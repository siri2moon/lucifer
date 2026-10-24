# lucifer-office

The 3D office of **Lucifer Corp**: a luxury yacht anchored off a golden beach. Every AI agent from [lucifer-engine](../lucifer-engine) is an angel working at a desk on deck. You watch them work in real time and assign tasks right from the interface. See the [root README](../README.md) for the full picture.

React 19 · React Three Fiber · drei · zustand · Vite.

## Running

```bash
# 1. The engine (sibling folder)
cd ../lucifer-engine && uv run lucifer-engine serve     # http://localhost:4666

# 2. The office
pnpm install
pnpm dev                                                # http://localhost:5173
```

The dev server proxies `/api` and `/ws` to the engine. For an engine elsewhere, run `LUCIFER_ENGINE_URL=http://host:port pnpm dev`. A static build (`pnpm build`) reads `VITE_ENGINE_URL` at build time.

## What's inside

**The yacht**
- A white hull with a navy bottom and a gold stripe, **LUCIFER ✦✦✦✦✦✦** on the side, bobbing on the waves.
- Three teak decks, glass rails, a sky deck canopy with a spinning radar, and a jacuzzi at the bow.

**Work zones**
- One zone per department. The CEO's department gets the **sky deck**; the others fill the upper, aft and bow decks by size.
- Departments that don't fit on board move to a **bougainvillea pergola** on the beach.
- The layout is computed from the engine's org chart.

**The angels**
- Feathered wings tinted in the agent's color, a glowing halo, an ivory tunic with gold trim and a silk stole. The head of the company is a seraph with two pairs of golden wings.
- Desks, laptops and motion follow the agent's status:
  - working: green screen, fast typing, wings fluttering
  - thinking: pulsing violet screen, rising thought bubbles
  - waiting on reports: a spinning hourglass
  - idle: looking around
- A name tag and speech bubbles for progress updates, thoughts, delegation and completion.
- **Break time:** pause the company and every angel flies ashore to grab a coffee at the Heaven's Brew bar, swim, sunbathe, stroll, chat or circle in the sky. Clock in and they fly back to their desks.

**Sea and beach**
- A layered wave shader rolling ashore, turquoise shallows fading to deep blue, sun glints, rhythmic shore foam and wet sand at the waterline.
- Swaying palms, umbrellas, sun loungers, circling seagulls and a sailboat offshore.
- Beachgoers take turns strolling, swimming, sunbathing and waving at the yacht; a new one appears every 40 seconds (`SHIFT_MS` in `src/scene/Beachgoers.tsx`).

**Interface**
- Team roster, kanban board, activity feed and an assign bar with assignee and priority.
- **Live missions** above the assign bar: every request shows its phase, a streaming progress bar, the angels working on it and what they just did. Board cards show the current step, a running clock and subtask progress.
- **Work links** on the yacht: a glowing arc from each manager to the reports holding their subtasks, with light flowing down while they work and a comet on every hand-off and every report back. Links of the selected mission glow brighter.
- **Follow the work:** the camera glides in to frame whoever is working and both ends of every hand-off, then pulls back to the overview when the company goes quiet. Dragging or zooming takes over for 20 seconds; toggle it from the top bar or with `F`.
- The task drawer shows the mission's **workflow**: a stepper (received, working, team, wrap-up, done) and the full delegation tree with live status on each node.
- Each panel collapses to a handle at the screen edge (`[` for the team, `]` for the board); `H` hides them all; `F` turns camera follow on or off.
- Agent and task drawers with subtasks, logs, results, a full-screen file viewer and cancellation. Expand a drawer for comfortable reading.
- Click an angel or a name in the roster and the camera flies there. `Esc` returns to the overview.
- A guided tour on the first visit, reopened with the help button or `?`.
- English and Vietnamese, switchable from the globe menu.

## Project structure

```
src/
  protocol.ts          engine types (mirrors lucifer_engine/protocol.py)
  i18n.ts, langs.ts    UI dictionaries and the language list
  state/office.ts      zustand store + applyEvent (a pure reducer)
  state/engine.ts      self-reconnecting WebSocket + REST client
  scene/
    World.tsx          canvas, lighting, sky, camera, seagulls, sailboat
    Ocean.tsx          sea shader
    Beach.tsx          sand, palms, umbrellas, loungers, pergola
    Yacht.tsx          the yacht and work zone mats
    layout.ts          departments to zones, desks within zones
    Person.tsx         character body, clothes and poses
    Angel.tsx          wings, halo, tunic and stole
    AgentAvatar.tsx    desk, cloud seat, laptop, status effects
    BreakTime.tsx      break-time flights, activities and the coffee bar
    Beachgoers.tsx     rotating beachgoers
    labels.tsx         name tags and bubbles (DOM, projected from 3D every frame)
    Lineup.tsx         character preview at /?lineup
  ui/                  top bar, panels, drawers, guide, assign bar
```

Agent labels don't use drei's `<Html>`, because the current version drops the content of the first label in the scene. `labels.tsx` projects coordinates itself and writes `transform` directly, so labels stay below the panels and don't grow when close to the camera.

## Development

```bash
pnpm test        # event reducer, zone layout, i18n
pnpm typecheck
pnpm build
```

Open `http://localhost:5173/?lineup` for a close-up preview of the characters while working on them.
