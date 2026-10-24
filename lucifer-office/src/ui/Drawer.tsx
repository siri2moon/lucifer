import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useActivityText, useLocalize, useT } from "../i18n";
import { STATUS_COLORS } from "../scene/labels";
import { engineApi } from "../state/engine";
import { useOffice } from "../state/office";
import { TERMINAL_TASK_STATUSES } from "../protocol";
import { ACTIVITY_ICONS, compactNumber, timeAgo } from "./format";
import { ActivityText, Markdown } from "./Markdown";
import { TaskCard, useTicker } from "./RightPanel";

/** The detail drawer: the selected task if any, otherwise the selected agent. */
export function Drawer() {
  const taskId = useOffice((s) => s.selectedTaskId);
  const agentId = useOffice((s) => s.selectedAgentId);
  // Keep the wide mode while switching between tasks and agents.
  const [wide, setWide] = useState(false);
  const view = { wide, onToggleWide: () => setWide((w) => !w) };
  if (taskId) return <TaskDetail taskId={taskId} {...view} />;
  if (agentId) return <AgentDetail agentId={agentId} {...view} />;
  return null;
}

/** Expand / shrink icon: two diagonal arrows pointing out or in. */
function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {expanded ? <path d="M6.5 1.5v5h-5M9.5 14.5v-5h5M6.5 6.5 1.5 1.5M9.5 9.5l5 5" /> : <path d="M10 1.5h4.5V6M6 14.5H1.5V10M14.5 1.5 9.5 6.5M1.5 14.5l5-5" />}
    </svg>
  );
}

type DrawerView = { wide: boolean; onToggleWide: () => void };

/** Expand and close buttons, pinned to the top corner so they stay visible while scrolling. */
function DrawerBar({ wide, onToggleWide, onClose }: DrawerView & { onClose: () => void }) {
  const t = useT();
  return (
    <div className="drawer__bar">
      <button className="icon-btn" onClick={onToggleWide} title={wide ? t.drawer.collapse : t.drawer.expand} aria-label={wide ? t.drawer.collapse : t.drawer.expand}>
        <ExpandIcon expanded={wide} />
      </button>
      <button className="icon-btn" onClick={onClose} title={t.drawer.close} aria-label={t.drawer.close}>
        ✕
      </button>
    </div>
  );
}

function AgentDetail({ agentId, ...view }: { agentId: string } & DrawerView) {
  const agent = useOffice((s) => s.agents[agentId]);
  const manager = useOffice((s) => (agent?.managerId ? s.agents[agent.managerId] : undefined));
  const tasks = useOffice((s) => s.tasks);
  const activities = useOffice((s) => s.activities);
  const selectAgent = useOffice((s) => s.selectAgent);
  const t = useT();
  const localize = useLocalize();
  const describe = useActivityText();
  useTicker(5000);

  const mine = useMemo(
    () => Object.values(tasks).filter((t) => t.assigneeId === agentId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [tasks, agentId],
  );
  const recent = useMemo(() => activities.filter((a) => a.agentId === agentId).slice(-15).reverse(), [activities, agentId]);
  if (!agent) return null;

  return (
    <div className={`drawer glass${view.wide ? " drawer--wide" : ""}`}>
      <DrawerBar {...view} onClose={() => selectAgent(null)} />
      <div className="profile">
        <span className="profile__avatar" style={{ background: agent.appearance.color }}>
          {agent.appearance.emoji}
        </span>
        <div>
          <h3>{agent.name}</h3>
          <div className="profile__title">
            {localize(agent, "title")}
            {manager && <> · {t.drawer.reportsTo(manager.name)}</>}
          </div>
          <span className="chip" style={{ background: STATUS_COLORS[agent.status] }}>
            {t.agentStatus[agent.status]}
          </span>
        </div>
      </div>
      <p className="persona">{localize(agent, "persona")}</p>
      <div className="kpis">
        <div>
          <b>{agent.stats.tasksCompleted}</b>
          <span>{t.drawer.done}</span>
        </div>
        <div>
          <b>{agent.stats.tasksFailed}</b>
          <span>{t.drawer.failed}</span>
        </div>
        <div>
          <b>{compactNumber(agent.stats.inputTokens + agent.stats.outputTokens)}</b>
          <span>{t.drawer.tokens}</span>
        </div>
        <div>
          <b>{agent.effort}</b>
          <span>{agent.model.replace("claude-", "")}</span>
        </div>
      </div>
      {mine.length > 0 && (
        <>
          <h4>{t.drawer.assigned}</h4>
          {mine.slice(0, 6).map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </>
      )}
      {recent.length > 0 && (
        <>
          <h4>{t.drawer.recent}</h4>
          <ul className="feed feed--compact">
            {recent.map((a) => (
              <li key={a.id} className={`feed__item feed__item--${a.kind}`}>
                <span className="feed__icon">{ACTIVITY_ICONS[a.kind]}</span>
                <div className="feed__body">
                  <ActivityText activity={a} text={describe(a)} />
                </div>
                <span className="feed__time">{timeAgo(a.at, t.ago)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function TaskDetail({ taskId, ...view }: { taskId: string } & DrawerView) {
  const task = useOffice((s) => s.tasks[taskId]);
  const tasks = useOffice((s) => s.tasks);
  const agents = useOffice((s) => s.agents);
  const activities = useOffice((s) => s.activities);
  const selectTask = useOffice((s) => s.selectTask);
  const selectAgent = useOffice((s) => s.selectAgent);
  const [file, setFile] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const t = useT();
  const localize = useLocalize();
  const describe = useActivityText();
  useTicker(5000);

  const subtasks = useMemo(() => Object.values(tasks).filter((t) => t.parentId === taskId), [tasks, taskId]);
  const log = useMemo(() => activities.filter((a) => a.taskId === taskId).slice(-30).reverse(), [activities, taskId]);
  if (!task) return null;
  const assignee = agents[task.assigneeId];
  const parent = task.parentId ? tasks[task.parentId] : undefined;
  const open = !TERMINAL_TASK_STATUSES.includes(task.status);

  return (
    <div className={`drawer glass${view.wide ? " drawer--wide" : ""}`}>
      <DrawerBar {...view} onClose={() => selectTask(null)} />
      <div className="task__head">
        <span className={`prio prio--${task.priority}`}>{t.priority[task.priority]}</span>
        <span className={`chip chip--${task.status}`}>{t.taskStatus[task.status]}</span>
        <span className="muted">{task.id}</span>
      </div>
      <h3>{task.title}</h3>
      {parent && (
        <button className="link" onClick={() => selectTask(parent.id)}>
          {t.drawer.partOf(parent.title)}
        </button>
      )}
      {assignee && (
        <button
          className="link"
          onClick={() => {
            selectTask(null);
            selectAgent(assignee.id);
          }}
        >
          {assignee.appearance.emoji} {assignee.name} · {localize(assignee, "title")}
        </button>
      )}
      {task.description && <Markdown text={task.description} className="persona" />}
      {task.result && (
        <div className={`result result--${task.status}`}>
          <h4>{task.status === "failed" ? t.drawer.reason : t.drawer.result}</h4>
          <Markdown text={task.result} />
        </div>
      )}
      {task.artifacts.length > 0 && (
        <>
          <h4>{t.drawer.deliverables}</h4>
          <div className="files">
            {task.artifacts.map((path) => (
              <button key={path} className="file" onClick={() => setFile(path)}>
                📄 {path}
              </button>
            ))}
          </div>
        </>
      )}
      {subtasks.length > 0 && (
        <>
          <h4>{t.drawer.subtasks(subtasks.length)}</h4>
          {subtasks.map((sub) => (
            <TaskCard key={sub.id} task={sub} />
          ))}
        </>
      )}
      {log.length > 0 && (
        <>
          <h4>{t.drawer.log}</h4>
          <ul className="feed feed--compact">
            {log.map((a) => (
              <li key={a.id} className={`feed__item feed__item--${a.kind}`}>
                <span className="feed__icon">{ACTIVITY_ICONS[a.kind]}</span>
                <div className="feed__body">
                  {a.agentId && agents[a.agentId] ? <strong>{agents[a.agentId]!.name} </strong> : null}
                  <ActivityText activity={a} text={describe(a)} />
                </div>
                <span className="feed__time">{timeAgo(a.at, t.ago)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {open && (
        <button
          className="btn btn--danger"
          disabled={cancelling}
          onClick={async () => {
            setCancelling(true);
            try {
              await engineApi.cancelTask(task.id);
            } finally {
              setCancelling(false);
            }
          }}
        >
          {t.drawer.cancel}
        </button>
      )}
      {file && <FileViewer path={file} onClose={() => setFile(null)} />}
    </div>
  );
}

function FileViewer({ path, onClose }: { path: string; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const isMarkdown = /\.(md|markdown)$/i.test(path);
  const [raw, setRaw] = useState(false);
  const t = useT();
  useEffect(() => {
    let alive = true;
    setContent(null);
    setError(null);
    engineApi
      .readFile(path)
      .then((text) => alive && setContent(text))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, [path]);

  // Esc closes the file viewer first without deselecting the task (App listens on window, bubble phase).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const copy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The clipboard may be blocked (plain http, browser permissions); ignore.
    }
  };

  // Portal to body: .glass has a backdrop-filter, which would trap position: fixed inside the drawer.
  return createPortal(
    <div className="modal" onClick={onClose}>
      <div className={`modal__box glass${full ? " modal__box--full" : ""}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <span className="modal__path">📄 {path}</span>
          <div className="modal__actions">
            {isMarkdown && (
              <button className="icon-btn icon-btn--text" onClick={() => setRaw((r) => !r)} aria-pressed={raw}>
                {raw ? t.drawer.preview : t.drawer.source}
              </button>
            )}
            <button className="icon-btn icon-btn--text" onClick={copy} disabled={!content}>
              {copied ? `✓ ${t.drawer.copied}` : t.drawer.copy}
            </button>
            <button className="icon-btn" onClick={() => setFull((f) => !f)} title={full ? t.drawer.collapse : t.drawer.expand} aria-label={full ? t.drawer.collapse : t.drawer.expand}>
              <ExpandIcon expanded={full} />
            </button>
            <button className="icon-btn" onClick={onClose} title={t.drawer.close} aria-label={t.drawer.close}>
              ✕
            </button>
          </div>
        </div>
        {content !== null && isMarkdown && !raw ? (
          <div className="modal__body modal__body--doc">
            <Markdown text={content} />
          </div>
        ) : (
          <pre className="modal__body">{error ? `⚠️ ${error}` : (content ?? t.drawer.loading)}</pre>
        )}
      </div>
    </div>,
    document.body,
  );
}
