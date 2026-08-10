# CLAUDE.md — Project instructions for Claude Code

You are building **ClaudeGod** — a Manifest V3 Chrome extension for claude.ai power users. Read `PRD.md`, `FEATURES.md`, and `ARCHITECTURE.md` before writing code. `TASKS.md` is the execution order; work top-to-bottom and check items off as you complete them.

## Project context
- Solo founder, part-time (~15–20 hrs/week). Optimize for maintainability and small diffs, not cleverness.
- Ship target: CWS submission at end of M6. Scope discipline is a feature — anything not P0 in FEATURES.md gets a TODO comment and moves on.

## Commands
- `pnpm dev` — Vite/CRXJS dev build (load `dist/` as unpacked extension)
- `pnpm build` — production build + zip
- `pnpm test` — Vitest unit tests
- `pnpm lint` / `pnpm typecheck` — must pass before any commit

## Hard rules (never violate; if a task seems to require it, stop and flag instead)
1. **Read-only against claude.ai.** No POST/PUT/DELETE to conversation or account endpoints, ever. No auto-sending messages. Prompt insertion inserts text only.
2. **All claude.ai HTTP access lives in `src/api/claudeAdapter.ts`.** No other file may build claude.ai URLs or call fetch against it.
3. **Conversation content never leaves the device.** The only external host allowed anywhere in the codebase is the payment provider's license endpoint. The `network-allowlist` test enforces this — keep it passing.
4. **Conversation content never enters `chrome.storage.*`** (metadata only). IndexedDB is the only home for message/artifact text.
5. **Permissions are frozen:** `storage`, `notifications`, `alarms`, host `https://claude.ai/*`. Do not add permissions to solve a problem; redesign the solution.
6. **No remote code, no analytics SDKs, no telemetry** in v1.
7. Throttle adapter requests (≤1/sec, backoff on 429/5xx). Never hammer claude.ai.
8. Defensive parsing everywhere: API shapes are unstable; missing fields degrade gracefully, never crash. UI must always have loading/empty/error/degraded states.

## Code style & conventions
- TypeScript strict; no `any` (use `unknown` + narrowing). Zod for all external data.
- Preact function components; hooks for state; no global state lib — small module-level stores with subscribe pattern are fine.
- Files small and single-purpose; barrel exports discouraged.
- All user-facing strings in `shared/strings.ts` (future i18n).
- Errors: throw typed errors in core; catch at UI boundary; show calm, actionable messages ("Sync paused — Claude changed something. Your indexed chats still work.").
- Comments: only where the *why* isn't obvious (especially in claudeAdapter and usage estimation).
- Commits: conventional commits (`feat:`, `fix:`, `chore:`); one logical change per commit.

## Definition of done for any task
1. Acceptance criteria in FEATURES.md checked off.
2. `pnpm typecheck && pnpm lint && pnpm test` pass.
3. New logic in `core/` or `api/` has unit tests (UI components exempt unless logic-heavy).
4. Manually verified in the browser against real claude.ai (describe what you verified in the task checkbox note).
5. No new permissions, hosts, or storage of conversation content (rules above).
6. Bundle-size budget respected (content script <250KB gz) — check on `pnpm build`.

## When blocked or uncertain
- If a claude.ai endpoint/DOM anchor doesn't match ARCHITECTURE.md assumptions: implement the degraded-mode path first, record the actual observed shape in `docs/api-notes.md`, then adapt the adapter.
- If a feature can't meet its acceptance criteria within its P0 scope, cut scope (note it in TASKS.md) rather than expanding the architecture.
- Prefer asking one precise question over guessing on: pricing/gating changes, permission changes, anything touching the hard rules.

## Repo layout
Follow the structure in ARCHITECTURE.md §2 exactly. Documents live at repo root (`PRD.md`, `FEATURES.md`, `ARCHITECTURE.md`, `TASKS.md`, `RELEASE.md`, `docs/api-notes.md`).
