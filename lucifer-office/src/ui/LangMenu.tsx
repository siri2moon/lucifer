import { useEffect, useRef, useState } from "react";
import { LANGS, useT } from "../i18n";
import { useOffice } from "../state/office";

/** Globe button that opens the language list. */
export function LangMenu() {
  const lang = useOffice((s) => s.lang);
  const setLang = useOffice((s) => s.setLang);
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = LANGS.find((l) => l.id === lang) ?? LANGS[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lang-menu" ref={root}>
      <button
        className="btn btn--square lang-menu__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t.language}
      >
        <GlobeIcon />
        <span>{current.id.toUpperCase()}</span>
      </button>
      {open && (
        <ul className="lang-menu__list glass" role="listbox" aria-label={t.language}>
          {LANGS.map((l) => (
            <li key={l.id}>
              <button
                role="option"
                aria-selected={l.id === lang}
                className={l.id === lang ? "is-active" : ""}
                onClick={() => {
                  setLang(l.id);
                  setOpen(false);
                }}
              >
                <span className="lang-menu__flag">{l.flag}</span>
                <span className="lang-menu__name">{l.name}</span>
                {l.id === lang && <span className="lang-menu__check">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M2.5 12h19" />
      <path d="M12 2.5c2.6 2.7 4 6 4 9.5s-1.4 6.8-4 9.5c-2.6-2.7-4-6-4-9.5s1.4-6.8 4-9.5z" />
    </svg>
  );
}
