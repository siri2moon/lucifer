"""The data contract between lucifer-engine and its clients (lucifer-office).

JSON uses camelCase. Run `uv run lucifer-engine schema` to export JSON Schema
cho client sinh type.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

AgentStatus = Literal["idle", "thinking", "working", "waiting", "offline"]
TaskStatus = Literal["todo", "in_progress", "waiting", "done", "failed", "cancelled"]
TaskPriority = Literal["low", "normal", "high", "urgent"]
Effort = Literal["low", "medium", "high", "xhigh", "max"]
ActivityKind = Literal[
    "task_assigned",
    "task_started",
    "task_delegated",
    "task_completed",
    "task_failed",
    "update",  # the agent reports progress (a speech bubble in the UI)
    "thought",  # text the agent writes between steps
    "file_written",
    "error",
]

TERMINAL_TASK_STATUSES: frozenset[str] = frozenset({"done", "failed", "cancelled"})


Translations = dict[str, dict[str, str]]
"""Translations by language, e.g. {"vi": {"title": "Kỹ sư Backend"}}. Base fields are English."""


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    def to_json(self) -> dict:
        return self.model_dump(mode="json", by_alias=True)


class Appearance(Model):
    color: str
    emoji: str


class Department(Model):
    id: str
    name: str
    color: str
    i18n: Translations = Field(default_factory=dict, alias="i18n")
    """Translations of `name`."""


class AgentStats(Model):
    tasks_completed: int = 0
    tasks_failed: int = 0
    input_tokens: int = 0
    output_tokens: int = 0


class Agent(Model):
    id: str
    name: str
    title: str
    department_id: str
    manager_id: str | None
    persona: str
    model: str
    effort: Effort
    appearance: Appearance
    status: AgentStatus = "idle"
    current_task_id: str | None = None
    stats: AgentStats = Field(default_factory=AgentStats)
    i18n: Translations = Field(default_factory=dict, alias="i18n")
    """Translations of `title` and `persona`."""


class Task(Model):
    id: str
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    assignee_id: str
    created_by_id: str | None
    """The agent who assigned the task; None means the owner."""
    parent_id: str | None
    language: str | None = None
    """The language agents must write in (e.g. "English"); subtasks inherit it. None means follow the task text."""
    result: str | None = None
    artifacts: list[str] = Field(default_factory=list)
    created_at: str
    updated_at: str
    started_at: str | None = None
    finished_at: str | None = None

    @property
    def terminal(self) -> bool:
        return self.status in TERMINAL_TASK_STATUSES


class Activity(Model):
    id: str
    at: str
    kind: ActivityKind
    agent_id: str | None
    task_id: str | None
    text: str
    target_agent_id: str | None = None


class CompanyInfo(Model):
    name: str
    mission: str
    departments: list[Department]
    i18n: Translations = Field(default_factory=dict, alias="i18n")
    """Translations of `name` and `mission`."""


class EngineInfo(Model):
    brain: Literal["crew", "sim"]
    llm: str | None = None
    """The LLM in use, e.g. "Cloudflare AI Gateway · deepseek/deepseek-chat"."""
    running: bool
    heartbeat_ms: int
    max_concurrent: int


class Snapshot(Model):
    company: CompanyInfo
    engine: EngineInfo
    agents: list[Agent]
    tasks: list[Task]
    activities: list[Activity]


class SnapshotEvent(Model):
    type: Literal["snapshot"] = "snapshot"
    data: Snapshot


class AgentUpdatedEvent(Model):
    type: Literal["agent.updated"] = "agent.updated"
    data: Agent


class TaskCreatedEvent(Model):
    type: Literal["task.created"] = "task.created"
    data: Task


class TaskUpdatedEvent(Model):
    type: Literal["task.updated"] = "task.updated"
    data: Task


class ActivityEvent(Model):
    type: Literal["activity"] = "activity"
    data: Activity


class EngineUpdatedEvent(Model):
    type: Literal["engine.updated"] = "engine.updated"
    data: EngineInfo


ServerEvent = Annotated[
    Union[SnapshotEvent, AgentUpdatedEvent, TaskCreatedEvent, TaskUpdatedEvent, ActivityEvent, EngineUpdatedEvent],
    Field(discriminator="type"),
]
"""Events the engine pushes over the `/ws` WebSocket."""


class CreateTaskInput(Model):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    title: str = Field(min_length=1)
    description: str = ""
    assignee_id: str | None = None
    """Defaults to the head of the company."""
    priority: TaskPriority = "normal"
    language: str | None = None
    """Force the reply language; when empty the engine detects it from the title and description."""
