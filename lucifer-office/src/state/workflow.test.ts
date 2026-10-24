import { describe, expect, it } from "vitest";
import type { Activity, Agent, Task } from "../protocol";
import { childrenIndex, clock, descendants, latestByTask, latestInTree, phaseOf, plainLine, rootOf, treeProgress, workFocus } from "./workflow";

function task(id: string, status: Task["status"], parentId: string | null = null, assigneeId = id): Task {
  const at = `2026-10-24T10:00:0${id.length}Z`;
  return {
    id,
    title: id,
    description: "",
    status,
    priority: "normal",
    assigneeId,
    createdById: null,
    parentId,
    result: null,
    artifacts: [],
    createdAt: at,
    updatedAt: at,
    startedAt: at,
    finishedAt: null,
  };
}

function byId(...list: Task[]): Record<string, Task> {
  return Object.fromEntries(list.map((t) => [t.id, t]));
}

function activity(id: string, kind: Activity["kind"], taskId: string, at: string): Activity {
  return { id, kind, taskId, at, agentId: "a", text: id, targetAgentId: null };
}

describe("workflow", () => {
  const tasks = byId(task("r", "waiting"), task("c1", "done", "r"), task("c2", "in_progress", "r"), task("g1", "todo", "c2"));
  const index = childrenIndex(tasks);

  it("walks the delegation tree depth first and finds the root", () => {
    expect(descendants("r", tasks, index).map((t) => t.id)).toEqual(["r", "c1", "c2", "g1"]);
    expect(rootOf("g1", tasks)?.id).toBe("r");
  });

  it("measures progress below the root and keeps an open mission under 100%", () => {
    const p = treeProgress(descendants("r", tasks, index));
    expect(p).toMatchObject({ total: 3, finished: 1, failed: 0, activeAgentIds: ["c2"] });
    expect(p.ratio).toBeGreaterThan(0.1);
    expect(p.ratio).toBeLessThan(1);
  });

  it("names the phase the way an owner would read it", () => {
    const solo = task("s", "in_progress");
    expect(phaseOf(solo, treeProgress([solo]))).toBe("working");
    expect(phaseOf(tasks.r!, treeProgress(descendants("r", tasks, index)))).toBe("team");
    // Every subtask finished and the parent is back in the queue: its owner will merge the results.
    const back = byId(task("r", "todo"), task("c1", "done", "r"));
    const backTree = descendants("r", back, childrenIndex(back));
    expect(phaseOf(back.r!, treeProgress(backTree))).toBe("merging");
    expect(phaseOf(task("q", "todo"), treeProgress([task("q", "todo")]))).toBe("queued");
    expect(treeProgress([task("d", "done")]).ratio).toBe(1);
  });

  it("keeps the latest meaningful activity per task", () => {
    const latest = latestByTask([
      activity("1", "update", "c2", "2026-10-24T10:00:01Z"),
      activity("2", "task_assigned", "c2", "2026-10-24T10:00:02Z"),
      activity("3", "file_written", "c1", "2026-10-24T10:00:03Z"),
    ]);
    expect(latest.get("c2")?.id).toBe("1");
    expect(latestInTree(descendants("r", tasks, index), latest)?.id).toBe("3");
  });

  it("formats running clocks and one-line agent text", () => {
    expect(clock("2026-10-24T10:00:00Z", Date.parse("2026-10-24T10:01:05Z"))).toBe("1:05");
    expect(clock("2026-10-24T10:00:00Z", Date.parse("2026-10-24T11:02:03Z"))).toBe("1:02:03");
    expect(plainLine("## Plan\n- **write** [docs](x.md)")).toBe("Plan - write docs");
  });

  it("focuses the camera on whoever works and both ends of recent hand-offs", () => {
    const agents = Object.fromEntries(
      (
        [
          ["ceo", "waiting"],
          ["cto", "working"],
          ["dev", "idle"],
          ["cmo", "idle"],
        ] as const
      ).map(([id, status]) => [id, { id, status } as Agent]),
    );
    const now = Date.parse("2026-10-24T10:00:10Z");
    const work = byId(task("root", "waiting", null, "ceo"), task("sub", "done", "root", "cmo"));
    const log: Activity[] = [
      { id: "old", kind: "task_delegated", taskId: "x", at: "2026-10-24T09:59:00Z", agentId: "cto", targetAgentId: "dev", text: "" },
      { id: "up", kind: "task_completed", taskId: "sub", at: "2026-10-24T10:00:08Z", agentId: "cmo", targetAgentId: null, text: "" },
    ];
    expect(workFocus(agents, work, log, now)).toEqual(["ceo", "cmo", "cto"]);
  });
});
