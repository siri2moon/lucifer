import { useT } from "../i18n";
import { type PanelId, useOffice } from "../state/office";

type Dir = "left" | "right" | "up" | "down";
const CHEVRON: Record<Dir, string> = {
  left: "M10 3 5 8l5 5",
  right: "M6 3l5 5-5 5",
  up: "M3 10l5-5 5 5",
  down: "M3 6l5 5 5-5",
};

function Chevron({ dir }: { dir: Dir }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={CHEVRON[dir]} />
    </svg>
  );
}

/** Collapse button in each panel's header; the chevron points where the panel slides. */
export function CollapseButton({ id, dir }: { id: PanelId; dir: Dir }) {
  const togglePanel = useOffice((s) => s.togglePanel);
  const t = useT();
  const label = t.panels.collapse(t.panels.names[id]);
  return (
    <button type="button" className="icon-btn icon-btn--flat" onClick={() => togglePanel(id)} title={label} aria-label={label}>
      <Chevron dir={dir} />
    </button>
  );
}

/** Handles left at the screen edge for collapsed panels, each with that panel's key number. */
export function PanelHandles() {
  const collapsed = useOffice((s) => s.collapsed);
  const togglePanel = useOffice((s) => s.togglePanel);
  const agents = useOffice((s) => s.agents);
  const tasks = useOffice((s) => s.tasks);
  const t = useT();

  const list = Object.values(agents);
  const busy = list.filter((a) => a.status === "thinking" || a.status === "working").length;
  const open = Object.values(tasks).filter((x) => x.status === "in_progress" || x.status === "waiting" || x.status === "todo").length;

  const handle = (id: PanelId, dir: Dir, badge?: string) => {
    if (!collapsed[id]) return null;
    const label = t.panels.expand(t.panels.names[id]);
    return (
      <button key={id} type="button" className={`handle handle--${id} glass`} onClick={() => togglePanel(id)} title={label} aria-label={label}>
        <Chevron dir={dir} />
        <span>{t.panels.handles[id]}</span>
        {badge && <b className="handle__badge">{badge}</b>}
      </button>
    );
  };

  return (
    <>
      {handle("team", "right", `${busy}/${list.length}`)}
      {handle("board", "left", open > 0 ? String(open) : undefined)}
      {handle("assign", "up")}
    </>
  );
}
