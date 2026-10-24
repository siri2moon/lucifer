import { type FormEvent, useEffect, useRef, useState } from "react";
import type { TaskPriority } from "../protocol";
import { engineApi } from "../state/engine";
import { useOffice } from "../state/office";
import { useLocalize, useT } from "../i18n";
import { PRIORITIES } from "./format";
import { CollapseButton } from "./Panels";

export function AssignBar() {
  const agents = useOffice((s) => s.agents);
  const order = useOffice((s) => s.agentOrder);
  const connection = useOffice((s) => s.connection);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const localize = useLocalize();
  const draft = useOffice((s) => s.draft);
  const setDraft = useOffice((s) => s.setDraft);
  const titleInput = useRef<HTMLInputElement>(null);

  // An example task from the guide or a suggestion: fill the form so the user can review it and assign it.
  useEffect(() => {
    if (!draft) return;
    setTitle(draft.title);
    setDescription(draft.description);
    setAssigneeId(draft.assigneeId && agents[draft.assigneeId] ? draft.assigneeId : "");
    setExpanded(true);
    setDraft(null);
    titleInput.current?.focus();
  }, [draft, agents, setDraft]);

  // The mission dock sits just above this bar, whatever its height (the description box grows it).
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const el = form.current;
    if (!el) return;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty("--assign-h", `${el.offsetHeight}px`));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const head = order.map((id) => agents[id]).find((a) => a?.managerId === null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSending(true);
    setError(null);
    try {
      await engineApi.createTask({
        title: title.trim(),
        description: description.trim(),
        assigneeId: assigneeId || undefined,
        priority,
      });
      setTitle("");
      setDescription("");
      setExpanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <form ref={form} className={`assign glass${expanded ? " is-expanded" : ""}`} onSubmit={submit}>
      {expanded && (
        <textarea
          className="assign__desc"
          placeholder={t.assign.descPlaceholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
      )}
      <div className="assign__row">
        <button type="button" className="btn btn--icon" title={t.assign.toggleDesc} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "▾" : "▴"}
        </button>
        <input
          ref={titleInput}
          className="assign__title"
          placeholder={t.assign.titlePlaceholder(head?.name)}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
        />
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} title={t.assign.assignee}>
          <option value="">{head ? `${head.appearance.emoji} ${t.assign.defaultAssignee(head.name)}` : t.assign.defaultAssignee()}</option>
          {order
            .map((id) => agents[id]!)
            .filter((a) => a && a.managerId !== null)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.appearance.emoji} {a.name} · {localize(a, "title")}
              </option>
            ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} title={t.assign.priority}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t.priority[p]}
            </option>
          ))}
        </select>
        <button className="btn btn--primary" disabled={sending || !title.trim() || connection !== "open"}>
          {sending ? t.assign.sending : t.assign.submit}
        </button>
        <CollapseButton id="assign" dir="down" />
      </div>
      {error && <div className="assign__error">⚠️ {error}</div>}
    </form>
  );
}
