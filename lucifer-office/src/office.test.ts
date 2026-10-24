import { describe, expect, it } from "vitest";
import type { Activity, Agent, Snapshot, Task } from "./protocol";
import { computeLayout, ZONES } from "./scene/layout";
import { activityText, localize, MESSAGES } from "./i18n";
import { applyEvent, emptyOffice } from "./state/office";

function agent(id: string, departmentId: string, managerId: string | null): Agent {
  return {
    id,
    name: id,
    title: id,
    departmentId,
    managerId,
    persona: "",
    model: "claude-opus-5-5",
    effort: "medium",
    appearance: { color: "#fff", emoji: "🙂" },
    status: "idle",
    currentTaskId: null,
    stats: { tasksCompleted: 0, tasksFailed: 0, inputTokens: 0, outputTokens: 0 },
  };
}

const departments = [
  { id: "executive", name: "Executive", color: "#f59e0b" },
  { id: "engineering", name: "Engineering", color: "#3b82f6" },
  { id: "marketing", name: "Marketing", color: "#10b981" },
  { id: "product", name: "Product", color: "#8b5cf6" },
  { id: "design", name: "Design", color: "#ec4899" },
];

const agents = [
  agent("lucifer", "executive", null),
  agent("michael", "engineering", "lucifer"),
  agent("gabriel", "engineering", "michael"),
  agent("raphael", "engineering", "michael"),
  agent("uriel", "engineering", "michael"),
  agent("azrael", "product", "lucifer"),
  agent("lilith", "design", "azrael"),
  agent("samael", "marketing", "lucifer"),
  agent("belial", "marketing", "samael"),
];

const snapshot: Snapshot = {
  company: { name: "Lucifer Corp", mission: "", departments },
  engine: { brain: "sim", running: true, heartbeatMs: 2000, maxConcurrent: 4 },
  agents,
  tasks: [],
  activities: [],
};

function activity(id: string, kind: Activity["kind"], agentId: string | null): Activity {
  return { id, at: new Date().toISOString(), kind, agentId, taskId: null, text: id, targetAgentId: null };
}

describe("applyEvent", () => {
  it("loads a snapshot, then updates agents, tasks and speech bubbles", () => {
    let s = applyEvent(emptyOffice, { type: "snapshot", data: snapshot });
    expect(s.agentOrder).toHaveLength(9);

    s = applyEvent(s, { type: "agent.updated", data: { ...agents[1]!, status: "working" } });
    expect(s.agents.michael?.status).toBe("working");
    expect(s.agentOrder).toHaveLength(9);

    const task = { id: "T-1", title: "x", status: "todo" } as Task;
    s = applyEvent(s, { type: "task.created", data: task });
    s = applyEvent(s, { type: "task.updated", data: { ...task, status: "done" } });
    expect(s.tasks["T-1"]?.status).toBe("done");

    s = applyEvent(s, { type: "activity", data: activity("a1", "update", "michael") }, 1000);
    expect(s.bubbles.michael).toMatchObject({ activity: { id: "a1", kind: "update" }, at: 1000 });
    s = applyEvent(s, { type: "activity", data: activity("a2", "file_written", "michael") }, 2000);
    expect(s.bubbles.michael?.at).toBe(1000); // writing a file shows no bubble
    expect(s.activities).toHaveLength(2);
  });

  it("ignores duplicate activity ids (events repeated after the snapshot)", () => {
    const a = activity("dup", "update", "lucifer");
    let s = applyEvent(emptyOffice, { type: "snapshot", data: { ...snapshot, activities: [a] } });
    const before = s;
    s = applyEvent(s, { type: "activity", data: a });
    expect(s).toBe(before);
  });
});

describe("computeLayout", () => {
  it("puts the CEO on the sky deck and gives everyone their own seat", () => {
    const layout = computeLayout(departments, agents);
    expect(layout.zoneByDepartment.executive?.id).toBe("sky");
    expect(layout.zoneByDepartment.engineering?.id).toBe("upper");
    expect(Object.keys(layout.seats)).toHaveLength(agents.length);

    const spots = Object.values(layout.seats).map((s) => `${s.zone.id}:${s.position[0].toFixed(2)}:${s.position[2].toFixed(2)}`);
    expect(new Set(spots).size).toBe(spots.length);

    for (const seat of Object.values(layout.seats)) {
      const [w, d] = seat.zone.size;
      expect(Math.abs(seat.position[0] - seat.zone.center[0])).toBeLessThanOrEqual(w / 2);
      expect(Math.abs(seat.position[2] - seat.zone.center[2])).toBeLessThanOrEqual(d / 2);
    }
    // Department heads take their department's first desk.
    expect(layout.seats.michael?.zone.id).toBe("upper");
  });

  it("moves departments beyond the yacht's zones to the beach cabana", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, name: `D${i}`, color: "#000" }));
    const people = many.map((d, i) => agent(`a${i}`, d.id, i === 0 ? null : "a0"));
    const layout = computeLayout(many, people);
    const used = new Set(Object.values(layout.zoneByDepartment).map((z) => z.id));
    expect(used.size).toBe(Math.min(many.length, ZONES.length));
    expect([...used]).toContain("cabana");
  });
});

describe("i18n", () => {
  it("uses a translation when present, otherwise the English base field", () => {
    const dept = { id: "engineering", name: "Engineering", color: "#000", i18n: { vi: { name: "Kỹ thuật" } } };
    expect(localize(dept, "name", "vi")).toBe("Kỹ thuật");
    expect(localize(dept, "name", "en")).toBe("Engineering");
    expect(localize({ ...dept, i18n: undefined }, "name", "vi")).toBe("Engineering");
  });

  it("rebuilds system activity text per language and keeps agents' own words", () => {
    const lookup = { taskTitle: () => "Launch", taskResult: () => "no budget", agentName: () => "Belial" };
    const delegated = { ...activity("a", "task_delegated", "samael"), taskId: "T-1", targetAgentId: "belial", text: "Delegated…" };
    expect(activityText(delegated, MESSAGES.en, lookup)).toBe('delegated "Launch" to Belial');
    expect(activityText(delegated, MESSAGES.vi, lookup)).toBe('giao "Launch" cho Belial');
    const failed = { ...activity("b", "task_failed", "samael"), taskId: "T-1" };
    expect(activityText(failed, MESSAGES.vi, lookup)).toBe('không hoàn thành "Launch": no budget');
    const update = { ...activity("c", "update", "samael"), taskId: "T-1", text: "Đang viết" };
    // Agents' own words are shown as written, whatever the UI language.
    expect(activityText(update, MESSAGES.en, lookup)).toBe("Đang viết");
  });
});
