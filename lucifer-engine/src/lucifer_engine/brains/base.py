from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from ..session import TaskSession


@dataclass
class WorkUsage:
    input_tokens: int = 0
    output_tokens: int = 0


class Brain(Protocol):
    """An employee's brain: takes a task and acts through the TaskSession until the task
    is completed, failed, or delegated and waiting on reports.

    `work` runs synchronously in a thread provided by the engine.
    """

    kind: Literal["crew", "sim"]

    def work(self, session: TaskSession) -> WorkUsage: ...
