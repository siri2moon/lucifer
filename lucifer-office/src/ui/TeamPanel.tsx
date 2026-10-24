import { useLocalize, useT } from "../i18n";
import { STATUS_COLORS } from "../scene/labels";
import { useOffice } from "../state/office";
import { CollapseButton } from "./Panels";

export function TeamPanel() {
  const company = useOffice((s) => s.company);
  const agents = useOffice((s) => s.agents);
  const order = useOffice((s) => s.agentOrder);
  const tasks = useOffice((s) => s.tasks);
  const selected = useOffice((s) => s.selectedAgentId);
  const selectAgent = useOffice((s) => s.selectAgent);
  const t = useT();
  const localize = useLocalize();

  if (!company) return null;
  return (
    <aside className="panel panel--left glass">
      <div className="panel__head">
        <h2 className="panel__title">{t.team.title}</h2>
        <CollapseButton id="team" dir="left" />
      </div>
      <div className="scroll">
        {company.departments.map((dept) => {
          const members = order.map((id) => agents[id]!).filter((a) => a && a.departmentId === dept.id);
          if (members.length === 0) return null;
          return (
            <section key={dept.id} className="dept">
              <div className="dept__name" style={{ color: dept.color }}>
                {localize(dept, "name")}
              </div>
              {members.map((a) => {
                const task = a.currentTaskId ? tasks[a.currentTaskId] : undefined;
                return (
                  <button
                    key={a.id}
                    className={`member${selected === a.id ? " is-selected" : ""}`}
                    onClick={() => selectAgent(selected === a.id ? null : a.id)}
                  >
                    <span className="member__avatar" style={{ background: a.appearance.color }}>
                      {a.appearance.emoji}
                    </span>
                    <span className="member__body">
                      <span className="member__name">
                        {a.name} <small>{localize(a, "title")}</small>
                      </span>
                      <span className="member__task">{task ? task.title : t.agentStatus[a.status]}</span>
                    </span>
                    <span className="member__status" title={t.agentStatus[a.status]} style={{ background: STATUS_COLORS[a.status] }} />
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
