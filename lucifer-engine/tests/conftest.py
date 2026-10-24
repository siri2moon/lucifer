from __future__ import annotations

import time
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest

from lucifer_engine.brains.base import Brain
from lucifer_engine.config import load_company
from lucifer_engine.engine import Engine
from lucifer_engine.store import CompanyStore

COMPANY_FILE = Path(__file__).resolve().parent.parent / "companies" / "lucifer-corp.yaml"


def make_store(state_path: Path | None = None) -> CompanyStore:
    loaded = load_company(COMPANY_FILE)
    return CompanyStore(loaded.company, loaded.agents, state_path)


def until(cond: Callable[[], bool], timeout_s: float = 10) -> None:
    deadline = time.monotonic() + timeout_s
    while not cond():
        if time.monotonic() > deadline:
            raise TimeoutError("condition not met before the timeout")
        time.sleep(0.01)


@pytest.fixture
def company(tmp_path: Path) -> Iterator[Callable[[Brain], tuple[CompanyStore, Engine]]]:
    engines: list[Engine] = []

    def build(brain: Brain) -> tuple[CompanyStore, Engine]:
        store = make_store(tmp_path / "state.json")
        engine = Engine(store, brain, heartbeat_s=0.02, max_concurrent=9, workspace_dir=tmp_path / "ws")
        engines.append(engine)
        return store, engine

    yield build
    for engine in engines:
        engine.stop()
