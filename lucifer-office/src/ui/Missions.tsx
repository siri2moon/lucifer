import { useMemo, useState } from "react";
import { useActivityText, useT } from "../i18n";
import type { Task } from "../protocol";
import { useOffice } from "../state/office";
import { descendants, isOpen, latestInTree, phaseOf, plainLine, treeProgress } from "../state/workflow";
import { useChildrenIndex, useLatestByTask, useNow } from "./live";
import { Elapsed, ProgressBar, StatusGlyph, usePhaseStatus } from "./Workflow";

/** A finished request stays in the dock this long, so the owner sees it land. */
const LINGER_MS = 20_000;
const VISIBLE = 3;

/**
 * Live missions, docked just above the assign bar: every request you give the company appears here
 * the moment it is assigned, and shows its phase, progress, who is working and what they just did.
 */
export function Missions() {
  const tasks = useOffice((s) => s.tasks);
  const [showAll, setShowAll] = useState(false);
  const t = useT();
  const roots = useMemo(() => Object.values(tasks).filter((task) => !task.parentId), [tasks]);
  const anyOpen = roots.some(isOpen);
  // Tick while something is open or just finished, so finished missions leave on time.
  const now = useNow(anyOpen || roots.some((r) => r.finishedAt && Date.now() - Date.parse(r.finishedAt) < LINGER_MS)) || Date.now();

  const missions = useMemo(
    () =>
      roots
        .filter((r) => isOpen(r) || (r.finishedAt && now - Date.parse(r.finishedAt) < LINGER_MS))
        .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.createdAt.localeCompare(a.createdAt)),
    [roots, now],
  );
  if (missions.length === 0) return null;
  const shown = showAll ? missions : missions.slice(0, VISIBLE);

  return (
    <section className={`missions${showAll ? " missions--all" : ""}`} aria-label={t.workflow.missions} aria-live="polite">
      {shown.map((root) => (
        <MissionCard key={root.id} root={root} />
      ))}
      {missions.length > VISIBLE && (
        <button type="button" className="missions__more glass" onClick={() => setShowAll((v) => !v)}>
          {showAll ? t.workflow.fewer : t.workflow.more(missions.length - VISIBLE)}
        </button>
      )}
    </section>
  );
}

function MissionCard({ root }: { root: Task }) {
  const tasks = useOffice((s) => s.tasks);
  const agents = useOffice((s) => s.agents);
  const selectTask = useOffice((s) => s.selectTask);
  const selected = useOffice((s) => s.selectedTaskId);
  const index = useChildrenIndex();
  const latest = useLatestByTask();
  const describe = useActivityText();
  const status = usePhaseStatus();
  const t = useT();

  const tree = useMemo(() => descendants(root.id, tasks, index), [root.id, tasks, index]);
  const progress = treeProgress(tree);
  const phase = phaseOf(root, progress);
  const last = isOpen(root) ? latestInTree(tree, latest) : undefined;
  const lastAgent = last?.agentId ? agents[last.agentId] : undefined;
  const isSelected = selected !== null && tree.some((task) => task.id === selected);

  return (
    <button
      type="button"
      className={`mission glass mission--${phase}${isSelected ? " is-selected" : ""}`}
      onClick={() => selectTask(root.id)}
      title={t.workflow.open}
    >
      <div className="mission__head">
        <StatusGlyph status={root.status} />
        <span className="mission__title">{root.title}</span>
        <span className="mission__crew">
          {progress.activeAgentIds.slice(0, 5).map((id) => {
            const a = agents[id];
            return a ? (
              <span key={id} className="mission__avatar" style={{ "--agent": a.appearance.color } as React.CSSProperties} title={a.name}>
                {a.appearance.emoji}
              </span>
            ) : null;
          })}
        </span>
        <Elapsed task={root} />
      </div>
      <ProgressBar ratio={progress.ratio} phase={phase} />
      <div className="mission__foot">
        <b>{t.workflow.phase[phase]}</b>
        <span className="mission__sep">·</span>
        {last && lastAgent ? (
          <span className="mission__now" key={last.id}>
            {lastAgent.appearance.emoji} <strong>{lastAgent.name}</strong> {plainLine(describe(last), 110)}
          </span>
        ) : (
          <span className="mission__now">{status(root, phase, progress)}</span>
        )}
      </div>
    </button>
  );
}
