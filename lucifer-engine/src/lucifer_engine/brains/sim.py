"""Simulation brain: makes no API calls and follows a fixed script, but goes through the real
actions (delegating, progress updates, writing files, completing). Used to develop
lucifer-office and to run tests without spending tokens."""

from __future__ import annotations

import random
import re
import unicodedata

from ..protocol import Agent, AgentStatus
from ..session import TaskClosedError, TaskSession
from .base import WorkUsage

MAX_DELEGATION_DEPTH = 2
"""Maximum depth of the delegation tree in simulation."""


class SimBrain:
    kind = "sim"

    def __init__(self, step_s: float = 1.5) -> None:
        """step_s: duration of each "thinking"/"working" step, with random jitter."""
        self.step_s = step_s

    def work(self, session: TaskSession) -> WorkUsage:
        agent, task = session.agent, session.task

        def step(status: AgentStatus) -> None:
            session.set_status(status)
            if session.cancelled.wait(self.step_s * random.uniform(0.6, 1.4)):
                raise TaskClosedError("Task was cancelled")

        step("thinking")
        subtasks = session.subtasks()

        if subtasks:
            session.post_update(f"Merging results from {len(subtasks)} delegated tasks")
            step("working")
            lines = "\n".join(f"- **{t.title}** ({t.status}): {t.result or 'no result'}" for t in subtasks)
            path = session.write_file(f"reports/{task.id}-{_slug(task.title)}.md", f"# {task.title}\n\n{lines}\n")
            session.complete(f"Merged {len(subtasks)} work items into {path}.")
            return _fake_usage(task.description)

        delegates = _pick_delegates(session)
        if delegates and len(session.ancestors()) < MAX_DELEGATION_DEPTH:
            session.post_update(f'Splitting "{task.title}" into {len(delegates)} parts for the team')
            for report in delegates:
                step("working")
                session.delegate(
                    report.id,
                    f"{task.title}: {report.title} part",
                    f"Handle the {report.title} part of: {task.description or task.title}",
                )
            return _fake_usage(task.description)

        session.post_update(f"Starting: {task.title}")
        step("working")
        step("thinking")
        path = session.write_file(
            f"work/{agent.id}/{task.id}-{_slug(task.title)}.md",
            f"# {task.title}\n\nOwner: {agent.name} ({agent.title})\n\n{task.description}\n\n"
            "_Simulated deliverable from SimBrain._\n",
        )
        step("working")
        session.complete(f"{agent.name} finished; the deliverable is at {path}.")
        return _fake_usage(task.description)


def _pick_delegates(session: TaskSession) -> list[Agent]:
    """Pick up to two reports whose expertise matches the task."""
    reports = session.delegates()
    text = f"{session.task.title} {session.task.description}".lower()

    def score(agent: Agent) -> int:
        words = {w for w in re.split(r"\W+", f"{agent.title} {agent.persona}".lower()) if len(w) >= 4}
        return sum(1 for w in words if w in text)

    return sorted(reports, key=score, reverse=True)[:2]


def _slug(text: str) -> str:
    ascii_text = unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D"))
    ascii_text = "".join(c for c in ascii_text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")[:40] or "task"


def _fake_usage(text: str) -> WorkUsage:
    return WorkUsage(input_tokens=800 + len(text), output_tokens=random.randint(300, 700))
