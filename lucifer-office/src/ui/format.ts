import type { Messages } from "../i18n";
import type { ActivityKind, TaskPriority } from "../protocol";

export const PRIORITIES: TaskPriority[] = ["urgent", "high", "normal", "low"];

export const ACTIVITY_ICONS: Record<ActivityKind, string> = {
  task_assigned: "📨",
  task_started: "▶️",
  task_delegated: "🤝",
  task_completed: "✅",
  task_failed: "❌",
  update: "💬",
  thought: "💭",
  file_written: "📄",
  error: "⚠️",
};

export function timeAgo(iso: string, units: Messages["ago"], now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}${units.s}`;
  if (s < 3600) return `${Math.floor(s / 60)}${units.m}`;
  if (s < 86400) return `${Math.floor(s / 3600)}${units.h}`;
  return `${Math.floor(s / 86400)}${units.d}`;
}

export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
