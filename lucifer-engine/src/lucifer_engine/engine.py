"""The dispatcher: on every heartbeat, each idle employee picks up their highest-priority
`todo` task and works on it with the configured brain. A parent task in `waiting`
is woken up again once all of its subtasks have finished."""

from __future__ import annotations

import logging
import threading
from collections import defaultdict
from concurrent.futures import Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
from pathlib import Path

from .brains.base import Brain, WorkUsage
from .language import detect_language
from .protocol import CreateTaskInput, EngineInfo, EngineUpdatedEvent, Task
from .session import TaskSession
from .store import CompanyStore, now_iso

log = logging.getLogger("lucifer.engine")


@dataclass
class _ActiveRun:
    task_id: str
    session: TaskSession
    future: Future[None] | None = None


class Engine:
    def __init__(
        self,
        store: CompanyStore,
        brain: Brain,
        *,
        heartbeat_s: float,
        max_concurrent: int,
        workspace_dir: Path,
        llm_label: str | None = None,
    ) -> None:
        self._store = store
        self._brain = brain
        self._heartbeat_s = heartbeat_s
        self._max_concurrent = max_concurrent
        self._workspace_dir = workspace_dir
        self._llm_label = llm_label
        self._running = False
        self._active: dict[str, _ActiveRun] = {}
        self._lock = threading.RLock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._loop_thread: threading.Thread | None = None
        self._pool: ThreadPoolExecutor | None = None

    def info(self) -> EngineInfo:
        return EngineInfo(
            brain=self._brain.kind,
            llm=self._llm_label if self._brain.kind == "crew" else None,
            running=self._running,
            heartbeat_ms=int(self._heartbeat_s * 1000),
            max_concurrent=self._max_concurrent,
        )

    # ---------- lifecycle ----------

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._running = True
            self._stop.clear()
            self._pool = ThreadPoolExecutor(max_workers=self._max_concurrent, thread_name_prefix="agent")
            self._wake_stalled_parents()
            for agent in self._store.list_agents():
                self._store.update_agent(agent.id, status="idle", current_task_id=None)
            self._loop_thread = threading.Thread(target=self._loop, name="heartbeat", daemon=True)
            self._loop_thread.start()
        self._store.emit(EngineUpdatedEvent(data=self.info()))

    def stop(self, timeout_s: float = 30) -> None:
        """Stop the heartbeat. Running tasks are told to cancel and go back to `todo` to be redone later."""
        with self._lock:
            if not self._running:
                return
            self._running = False
            self._stop.set()
            self._wake.set()
            runs = list(self._active.values())
            for run in runs:
                run.session.cancelled.set()
            pool = self._pool
            self._pool = None
        futures = [r.future for r in runs if r.future is not None]
        wait(futures, timeout=timeout_s)
        if pool is not None:
            pool.shutdown(wait=False, cancel_futures=True)
        if self._loop_thread is not None:
            self._loop_thread.join(timeout=timeout_s)
        for agent in self._store.list_agents():
            self._store.update_agent(agent.id, status="offline", current_task_id=None)
        self._store.emit(EngineUpdatedEvent(data=self.info()))

    def _loop(self) -> None:
        while not self._stop.is_set():
            self.tick()
            self._wake.wait(self._heartbeat_s)
            self._wake.clear()

    def nudge(self) -> None:
        """Run a tick now instead of waiting for the next heartbeat."""
        self._wake.set()

    # ---------- assigning / cancelling ----------

    def assign(self, data: CreateTaskInput) -> Task:
        assignee_id = data.assignee_id or self._store.head().id
        assignee = self._store.require_agent(assignee_id)
        task = self._store.create_task(
            title=data.title,
            description=data.description,
            assignee_id=assignee_id,
            created_by_id=None,
            parent_id=None,
            priority=data.priority,
            language=data.language or detect_language(f"{data.title}\n{data.description}"),
        )
        self._store.log(
            "task_assigned",
            f'Owner assigned "{task.title}" to {assignee.name}',
            task_id=task.id,
            target_agent_id=assignee_id,
        )
        self.nudge()
        return task

    def cancel(self, task_id: str) -> Task:
        """Cancel a task along with all of its unfinished subtasks."""
        root = self._store.require_task(task_id)
        children: dict[str, list[Task]] = defaultdict(list)
        for t in self._store.list_tasks():
            if t.parent_id:
                children[t.parent_id].append(t)
        stack = [root]
        now = now_iso()
        while stack:
            task = stack.pop()
            stack.extend(children.get(task.id, []))
            if task.terminal:
                continue
            self._store.update_task(task.id, status="cancelled", finished_at=now)
            with self._lock:
                run = self._active.get(task.assignee_id)
                if run is not None and run.task_id == task.id:
                    run.session.cancelled.set()
        with self._lock:
            self._wake_parent(root)
        return self._store.require_task(task_id)

    # ---------- dispatch ----------

    def tick(self) -> None:
        with self._lock:
            if not self._running or self._pool is None:
                return
            for agent_id, task in self._store.next_todo_by_agent().items():
                if len(self._active) >= self._max_concurrent:
                    break
                if agent_id in self._active:
                    continue
                self._launch(agent_id, task)

    def _launch(self, agent_id: str, queued: Task) -> None:
        assert self._pool is not None
        task = self._store.update_task(queued.id, status="in_progress", started_at=queued.started_at or now_iso())
        agent = self._store.update_agent(agent_id, status="thinking", current_task_id=task.id)
        self._store.log("task_started", f'{agent.name} started "{task.title}"', agent_id=agent_id, task_id=task.id)
        run = _ActiveRun(task_id=task.id, session=TaskSession(self._store, self._workspace_dir, agent, task))
        self._active[agent_id] = run
        run.future = self._pool.submit(self._run, agent_id, run)

    def _run(self, agent_id: str, run: _ActiveRun) -> None:
        session = run.session
        usage = WorkUsage()
        try:
            usage = self._brain.work(session)
        except Exception as err:  # noqa: BLE001 — any brain error fails the task
            if not session.cancelled.is_set() and session.outcome is None:
                log.exception("agent %s crashed while working on %s", agent_id, session.task.id)
                self._store.log("error", str(err), agent_id=agent_id, task_id=session.task.id)
                session.fail(f"Error while working: {err}")
        try:
            # Settling the status and waking the parent must happen under one lock; otherwise a
            # subtask can finish just as the parent moves to `waiting`, and the parent hangs forever.
            with self._lock:
                self._settle(session)
            self._record(agent_id, session, usage)
        finally:
            with self._lock:
                self._active.pop(agent_id, None)
            self.nudge()

    def _settle(self, session: TaskSession) -> None:
        """Decide the task's status after a work session."""
        task = self._store.require_task(session.task.id)
        agent = session.agent

        if session.outcome == "completed":
            self._store.log("task_completed", f'{agent.name} completed "{task.title}"', agent_id=agent.id, task_id=task.id)
            self._wake_parent(task)
        elif session.outcome == "failed":
            self._store.log(
                "task_failed",
                f'{agent.name} could not complete "{task.title}": {task.result or ""}',
                agent_id=agent.id,
                task_id=task.id,
            )
            self._wake_parent(task)
        elif task.status == "cancelled":
            pass
        elif session.cancelled.is_set():
            # The engine stopped mid-run: put the task back in the queue.
            self._store.update_task(task.id, status="todo")
        elif session.has_open_subtasks():
            self._store.update_task(task.id, status="waiting")
        elif session.delegated_task_ids:
            # The reports finished before this session ended: come back to merge their results.
            self._store.update_task(task.id, status="todo")
        else:
            # The brain ended without calling complete_task: treat its final answer as the result.
            session.complete(session.last_thought or "Done (no summary).")
            self._store.log("task_completed", f'{agent.name} completed "{task.title}"', agent_id=agent.id, task_id=task.id)
            self._wake_parent(task)

    def _record(self, agent_id: str, session: TaskSession, usage: WorkUsage) -> None:
        stats = self._store.require_agent(agent_id).stats
        waiting = self._store.require_task(session.task.id).status == "waiting"
        status = "offline" if not self._running else "waiting" if waiting else "idle"
        self._store.update_agent(
            agent_id,
            status=status,
            current_task_id=None,
            stats=stats.model_copy(
                update={
                    "tasks_completed": stats.tasks_completed + (session.outcome == "completed"),
                    "tasks_failed": stats.tasks_failed + (session.outcome == "failed"),
                    "input_tokens": stats.input_tokens + usage.input_tokens,
                    "output_tokens": stats.output_tokens + usage.output_tokens,
                }
            ),
        )

    def _wake_parent(self, task: Task) -> None:
        """Wake a waiting parent task once all of its subtasks have finished. Call while holding `_lock`."""
        if not task.parent_id:
            return
        parent = self._store.get_task(task.parent_id)
        if parent is None or parent.status != "waiting":
            return
        if all(t.terminal for t in self._store.subtasks(parent.id)):
            self._store.update_task(parent.id, status="todo")
            self.nudge()

    def _wake_stalled_parents(self) -> None:
        """After a restart a parent task can be stuck in `waiting` even though its subtasks are done."""
        tasks = self._store.list_tasks()
        open_parents = {t.parent_id for t in tasks if t.parent_id and not t.terminal}
        for t in tasks:
            if t.status == "waiting" and t.id not in open_parents:
                self._store.update_task(t.id, status="todo")
