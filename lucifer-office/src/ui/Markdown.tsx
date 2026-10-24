import { useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useT } from "../i18n";
import type { Activity } from "../protocol";

const PLUGINS = [remarkGfm];
const COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

/** Markdown written by agents (results, thoughts, files). Raw HTML is not rendered. */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Kinds whose text is written by the agent and may contain markdown. */
const AGENT_WRITTEN = new Set<Activity["kind"]>(["thought", "update"]);

/**
 * The body of an activity line: plain text for system events, markdown for what agents wrote.
 * Long agent text starts collapsed with a "Show more" toggle.
 */
export function ActivityText({ activity, text }: { activity: Activity; text: string }) {
  if (!AGENT_WRITTEN.has(activity.kind)) return <>{text}</>;
  return (
    <Collapsible>
      <Markdown text={text} className="md--compact" />
    </Collapsible>
  );
}

function Collapsible({ children }: { children: React.ReactNode }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight + 4);
  }, [children, open]);

  return (
    <div className="collapsible">
      <div ref={box} className={`collapsible__body${open ? " is-open" : ""}${overflows && !open ? " is-clipped" : ""}`}>
        {children}
      </div>
      {(overflows || open) && (
        <button
          type="button"
          className="collapsible__toggle"
          onClick={(e) => {
            e.stopPropagation(); // feed rows open their task on click
            setOpen((v) => !v);
          }}
        >
          {open ? t.drawer.showLess : t.drawer.showMore}
        </button>
      )}
    </div>
  );
}
