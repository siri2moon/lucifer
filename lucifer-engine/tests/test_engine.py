from __future__ import annotations

from pathlib import Path

import pytest

from lucifer_engine.brains.base import WorkUsage
from lucifer_engine.brains.sim import SimBrain
from lucifer_engine.protocol import CreateTaskInput
from lucifer_engine.session import TaskSession, WorkspacePathError

from .conftest import make_store, until


def test_ceo_splits_work_down_the_org_chart_then_merges(company):
    store, engine = company(SimBrain(step_s=0.002))
    engine.start()
    # Written in Vietnamese on purpose: the detected language must reach every subtask.
    root = engine.assign(CreateTaskInput(title="Ra mắt app ghi chú", description="Kế hoạch sản phẩm, kỹ thuật và marketing"))

    until(lambda: store.require_task(root.id).status == "done")

    tasks = store.list_tasks()
    assert len(tasks) > 1
    assert all(t.status == "done" for t in tasks)
    for t in tasks:
        if t.parent_id:
            parent = store.require_task(t.parent_id)
            assert store.require_agent(t.assignee_id).manager_id == parent.assignee_id
    assert store.require_task(root.id).artifacts[0].startswith("reports/")
    assert {t.language for t in tasks} == {"Vietnamese"}
    until(lambda: all(a.status == "idle" for a in store.list_agents()))
    assert store.require_agent("lucifer").stats.tasks_completed == 1


def test_cancelling_a_parent_cancels_its_subtasks(company):
    store, engine = company(SimBrain(step_s=0.05))
    engine.start()
    root = engine.assign(CreateTaskInput(title="Long project"))
    until(lambda: len(store.subtasks(root.id)) > 0)

    engine.cancel(root.id)
    until(lambda: all(a.current_task_id is None for a in store.list_agents()))

    statuses = {t.status for t in store.list_tasks()}
    assert not statuses & {"todo", "in_progress", "waiting"}
    assert store.require_task(root.id).status == "cancelled"


class _FailingChildBrain:
    kind = "sim"

    def work(self, session: TaskSession) -> WorkUsage:
        if session.agent.id == "lucifer" and not session.subtasks():
            session.delegate("michael", "Subtask", "")
            return WorkUsage()
        if session.agent.id == "michael":
            raise RuntimeError("API is down")
        session.complete("merged")
        return WorkUsage()


def test_brain_error_fails_the_task_and_wakes_the_parent(company):
    store, engine = company(_FailingChildBrain())
    engine.start()
    root = engine.assign(CreateTaskInput(title="Root task"))

    until(lambda: store.require_task(root.id).status == "done")
    [child] = store.subtasks(root.id)
    assert child.status == "failed"
    assert "API is down" in (child.result or "")


def test_delegates_only_to_reports_and_blocks_paths_outside_workspace(tmp_path: Path):
    store = make_store()
    task = store.create_task(
        title="x", description="", assignee_id="michael", created_by_id=None, parent_id=None, priority="normal"
    )
    session = TaskSession(store, tmp_path / "ws", store.require_agent("michael"), task)

    with pytest.raises(ValueError, match="does not report to you"):
        session.delegate("belial", "t", "")
    session.delegate("gabriel", "t", "")

    for bad in ("../evil.txt", "/etc/evil.txt"):
        with pytest.raises(WorkspacePathError):
            session.write_file(bad, "x")
    (tmp_path / "ws" / "escape").symlink_to(tmp_path)
    with pytest.raises(WorkspacePathError):
        session.write_file("escape/evil.txt", "x")

    assert session.write_file("docs/a.md", "hello") == "docs/a.md"
    assert session.read_file("docs/a.md") == "hello"
    assert store.require_task(task.id).artifacts == ["docs/a.md"]


def test_state_is_saved_and_running_tasks_return_to_todo(tmp_path: Path):
    store = make_store(tmp_path / "state.json")
    t = store.create_task(title="x", description="", assignee_id="lucifer", created_by_id=None, parent_id=None, priority="high")
    store.update_task(t.id, status="in_progress")
    store.flush()

    reloaded = make_store(tmp_path / "state.json")
    assert reloaded.require_task(t.id).status == "todo"
