import { useEffect } from "react";
import { AgentLabels } from "./scene/labels";
import { World } from "./scene/World";
import { useT } from "./i18n";
import { connectEngine } from "./state/engine";
import { useOffice } from "./state/office";
import { AssignBar } from "./ui/AssignBar";
import { Drawer } from "./ui/Drawer";
import { Guide } from "./ui/Guide";
import { RightPanel } from "./ui/RightPanel";
import { TeamPanel } from "./ui/TeamPanel";
import { PanelHandles } from "./ui/Panels";
import { TopBar } from "./ui/TopBar";

export function App() {
  const connection = useOffice((s) => s.connection);
  const hasData = useOffice((s) => s.company !== null);
  const panelsVisible = useOffice((s) => s.panelsVisible);
  const collapsed = useOffice((s) => s.collapsed);
  const lang = useOffice((s) => s.lang);
  const t = useT();

  useEffect(() => connectEngine(), []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { selectedTaskId, selectTask, selectAgent, togglePanels, togglePanel, openGuide, guideOpen } = useOffice.getState();
      if (guideOpen) return; // The guide handles its own keys.
      if ((e.key === "?" || (e.key === "/" && e.shiftKey)) && !isTyping(e.target)) {
        openGuide();
        return;
      }
      if ((e.key === "h" || e.key === "H") && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        togglePanels();
        return;
      }
      if ((e.key === "[" || e.key === "]") && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        togglePanel(e.key === "[" ? "team" : "board");
        return;
      }
      if (e.key !== "Escape") return;
      if (selectedTaskId) selectTask(null);
      else selectAgent(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <World />
      <AgentLabels />
      <div
        className={[
          "hud",
          !panelsVisible && "hud--clean",
          collapsed.team && "hud--no-team",
          collapsed.board && "hud--no-board",
          collapsed.assign && "hud--no-assign",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <TopBar />
        <PanelHandles />
        <TeamPanel />
        <RightPanel />
        <Drawer />
        <AssignBar />
        <Guide />
        {!hasData && (
          <div className="splash glass">
            {connection === "closed" ? (
              <>
                <h2>{t.splash.offlineTitle}</h2>
                <p>
                  {t.splash.offlineBody("uv run lucifer-engine serve", "lucifer-engine").map((part, i) =>
                    i % 2 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>,
                  )}
                </p>
              </>
            ) : (
              <h2>{t.splash.loading}</h2>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}
