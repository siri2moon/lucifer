import { useMemo } from "react";
import { useActivityText, useT } from "../i18n";
import type { Task } from "../protocol";
import { useOffice } from "../state/office";
import { clock, descendants, isOpen, type Phase, phaseOf, plainLine, type Progress, rootOf, treeProgress } from "../state/workflow";
import { useChildrenIndex, useLatestByTask, useNow } from "./live";

/** Status glyph for a task: a spinner while working, an hourglass while waiting, a check when done. */
export function StatusGlyph({ status }: { status: Task["status"] }) {
  switch (status) {
    case "in_progress":
      return <span className="glyph glyph--spin" aria-hidden />;
    case "waiting":
      return <span className="glyph glyph--wait" aria-hidden>⏳</span>;
    case "todo":
      return <span className="glyph glyph--todo" aria-hidden />;
    case "done":
      return <span className="glyph glyph--done" aria-hidden>✓</span>;
    case "failed":
      return <span className="glyph glyph--failed" aria-hidden>✕</span>;
    case "cancelled":
      return <span className="glyph glyph--cancelled" aria-hidden>–</span>;
  }
}

/** A progress bar that streams while work is moving and settles when it ends. */
export function ProgressBar({ ratio, phase }: { ratio: number; phase: Phase }) {
  return (
    <div className={`progress progress--${phase}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
      <div className="progress__fill" style={{ width: `${Math.max(4, ratio * 100)}%` }} />
    </div>
  );
}

/** How long a task has run: a live clock while open, the final duration once finished. */
export function Elapsed({ task }: { task: Task }) {
  const running = task.status === "in_progress" || task.status === "waiting";
  const now = useNow(running);
  if (!task.startedAt) return null;
  const end = running ? now || Date.now() : task.finishedAt ? Date.parse(task.finishedAt) : Date.parse(task.updatedAt);
  return <span className={`elapsed${running ? " elapsed--live" : ""}`}>{clock(task.startedAt, end)}</span>;
}

/** The sentence under a mission: who is doing what at this phase. */
export function usePhaseStatus() {
  const t = useT();
  const agents = useOffice((s) => s.agents);
  return (root: Task, phase: Phase, progress: Progress) => {
    const name = agents[root.assigneeId]?.name ?? "";
    switch (phase) {
      case "queued":
        return t.workflow.status.queued(name);
      case "working":
        return t.workflow.status.working(name);
      case "team":
        return t.workflow.status.team(progress.finished, progress.total);
      case "merging":
        return t.workflow.status.merging(name);
      default:
        return t.workflow.status[phase];
    }
  };
}

const STEPS = ["queued", "working", "team", "merging", "done"] as const;
type Step = (typeof STEPS)[number];
const STEP_OF: Record<Phase, Step> = { queued: "queued", working: "working", team: "team", merging: "merging", done: "done", failed: "done", cancelled: "done" };

/** Received → Working → Team → Wrap-up → Done. Solo tasks skip the team steps. */
function Stepper({ phase, delegated }: { phase: Phase; delegated: boolean }) {
  const t = useT();
  const steps: readonly Step[] = delegated ? STEPS : STEPS.filter((s) => s !== "team" && s !== "merging");
  const current = steps.indexOf(STEP_OF[phase]);
  const ended = phase === "done" || phase === "failed" || phase === "cancelled";
  return (
    <ol className="stepper">
      {steps.map((step, i) => {
        const state = i < current || (ended && i === current) ? "past" : i === current ? "now" : "next";
        const label = step === "done" && ended ? t.workflow.phase[phase] : t.workflow.steps[step];
        return (
          <li key={step} className={`stepper__step stepper__step--${state}${step === "done" && ended ? ` stepper__step--${phase}` : ""}`}>
            <span className="stepper__dot" />
            <span className="stepper__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The whole mission a task belongs to: a stepper, a progress bar and the delegation tree,
 * with the task being viewed highlighted and live status on the nodes that are working.
 */
export function Workflow({ taskId }: { taskId: string }) {
  const tasks = useOffice((s) => s.tasks);
  const index = useChildrenIndex();
  const t = useT();
  const status = usePhaseStatus();
  const root = rootOf(taskId, tasks);
  const tree = useMemo(() => (root ? descendants(root.id, tasks, index) : []), [root, tasks, index]);
  if (!root) return null;
  const progress = treeProgress(tree);
  const phase = phaseOf(root, progress);

  return (
    <section className="workflow">
      <h4>{t.workflow.title}</h4>
      <Stepper phase={phase} delegated={progress.total > 0} />
      <ProgressBar ratio={progress.ratio} phase={phase} />
      <div className="workflow__status">
        <span>{status(root, phase, progress)}</span>
        <Elapsed task={root} />
      </div>
      {tree.length > 1 && (
        <ul className="tree">
          <TreeNode task={root} currentId={taskId} index={index} />
        </ul>
      )}
    </section>
  );
}

function TreeNode({ task, currentId, index }: { task: Task; currentId: string; index: Map<string, Task[]> }) {
  const agent = useOffice((s) => s.agents[task.assigneeId]);
  const selectTask = useOffice((s) => s.selectTask);
  const latest = useLatestByTask();
  const describe = useActivityText();
  const t = useT();
  const children = index.get(task.id) ?? [];
  const openChildren = children.filter(isOpen).length;
  const live = task.status === "in_progress" ? latest.get(task.id) : undefined;

  return (
    <li className={`tree__item tree__item--${task.status}`}>
      <button
        type="button"
        className={`tree__node${task.id === currentId ? " is-current" : ""}`}
        onClick={() => selectTask(task.id)}
        style={agent ? ({ "--agent": agent.appearance.color } as React.CSSProperties) : undefined}
      >
        <StatusGlyph status={task.status} />
        <span className="tree__avatar" title={agent?.name}>
          {agent?.appearance.emoji}
        </span>
        <span className="tree__body">
          <span className="tree__title">{task.title}</span>
          {live && <span className="tree__live" key={live.id}>{plainLine(describe(live), 90)}</span>}
          {task.status === "waiting" && openChildren > 0 && <span className="tree__live">{t.workflow.waitingOn(openChildren)}</span>}
        </span>
        <Elapsed task={task} />
      </button>
      {children.length > 0 && (
        <ul className="tree">
          {children.map((child) => (
            <TreeNode key={child.id} task={child} currentId={currentId} index={index} />
          ))}
        </ul>
      )}
    </li>
  );
}
