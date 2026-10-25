import { useState } from "react";
import { useT } from "../i18n";
import { LangMenu } from "./LangMenu";
import { engineApi } from "../state/engine";
import { useOffice } from "../state/office";

export function TopBar() {
  const company = useOffice((s) => s.company);
  const engine = useOffice((s) => s.engine);
  const connection = useOffice((s) => s.connection);
  const agents = useOffice((s) => s.agents);
  const tasks = useOffice((s) => s.tasks);
  const panelsVisible = useOffice((s) => s.panelsVisible);
  const togglePanels = useOffice((s) => s.togglePanels);
  const openGuide = useOffice((s) => s.openGuide);
  const followWork = useOffice((s) => s.followWork);
  const toggleFollow = useOffice((s) => s.toggleFollow);
  const t = useT();
  const [busy, setBusy] = useState(false);

  const list = Object.values(agents);
  const busyAgents = list.filter((a) => a.status === "thinking" || a.status === "working").length;
  const openTasks = Object.values(tasks).filter((t) => t.status === "in_progress" || t.status === "waiting" || t.status === "todo").length;

  const toggle = async () => {
    if (!engine) return;
    setBusy(true);
    try {
      await (engine.running ? engineApi.stop() : engineApi.start());
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="topbar glass">
      <div className="brand">
        <Monogram />
        <div>
          <div className="brand__name">{company?.name ?? "Lucifer Office"}</div>
          <div className="brand__sub">{t.brandSub}</div>
        </div>
      </div>
      <div className="topbar__stats">
        <Stat label={t.stats.busy} value={`${busyAgents}/${list.length}`} />
        <Stat label={t.stats.open} value={openTasks} />
        <Stat
          label={connection === "open" ? t.stats.brain : t.connection[connection]}
          value={!engine ? "—" : engine.brain === "crew" ? modelName(engine.llm) : t.stats.sim}
          dot={connection}
          title={t.stats.brainTitle(engine?.brain === "crew" ? (engine.llm ?? "CrewAI") : t.stats.sim, t.connection[connection])}
        />
      </div>
      <div className="topbar__actions">
        <button
          className={`btn btn--square${panelsVisible ? "" : " btn--on"}`}
          onClick={togglePanels}
          title={panelsVisible ? t.panels.hideTitle : t.panels.showTitle}
          aria-label={panelsVisible ? t.panels.hide : t.panels.show}
          aria-pressed={!panelsVisible}
        >
          <PanelsIcon hidden={!panelsVisible} />
        </button>
        <button
          className={`btn btn--square${followWork ? " btn--on" : ""}`}
          onClick={toggleFollow}
          title={followWork ? t.camera.followOnTitle : t.camera.followOffTitle}
          aria-label={t.camera.follow}
          aria-pressed={followWork}
        >
          <FollowIcon />
        </button>
        <button className="btn btn--square" onClick={openGuide} title={t.guide.buttonTitle} aria-label={t.guide.button}>
          <HelpIcon />
        </button>
        <LangMenu />
        {engine && (
          <button className={`btn btn--engine ${engine.running ? "btn--ghost" : "btn--primary"}`} onClick={toggle} disabled={busy || connection !== "open"}>
            {engine.running ? t.engine.pause : t.engine.start}
          </button>
        )}
      </div>
    </header>
  );
}

function Stat({ label, value, dot, title }: { label: string; value: string | number; dot?: string; title?: string }) {
  return (
    <div className="stat" title={title}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">
        {dot && <span className={`stat__dot stat__dot--${dot}`} />}
        {label}
      </div>
    </div>
  );
}

/** "Cloudflare AI Gateway · deepseek/deepseek-chat" → "deepseek-chat"; the full source is in the tooltip. */
function modelName(llm: string | null | undefined): string {
  if (!llm) return "CrewAI";
  const model = llm.split(" · ").pop() ?? llm;
  return model.split("/").pop()?.replace(/^claude-/, "") || model;
}

function PanelsIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      {hidden ? <path d="M3 9h18" /> : <path d="M9 4v16M15 4v16" />}
    </svg>
  );
}

/** A camera with a focus bracket: the view follows the work. */
function FollowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.4 9.2a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.4-2.6 4" />
      <path d="M12 17.4h.01" />
    </svg>
  );
}

/** The house crest: a gilded L in a navy medallion, ringed by six stars. */
function Monogram() {
  const stars = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return [24 + Math.cos(a) * 18.5, 24 + Math.sin(a) * 18.5] as const;
  });
  return (
    <svg className="brand__logo" viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="crest-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e3ad" />
          <stop offset="0.45" stopColor="#d9b56c" />
          <stop offset="0.6" stopColor="#b48a3f" />
          <stop offset="1" stopColor="#ecd08a" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22.5" fill="#0b1a30" stroke="url(#crest-gold)" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="14" fill="none" stroke="url(#crest-gold)" strokeWidth="0.6" opacity="0.6" />
      {stars.map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 2.2}L${x + 0.7} ${y - 0.7}L${x + 2.2} ${y}L${x + 0.7} ${y + 0.7}L${x} ${y + 2.2}L${x - 0.7} ${y + 0.7}L${x - 2.2} ${y}L${x - 0.7} ${y - 0.7}Z`} fill="url(#crest-gold)" />
      ))}
      <text x="24" y="30.5" textAnchor="middle" fontFamily="'Cormorant Garamond', Didot, Georgia, serif" fontWeight="700" fontSize="19" fill="url(#crest-gold)">
        L
      </text>
    </svg>
  );
}
