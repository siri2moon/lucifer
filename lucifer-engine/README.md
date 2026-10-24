# lucifer-engine

The runtime behind **Lucifer Corp**, a company where every employee is an AI agent built on [CrewAI](https://github.com/crewAIInc/crewAI). You are the owner: you hand work to the CEO, the CEO splits it along the org chart, each employee does their part, writes deliverables to a shared workspace and reports back up.

It pairs with [lucifer-office](../lucifer-office), the 3D office that shows every agent live over WebSocket. See the [root README](../README.md) for the full picture.

## Quick start

Requires [uv](https://docs.astral.sh/uv/). uv installs Python 3.13 for you (CrewAI does not support 3.14 yet).

```bash
uv sync
uv run lucifer-engine serve          # http://localhost:4666
```

With no LLM key the engine runs the **simulation brain** (`sim`): agents still delegate, post updates and write files, but no API is called. Configure an LLM (below) to put real agents to work.

Assign a first task:

```bash
curl -X POST localhost:4666/api/tasks -H 'content-type: application/json' \
  -d '{"title":"Launch an AI note-taking app","description":"We need a PRD, a technical architecture and a marketing plan"}'
```

## Configuration

Copy `.env.example` to `.env`. Every variable is optional.

### General

| Variable | Default | Description |
|---|---|---|
| `LUCIFER_BRAIN` | `auto` | `auto` · `crew` · `sim`. `auto` picks `crew` when the selected LLM has a key |
| `LUCIFER_LLM` | auto | `anthropic` · `gateway`. Defaults to `gateway` when any `CF_AIG_*` variable is set |
| `LUCIFER_MODEL` | | One model for every employee, overriding the org chart. Required for `gateway` |
| `LUCIFER_COMPANY` | `companies/lucifer-corp.yaml` | Org chart file |
| `HOST` / `PORT` | `0.0.0.0` / `4666` | |
| `LUCIFER_HEARTBEAT_MS` | `2000` | Dispatch interval |
| `LUCIFER_MAX_CONCURRENT` | `4` | Agents working at the same time |
| `LUCIFER_DATA_DIR` | `data` | Where `state.json` is stored |
| `LUCIFER_WORKSPACE_DIR` | `workspace` | Where agents write deliverables |

### Anthropic Claude

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Required. CrewAI's provider does not read the `ant auth login` profile |
| `LUCIFER_FALLBACKS` | `1` (default) enables server-side fallbacks when the safety classifier declines a request |

### Cloudflare AI Gateway (DeepSeek, OpenAI, Gemini…)

The engine calls the gateway's OpenAI-compatible endpoint, `/compat/chat/completions`, so models, provider keys, caching, rate limits and fallbacks are all managed on Cloudflare.

```bash
CF_AIG_ACCOUNT_ID=<account id>
CF_AIG_GATEWAY_ID=<gateway id>          # empty means "default"
CF_AIG_TOKEN=<Cloudflare API token>      # provider key stored on the gateway (BYOK)
LUCIFER_MODEL=deepseek/deepseek-chat     # or dynamic/<route> to choose the model on the gateway
```

| Variable | Description |
|---|---|
| `CF_AIG_ACCOUNT_ID`, `CF_AIG_GATEWAY_ID` | Build `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/compat` |
| `CF_AIG_BASE_URL` | Override the whole `/compat` URL, for example with a custom domain |
| `CF_AIG_TOKEN` | Cloudflare API token. Enough on its own when the provider key is stored on the gateway |
| `CF_AIG_BYOK_ALIAS` | Alias of the stored provider key when it is not `default`. Without it the gateway answers `no BYOK credential named 'default'` |
| `CF_AIG_PROVIDER_KEY` | Provider key when it is not stored on the gateway. The token then goes in the `cf-aig-authorization` header |
| `LUCIFER_STRICT_TOOLS` | `1` sends tools with `strict: true` (OpenAI models only). Off by default because DeepSeek and many others reject it |

Through the gateway, Claude-specific `effort` and server-side fallbacks are not sent. Configure retries and fallbacks with a dynamic route on Cloudflare instead.

## How the company works

```
Owner ──assigns──▶ Lucifer (CEO)
                     ├─▶ Michael (CTO) ─▶ Gabriel · Raphael · Uriel
                     ├─▶ Azrael (CPO)  ─▶ Lilith
                     └─▶ Samael (CMO)  ─▶ Belial
```

- **Heartbeat.** On every tick, each idle employee picks up their highest-priority `todo` task. Each work session runs in its own thread.
- **Delegation.** Agents can only delegate to their direct reports (`delegate_task`). The parent task moves to `waiting` and returns to `todo` once every subtask has finished, so its owner can merge the results.
- **Agent tools:** `delegate_task`, `post_update`, `write_file`, `read_file`, `list_files`, `complete_task`, `fail_task`. File paths are confined to `workspace/`, symlinks included.
- **Task lifecycle:** `todo → in_progress → (waiting →) done | failed | cancelled`. Cancelling a task cancels its open subtasks.
- **Agent status** (drives the office animations): `idle`, `thinking`, `working`, `waiting`, `offline`.
- **Persistence:** `data/state.json`. Tasks that were running when the engine stopped are redone on the next start.

### Languages

Prompts are written in English. Each task carries a `language`: either the one passed to `POST /api/tasks`, or one detected from the title and description (Vietnamese, Japanese, Korean, Chinese, Thai and English are recognized; see [`language.py`](src/lucifer_engine/language.py)). Subtasks inherit it, and the brief tells every agent to write files, updates and summaries in that language, whatever language other files in the workspace use. When no language is detected, agents follow the language of the task text.

Base fields in the org chart are English. Translations for the office go under `i18n`, keyed by language code, for the company, departments and employees:

```yaml
- id: gabriel
  title: Backend Engineer
  i18n:
    vi:
      title: Kỹ sư Backend
```

Edit [`companies/lucifer-corp.yaml`](companies/lucifer-corp.yaml) to add people, change personas or set a `model` and `effort` per employee.

## How CrewAI is used

Each work session is a `Crew` with exactly one `Agent` (role, goal and backstory from the org chart) and one `Task`, run with `Process.sequential`. The engine does not use `Process.hierarchical`: it supports a single manager layer and delegates synchronously inside one run, so it cannot model a multi-level org chart and the UI could not show each subtask as a real task. Instead, `delegate_task` creates a subtask in the engine and the assignee picks it up on their own turn.

With Anthropic, the engine uses CrewAI's native provider (default model `claude-opus-5-5`), extended as `LuciferAnthropic` to also send:

- `output_config.effort` per employee (CEO and CTO `high`, everyone else `medium`).
- `fallbacks: "default"`, so a request declined by the safety classifier is retried on a fallback model. Disable with `LUCIFER_FALLBACKS=0`.

CrewAI adds prompt caching on its own. CrewAI telemetry is disabled by default (`CREWAI_DISABLE_TELEMETRY=true`).

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/snapshot` | Full state: company, engine, agents, tasks, activities |
| GET | `/api/agents`, `/api/agents/{id}` | Employees |
| GET | `/api/tasks`, `/api/tasks/{id}` | Tasks (the detail includes subtasks and activities) |
| POST | `/api/tasks` | Assign work: `{title, description?, assigneeId?, priority?, language?}`. Goes to the CEO by default |
| POST | `/api/tasks/{id}/cancel` | Cancel a task and its open subtasks |
| POST | `/api/engine/start` · `/api/engine/stop` | Start or pause the heartbeat |
| GET | `/api/files`, `/api/files/{path}` | List and read workspace files |
| WS | `/ws` | `snapshot` on connect, then `agent.updated`, `task.created`, `task.updated`, `activity`, `engine.updated` |

JSON is camelCase. The types live in [`src/lucifer_engine/protocol.py`](src/lucifer_engine/protocol.py). Export a JSON Schema for clients with:

```bash
uv run lucifer-engine schema > protocol.schema.json
```

Interactive OpenAPI docs are served at `http://localhost:4666/docs`.

## Development

```bash
uv run pytest
```

The suite covers the engine with the simulation brain, delegation rules, workspace sandboxing, state persistence, HTTP and WebSocket, and language detection. One test runs real CrewAI against an Anthropic API faked at the HTTP layer, checking that tools execute and that requests carry `effort` and `fallbacks`. No test needs an API key.

```
src/lucifer_engine/
  protocol.py        data types shared with lucifer-office
  config.py          environment variables and the org chart
  store.py           in-memory state saved to JSON, thread-safe, emits events
  engine.py          heartbeat, dispatch, waking parent tasks
  session.py         what an agent may do on a task
  prompts.py         backstory and task brief
  language.py        task language detection
  brains/crew.py     CrewAI with Claude or Cloudflare AI Gateway
  brains/sim.py      simulation brain
  server.py          FastAPI REST + WebSocket
  cli.py             lucifer-engine serve | schema
```
