# TASKS.md — Execution plan (work top to bottom)

Check off tasks as completed. Each task should end with passing checks per CLAUDE.md "Definition of done." Milestones map to PRD §10; rough calendar assumes 15–20 hrs/week.

## M0 — Spike & scaffold (Week 1)
- [x] Scaffold Vite + CRXJS + TypeScript + Preact project; manifest with frozen permissions; hello-world content script renders a badge on claude.ai; popup and options pages boot. *(TS pinned to 5.9.3, not 7.x: typescript-eslint 8.66 caps at `<6.1.0`. Build verified; generated manifest carries exactly the four frozen permissions. Content script 0.43KB gz vs 250KB budget. NOT yet loaded in a real browser — see spike below.)*
- [x] Set up Vitest, ESLint, Prettier, typecheck script; CI-style `pnpm verify` script running all three. *(`pnpm verify` green: typecheck + lint + 8 tests.)*
- [ ] **SPIKE (de-risks everything):** from the content script, fetch `/api/organizations` and one page of `chat_conversations` on a logged-in claude.ai tab. Record real response shapes in `docs/api-notes.md`. If same-origin fetch lacks auth, implement and document the page-world proxy fallback. *Exit: raw conversation list logged with 200s.* **← BLOCKED: needs a logged-in browser. `docs/api-notes.md` scaffolded with the checklist. Do this before any M1 work; the adapter is written against unverified assumptions.**
- [x] Write `network-allowlist` test (fails build if any host other than claude.ai + payment provider appears in src) *(Negative-tested: injecting a rogue host fails the build.)*
- [x] Write read-only guard test for the (stub) adapter. *(Negative-tested: a DELETE in the adapter, and a claude.ai URL outside the adapter, both fail the build.)*

## M1 — Sync engine (Weeks 1–2)
- [ ] `api/claudeAdapter.ts`: typed client per ARCHITECTURE §3 (throttle, backoff, zod parsing, selfTest, degraded status).
- [ ] `core/db.ts`: Dexie schema v1 + storage-content guard test.
- [ ] `core/sync.ts`: backfill state machine (paginate → fetch details → persist → checkpoint) resumable across restarts; incremental mode via `updated_at`.
- [ ] Progress UI: minimal banner in content script ("Indexed N/M") + degraded-mode banner.
- [ ] Fixture tests: happy path, malformed conversation, 429 storm, resume-from-checkpoint.

## M2 — Search (Week 3)
- [ ] `core/searchIndex.ts`: build MiniSearch from Dexie; chunk long messages; serialize/restore; incremental add; free-tier 100-conversation rotation behind `entitlements` stub.
- [ ] Cmd/Ctrl+K overlay UI: input, ranked results (title/snippet/date, match highlight), keyboard nav, empty/zero states; shortcut configurable + non-conflicting fallback.
- [ ] Jump-to-message: open conversation, scroll to matched message, flash highlight; graceful fallback (open conversation top) if message anchor not found.
- [ ] Perf check vs. budget (<200ms @1k convs); move indexing to idle/worker if backfill janks UI.

## M3 — Usage meter (Week 4)
- [ ] `core/usage.ts`: authoritative-source read via adapter if available (record findings in api-notes) + estimation fallback from observed sends; "est." labeling; plan setting.
- [ ] Floating widget (collapsible, position persisted) + popup display: session window %, weekly %, reset countdown when derivable.
- [ ] Service worker: 1-min alarm + on-send check; 80% notification (configurable threshold), once per window.
- [ ] Tests: estimation math, once-per-window alert logic.

## M4 — Organize + prompts + export (Week 5)
- [ ] `folders`: storage.sync-backed store with chunking + quota handling; sidebar panel UI; drag-and-drop from native sidebar and search results; multi-folder membership; popup fallback view when DOM anchor missing.
- [ ] Prompt library: CRUD in popup/options; `/` slash-picker in Claude input; insertion verified to register with Claude's editor (test on real site — this is finicky, see FEATURES 5.1); `{{variable}}` fill flow (Pro).
- [ ] `core/exporter.ts`: single-conversation Markdown (roles, code blocks preserved; snapshot tests); bulk ZIP (fflate) of folder/all/search-results with artifacts as separate files; async + progress for 500+ convs.

## M5 — Monetization (Week 6)
- [ ] `core/license.ts` behind `LicenseProvider` interface; Dodo implementation first, LS stub. Activate/validate with instanceId; weekly revalidation alarm; 14-day grace; downgrade states.
- [ ] `core/entitlements.ts` as single gate source; wire all Pro gates (search cap, alerts, folders>3, prompts>10, bulk export, variables).
- [ ] Contextual upgrade CTAs (quiet, per FEATURES 7.1) + hosted-checkout links.
- [ ] Onboarding: 3-step first-run with explicit "Start indexing" consent; `setUninstallURL`.
- [ ] Settings page complete: shortcuts, widget, threshold, pause sync, delete-all-data, license mgmt.
- [ ] End-to-end test purchase in MoR test mode; document flow in RELEASE.md.

## M6 — Polish & ship (Week 7)
- [ ] Light/dark auto-theming; keyboard nav + focus states across overlay/panel/popup; calm error copy pass.
- [ ] Full manual smoke checklist (RELEASE.md) on a fresh Chrome profile with a real 100+ chat account.
- [ ] Bundle audit vs. budgets; strip dev logging.
- [ ] Store assets: 128px icon, 5 screenshots (usage meter first, search second), 30s screencap GIF/video, listing copy (from RELEASE.md draft), privacy policy page live on landing domain.
- [ ] Submit to Chrome Web Store. While in review: landing page live with waitlist→launch email, 2 SEO posts published ("search your Claude history", "Claude limits explained").

## M7 — Launch (Week 8)
- [ ] Address review feedback same-day; publish.
- [ ] Soft launch: reply to Week-1 validation thread + waitlist email.
- [ ] Launch posts: r/ClaudeAI (story format: "you asked, I built"), X thread with usage-meter GIF, Product Hunt (Tue–Thu), AlternativeTo + directory listings.
- [ ] Instrument nothing; instead: daily manual check of CWS stats + MoR dashboard; reply to every review/comment for 2 weeks.

## Post-launch backlog (pull only on demand)
Search filters (2.2), usage history chart (3.3), pinned chats, prompt import/export, Projects sync, PDF/HTML export, Firefox build, Gemini port (pivot option per PRD §11).
