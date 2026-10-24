import { create } from "zustand";
import { DEFAULT_LANG, isLang, type Lang } from "../langs";
import type { Activity, Agent, CompanyInfo, EngineInfo, ServerEvent, Task } from "../protocol";

const MAX_ACTIVITIES = 300;
/** How long a speech bubble stays above an agent. */
export const BUBBLE_MS = 7000;

export type ConnectionState = "connecting" | "open" | "closed";

export interface Bubble {
  /** Keeps the whole activity so labels can phrase it in the selected language. */
  activity: Activity;
  at: number;
}

export interface OfficeData {
  company: CompanyInfo | null;
  engine: EngineInfo | null;
  agents: Record<string, Agent>;
  agentOrder: string[];
  tasks: Record<string, Task>;
  activities: Activity[];
  bubbles: Record<string, Bubble>;
}

export const emptyOffice: OfficeData = {
  company: null,
  engine: null,
  agents: {},
  agentOrder: [],
  tasks: {},
  activities: [],
  bubbles: {},
};

const BUBBLE_KINDS = new Set<Activity["kind"]>(["update", "thought", "task_delegated", "task_completed", "task_failed", "error"]);

/** Apply an engine event to the state. Pure, so it can be tested. */
export function applyEvent(state: OfficeData, event: ServerEvent, now = Date.now()): OfficeData {
  switch (event.type) {
    case "snapshot": {
      const { company, engine, agents, tasks, activities } = event.data;
      return {
        company,
        engine,
        agents: Object.fromEntries(agents.map((a) => [a.id, a])),
        agentOrder: agents.map((a) => a.id),
        tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
        activities: activities.slice(-MAX_ACTIVITIES),
        bubbles: {},
      };
    }
    case "agent.updated": {
      const agent = event.data;
      const agentOrder = state.agents[agent.id] ? state.agentOrder : [...state.agentOrder, agent.id];
      return { ...state, agents: { ...state.agents, [agent.id]: agent }, agentOrder };
    }
    case "task.created":
    case "task.updated":
      return { ...state, tasks: { ...state.tasks, [event.data.id]: event.data } };
    case "engine.updated":
      return { ...state, engine: event.data };
    case "activity": {
      const activity = event.data;
      // Events right after the snapshot may repeat what it already contains.
      if (state.activities.some((a) => a.id === activity.id)) return state;
      const activities = [...state.activities, activity].slice(-MAX_ACTIVITIES);
      const bubbles =
        activity.agentId && BUBBLE_KINDS.has(activity.kind)
          ? { ...state.bubbles, [activity.agentId]: { activity, at: now } }
          : state.bubbles;
      return { ...state, activities, bubbles };
    }
  }
}

interface OfficeStore extends OfficeData {
  connection: ConnectionState;
  selectedAgentId: string | null;
  selectedTaskId: string | null;
  /** Show the team, board and assign bar; turn off to watch the office full screen. */
  panelsVisible: boolean;
  /** Collapse panels one by one; a collapsed panel leaves a small handle at the screen edge. */
  collapsed: Record<PanelId, boolean>;
  togglePanel(id: PanelId): void;
  lang: Lang;
  setLang(lang: Lang): void;
  /** The guide: opens on the first visit, reopened with the help button or the ? key. */
  guideOpen: boolean;
  openGuide(): void;
  closeGuide(): void;
  /** An example task waiting to be filled into the assign bar (from the guide or the board's suggestions). */
  draft: TaskDraft | null;
  setDraft(draft: TaskDraft | null): void;
  apply(event: ServerEvent): void;
  setConnection(state: ConnectionState): void;
  selectAgent(id: string | null): void;
  selectTask(id: string | null): void;
  togglePanels(): void;
}

const PANELS_KEY = "lucifer-office:panels";
const COLLAPSED_KEY = "lucifer-office:collapsed";

export type PanelId = "team" | "board" | "assign";
const LANG_KEY = "lucifer-office:lang";
const GUIDE_KEY = "lucifer-office:guide-seen";

export interface TaskDraft {
  title: string;
  description: string;
  assigneeId?: string;
}

function guideSeen(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) === "1";
  } catch {
    return true; // If we can't remember, don't open on every page load.
  }
}

function loadLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // Storage unavailable: use the default.
  }
  return DEFAULT_LANG;
}

function loadPanelsVisible(): boolean {
  try {
    return localStorage.getItem(PANELS_KEY) !== "hidden";
  } catch {
    return true;
  }
}

function loadCollapsed(): Record<PanelId, boolean> {
  const none = { team: false, board: false, assign: false };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "null");
    if (saved && typeof saved === "object") {
      const s = saved as Partial<Record<PanelId, unknown>>;
      return { team: s.team === true, board: s.board === true, assign: s.assign === true };
    }
  } catch {
    // Storage corrupt or blocked: expand everything.
  }
  return none;
}

export const useOffice = create<OfficeStore>((set) => ({
  ...emptyOffice,
  connection: "connecting",
  selectedAgentId: null,
  selectedTaskId: null,
  panelsVisible: loadPanelsVisible(),
  collapsed: loadCollapsed(),
  togglePanel: (id) =>
    set((s) => {
      // While everything is hidden, toggling a panel means the user wants to see it: show the HUD and expand it.
      const collapsed = { ...s.collapsed, [id]: s.panelsVisible ? !s.collapsed[id] : false };
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
      } catch {
        // Not remembered across reloads, but collapsing still works.
      }
      if (!s.panelsVisible) {
        try {
          localStorage.setItem(PANELS_KEY, "shown");
        } catch {
          // Same as above.
        }
      }
      return { collapsed, panelsVisible: true };
    }),
  lang: loadLang(),
  guideOpen: !guideSeen(),
  openGuide: () => set({ guideOpen: true }),
  closeGuide: () => {
    try {
      localStorage.setItem(GUIDE_KEY, "1");
    } catch {
      // Ignore: the guide may open again next time.
    }
    set({ guideOpen: false });
  },
  draft: null,
  setDraft: (draft) => set({ draft }),
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Storage blocked: the change still applies, it just isn't remembered across reloads.
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
  apply: (event) => set((s) => applyEvent(s, event)),
  setConnection: (connection) => set({ connection }),
  selectAgent: (selectedAgentId) => set({ selectedAgentId }),
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  togglePanels: () =>
    set((s) => {
      const panelsVisible = !s.panelsVisible;
      try {
        localStorage.setItem(PANELS_KEY, panelsVisible ? "shown" : "hidden");
      } catch {
        // Storage blocked: hiding still works, it just isn't remembered across reloads.
      }
      return { panelsVisible };
    }),
}));
