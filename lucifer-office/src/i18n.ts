import type { Activity, AgentStatus, TaskPriority, TaskStatus, Translations } from "./protocol";
import { type Lang } from "./langs";
import { type PanelId, useOffice } from "./state/office";
import type { Phase } from "./state/workflow";

export { DEFAULT_LANG, LANGS, type Lang } from "./langs";

const en = {
  brandSub: "Six-star yacht ✦ Golden-sand beach",
  stats: { busy: "Working", open: "Open tasks", brain: "Brain", sim: "Simulation", brainTitle: (llm: string, status: string) => `Brain: ${llm} · ${status}` },
  panels: { hide: "Hide panels", show: "Show panels", hideTitle: "Hide the panels to enjoy the office (H)", showTitle: "Show team, board and assign bar (H)",
    collapse: (name: string) => `Collapse ${name}`,
    expand: (name: string) => `Show ${name}`,
    names: { team: "the team", board: "the board", assign: "the assign bar" } as Record<PanelId, string>,
    handles: { team: "Team", board: "Board", assign: "Assign work" } as Record<PanelId, string>,
  },
  connection: { open: "Connected", connecting: "Connecting…", closed: "Engine offline" },
  engine: { pause: "⏸ Break time", start: "▶ Clock in" },
  camera: {
    follow: "Follow the work",
    followOnTitle: "Following the work: the camera glides to whoever is working and to every hand-off. Click to stop (F)",
    followOffTitle: "Follow the work: let the camera glide to whoever is working and to every hand-off (F)",
  },
  language: "Language",
  splash: {
    offlineTitle: "🌊 lucifer-engine not found",
    offlineBody: (cmd: string, dir: string) => [`Run `, cmd, ` in the `, dir, ` folder; the office will reconnect on its own.`],
    loading: "⛵ Welcoming the crew aboard…",
  },
  team: { title: "Team" },
  board: {
    tab: "📋 Board",
    feedTab: "🌊 Activity",
    empty: "No tasks yet. Assign the first one in the bar below 👇",
    feedEmpty: "Calm seas, no activity yet.",
    columns: { in_progress: "In progress", waiting: "Waiting on reports", todo: "To do", finished: "Finished" },
    owner: "Owner",
  },
  assign: {
    descPlaceholder: "Details: goal, expected output, constraints…",
    toggleDesc: "Add a description",
    titlePlaceholder: (head?: string) => (head ? `Give ${head} and the whole company a task…` : "Assign a task…"),
    assignee: "Assignee",
    defaultAssignee: (head?: string) => (head ? `${head} (default)` : "Company head"),
    priority: "Priority",
    sending: "Assigning…",
    submit: "Assign 🚀",
  },
  drawer: {
    reportsTo: (name: string) => `reports to ${name}`,
    done: "done",
    failed: "failed",
    tokens: "tokens",
    assigned: "Assigned tasks",
    recent: "Recent",
    partOf: (title: string) => `↖ Part of: ${title}`,
    reason: "Reason",
    result: "Result",
    deliverables: "Deliverables",
    log: "Log",
    cancel: "Cancel this task and its subtasks",
    loading: "Loading…",
    close: "Close (Esc)",
    expand: "Expand for reading",
    collapse: "Shrink back",
    copy: "Copy",
    copied: "Copied",
    showMore: "Show more",
    showLess: "Show less",
    preview: "Preview",
    source: "Source",
  },
  taskStatus: { todo: "To do", in_progress: "In progress", waiting: "Waiting on reports", done: "Done", failed: "Failed", cancelled: "Cancelled" } as Record<TaskStatus, string>,
  priority: { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" } as Record<TaskPriority, string>,
  agentStatus: { idle: "Idle", thinking: "Thinking", working: "Working", waiting: "Waiting on reports", offline: "Off duty" } as Record<AgentStatus, string>,
  activity: {
    assigned: (task: string, to: string) => `assigned "${task}" to ${to}`,
    started: (task: string) => `started "${task}"`,
    delegated: (task: string, to: string) => `delegated "${task}" to ${to}`,
    completed: (task: string) => `completed "${task}"`,
    failed: (task: string, reason: string) => `could not complete "${task}"${reason ? `: ${reason}` : ""}`,
  },
  guide: {
    button: "Guide",
    buttonTitle: "How Lucifer Office works (?)",
    close: "Close",
    back: "Back",
    next: "Next",
    skip: "Skip",
    finish: "Start working",
    tryExample: "✨ Try an example task",
    step: (i: number, n: number) => `${i} / ${n}`,
    slides: [
      {
        icon: "😇",
        title: "A fallen angel's second chance",
        body: [
          "Lucifer was once the brightest of the angels. Pride made him fall.",
          "Living among people on this golden coast, he learned what they know: everyone makes mistakes, and what matters is getting back up, owning it and doing better.",
          "So he anchored a yacht offshore and founded Lucifer Corp with other angels who lost their way. Every honest task they finish is a step on the road back to the light.",
          "You are the owner. You bring the work; they bring their best.",
        ],
      },
      {
        icon: "🛥️",
        title: "Meet the crew",
        body: [
          "The yacht is the office. Each deck is a department, and departments that don't fit work from the pergola on the beach.",
          "Lucifer, the seraph with two pairs of golden wings, leads from the sky deck. Every other angel reports to a manager, just like a real org chart.",
          "Click an angel, or a name in the Team panel, to fly to them and read their role, stats and recent work.",
          "Press Break time and the angels fly ashore to enjoy themselves: coffee at the bar, a swim, a nap in the sun. Clock in and they fly straight back to their desks.",
        ],
      },
      {
        icon: "📨",
        title: "Give them work",
        body: [
          "Type a goal into the bar at the bottom and press Assign. By default it goes to Lucifer, who splits it into subtasks for the right people.",
          "To skip the hierarchy, choose a specific angel and a priority. Use ▴ to add details: the goal, the expected output and any constraints.",
          "The clearer the brief, the better the result. Ask for concrete deliverables, such as \"a PRD in docs/prd.md\".",
        ],
      },
      {
        icon: "👀",
        title: "Watch them work",
        body: [
          "The dot by each name, and the glow of their laptop, shows what an angel is doing:",
          "Speech bubbles show progress updates, thoughts, delegation and results. The Board tracks every task; Activity is the live feed.",
          "Every request you give appears as a live mission above the assign bar: its phase, progress, who is working and what they just did. On the yacht, glowing links show work flowing from each manager to their reports, and the camera glides in to follow it (turn this off with F).",
          "Click any task to see its subtasks, log, result and the files the angels wrote. You can cancel a task at any time.",
        ],
        legend: true,
      },
      {
        icon: "🧠",
        title: "Simulation or the real thing",
        body: [
          "The Brain in the top bar tells you how the company thinks. \"Simulation\" is free and scripted: perfect for exploring.",
          "To have the angels do real work, give lucifer-engine an LLM in its .env file: an Anthropic API key, or a Cloudflare AI Gateway model such as DeepSeek. Then restart the engine.",
          "Real agents spend real tokens, so start with a small task for one angel before giving Lucifer a big goal.",
        ],
        shortcuts: true,
      },
    ],
    shortcutsTitle: "Shortcuts",
    shortcuts: [
      ["H", "Hide or show all panels"],
      ["F", "Turn the camera's follow-the-work mode on or off"],
      ["[", "Collapse or show the team panel"],
      ["]", "Collapse or show the board"],
      ["Esc", "Close details and return to the overview"],
      ["?", "Open this guide"],
    ] as [string, string][],
  },
  examples: {
    title: "Not sure where to start? Try one:",
    items: [
      {
        title: "Write 3 social posts introducing Lucifer Corp",
        description: "Short, warm posts for X, LinkedIn and Facebook. Save them to content/launch-posts.md.",
        assigneeId: "belial",
      },
      {
        title: "Plan the launch of an AI note-taking app",
        description: "A product brief, a technical outline and a two-week marketing plan, each in its own file.",
      },
      {
        title: "Design a landing page for a bakery",
        description: "User flow, section-by-section wireframe in text, colors and typography. Save to design/bakery-landing.md.",
        assigneeId: "lilith",
      },
    ] as { title: string; description: string; assigneeId?: string }[],
  },
  workflow: {
    title: "Workflow",
    missions: "Live missions",
    phase: { queued: "Queued", working: "Working", team: "Team at work", merging: "Wrapping up", done: "Done", failed: "Failed", cancelled: "Cancelled" } as Record<Phase, string>,
    steps: { queued: "Received", working: "Working", team: "Team", merging: "Wrap-up", done: "Done" },
    status: {
      queued: (name: string) => `Waiting for ${name} to pick it up`,
      working: (name: string) => `${name} is on it`,
      team: (done: number, total: number) => `${done}/${total} subtasks finished`,
      merging: (name: string) => `${name} is merging the results`,
      done: "Delivered",
      failed: "Could not be completed",
      cancelled: "Cancelled",
    },
    waitingOn: (n: number) => (n === 1 ? "Waiting on 1 report" : `Waiting on ${n} reports`),
    queued: "In the queue",
    more: (n: number) => `+${n} more`,
    fewer: "Show fewer",
    open: "Open details",
  },
  ago: { s: "s", m: "m", h: "h", d: "d" },
};

export type Messages = typeof en;

const vi: Messages = {
  brandSub: "Du thuyền ✦✦✦✦✦✦ · Bãi biển cát vàng",
  stats: { busy: "Đang làm", open: "Việc mở", brain: "Bộ não", sim: "Mô phỏng", brainTitle: (llm: string, status: string) => `Bộ não: ${llm} · ${status}` },
  panels: { hide: "Ẩn thanh", show: "Hiện thanh", hideTitle: "Ẩn các thanh để ngắm văn phòng (H)", showTitle: "Hiện nhân sự, bảng việc, giao việc (H)",
    collapse: (name: string) => `Thu gọn ${name}`,
    expand: (name: string) => `Mở ${name}`,
    names: { team: "thanh nhân sự", board: "bảng việc", assign: "thanh giao việc" },
    handles: { team: "Nhân sự", board: "Bảng việc", assign: "Giao việc" },
  },
  connection: { open: "Đã kết nối", connecting: "Đang kết nối…", closed: "Mất kết nối engine" },
  engine: { pause: "⏸ Cho nghỉ", start: "▶ Vào ca" },
  camera: {
    follow: "Theo dõi công việc",
    followOnTitle: "Đang theo dõi công việc: camera tự lướt tới người đang làm và mỗi lần giao, nhận việc. Bấm để tắt (F)",
    followOffTitle: "Theo dõi công việc: để camera tự lướt tới người đang làm và mỗi lần giao, nhận việc (F)",
  },
  language: "Ngôn ngữ",
  splash: {
    offlineTitle: "🌊 Chưa thấy lucifer-engine",
    offlineBody: (cmd: string, dir: string) => [`Chạy `, cmd, ` trong thư mục `, dir, `, văn phòng sẽ tự kết nối lại.`],
    loading: "⛵ Đang đón nhân viên lên du thuyền…",
  },
  team: { title: "Nhân sự" },
  board: {
    tab: "📋 Bảng việc",
    feedTab: "🌊 Hoạt động",
    empty: "Chưa có việc nào. Giao việc đầu tiên ở thanh bên dưới 👇",
    feedEmpty: "Biển lặng, chưa có hoạt động.",
    columns: { in_progress: "Đang làm", waiting: "Chờ cấp dưới", todo: "Cần làm", finished: "Đã xong" },
    owner: "Chủ công ty",
  },
  assign: {
    descPlaceholder: "Mô tả chi tiết: mục tiêu, đầu ra mong muốn, ràng buộc…",
    toggleDesc: "Thêm mô tả",
    titlePlaceholder: (head?: string) => (head ? `Giao việc cho ${head} và cả công ty…` : "Giao việc…"),
    assignee: "Người nhận",
    defaultAssignee: (head?: string) => (head ? `${head} (mặc định)` : "Người đứng đầu"),
    priority: "Độ ưu tiên",
    sending: "Đang giao…",
    submit: "Giao việc 🚀",
  },
  drawer: {
    reportsTo: (name: string) => `báo cáo cho ${name}`,
    done: "xong",
    failed: "thất bại",
    tokens: "token",
    assigned: "Việc được giao",
    recent: "Gần đây",
    partOf: (title: string) => `↖ Thuộc: ${title}`,
    reason: "Lý do",
    result: "Kết quả",
    deliverables: "Sản phẩm",
    log: "Nhật ký",
    cancel: "Huỷ việc này và các việc con",
    loading: "Đang tải…",
    close: "Đóng (Esc)",
    expand: "Phóng to để đọc",
    collapse: "Thu nhỏ lại",
    copy: "Sao chép",
    copied: "Đã chép",
    showMore: "Xem thêm",
    showLess: "Thu gọn",
    preview: "Xem trước",
    source: "Mã nguồn",
  },
  taskStatus: { todo: "Cần làm", in_progress: "Đang làm", waiting: "Chờ cấp dưới", done: "Xong", failed: "Thất bại", cancelled: "Đã huỷ" },
  priority: { urgent: "Khẩn", high: "Cao", normal: "Thường", low: "Thấp" },
  agentStatus: { idle: "Rảnh", thinking: "Đang suy nghĩ", working: "Đang làm việc", waiting: "Chờ cấp dưới", offline: "Nghỉ" },
  activity: {
    assigned: (task: string, to: string) => `giao "${task}" cho ${to}`,
    started: (task: string) => `bắt đầu "${task}"`,
    delegated: (task: string, to: string) => `giao "${task}" cho ${to}`,
    completed: (task: string) => `hoàn thành "${task}"`,
    failed: (task: string, reason: string) => `không hoàn thành "${task}"${reason ? `: ${reason}` : ""}`,
  },
  guide: {
    button: "Hướng dẫn",
    buttonTitle: "Cách dùng Lucifer Office (?)",
    close: "Đóng",
    back: "Quay lại",
    next: "Tiếp",
    skip: "Bỏ qua",
    finish: "Bắt đầu làm việc",
    tryExample: "✨ Thử một việc mẫu",
    step: (i: number, n: number) => `${i} / ${n}`,
    slides: [
      {
        icon: "😇",
        title: "Cơ hội thứ hai của thiên thần sa ngã",
        body: [
          "Lucifer từng là thiên thần sáng nhất. Vì kiêu ngạo, anh đã sa ngã.",
          "Sống giữa con người trên bờ biển cát vàng này, anh hiểu ra điều họ vẫn biết: ai cũng có lỗi lầm, quan trọng là biết đứng dậy, nhận lỗi và làm lại tốt hơn.",
          "Vì thế anh neo một chiếc du thuyền ngoài khơi, lập nên Lucifer Corp cùng những thiên thần lạc lối khác. Mỗi việc tử tế họ hoàn thành là một bước trên con đường ăn năn để trở về với Thiên Chúa.",
          "Bạn là chủ công ty. Bạn mang việc đến, họ dốc hết sức mình.",
        ],
      },
      {
        icon: "🛥️",
        title: "Làm quen với đội ngũ",
        body: [
          "Du thuyền là văn phòng. Mỗi tầng boong là một phòng ban, phòng nào không đủ chỗ thì làm việc dưới giàn hoa trên bãi biển.",
          "Lucifer, seraph với hai cặp cánh vàng, điều hành từ sky deck. Các thiên thần khác đều có cấp trên trực tiếp, như một sơ đồ tổ chức thật.",
          "Bấm vào một thiên thần, hoặc tên trong bảng Nhân sự, để camera bay tới và xem vai trò, thành tích, việc gần đây.",
          "Bấm Cho nghỉ, các thiên thần sẽ dang cánh bay vào bờ làm việc riêng: uống cà phê ở quầy bar, bơi, tắm nắng. Bấm Vào ca, họ bay ngay về bàn làm việc.",
        ],
      },
      {
        icon: "📨",
        title: "Giao việc",
        body: [
          "Gõ mục tiêu vào thanh dưới cùng rồi bấm Giao việc. Mặc định việc đến tay Lucifer, anh sẽ chia nhỏ cho đúng người.",
          "Muốn giao thẳng, hãy chọn một thiên thần và độ ưu tiên. Bấm ▴ để thêm mô tả: mục tiêu, đầu ra mong muốn, ràng buộc.",
          "Yêu cầu càng rõ, kết quả càng tốt. Hãy nêu sản phẩm cụ thể, ví dụ \"một PRD trong docs/prd.md\".",
        ],
      },
      {
        icon: "👀",
        title: "Theo dõi công việc",
        body: [
          "Chấm màu cạnh tên và ánh sáng màn hình laptop cho biết thiên thần đang làm gì:",
          "Bong bóng thoại hiện tiến độ, suy nghĩ, việc giao và kết quả. Bảng việc theo dõi mọi task; Hoạt động là dòng sự kiện trực tiếp.",
          "Mỗi việc bạn giao hiện thành một nhiệm vụ trực tiếp ngay trên thanh giao việc: đang ở giai đoạn nào, tiến độ bao nhiêu, ai đang làm và vừa làm gì. Trên du thuyền, các đường sáng cho thấy công việc chảy từ cấp trên xuống từng cấp dưới, và camera tự lướt lại gần để theo dõi (tắt bằng phím F).",
          "Bấm vào task để xem việc con, nhật ký, kết quả và các file thiên thần đã viết. Bạn có thể huỷ task bất cứ lúc nào.",
        ],
        legend: true,
      },
      {
        icon: "🧠",
        title: "Mô phỏng hay làm thật",
        body: [
          "Mục Bộ não trên header cho biết công ty đang suy nghĩ bằng gì. \"Mô phỏng\" miễn phí và chạy theo kịch bản, hợp để khám phá.",
          "Để các thiên thần làm việc thật, khai báo LLM trong file .env của lucifer-engine: Anthropic API key, hoặc model qua Cloudflare AI Gateway như DeepSeek. Sau đó khởi động lại engine.",
          "Agent thật tốn token thật, nên hãy bắt đầu bằng một việc nhỏ cho một thiên thần trước khi giao mục tiêu lớn cho Lucifer.",
        ],
        shortcuts: true,
      },
    ],
    shortcutsTitle: "Phím tắt",
    shortcuts: [
      ["H", "Ẩn hoặc hiện tất cả các thanh"],
      ["F", "Bật hoặc tắt chế độ camera theo dõi công việc"],
      ["[", "Thu gọn hoặc mở thanh nhân sự"],
      ["]", "Thu gọn hoặc mở bảng việc"],
      ["Esc", "Đóng chi tiết, quay về toàn cảnh"],
      ["?", "Mở hướng dẫn này"],
    ],
  },
  examples: {
    title: "Chưa biết bắt đầu từ đâu? Thử một việc:",
    items: [
      {
        title: "Viết 3 bài đăng giới thiệu Lucifer Corp",
        description: "Bài ngắn, ấm áp cho X, LinkedIn và Facebook. Lưu vào content/launch-posts.md.",
        assigneeId: "belial",
      },
      {
        title: "Lên kế hoạch ra mắt app ghi chú AI",
        description: "Product brief, phác thảo kỹ thuật và kế hoạch marketing hai tuần, mỗi phần một file.",
      },
      {
        title: "Thiết kế landing page cho tiệm bánh",
        description: "Luồng người dùng, wireframe từng section bằng văn bản, màu sắc và typography. Lưu vào design/bakery-landing.md.",
        assigneeId: "lilith",
      },
    ],
  },
  workflow: {
    title: "Tiến trình",
    missions: "Nhiệm vụ đang chạy",
    phase: { queued: "Đang chờ", working: "Đang làm", team: "Cả đội đang làm", merging: "Đang tổng hợp", done: "Hoàn thành", failed: "Thất bại", cancelled: "Đã huỷ" },
    steps: { queued: "Đã nhận", working: "Thực hiện", team: "Cả đội", merging: "Tổng hợp", done: "Xong" },
    status: {
      queued: (name: string) => `Chờ ${name} nhận việc`,
      working: (name: string) => `${name} đang thực hiện`,
      team: (done: number, total: number) => `${done}/${total} việc con đã xong`,
      merging: (name: string) => `${name} đang tổng hợp kết quả`,
      done: "Đã bàn giao",
      failed: "Không hoàn thành được",
      cancelled: "Đã huỷ",
    },
    waitingOn: (n: number) => `Chờ ${n} cấp dưới báo cáo`,
    queued: "Đang trong hàng đợi",
    more: (n: number) => `+${n} nhiệm vụ`,
    fewer: "Thu gọn",
    open: "Xem chi tiết",
  },
  ago: { s: "s", m: "ph", h: "g", d: "n" },
};

export const MESSAGES: Record<Lang, Messages> = { en, vi };

export function useT(): Messages {
  return MESSAGES[useOffice((s) => s.lang)];
}

/** A field's translation (title, name, persona…) when present, otherwise the English base value. */
export function localize<T extends { i18n?: Translations }, K extends keyof T & string>(entity: T, field: K, lang: Lang): string {
  return entity.i18n?.[lang]?.[field] ?? String(entity[field]);
}

export function useLocalize() {
  const lang = useOffice((s) => s.lang);
  return <T extends { i18n?: Translations }, K extends keyof T & string>(entity: T, field: K) => localize(entity, field, lang);
}

/**
 * Describe an activity in the selected language. System activities (assigned, started, completed…)
 * are rebuilt from structured data; text written by agents (updates, thoughts, errors, file paths) is kept as is.
 */
export function activityText(
  a: Activity,
  t: Messages,
  lookup: { taskTitle(id: string): string | undefined; agentName(id: string): string | undefined; taskResult(id: string): string | undefined },
): string {
  const title = a.taskId ? lookup.taskTitle(a.taskId) : undefined;
  const target = a.targetAgentId ? lookup.agentName(a.targetAgentId) : undefined;
  if (title === undefined) return a.text;
  switch (a.kind) {
    case "task_assigned":
      return target ? t.activity.assigned(title, target) : a.text;
    case "task_delegated":
      return target ? t.activity.delegated(title, target) : a.text;
    case "task_started":
      return t.activity.started(title);
    case "task_completed":
      return t.activity.completed(title);
    case "task_failed":
      return t.activity.failed(title, lookup.taskResult(a.taskId!) ?? "");
    default:
      return a.text;
  }
}

/** activityText backed by the current store. */
export function useActivityText() {
  const t = useT();
  const tasks = useOffice((s) => s.tasks);
  const agents = useOffice((s) => s.agents);
  return (a: Activity) =>
    activityText(a, t, {
      taskTitle: (id) => tasks[id]?.title,
      taskResult: (id) => tasks[id]?.result ?? undefined,
      agentName: (id) => agents[id]?.name,
    });
}
