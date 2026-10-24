import { useEffect, useState } from "react";
import { useT } from "../i18n";
import type { AgentStatus } from "../protocol";
import { STATUS_COLORS } from "../scene/labels";
import { useOffice } from "../state/office";

const LEGEND: AgentStatus[] = ["idle", "thinking", "working", "waiting"];

/** The guided tour: the story, the crew, assigning work, watching, and brain modes. */
export function Guide() {
  const open = useOffice((s) => s.guideOpen);
  const closeGuide = useOffice((s) => s.closeGuide);
  const setDraft = useOffice((s) => s.setDraft);
  const t = useT();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeGuide();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, t.guide.slides.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeGuide, t]);

  if (!open) return null;
  const slides = t.guide.slides;
  const slide = slides[index]!;
  const last = index === slides.length - 1;

  const tryExample = () => {
    const example = t.examples.items[0]!;
    setDraft({ ...example });
    closeGuide();
  };

  return (
    <div className="modal guide" onClick={closeGuide}>
      <div className="guide__box glass" role="dialog" aria-modal="true" aria-labelledby="guide-title" onClick={(e) => e.stopPropagation()}>
        <button className="drawer__close" onClick={closeGuide} aria-label={t.guide.close}>
          ✕
        </button>
        <div className="guide__icon" key={`icon-${index}`}>
          {slide.icon}
        </div>
        <h2 id="guide-title" className="guide__title">
          {slide.title}
        </h2>
        <div className="guide__body" key={`body-${index}`}>
          {slide.body.map((p, i) => (
            <div key={i}>
              <p>{p}</p>
              {/* The color legend goes right after the first paragraph. */}
              {slide.legend && i === 0 && (
                <ul className="guide__legend">
                  {LEGEND.map((status) => (
                    <li key={status}>
                      <span className="guide__dot" style={{ background: STATUS_COLORS[status], boxShadow: `0 0 8px ${STATUS_COLORS[status]}` }} />
                      {t.agentStatus[status]}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {slide.shortcuts && (
            <div className="guide__shortcuts">
              <h4>{t.guide.shortcutsTitle}</h4>
              {t.guide.shortcuts.map(([key, label]) => (
                <div key={key}>
                  <kbd>{key}</kbd> {label}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="guide__dots">
          {slides.map((s, i) => (
            <button key={i} className={i === index ? "is-active" : ""} onClick={() => setIndex(i)} aria-label={s.title} />
          ))}
        </div>

        <div className="guide__nav">
          {index > 0 ? (
            <button className="btn btn--ghost" onClick={() => setIndex(index - 1)}>
              ← {t.guide.back}
            </button>
          ) : (
            <button className="btn btn--ghost" onClick={closeGuide}>
              {t.guide.skip}
            </button>
          )}
          <span className="muted">{t.guide.step(index + 1, slides.length)}</span>
          {last ? (
            <div className="guide__finish">
              <button className="btn btn--ghost" onClick={closeGuide}>
                {t.guide.finish}
              </button>
              <button className="btn btn--primary" onClick={tryExample}>
                {t.guide.tryExample}
              </button>
            </div>
          ) : (
            <button className="btn btn--primary" onClick={() => setIndex(index + 1)}>
              {t.guide.next} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Example tasks shown on an empty board; clicking one fills the assign bar. */
export function ExampleTasks() {
  const t = useT();
  const setDraft = useOffice((s) => s.setDraft);
  const agents = useOffice((s) => s.agents);
  return (
    <div className="examples">
      <p className="examples__title">{t.examples.title}</p>
      {t.examples.items.map((ex) => {
        const who = ex.assigneeId ? agents[ex.assigneeId] : undefined;
        return (
          <button key={ex.title} className="examples__item" onClick={() => setDraft({ ...ex })}>
            <span>{ex.title}</span>
            {who && (
              <small>
                → {who.appearance.emoji} {who.name}
              </small>
            )}
          </button>
        );
      })}
    </div>
  );
}
