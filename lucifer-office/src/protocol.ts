/**
 * lucifer-engine's data types, mirroring `lucifer_engine/protocol.py`.
 * Check against `uv run lucifer-engine schema` whenever the engine protocol changes.
 */

export type AgentStatus = "idle" | "thinking" | "working" | "waiting" | "offline";
export type TaskStatus = "todo" | "in_progress" | "waiting" | "done" | "failed" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type ActivityKind =
  | "task_assigned"
  | "task_started"
  | "task_delegated"
  | "task_completed"
  | "task_failed"
  | "update"
  | "thought"
  | "file_written"
  | "error";

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ["done", "failed", "cancelled"];

/** Translations by language, e.g. { vi: { title: "Kỹ sư Backend" } }. Base fields are English. */
export type Translations = Record<string, Record<string, string>>;

export interface Department {
  id: string;
  name: string;
  color: string;
  i18n?: Translations;
}

export interface Agent {
  id: string;
  name: string;
  title: string;
  departmentId: string;
  managerId: string | null;
  persona: string;
  model: string;
  effort: Effort;
  appearance: { color: string; emoji: string };
  status: AgentStatus;
  currentTaskId: string | null;
  stats: { tasksCompleted: number; tasksFailed: number; inputTokens: number; outputTokens: number };
  /** Translations of title and persona. */
  i18n?: Translations;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  createdById: string | null;
  parentId: string | null;
  /** The language agents must write in, detected from the owner's request; subtasks inherit it. */
  language?: string | null;
  result: string | null;
  artifacts: string[];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Activity {
  id: string;
  at: string;
  kind: ActivityKind;
  agentId: string | null;
  taskId: string | null;
  text: string;
  targetAgentId: string | null;
}

export interface CompanyInfo {
  name: string;
  mission: string;
  departments: Department[];
  /** Translations of name and mission. */
  i18n?: Translations;
}

export interface EngineInfo {
  brain: "crew" | "sim";
  /** E.g. "Cloudflare AI Gateway · deepseek/deepseek-chat"; null in simulation. */
  llm?: string | null;
  running: boolean;
  heartbeatMs: number;
  maxConcurrent: number;
}

export interface Snapshot {
  company: CompanyInfo;
  engine: EngineInfo;
  agents: Agent[];
  tasks: Task[];
  activities: Activity[];
}

export type ServerEvent =
  | { type: "snapshot"; data: Snapshot }
  | { type: "agent.updated"; data: Agent }
  | { type: "task.created"; data: Task }
  | { type: "task.updated"; data: Task }
  | { type: "activity"; data: Activity }
  | { type: "engine.updated"; data: EngineInfo };

export interface CreateTaskInput {
  title: string;
  description?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  /** Force the reply language, e.g. "English"; when empty the engine detects it. */
  language?: string;
}
