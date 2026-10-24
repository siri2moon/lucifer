"""Company state: kept in memory, saved to a JSON file, emitting an event on every change."""

from __future__ import annotations

import json
import os
import threading
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .protocol import (
    Activity,
    ActivityEvent,
    ActivityKind,
    Agent,
    AgentStats,
    AgentUpdatedEvent,
    CompanyInfo,
    Model,
    Task,
    TaskCreatedEvent,
    TaskPriority,
    TaskUpdatedEvent,
)

MAX_ACTIVITIES = 500
SAVE_DELAY_S = 0.5
PRIORITY_RANK: dict[str, int] = {"urgent": 0, "high": 1, "normal": 2, "low": 3}

Listener = Callable[[Model], None]


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class NotFoundError(LookupError):
    pass


class CompanyStore:
    """Thread-safe: each agent's brain runs in its own thread.

    Listeners are called synchronously, under the lock, on the thread that made the change, so
    events arrive in the order of the changes. Listeners must be fast and must not call back into
    the store; the server's listener only hands events over to its event loop.
    """

    def __init__(self, company: CompanyInfo, agents: list[Agent], state_path: Path | None) -> None:
        self.company = company
        self._agents: dict[str, Agent] = {a.id: a for a in agents}
        self._tasks: dict[str, Task] = {}
        self._activities: list[Activity] = []
        self._listeners: list[Listener] = []
        self._lock = threading.RLock()
        self._state_path = state_path
        self._save_timer: threading.Timer | None = None
        self._load()

    # ---------- events ----------

    def subscribe(self, listener: Listener) -> Callable[[], None]:
        with self._lock:
            self._listeners.append(listener)

        def unsubscribe() -> None:
            with self._lock:
                if listener in self._listeners:
                    self._listeners.remove(listener)

        return unsubscribe

    def emit(self, event: Model) -> None:
        with self._lock:
            for listener in list(self._listeners):
                listener(event)

    # ---------- agents ----------

    def list_agents(self) -> list[Agent]:
        with self._lock:
            return list(self._agents.values())

    def get_agent(self, agent_id: str) -> Agent | None:
        with self._lock:
            return self._agents.get(agent_id)

    def require_agent(self, agent_id: str) -> Agent:
        agent = self.get_agent(agent_id)
        if agent is None:
            raise NotFoundError(f'Agent "{agent_id}" not found')
        return agent

    def update_agent(self, agent_id: str, **patch: Any) -> Agent:
        with self._lock:
            agent = self.require_agent(agent_id).model_copy(update=patch)
            self._agents[agent_id] = agent
            self.emit(AgentUpdatedEvent(data=agent))
        self._schedule_save()
        return agent

    def head(self) -> Agent:
        for agent in self.list_agents():
            if agent.manager_id is None:
                return agent
        raise RuntimeError("The company has no head (an agent without reportsTo)")

    def direct_reports(self, manager_id: str) -> list[Agent]:
        return [a for a in self.list_agents() if a.manager_id == manager_id]

    def is_under(self, agent_id: str, manager_id: str) -> bool:
        """True if the agent sits under the manager in the org chart (directly or indirectly)."""
        with self._lock:
            current = self._agents.get(agent_id)
            while current is not None and current.manager_id:
                if current.manager_id == manager_id:
                    return True
                current = self._agents.get(current.manager_id)
        return False

    # ---------- tasks ----------

    def list_tasks(self) -> list[Task]:
        with self._lock:
            return list(self._tasks.values())

    def get_task(self, task_id: str) -> Task | None:
        with self._lock:
            return self._tasks.get(task_id)

    def require_task(self, task_id: str) -> Task:
        task = self.get_task(task_id)
        if task is None:
            raise NotFoundError(f'Task "{task_id}" not found')
        return task

    def create_task(
        self,
        *,
        title: str,
        description: str,
        assignee_id: str,
        created_by_id: str | None,
        parent_id: str | None,
        priority: TaskPriority,
        language: str | None = None,
    ) -> Task:
        self.require_agent(assignee_id)
        now = now_iso()
        task = Task(
            id=f"T-{uuid.uuid4().hex[:8]}",
            title=title,
            description=description,
            status="todo",
            priority=priority,
            assignee_id=assignee_id,
            created_by_id=created_by_id,
            parent_id=parent_id,
            language=language,
            created_at=now,
            updated_at=now,
        )
        with self._lock:
            self._tasks[task.id] = task
            self.emit(TaskCreatedEvent(data=task))
        self._schedule_save()
        return task

    def update_task(self, task_id: str, **patch: Any) -> Task:
        with self._lock:
            task = self.require_task(task_id).model_copy(update={**patch, "updated_at": now_iso()})
            self._tasks[task_id] = task
            self.emit(TaskUpdatedEvent(data=task))
        self._schedule_save()
        return task

    def subtasks(self, parent_id: str) -> list[Task]:
        return [t for t in self.list_tasks() if t.parent_id == parent_id]

    def ancestors(self, task_id: str) -> list[Task]:
        """Parent tasks, nearest first."""
        chain: list[Task] = []
        with self._lock:
            current = self._tasks.get(task_id)
            while current is not None and current.parent_id:
                parent = self._tasks.get(current.parent_id)
                if parent is None:
                    break
                chain.append(parent)
                current = parent
        return chain

    def next_todo_by_agent(self) -> dict[str, Task]:
        """Each agent's next `todo` task in one pass: highest priority first, then oldest."""
        best: dict[str, Task] = {}
        for task in self.list_tasks():
            if task.status != "todo":
                continue
            current = best.get(task.assignee_id)
            if current is None or _sort_key(task) < _sort_key(current):
                best[task.assignee_id] = task
        return best

    # ---------- activities ----------

    def list_activities(self) -> list[Activity]:
        with self._lock:
            return list(self._activities)

    def log(
        self,
        kind: ActivityKind,
        text: str,
        *,
        agent_id: str | None = None,
        task_id: str | None = None,
        target_agent_id: str | None = None,
    ) -> Activity:
        activity = Activity(
            id=uuid.uuid4().hex,
            at=now_iso(),
            kind=kind,
            agent_id=agent_id,
            task_id=task_id,
            text=text,
            target_agent_id=target_agent_id,
        )
        with self._lock:
            self._activities.append(activity)
            if len(self._activities) > MAX_ACTIVITIES:
                self._activities = self._activities[-MAX_ACTIVITIES:]
            self.emit(ActivityEvent(data=activity))
        self._schedule_save()
        return activity

    # ---------- persistence ----------

    def _load(self) -> None:
        if self._state_path is None or not self._state_path.exists():
            return
        state = json.loads(self._state_path.read_text("utf-8"))
        for raw in state.get("tasks", []):
            task = Task.model_validate(raw)
            # Tasks that were running when the engine stopped are redone from scratch.
            if task.status == "in_progress":
                task = task.model_copy(update={"status": "todo"})
            self._tasks[task.id] = task
        self._activities = [Activity.model_validate(a) for a in state.get("activities", [])][-MAX_ACTIVITIES:]
        for agent_id, stats in state.get("agentStats", {}).items():
            if agent_id in self._agents:
                self._agents[agent_id] = self._agents[agent_id].model_copy(
                    update={"stats": AgentStats.model_validate(stats)}
                )

    def _schedule_save(self) -> None:
        if self._state_path is None:
            return
        with self._lock:
            if self._save_timer is not None:
                return
            self._save_timer = threading.Timer(SAVE_DELAY_S, self._save_from_timer)
            self._save_timer.daemon = True
            self._save_timer.start()

    def _save_from_timer(self) -> None:
        with self._lock:
            self._save_timer = None
        self.save_now()

    def save_now(self) -> None:
        if self._state_path is None:
            return
        with self._lock:
            state = {
                "version": 1,
                "tasks": [t.to_json() for t in self._tasks.values()],
                "activities": [a.to_json() for a in self._activities],
                "agentStats": {a.id: a.stats.to_json() for a in self._agents.values()},
            }
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), "utf-8")
        os.replace(tmp, self._state_path)

    def flush(self) -> None:
        with self._lock:
            if self._save_timer is not None:
                self._save_timer.cancel()
                self._save_timer = None
        self.save_now()


def _sort_key(task: Task) -> tuple[int, str]:
    return (PRIORITY_RANK[task.priority], task.created_at)
