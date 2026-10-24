"""REST + WebSocket cho lucifer-office."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from .engine import Engine
from .protocol import CreateTaskInput, Model, Snapshot, SnapshotEvent
from .session import WorkspacePathError, list_workspace_files, resolve_workspace_path
from .store import CompanyStore, NotFoundError


def create_app(store: CompanyStore, engine: Engine, workspace_dir: Path, *, start_engine: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        if start_engine:
            engine.start()
        try:
            yield
        finally:
            await asyncio.to_thread(engine.stop)
            store.flush()

    app = FastAPI(title="lucifer-engine", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(NotFoundError)
    async def _not_found(_req: Request, err: NotFoundError) -> JSONResponse:
        return JSONResponse({"error": str(err)}, status_code=404)

    @app.exception_handler(WorkspacePathError)
    async def _bad_path(_req: Request, err: WorkspacePathError) -> JSONResponse:
        return JSONResponse({"error": str(err)}, status_code=400)

    def snapshot() -> Snapshot:
        return Snapshot(
            company=store.company,
            engine=engine.info(),
            agents=store.list_agents(),
            tasks=store.list_tasks(),
            activities=store.list_activities(),
        )

    @app.get("/health")
    def health() -> dict:
        return {"ok": True}

    @app.get("/api/snapshot")
    def get_snapshot() -> dict:
        return snapshot().to_json()

    @app.get("/api/agents")
    def list_agents() -> list[dict]:
        return [a.to_json() for a in store.list_agents()]

    @app.get("/api/agents/{agent_id}")
    def get_agent(agent_id: str) -> dict:
        return store.require_agent(agent_id).to_json()

    @app.get("/api/tasks")
    def list_tasks() -> list[dict]:
        return [t.to_json() for t in store.list_tasks()]

    @app.get("/api/tasks/{task_id}")
    def get_task(task_id: str) -> dict:
        task = store.require_task(task_id)
        return {
            "task": task.to_json(),
            "subtasks": [t.to_json() for t in store.subtasks(task.id)],
            "activities": [a.to_json() for a in store.list_activities() if a.task_id == task.id],
        }

    @app.post("/api/tasks", status_code=201)
    def create_task(body: CreateTaskInput) -> dict:
        return engine.assign(body).to_json()

    @app.post("/api/tasks/{task_id}/cancel")
    def cancel_task(task_id: str) -> dict:
        return engine.cancel(task_id).to_json()

    @app.post("/api/engine/start")
    def start() -> dict:
        engine.start()
        return engine.info().to_json()

    @app.post("/api/engine/stop")
    async def stop() -> dict:
        await asyncio.to_thread(engine.stop)
        return engine.info().to_json()

    @app.get("/api/files")
    def list_files() -> list[str]:
        return list_workspace_files(workspace_dir)

    @app.get("/api/files/{path:path}", response_class=PlainTextResponse)
    def read_file(path: str) -> str:
        target = resolve_workspace_path(workspace_dir, path)
        if not target.is_file():
            raise HTTPException(404, "File not found")
        return target.read_text("utf-8")

    @app.websocket("/ws")
    async def ws(socket: WebSocket) -> None:
        """Send a snapshot on connect, then push every change event.

        Subscribes before taking the snapshot so no change is missed; a few events may
        repeat what the snapshot already contains (clients merge by id).
        """
        await socket.accept()
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict] = asyncio.Queue()

        def forward(event: Model) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, event.to_json())

        unsubscribe = store.subscribe(forward)
        try:
            await socket.send_json(SnapshotEvent(data=snapshot()).to_json())
            while True:
                await socket.send_json(await queue.get())
        except WebSocketDisconnect:
            pass
        finally:
            unsubscribe()

    return app
