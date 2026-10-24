import { useEffect, useMemo, useState } from "react";
import type { Task, TaskStatus } from "../protocol";
import { useOffice } from "../state/office";
import { useActivityText, useT } from "../i18n";
import { ACTIVITY_ICONS, timeAgo } from "./format";
import { ExampleTasks } from "./Guide";
import { ActivityText } from "./Markdown";
import { CollapseButton } from "./Panels";

type ColumnId = "in_progress" | "waiting" | "todo" | "finished";
const COLUMNS: { id: ColumnId; statuses: TaskStatus[] }[] = [
  { id: "in_progress", statuses: ["in_progress"] },
  { id: "waiting", statuses: ["waiting"] },
  { id: "todo", statuses: ["todo"] },
  { id: "finished", statuses: ["done", "failed", "cancelled"] },
];

export function RightPanel() {
  const [tab, setTab] = useState<"board" | "feed">("board");
  const t = useT();
  return (
    <aside className="panel panel--right glass">
      <div className="tabs">
        <button className={tab === "board" ? "is-active" : ""} onClick={() => setTab("board")}>
          {t.board.tab}
        </button>
        <button className={tab === "feed" ? "is-active" : ""} onClick={() => setTab("feed")}>
          {t.board.feedTab}
        </button>
        <CollapseButton id="board" dir="right" />
      </div>
      <div className="scroll">{tab === "board" ? <Board /> : <Feed />}</div>
    </aside>
  );
}

function Board() {
  const tasks = useOffice((s) => s.tasks);
  const t = useT();
  const columns = useMemo(() => {
    const all = Object.values(tasks).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return COLUMNS.map((c) => ({ ...c, tasks: all.filter((t) => c.statuses.includes(t.status)) }));
  }, [tasks]);

  if (Object.keys(tasks).length === 0) {
    return (
      <>
        <p className="empty">{t.board.empty}</p>
        <ExampleTasks />
      </>
    );
  }
  return (
    <>
      {columns.map((col) =>
        col.tasks.length === 0 ? null : (
          <section key={col.id} className="column">
            <div className="column__title">
              {t.board.columns[col.id]} <span>{col.tasks.length}</span>
            </div>
            {col.tasks.slice(0, col.id === "finished" ? 12 : 50).map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </section>
        ),
      )}
    </>
  );
}

export function TaskCard({ task }: { task: Task }) {
  const assignee = useOffice((s) => s.agents[task.assigneeId]);
  const selectTask = useOffice((s) => s.selectTask);
  const subtaskCount = useOffice((s) => Object.values(s.tasks).filter((t) => t.parentId === task.id).length);
  const t = useT();
  return (
    <button className={`task task--${task.status}`} onClick={() => selectTask(task.id)}>
      <div className="task__head">
        <span className={`prio prio--${task.priority}`}>{t.priority[task.priority]}</span>
        <span className="task__status">{t.taskStatus[task.status]}</span>
      </div>
      <div className="task__title">{task.title}</div>
      <div className="task__meta">
        {assignee && (
          <span>
            {assignee.appearance.emoji} {assignee.name}
          </span>
        )}
        {subtaskCount > 0 && <span>🤝 {subtaskCount}</span>}
        {task.artifacts.length > 0 && <span>📄 {task.artifacts.length}</span>}
        <span className="task__time">{timeAgo(task.updatedAt, t.ago)}</span>
      </div>
    </button>
  );
}

function Feed() {
  const activities = useOffice((s) => s.activities);
  const agents = useOffice((s) => s.agents);
  const selectTask = useOffice((s) => s.selectTask);
  const t = useT();
  const describe = useActivityText();
  useTicker(5000);
  const items = useMemo(() => [...activities].reverse().slice(0, 120), [activities]);

  if (items.length === 0) return <p className="empty">{t.board.feedEmpty}</p>;
  return (
    <ul className="feed">
      {items.map((a) => {
        const agent = a.agentId ? agents[a.agentId] : undefined;
        return (
          <li key={a.id} className={`feed__item feed__item--${a.kind}`} onClick={() => a.taskId && selectTask(a.taskId)}>
            <span className="feed__icon">{ACTIVITY_ICONS[a.kind]}</span>
            <div className="feed__body">
              <strong>{agent ? `${agent.appearance.emoji} ${agent.name}` : t.board.owner}</strong> <ActivityText activity={a} text={describe(a)} />
            </div>
            <span className="feed__time">{timeAgo(a.at, t.ago)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Re-render periodically so "x minutes ago" labels stay current. */
export function useTicker(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
}
