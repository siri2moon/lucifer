"""`lucifer-engine serve` runs the company; `lucifer-engine schema` exports the protocol as JSON Schema."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys

from pydantic import TypeAdapter


def serve() -> None:
    import uvicorn
    from dotenv import load_dotenv

    load_dotenv()

    from .brains.crew import CrewBrain, anthropic_llm, gateway_llm
    from .brains.sim import SimBrain
    from .config import Settings, load_company
    from .engine import Engine
    from .server import create_app
    from .store import CompanyStore

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = Settings.from_env()
    loaded = load_company(settings.company_file)
    agents = loaded.agents
    if settings.model_override:
        agents = [a.model_copy(update={"model": settings.model_override}) for a in agents]
    store = CompanyStore(loaded.company, agents, settings.data_dir / "state.json")
    brain_kind = settings.resolved_brain()
    if brain_kind == "sim":
        brain = SimBrain()
    elif settings.llm == "gateway":
        assert settings.gateway is not None
        brain = CrewBrain(loaded.company, gateway_llm(settings.gateway))
    else:
        brain = CrewBrain(loaded.company, anthropic_llm(fallbacks=settings.fallbacks))
    engine = Engine(
        store,
        brain,
        heartbeat_s=settings.heartbeat_s,
        max_concurrent=settings.max_concurrent,
        workspace_dir=settings.workspace_dir,
        llm_label=settings.llm_label(),
    )
    logging.getLogger("lucifer").info(
        "😇 %s: %d employees, brain %r (%s), workspace %s",
        loaded.company.name,
        len(agents),
        brain_kind,
        settings.llm_label() if brain_kind == "crew" else "no LLM calls",
        settings.workspace_dir,
    )
    code = 0
    try:
        uvicorn.run(
            create_app(store, engine, settings.workspace_dir),
            host=settings.host,
            port=settings.port,
            # Don't wait forever for the office's WebSockets on shutdown.
            timeout_graceful_shutdown=5,
        )
    except SystemExit as exc:  # uvicorn calls sys.exit when it cannot bind the port.
        code = exc.code if isinstance(exc.code, int) else 1
    # State was saved during shutdown. Exit now instead of letting Python join agent threads that may be
    # stuck in an LLM call: the process would hang forever with no port but open LLM connections.
    # Tasks that were in progress go back to todo on the next start.
    logging.getLogger("lucifer").info("Engine stopped")
    logging.shutdown()
    os._exit(code)


def schema() -> None:
    from .protocol import CreateTaskInput, ServerEvent

    out = {
        "ServerEvent": TypeAdapter(ServerEvent).json_schema(by_alias=True),
        "CreateTaskInput": CreateTaskInput.model_json_schema(by_alias=True),
    }
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


def main() -> None:
    parser = argparse.ArgumentParser(prog="lucifer-engine")
    parser.add_argument("command", choices=["serve", "schema"], nargs="?", default="serve")
    args = parser.parse_args()
    serve() if args.command == "serve" else schema()
