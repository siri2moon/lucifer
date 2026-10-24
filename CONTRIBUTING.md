# Contributing to Lucifer

Thanks for helping build the company of angels.

## Setup

```bash
cd lucifer-engine && uv sync          # Python 3.13 is installed by uv
cd lucifer-office && pnpm install
```

Run the engine without an API key to use the simulation brain. You can develop the whole UI and engine flow without spending tokens.

## Before opening a pull request

- Engine: `uv run pytest`
- Office: `pnpm test && pnpm build` (includes the TypeScript check)
- If you change the protocol, update both `lucifer-engine/src/lucifer_engine/protocol.py` and `lucifer-office/src/protocol.ts`, and check them against `uv run lucifer-engine schema`.
- Never commit `.env`, `data/` or `workspace/`. They hold secrets and agent output.

## Guidelines

- Keep pull requests focused, one change per PR, and explain the *why* in the description.
- Follow the style of the surrounding code. The engine uses type hints throughout. The office uses strict TypeScript.
- Write code, comments, docstrings, log messages and test names in English. Other languages belong only in translations (`lucifer-office/src/i18n.ts`, `i18n` in org charts) and in test data that exercises them.
- For visual changes to the office, attach a screenshot or GIF. `/?lineup` gives a close-up character preview.
- Tests that call a real LLM must be mocked at the HTTP layer, like `tests/test_crew.py`. CI should never need an API key.

## Adding a language

1. Add an entry to `lucifer-office/src/langs.ts`, for example `{ id: "ja", name: "日本語", flag: "🇯🇵" }`. It then shows up in the 🌐 menu.
2. Add a dictionary for it in `lucifer-office/src/i18n.ts` and register it in `MESSAGES`. TypeScript reports any missing key.
3. Optional: add translations of company, department and employee fields under `i18n.<id>` in the org chart YAML.

Agents need no change: they reply in the language of the task. If the engine should recognize your language explicitly, add it to `lucifer-engine/src/lucifer_engine/language.py` with a test.

## Reporting issues

Include what you did, what you expected and what happened. For engine problems, attach the engine log, with API keys removed.
