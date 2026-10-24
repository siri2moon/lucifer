"""CrewAI brain: each work session is a Crew with exactly one Agent (the employee) and one
Task. Delegation between employees is handled by the engine through the `delegate_task` tool
instead of CrewAI's `Process.hierarchical`, which has a single manager layer and delegates
synchronously inside one run: it cannot model a multi-level org chart, and the UI could not
show each subtask as a real task."""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any

from crewai import Agent as CrewAgent
from crewai import Crew, Process
from crewai import Task as CrewTask
from crewai.llms.base_llm import BaseLLM
from crewai.llms.providers.anthropic.completion import AnthropicCompletion
from crewai.llms.providers.openai.completion import OpenAICompletion
from crewai.tools import BaseTool
from pydantic import BaseModel, Field, PrivateAttr

from ..config import GatewaySettings
from ..protocol import Agent, CompanyInfo, Effort, TaskPriority
from ..session import TaskSession
from .. import prompts
from .base import WorkUsage

MAX_ITERATIONS = 30
MAX_TOKENS = 16000
FALLBACK_MODELS = frozenset({"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"})
"""Models that accept the `"default"` server-side fallback when the safety classifier declines a request."""
FALLBACK_BETA = "server-side-fallback-2026-07-01"

# CrewAI sends anonymous telemetry by default; turn it off unless the user opts in.
os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")


class LuciferAnthropic(AnthropicCompletion):
    """CrewAI's Anthropic provider, plus `effort` and server-side fallbacks that CrewAI doesn't support yet.

    Thinking stays at its default (adaptive on Opus 5.5). Both parameters go through the Anthropic
    SDK's `extra_body`; the fallback beta header goes through `extra_headers`.
    """

    effort: Effort | None = None
    fallbacks: bool = False

    def _prepare_completion_params(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        params = super()._prepare_completion_params(*args, **kwargs)
        extra_body: dict[str, Any] = {}
        if self.effort:
            extra_body["output_config"] = {"effort": self.effort}
        if self.fallbacks:
            extra_body["fallbacks"] = "default"
            params["extra_headers"] = {"anthropic-beta": FALLBACK_BETA}
        if extra_body:
            params["extra_body"] = extra_body
        return params


class GatewayCompletion(OpenAICompletion):
    """Calls Cloudflare AI Gateway through its OpenAI-compatible endpoint.

    CrewAI always sends tools with `strict: true` (an OpenAI mode); many other providers such as
    DeepSeek reject it, so the flag is dropped by default.
    """

    strict_tools: bool = False

    def _convert_tools_for_interference(self, tools: list[dict[str, BaseTool]]) -> list[dict[str, Any]]:
        converted = super()._convert_tools_for_interference(tools)
        if not self.strict_tools:
            for tool in converted:
                tool["function"].pop("strict", None)
        return converted


LLMFactory = Callable[[Agent], BaseLLM]


def anthropic_llm(*, fallbacks: bool = True, **options: Any) -> LLMFactory:
    """Claude through CrewAI's native Anthropic provider; `options` are passed straight to LuciferAnthropic."""

    def make(agent: Agent) -> BaseLLM:
        return LuciferAnthropic(
            model=agent.model,
            max_tokens=MAX_TOKENS,
            effort=agent.effort,
            fallbacks=fallbacks and agent.model in FALLBACK_MODELS,
            **options,
        )

    return make


def gateway_llm(gateway: GatewaySettings, **options: Any) -> LLMFactory:
    """Any model behind Cloudflare AI Gateway. `agent.model` is `provider/model` or `dynamic/<route>`.

    Auth: with only a Cloudflare token, send it as the API key (the provider key is stored on the gateway);
    with a provider key, send that key and pass the token in the `cf-aig-authorization` header.
    """
    headers: dict[str, str] = {}
    if gateway.gateway_id:
        headers["cf-aig-gateway-id"] = gateway.gateway_id  # required for dynamic/... routes
    if gateway.byok_alias:
        # The gateway looks for a BYOK key named "default"; a key stored under another name must be named.
        headers["cf-aig-byok-alias"] = gateway.byok_alias
    if gateway.provider_key:
        api_key = gateway.provider_key
        if gateway.token:
            headers["cf-aig-authorization"] = f"Bearer {gateway.token}"
    else:
        api_key = gateway.token

    def make(agent: Agent) -> BaseLLM:
        return GatewayCompletion(
            model=agent.model,
            base_url=gateway.base_url,
            api_key=api_key,
            custom_openai=True,
            default_headers=headers or None,
            max_tokens=MAX_TOKENS,
            strict_tools=gateway.strict_tools,
            **options,
        )

    return make


class CrewBrain:
    kind = "crew"

    def __init__(self, company: CompanyInfo, llm: LLMFactory) -> None:
        self._company = company
        self._llm = llm

    def work(self, session: TaskSession) -> WorkUsage:
        agent = session.agent
        llm = self._llm(agent)

        def on_step(step: Any) -> None:
            text = getattr(step, "thought", None) or getattr(step, "output", None)
            if isinstance(text, str) and text.strip():
                session.thought(text.strip())
            if session.cancelled.is_set():
                # Break out of CrewAI's loop at the next step.
                raise RuntimeError("Task was cancelled")

        crew_agent = CrewAgent(
            role=f"{agent.title} ({agent.name})",
            goal=prompts.goal(agent),
            backstory=prompts.backstory(self._company, agent, session.manager(), session.delegates()),
            llm=llm,
            tools=build_tools(session),
            allow_delegation=False,
            max_iter=MAX_ITERATIONS,
            step_callback=on_step,
            verbose=False,
        )
        crew_task = CrewTask(
            description=prompts.task_brief(session),
            expected_output=prompts.EXPECTED_OUTPUT,
            agent=crew_agent,
        )
        crew = Crew(agents=[crew_agent], tasks=[crew_task], process=Process.sequential, verbose=False)

        session.set_status("thinking")
        output = crew.kickoff()
        if output.raw and output.raw.strip():
            session.last_thought = output.raw.strip()
        usage = output.token_usage
        return WorkUsage(input_tokens=usage.prompt_tokens, output_tokens=usage.completion_tokens)


# ---------- tools ----------


class _SessionTool(BaseTool):
    """Wraps a TaskSession action as a CrewAI tool. Exceptions raised by `_act` are returned
    to the model by CrewAI as tool errors."""

    _session: TaskSession = PrivateAttr()

    def bind(self, session: TaskSession) -> _SessionTool:
        self._session = session
        return self

    def _run(self, **kwargs: Any) -> str:
        session = self._session
        session.set_status("working")
        try:
            return self._act(session, **kwargs)
        finally:
            if session.outcome is None:
                session.set_status("thinking")

    def _act(self, session: TaskSession, **kwargs: Any) -> str:
        raise NotImplementedError


class _PostUpdateArgs(BaseModel):
    message: str = Field(description="One sentence about what you just did or are about to do")


class PostUpdateTool(_SessionTool):
    name: str = "post_update"
    description: str = "Post a short (one sentence) progress update for your manager and the owner. Use it at key milestones."
    args_schema: type[BaseModel] = _PostUpdateArgs

    def _act(self, session: TaskSession, message: str) -> str:
        session.post_update(message)
        return "Update posted."


class _NoArgs(BaseModel):
    pass


class ListFilesTool(_SessionTool):
    name: str = "list_files"
    description: str = "List the files in the company's shared workspace."
    args_schema: type[BaseModel] = _NoArgs

    def _act(self, session: TaskSession) -> str:
        return "\n".join(session.list_files()) or "(workspace is empty)"


class _ReadFileArgs(BaseModel):
    path: str = Field(description="Path relative to the workspace")


class ReadFileTool(_SessionTool):
    name: str = "read_file"
    description: str = "Read a file from the shared workspace."
    args_schema: type[BaseModel] = _ReadFileArgs

    def _act(self, session: TaskSession, path: str) -> str:
        return session.read_file(path)


class _WriteFileArgs(BaseModel):
    path: str = Field(description="Relative path, for example docs/product/prd.md")
    content: str = Field(description="The full file content")


class WriteFileTool(_SessionTool):
    name: str = "write_file"
    description: str = (
        "Create or overwrite a file in the shared workspace. Use it for every deliverable: documents, code, plans."
    )
    args_schema: type[BaseModel] = _WriteFileArgs

    def _act(self, session: TaskSession, path: str, content: str) -> str:
        return f"Wrote {session.write_file(path, content)}"


class _CompleteArgs(BaseModel):
    summary: str = Field(description="Summary of the result for whoever assigned the task, including the files you created")


class CompleteTaskTool(_SessionTool):
    name: str = "complete_task"
    description: str = "Mark the task as done. Call it once, when the final deliverable exists."
    args_schema: type[BaseModel] = _CompleteArgs

    def _act(self, session: TaskSession, summary: str) -> str:
        session.complete(summary)
        return "Task completed. Give your final answer and stop."


class _FailArgs(BaseModel):
    reason: str = Field(description="The specific reason, and what would be needed to finish it")


class FailTaskTool(_SessionTool):
    name: str = "fail_task"
    description: str = "Mark the task as failed when it cannot be completed."
    args_schema: type[BaseModel] = _FailArgs

    def _act(self, session: TaskSession, reason: str) -> str:
        session.fail(reason)
        return "Failure reported. Give your final answer and stop."


class _DelegateArgs(BaseModel):
    assignee_id: str = Field(description="id of one of your direct reports")
    title: str = Field(description="Short task title")
    description: str = Field(description="Goal, expected output, files to create, constraints")
    priority: TaskPriority | None = Field(default=None, description="low | normal | high | urgent")


class DelegateTaskTool(_SessionTool):
    name: str = "delegate_task"
    description: str = "Delegate a subtask to a direct report. You will be called again with their result when they finish."
    args_schema: type[BaseModel] = _DelegateArgs

    def _act(
        self, session: TaskSession, assignee_id: str, title: str, description: str, priority: TaskPriority | None = None
    ) -> str:
        return f"Delegated as {session.delegate(assignee_id, title, description, priority)}."


def build_tools(session: TaskSession) -> list[BaseTool]:
    tools: list[_SessionTool] = [
        PostUpdateTool(),
        ListFilesTool(),
        ReadFileTool(),
        WriteFileTool(),
        CompleteTaskTool(),
        FailTaskTool(),
    ]
    if session.delegates():
        tools.append(DelegateTaskTool())
    return [t.bind(session) for t in tools]
