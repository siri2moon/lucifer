from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from lucifer_engine.brains.sim import SimBrain
from lucifer_engine.engine import Engine
from lucifer_engine.server import create_app

from .conftest import make_store


def test_assign_over_rest_follow_over_websocket_read_files(tmp_path: Path):
    store = make_store()
    ws_dir = tmp_path / "ws"
    engine = Engine(store, SimBrain(step_s=0.002), heartbeat_s=0.02, max_concurrent=9, workspace_dir=ws_dir)

    with TestClient(create_app(store, engine, ws_dir)) as client:
        with client.websocket_connect("/ws") as ws:
            first = ws.receive_json()
            assert first["type"] == "snapshot"
            assert len(first["data"]["agents"]) == 9
            assert first["data"]["engine"]["brain"] == "sim"
            assert "departmentId" in first["data"]["agents"][0]  # JSON is camelCase

            res = client.post("/api/tasks", json={"title": "Launch a notes app", "description": "PRD, architecture, marketing"})
            assert res.status_code == 201
            root = res.json()
            assert root["assigneeId"] == "lucifer"

            types: set[str] = set()
            while True:
                event = ws.receive_json()
                types.add(event["type"])
                if event["type"] == "task.updated" and event["data"]["id"] == root["id"] and event["data"]["status"] == "done":
                    break
            assert {"agent.updated", "task.created", "task.updated", "activity"} <= types

        detail = client.get(f"/api/tasks/{root['id']}").json()
        assert detail["subtasks"]

        files = client.get("/api/files").json()
        assert files
        file = client.get(f"/api/files/{files[0]}")
        assert file.status_code == 200
        assert file.text.startswith("#")


def test_rejects_bad_body_unknown_task_and_paths_outside_workspace(tmp_path: Path):
    store = make_store()
    engine = Engine(store, SimBrain(step_s=0.002), heartbeat_s=0.02, max_concurrent=1, workspace_dir=tmp_path)

    with TestClient(create_app(store, engine, tmp_path, start_engine=False)) as client:
        assert client.post("/api/tasks", json={}).status_code == 422
        assert client.post("/api/tasks", json={"title": "x", "assigneeId": "nobody"}).status_code == 404
        assert client.get("/api/tasks/T-nope").status_code == 404
        escape = client.get("/api/files/..%2F..%2Fetc%2Fpasswd")
        assert escape.status_code == 400
        assert "workspace" in escape.json()["error"]
