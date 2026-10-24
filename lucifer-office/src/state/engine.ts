import type { CreateTaskInput, ServerEvent, Task } from "../protocol";
import { useOffice } from "./office";

/** Empty means same origin (the dev server proxies to the engine). */
const ENGINE_URL = (import.meta.env.VITE_ENGINE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

function wsUrl(): string {
  const base = ENGINE_URL || window.location.origin;
  return `${base.replace(/^http/, "ws")}/ws`;
}

/** WebSocket connection to the engine that reconnects with backoff. Returns a disposer. */
export function connectEngine(): () => void {
  let socket: WebSocket | null = null;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const { apply, setConnection } = useOffice.getState();

  const open = () => {
    setConnection("connecting");
    socket = new WebSocket(wsUrl());
    socket.onopen = () => {
      retry = 0;
      setConnection("open");
    };
    socket.onmessage = (m) => apply(JSON.parse(m.data as string) as ServerEvent);
    socket.onclose = () => {
      setConnection("closed");
      if (stopped) return;
      const delay = Math.min(10_000, 500 * 2 ** retry++);
      timer = setTimeout(open, delay);
    };
  };
  open();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    socket?.close();
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; detail?: unknown } | null;
    throw new Error(body?.error ?? (body?.detail ? JSON.stringify(body.detail) : `HTTP ${res.status}`));
  }
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("json") ? res.json() : res.text()) as Promise<T>;
}

export const engineApi = {
  createTask: (input: CreateTaskInput) => request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
  cancelTask: (id: string) => request<Task>(`/api/tasks/${id}/cancel`, { method: "POST" }),
  readFile: (path: string) => request<string>(`/api/files/${path.split("/").map(encodeURIComponent).join("/")}`),
  start: () => request("/api/engine/start", { method: "POST" }),
  stop: () => request("/api/engine/stop", { method: "POST" }),
};
