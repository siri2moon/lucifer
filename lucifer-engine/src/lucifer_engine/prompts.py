"""Text given to agents: a backstory for their position in the company and a brief for each task.

The backstory depends only on the company and the agent's position, never on the task, so the
request prefix can be cached across work sessions.
"""

from __future__ import annotations

import re

from .protocol import Agent, CompanyInfo, Task
from .session import TaskSession


def backstory(company: CompanyInfo, agent: Agent, manager: Agent | None, reports: list[Agent]) -> str:
    department = next((d.name for d in company.departments if d.id == agent.department_id), agent.department_id)
    lines = [
        f"You are {agent.name}, {agent.title} in the {department} department at {company.name}.",
        "",
        f"Company mission: {company.mission}",
        "",
        "Your role and expertise:",
        agent.persona,
        "",
        f"You report to {manager.name} ({manager.title})."
        if manager
        else "You lead the company and report directly to the owner.",
    ]
    if reports:
        lines += [
            "",
            "Direct reports you can delegate to (use delegate_task with the exact id):",
            *(f'- id "{r.id}": {r.name}, {r.title}. {_first_sentence(r.persona)}' for r in reports),
            "",
            "When a task is large or outside your expertise, break it down and hand each piece to the right person"
            " with a clear brief: the goal, the expected output and the file names to create. After delegating, end"
            " your turn. You will be called again with their results once they finish, so you can merge them.",
        ]
    else:
        lines += ["", "You have no direct reports: do the task yourself with your own expertise."]
    lines += [
        "",
        "How you work:",
        "- Every deliverable (documents, code, plans) goes into the shared workspace with write_file, organized in"
        " sensible folders. Colleagues can read each other's files.",
        "- Use post_update for short (one sentence) progress updates at key milestones.",
        "- When you are done, call complete_task with a summary of the result and the files you created. If you"
        " cannot do it, call fail_task with a specific reason.",
        "- Write in the language the task brief asks for: files, progress updates, the complete_task summary and"
        " the briefs you delegate. Ignore the language of existing files, file names and earlier tasks.",
    ]
    return "\n".join(lines)


def goal(agent: Agent) -> str:
    return f"Deliver excellent work on every task assigned to you as {agent.title}, in line with the company mission."


def task_brief(session: TaskSession) -> str:
    task = session.task
    parts = [f"# Task {task.id}: {task.title}", f"Priority: {task.priority}", _language_rule(task.language)]
    parts += ["", task.description or "(no further description)"]

    ancestors = session.ancestors()
    if ancestors:
        parts += ["", "## Context: this task is part of"]
        parts += [f'- {a.id} "{a.title}": {_truncate(a.description, 300)}' for a in ancestors]

    subtasks = session.subtasks()
    if subtasks:
        parts += ["", "## Work you delegated and the results", *(_describe_subtask(t) for t in subtasks)]
        parts += [
            "",
            "Review your reports' results, read the related files if needed, then merge them and complete the task"
            " (or delegate more work if something is missing).",
        ]

    files = session.list_files()
    if files:
        parts += ["", "## Files currently in the workspace", *(f"- {f}" for f in files)]
    return "\n".join(parts)


EXPECTED_OUTPUT = (
    "The task is finished with complete_task (or fail_task), or the work has been delegated with delegate_task."
    " The final answer is a short summary of what was done."
)


def _language_rule(language: str | None) -> str:
    if language:
        return f"Language: {language}. Write everything for this task in {language}, even if other files in the workspace use another language."
    return "Language: the same language as this task's title and description, even if other files in the workspace use another language."


def _describe_subtask(t: Task) -> str:
    head = f'- {t.id} "{t.title}" → {t.status}'
    if t.result:
        head += f"\n  Result: {_truncate(t.result, 1500)}"
    if t.artifacts:
        head += f"\n  Files: {', '.join(t.artifacts)}"
    return head


def _first_sentence(text: str) -> str:
    match = re.match(r"^[^.!?\n]+[.!?]?", text)
    return match.group(0).strip() if match else text


def _truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + "…"
