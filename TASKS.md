# TASKS.md — Execution plan (work top to bottom)

Check off tasks as completed. Each task should end with passing checks per CLAUDE.md "Definition of done." Milestones map to PRD §10; rough calendar assumes 15–20 hrs/week.

## M0 — Spike & scaffold (Week 1)
- [x] Scaffold Vite + CRXJS + TypeScript + Preact project; manifest with frozen permissions; hello-world content script renders a badge on claude.ai; popup and options pages boot. *(TS pinned to 5.9.3, not 7.x: typescript-eslint 8.66 caps at `<6.1.0`. Build verified; generated manifest carries exactly the four frozen permissions. Content script 0.43KB gz vs 250KB budget. NOT yet loaded in a real browser — see spike below.)*
- [x] Set up Vitest, ESLint, Prettier, typecheck script; CI-style `pnpm verify` script running all three. *(`pnpm verify` green: typecheck + lint + 8 tests.)*
- [x] **SPIKE (de-risks everything):** from the content script, fetch `/api/organizations` and one page of `chat_conversations` on a logged-in claude.ai tab. Record real response shapes in `docs/api-notes.md`. If same-origin fetch lacks auth, implement and document the page-world proxy fallback. *Exit: raw conversation list logged with 200s.* *(Run 2026-08-10 against a real ~298-chat account. All 3 endpoints 200. Same-origin fetch carries auth, so no page-world proxy needed. Shapes recorded in `docs/api-notes.md`. **Caveat: verified from page context, NOT yet from the content-script isolated world** — confirm that by loading `dist/` unpacked before M1 sync.)*
- [ ] **Follow-ups the spike created (do before M1):**
  - [ ] Confirm same-origin fetch from the content-script isolated world (load `dist/` unpacked, call `listOrganizations()`).
  - [ ] ARCHITECTURE §4: `artifacts` is a **derived** table, not an API entity. Artifacts are `tool_use` blocks named `artifacts`, versioned via `input.version_uuid`; export must fold versions per `input.id`.
  - [ ] ARCHITECTURE §3: message array is `chat_messages`, `sender` is `human`/`assistant`.
  - [ ] Decide default: exclude `thinking` content blocks from search index and export (recommended).
  - [ ] FEATURES 3.1 / ARCHITECTURE §5: authoritative `/usage` endpoint exists, so cut estimation, `usageEvents`, `shared/limits.ts`, "est." labels, and the send-hook. Keep the degraded path.
- [x] Write `network-allowlist` test (fails build if any host other than claude.ai + payment provider appears in src) *(Negative-tested: injecting a rogue host fails the build.)*
- [x] Write read-only guard test for the (stub) adapter. *(Negative-tested: a DELETE in the adapter, and a claude.ai URL outside the adapter, both fail the build.)*

## M1 — Sync engine (Weeks 1–2)
- [x] `api/claudeAdapter.ts`: typed client per ARCHITECTURE §3 (throttle, backoff, zod parsing, selfTest, degraded status). *(Token-bucket 1 req/sec, honours Retry-After, exponential backoff + jitter on 429/5xx, degraded after 5 consecutive failures, single hard-coded GET transport.)*
- [x] `core/db.ts`: Dexie schema v1 + storage-content guard test. *(Guard negative-tested. Schema diverges from ARCHITECTURE §4 in 3 documented ways; §4 updated to match.)*
- [x] `core/sync.ts`: backfill state machine (paginate → fetch details → persist → checkpoint) resumable across restarts; incremental mode via `updated_at`. *(Checkpoints per conversation, not per page, so an abort mid-page still resumes. Depends on a `SyncStore` port so tests need no IndexedDB.)*
- [x] Progress UI: minimal banner in content script ("Indexed N/M") + degraded-mode banner.
- [x] Fixture tests: happy path, malformed conversation, 429 storm, resume-from-checkpoint. *(43 tests total. Also: abort, incremental skip, re-sync on changed `updated_at`, unreadable checkpoint, artifact version folding.)*
- [ ] **NOT DONE — definition of done #4: none of this has run against real claude.ai.** Every test is against fixtures. Verify a real backfill before trusting M2 search results. Blocked on the same unpacked-extension load as the content-script auth check.
- [ ] Watch item: `dexie` + `zod` are not yet in the content-script bundle because sync is not wired to a trigger. Re-check the 250KB gz budget once it is (currently 0.70KB gz).

## M2 — Search (Week 3)
- [x] `core/searchIndex.ts`: build MiniSearch from Dexie; chunk long messages; serialize/restore; incremental add; free-tier 100-conversation rotation behind `entitlements` stub. *(One document per message chunk, not per conversation, so BM25 stays meaningful and hits carry a message to jump to. 1KB chunks with 100-char overlap so phrases survive boundaries.)*
- [x] Cmd/Ctrl+K overlay UI: input, ranked results (title/snippet/date, match highlight), keyboard nav, empty/zero states; shortcut configurable + non-conflicting fallback. *(Preact in a shadow root so Claude's cascade and ours cannot collide. Cmd+K yields when an editable element has focus; Cmd+Shift+K always opens.)*
- [x] Jump-to-message: open conversation, scroll to matched message, flash highlight; graceful fallback (open conversation top) if message anchor not found. *(Degraded-first: tries uuid attributes, then a text scan, then gives up silently after 6s. Claude's DOM anchors were never verified, so nothing here assumes they exist.)*
- [x] Perf check vs. budget (<200ms @1k convs); move indexing to idle/worker if backfill janks UI. *(Measured 17ms avg query over 1,000 conversations / 8,000 chunks. Build 510ms, serialized index 1.9MB. No worker needed yet.)*
- [ ] **NOT DONE — definition of done #4: the overlay has never rendered on real claude.ai.** Keyboard capture, shadow-root isolation and jump-to-message all touch Claude's live DOM and none of it is fixture-testable. Verify before M3.
- [ ] Deferred: free-tier cap is enforced at index build, not on incremental upsert. Not reachable until sync has a trigger (M5). TODO recorded in `core/searchStore.ts`.
- [x] Bundle after M2: content script 42.93KB gz (budget 250KB). Preact + MiniSearch + Dexie + Zod all now included.

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
