import { type Activity, type Agent, type Task, TERMINAL_TASK_STATUSES } from "../protocol";

/**
 * Derived views of how work flows through the company: task trees, progress and phases.
 * Pure functions over the store's data, so they can be tested and memoized.
 */

/** Subtasks by parent id, oldest first. Build once per render and share it. */
export function childrenIndex(tasks: Record<string, Task>): Map<string, Task[]> {
  const index = new Map<string, Task[]>();
  for (const task of Object.values(tasks)) {
    if (!task.parentId) continue;
    const list = index.get(task.parentId);
    if (list) list.push(task);
    else index.set(task.parentId, [task]);
  }
  for (const list of index.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return index;
}

/** The task and all its descendants, depth first. */
export function descendants(rootId: string, tasks: Record<string, Task>, index: Map<string, Task[]>): Task[] {
  const root = tasks[rootId];
  if (!root) return [];
  const out: Task[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const task = stack.pop()!;
    out.push(task);
    const children = index.get(task.id);
    if (children) for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!);
  }
  return out;
}

/** The top-level task (the owner's request) a task belongs to. */
export function rootOf(taskId: string, tasks: Record<string, Task>): Task | undefined {
  let task = tasks[taskId];
  const seen = new Set<string>();
  while (task?.parentId && tasks[task.parentId] && !seen.has(task.id)) {
    seen.add(task.id);
    task = tasks[task.parentId];
  }
  return task;
}

export const isOpen = (task: Task) => !TERMINAL_TASK_STATUSES.includes(task.status);

/** How far a single task is, from 0 to 1. */
const WEIGHT: Record<Task["status"], number> = { todo: 0, in_progress: 0.4, waiting: 0.5, done: 1, failed: 1, cancelled: 1 };

export interface Progress {
  /** Subtasks below the root (the root itself is not counted). */
  total: number;
  finished: number;
  failed: number;
  /** Agents with an in-progress task in the tree, in tree order. */
  activeAgentIds: string[];
  /** 0..1 for the whole tree. An open root never reaches 1. */
  ratio: number;
}

export function treeProgress(tree: Task[]): Progress {
  const [root, ...subs] = tree;
  if (!root) return { total: 0, finished: 0, failed: 0, activeAgentIds: [], ratio: 0 };
  const finished = subs.filter((t) => !isOpen(t)).length;
  const failed = subs.filter((t) => t.status === "failed").length;
  const activeAgentIds = [...new Set(tree.filter((t) => t.status === "in_progress").map((t) => t.assigneeId))];
  let ratio: number;
  if (!isOpen(root)) ratio = 1;
  else if (subs.length === 0) ratio = WEIGHT[root.status] * 0.8;
  else {
    // The root's own work (planning, then merging) counts for a fifth; the subtasks for the rest.
    const subRatio = subs.reduce((sum, t) => sum + WEIGHT[t.status], 0) / subs.length;
    const merging = root.status === "in_progress" && finished === subs.length;
    ratio = 0.1 + subRatio * 0.75 + (merging ? 0.05 : 0);
  }
  return { total: subs.length, finished, failed, activeAgentIds, ratio: Math.min(isOpen(root) ? 0.97 : 1, ratio) };
}

/**
 * Where a request stands, in the words an owner would use:
 * queued → working (the assignee plans or does it) → team (subtasks in flight) → merging (results are back) → done.
 */
export type Phase = "queued" | "working" | "team" | "merging" | "done" | "failed" | "cancelled";

export function phaseOf(root: Task, progress: Progress): Phase {
  switch (root.status) {
    case "done":
    case "failed":
    case "cancelled":
      return root.status;
    case "waiting":
      return "team";
    case "todo":
      // Back in the queue after the subtasks finished: the owner will pick it up to merge.
      return progress.total > 0 && progress.finished === progress.total ? "merging" : "queued";
    case "in_progress":
      return progress.total > 0 && progress.finished === progress.total ? "merging" : "working";
  }
}

/** Kinds that say what an agent is doing right now; assignment noise is skipped. */
const NOW_KINDS = new Set<Activity["kind"]>(["update", "thought", "file_written", "task_delegated", "task_started", "error"]);

/** The latest meaningful activity for each task id. One pass over the activity log. */
export function latestByTask(activities: Activity[]): Map<string, Activity> {
  const latest = new Map<string, Activity>();
  for (const a of activities) if (a.taskId && NOW_KINDS.has(a.kind)) latest.set(a.taskId, a);
  return latest;
}

/** The most recent activity anywhere in a tree. */
export function latestInTree(tree: Task[], latest: Map<string, Activity>): Activity | undefined {
  let best: Activity | undefined;
  for (const task of tree) {
    const a = latest.get(task.id);
    if (a && (!best || a.at > best.at)) best = a;
  }
  return best;
}

/** "1:05", "12:40", "1:02:03": a running clock for active work. */
export function clock(fromIso: string, toMs: number): string {
  const s = Math.max(0, Math.floor((toMs - Date.parse(fromIso)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** One line of agent text for a compact live status: markdown markers removed, whitespace collapsed. */
export function plainLine(text: string, max = 120): string {
  const line = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~]+/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** How long after a hand-off its two ends stay in the camera's focus. */
export const HANDOFF_FOCUS_MS = 6000;

/**
 * The agents the camera should frame to show work moving right now: everyone thinking or working,
 * plus both ends of every recent hand-off (a delegation going down, a report going back up).
 */
export function workFocus(agents: Record<string, Agent>, tasks: Record<string, Task>, activities: Activity[], now: number): string[] {
  const ids = new Set<string>();
  for (const agent of Object.values(agents)) if (agent.status === "working" || agent.status === "thinking") ids.add(agent.id);
  for (let i = activities.length - 1; i >= 0; i--) {
    const a = activities[i]!;
    if (now - Date.parse(a.at) > HANDOFF_FOCUS_MS) break;
    if (!a.agentId) continue;
    if (a.kind === "task_delegated" && a.targetAgentId) {
      ids.add(a.agentId).add(a.targetAgentId);
    } else if (a.kind === "task_completed" && a.taskId) {
      const parentId = tasks[a.taskId]?.parentId;
      const manager = parentId ? tasks[parentId]?.assigneeId : undefined;
      if (manager) ids.add(a.agentId).add(manager);
    }
  }
  return [...ids].filter((id) => agents[id]).sort();
}
