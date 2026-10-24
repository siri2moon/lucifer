"""What an employee may do while working on a task.

Brains (CrewAI or sim) only touch the company through this class, so the organizational
rules (who may delegate to whom, where files go) live in one place.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Literal

from .language import detect_language
from .protocol import Agent, AgentStatus, Task, TaskPriority
from .store import CompanyStore, now_iso

MAX_FILE_BYTES = 200_000
MAX_LISTED_FILES = 200


class WorkspacePathError(ValueError):
    def __init__(self) -> None:
        super().__init__("The path must stay inside the company workspace")


class TaskClosedError(RuntimeError):
    pass


def resolve_workspace_path(workspace_dir: Path, rel_path: str) -> Path:
    """Paths from the model or a client are untrusted: block anything that escapes the workspace, symlinks included."""
    workspace_dir.mkdir(parents=True, exist_ok=True)
    root = workspace_dir.resolve()
    target = (root / rel_path).resolve()
    if target == root or not target.is_relative_to(root):
        raise WorkspacePathError()
    return target


def list_workspace_files(workspace_dir: Path) -> list[str]:
    if not workspace_dir.exists():
        return []
    root = workspace_dir.resolve()
    files: list[str] = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            files.append(str((Path(dirpath) / name).relative_to(root)))
    return sorted(files)[:MAX_LISTED_FILES]


class TaskSession:
    def __init__(self, store: CompanyStore, workspace_dir: Path, agent: Agent, task: Task) -> None:
        self._store = store
        self._workspace_dir = workspace_dir
        self.agent = agent
        self.task = task
        self.outcome: Literal["completed", "failed"] | None = None
        self.delegated_task_ids: list[str] = []
        self.last_thought: str | None = None
        """The brain's last text, used as the result if it forgets to call complete_task."""
        self.cancelled = threading.Event()
        """Set by the engine when the task is cancelled or the engine stops; brains should check it to stop early."""

    # ---------- context ----------

    def delegates(self) -> list[Agent]:
        """People the agent may delegate to: its direct reports."""
        return self._store.direct_reports(self.agent.id)

    def manager(self) -> Agent | None:
        return self._store.get_agent(self.agent.manager_id) if self.agent.manager_id else None

    def ancestors(self) -> list[Task]:
        return self._store.ancestors(self.task.id)

    def subtasks(self) -> list[Task]:
        return self._store.subtasks(self.task.id)

    def has_open_subtasks(self) -> bool:
        return any(not t.terminal for t in self.subtasks())

    def list_files(self) -> list[str]:
        return list_workspace_files(self._workspace_dir)

    # ---------- actions ----------

    def set_status(self, status: AgentStatus) -> None:
        if self._store.require_agent(self.agent.id).status != status:
            self._store.update_agent(self.agent.id, status=status)

    def delegate(self, assignee_id: str, title: str, description: str, priority: TaskPriority | None = None) -> str:
        self._assert_open()
        assignee = self._store.get_agent(assignee_id)
        if assignee is None:
            raise ValueError(f'No employee with id "{assignee_id}"')
        if not self._store.is_under(assignee.id, self.agent.id):
            raise ValueError(f"{assignee.name} does not report to you, so you cannot delegate to them")
        sub = self._store.create_task(
            title=title,
            description=description,
            assignee_id=assignee.id,
            created_by_id=self.agent.id,
            parent_id=self.task.id,
            priority=priority or self.task.priority,
            language=self.task.language or detect_language(f"{title}\n{description}"),
        )
        self.delegated_task_ids.append(sub.id)
        self._store.log(
            "task_delegated",
            f'Delegated "{sub.title}" to {assignee.name}',
            agent_id=self.agent.id,
            task_id=sub.id,
            target_agent_id=assignee.id,
        )
        return sub.id

    def post_update(self, message: str) -> None:
        self._store.log("update", message, agent_id=self.agent.id, task_id=self.task.id)

    def thought(self, text: str) -> None:
        self.last_thought = text
        self._store.log("thought", text, agent_id=self.agent.id, task_id=self.task.id)

    def write_file(self, rel_path: str, content: str) -> str:
        self._assert_open()
        if len(content.encode()) > MAX_FILE_BYTES:
            raise ValueError(f"File too large (max {MAX_FILE_BYTES} bytes)")
        target = resolve_workspace_path(self._workspace_dir, rel_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, "utf-8")
        rel = str(target.relative_to(self._workspace_dir.resolve()))
        current = self._store.require_task(self.task.id)
        if rel not in current.artifacts:
            self._store.update_task(self.task.id, artifacts=[*current.artifacts, rel])
        self._store.log("file_written", rel, agent_id=self.agent.id, task_id=self.task.id)
        return rel

    def read_file(self, rel_path: str) -> str:
        target = resolve_workspace_path(self._workspace_dir, rel_path)
        if not target.is_file():
            raise FileNotFoundError(f"No such file: {rel_path}")
        if target.stat().st_size > MAX_FILE_BYTES:
            raise ValueError(f"File too large to read ({target.stat().st_size} bytes)")
        return target.read_text("utf-8")

    def complete(self, summary: str) -> None:
        self._assert_open()
        self.outcome = "completed"
        self._store.update_task(self.task.id, status="done", result=summary, finished_at=now_iso())

    def fail(self, reason: str) -> None:
        self._assert_open()
        self.outcome = "failed"
        self._store.update_task(self.task.id, status="failed", result=reason, finished_at=now_iso())

    def _assert_open(self) -> None:
        if self.outcome is not None:
            raise TaskClosedError("The task is already finished")
        if self.cancelled.is_set() or self._store.require_task(self.task.id).status == "cancelled":
            raise TaskClosedError("The task was cancelled, stop now")
