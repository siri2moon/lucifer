"""Runs the real CrewBrain (CrewAI + Anthropic SDK) against an Anthropic API faked at the HTTP layer."""

from __future__ import annotations

import json
from pathlib import Path

import anthropic
import httpx

from lucifer_engine.brains.crew import FALLBACK_BETA, CrewBrain, GatewayCompletion, LuciferAnthropic, anthropic_llm, gateway_llm
from lucifer_engine.config import GatewaySettings
from lucifer_engine.protocol import CreateTaskInput

from .conftest import until


def _message(content: list[dict], stop_reason: str) -> dict:
    return {
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "model": "claude-opus-5-5",
        "content": content,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": 100, "output_tokens": 20},
    }


def _tool_use(tool_id: str, name: str, args: dict) -> dict:
    return _message([{"type": "tool_use", "id": tool_id, "name": name, "input": args}], "tool_use")


SCRIPT = [
    _tool_use("tu_1", "write_file", {"path": "api/design.md", "content": "# API design\n"}),
    _tool_use("tu_2", "complete_task", {"summary": "Wrote api/design.md"}),
    _message([{"type": "text", "text": "Done: the API is designed in api/design.md."}], "end_turn"),
]


def test_crew_brain_runs_real_tools_and_sends_effort_and_fallback(company, tmp_path: Path, monkeypatch):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/count_tokens"):  # CrewAI counts tokens before every turn
            return httpx.Response(200, json={"input_tokens": 100})
        requests.append(request)
        reply = SCRIPT[min(len(requests), len(SCRIPT)) - 1]
        return httpx.Response(200, json=reply)

    mock_client = anthropic.Anthropic(
        api_key="test-key", max_retries=0, http_client=httpx.Client(transport=httpx.MockTransport(handler))
    )
    monkeypatch.setattr(LuciferAnthropic, "_build_sync_client", lambda self: mock_client)
    store, engine = company(CrewBrain(_company_info(), anthropic_llm(api_key="test-key")))
    engine.start()
    task = engine.assign(CreateTaskInput(title="Design the notes API", assignee_id="gabriel"))

    until(lambda: store.require_task(task.id).status in ("done", "failed"))

    done = store.require_task(task.id)
    assert done.status == "done", done.result
    assert done.result == "Wrote api/design.md"
    assert done.artifacts == ["api/design.md"]
    assert (tmp_path / "ws" / "api" / "design.md").read_text() == "# API design\n"

    body = json.loads(requests[0].content)
    assert body["model"] == "claude-opus-5-5"
    assert body["output_config"] == {"effort": "medium"}
    assert body["fallbacks"] == "default"
    assert FALLBACK_BETA in requests[0].headers.get("anthropic-beta", "")
    assert "thinking" not in body  # Opus 5.5: adaptive thinking by default
    tool_names = {t["name"] for t in body["tools"]}
    assert {"write_file", "complete_task", "post_update"} <= tool_names
    assert "delegate_task" not in tool_names  # gabriel has no reports

    until(lambda: store.require_agent("gabriel").stats.output_tokens > 0)
    assert store.require_agent("gabriel").stats.tasks_completed == 1


def _company_info():
    from .conftest import COMPANY_FILE
    from lucifer_engine.config import load_company

    return load_company(COMPANY_FILE).company


def _chat(message: dict, finish: str) -> dict:
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 0,
        "model": "deepseek/deepseek-chat",
        "choices": [{"index": 0, "message": {"role": "assistant", **message}, "finish_reason": finish}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120},
    }


def _call(call_id: str, name: str, args: dict) -> dict:
    return _chat(
        {"content": None, "tool_calls": [{"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]},
        "tool_calls",
    )


GATEWAY_SCRIPT = [
    _call("call_1", "write_file", {"path": "content/captions.md", "content": "# Caption\n"}),
    _call("call_2", "complete_task", {"summary": "Wrote content/captions.md"}),
    _chat({"content": "Done."}, "stop"),
]


def test_gateway_calls_cloudflare_compat_with_deepseek(company, tmp_path: Path, monkeypatch):
    import crewai.llms.providers.openai.completion as openai_completion

    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=GATEWAY_SCRIPT[min(len(requests), len(GATEWAY_SCRIPT)) - 1])

    real_openai = openai_completion.OpenAI
    monkeypatch.setattr(
        openai_completion,
        "OpenAI",
        lambda **kw: real_openai(**{**kw, "max_retries": 0, "http_client": httpx.Client(transport=httpx.MockTransport(handler))}),
    )
    gateway = GatewaySettings(
        base_url="https://gateway.ai.cloudflare.com/v1/acc123/lucifer/compat",
        gateway_id="lucifer",
        token="cf-token",
        provider_key=None,
        strict_tools=False,
        byok_alias="thaomai",
    )
    store, engine = company(CrewBrain(_company_info(), gateway_llm(gateway)))
    for agent in store.list_agents():
        store.update_agent(agent.id, model="deepseek/deepseek-chat")
    engine.start()
    task = engine.assign(CreateTaskInput(title="Write captions", assignee_id="belial"))

    until(lambda: store.require_task(task.id).status in ("done", "failed"))

    done = store.require_task(task.id)
    assert done.status == "done", done.result
    assert done.artifacts == ["content/captions.md"]

    first = requests[0]
    assert str(first.url) == "https://gateway.ai.cloudflare.com/v1/acc123/lucifer/compat/chat/completions"
    assert first.headers["authorization"] == "Bearer cf-token"  # BYOK: the Cloudflare token is the API key
    assert first.headers["cf-aig-gateway-id"] == "lucifer"
    assert first.headers["cf-aig-byok-alias"] == "thaomai"
    body = json.loads(first.content)
    assert body["model"] == "deepseek/deepseek-chat"
    assert all("strict" not in t["function"] for t in body["tools"])
    assert "output_config" not in body and "fallbacks" not in body


def test_gateway_with_provider_key_sends_token_in_cf_aig_authorization():
    from lucifer_engine.protocol import Agent, Appearance

    gateway = GatewaySettings(
        base_url="https://gateway.ai.cloudflare.com/v1/a/g/compat",
        gateway_id=None,
        token="cf-token",
        provider_key="sk-deepseek",
        strict_tools=False,
    )
    agent = Agent(
        id="x", name="X", title="T", department_id="d", manager_id=None, persona="", model="deepseek/deepseek-chat",
        effort="medium", appearance=Appearance(color="#000", emoji="🙂"),
    )
    llm = gateway_llm(gateway)(agent)
    assert isinstance(llm, GatewayCompletion)
    assert llm.api_key == "sk-deepseek"
    assert llm.default_headers == {"cf-aig-authorization": "Bearer cf-token"}
