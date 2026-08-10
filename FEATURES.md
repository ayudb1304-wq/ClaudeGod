# FEATURES.md — Prioritized Feature List with Acceptance Criteria

Legend: **P0** = MVP must-have · **P1** = fast-follow / if schedule allows · **P2** = post-launch backlog
Tier: **F** = free · **P** = Pro-gated

---

## 1. Sync engine (foundation — not user-visible)

### 1.1 Conversation sync — P0
Incrementally mirror the logged-in user's conversation list and message content from claude.ai's internal web API into IndexedDB.
- [ ] First run performs a full backfill, paginated, throttled to ≤1 request/sec, with a visible progress indicator ("Indexed 240/512 chats").
- [ ] Subsequent runs sync only new/updated conversations (compare `updated_at`).
- [ ] Sync survives tab close/reopen (resumes from checkpoint stored in IndexedDB).
- [ ] All API access flows through `src/api/claudeAdapter.ts` only; no other module constructs claude.ai URLs.
- [ ] On any endpoint returning unexpected shape/status: adapter sets global `syncStatus = "degraded"`, UI shows non-scary banner, no crash, search continues over already-indexed data.
- [ ] Strictly read-only: adapter contains no POST/PUT/DELETE to conversation endpoints. Enforced by unit test that fails if any mutating method exists.

### 1.2 Projects sync — P1 (tier: P)
Include conversations inside Claude Projects in the index, tagged with project name.

---

## 2. Search

### 2.1 Full-text search overlay — P0 (F: last 100 chats · P: unlimited)
- [ ] Cmd/Ctrl+K opens an overlay on claude.ai (does not conflict when focus is in the message input — use Cmd/Ctrl+Shift+K as fallback binding, configurable).
- [ ] Searches conversation titles + message bodies; results ranked by relevance (MiniSearch default BM25-ish is fine), show title, snippet with highlighted match, date.
- [ ] Latency: <200ms for query over 1,000 conversations on a mid-range laptop.
- [ ] Enter opens the conversation; the extension scrolls to and briefly highlights the matched message.
- [ ] Free tier: index capped at 100 most recent chats; results footer shows "Searching your last 100 chats — upgrade for full history."
- [ ] Empty/zero-result states designed (no blank panes).

### 2.2 Search filters — P1 (P)
Filter by date range, folder, has-artifact. Simple pill UI in the overlay.

### 2.3 Artifact search — P2 (P)
Index artifact titles/content separately; "Artifacts" tab in overlay.

---

## 3. Usage intelligence (headline feature)

### 3.1 Usage meter — P0 (F)
- [ ] Small floating widget on claude.ai (collapsible, position remembered) + toolbar popup showing: 5-hour session window usage and weekly cap usage.
- [ ] Data source: the authoritative `GET /api/organizations/{org}/usage` endpoint (verified in the M0 spike, docs/api-notes.md §5), read via the adapter. `utilization` is displayed as-is. There is no client-side estimation tier and no "est." labeling in v1 — scope cut recorded in api-notes §5.
- [ ] Degraded path: if `/usage` is non-200 or unparseable, hide the meter behind a calm message; never fall back to guessing a number.
- [ ] Countdown to window reset shown when `resets_at` is present.
- [ ] Never blocks or delays the user's actual chatting; passive display only.

### 3.2 Limit alerts — P0 (P)
- [ ] Browser notification at 80% of session window (threshold configurable 50–95%).
- [ ] Uses `notifications` + `alarms` permissions; respects OS Do-Not-Disturb (i.e., just uses standard notification API, no workarounds).
- [ ] Alert fires at most once per window; no notification spam.

### 3.3 Usage history — P1 (P)
7/30-day chart of usage in the popup (simple sparkline/bars; no charting lib heavier than ~10KB, or hand-rolled SVG).

---

## 4. Organization

### 4.1 Folders — P0 (F: 3 folders · P: unlimited + sync)
- [ ] Sidebar panel injected on claude.ai listing folders; drag-and-drop a chat from Claude's native sidebar or from search results into a folder.
- [ ] Folder = name + color + ordered list of conversation IDs. Metadata only, stored in `chrome.storage.sync` (chunked to respect the 8KB/item and 100KB total quotas), so Pro users get cross-device sync for free.
- [ ] A chat can be in multiple folders (tags-like semantics).
- [ ] Deleting a folder never touches the conversations themselves.
- [ ] Graceful behavior when Claude's DOM changes: if injection anchor not found, panel falls back to popup-only view of folders (no crash, no broken layout).

### 4.2 Pinned chats — P1 (F)
Pin up to N chats to the top of the folder panel.

---

## 5. Prompt library

### 5.1 Saved prompts with slash insertion — P0 (F: 10 prompts · P: unlimited)
- [ ] CRUD UI for prompts (title, body, optional category) in popup/options.
- [ ] Typing `/` at the start of Claude's message input opens a filterable prompt picker; selecting inserts the body into the input. Insertion must use input events compatible with Claude's editor (contenteditable/ProseMirror-safe: dispatch proper `beforeinput`/`input` events or use `document.execCommand('insertText')` fallback; verify text is actually registered by the app, not just visually present).
- [ ] `{{variable}}` placeholders: picker prompts for values before insertion (P feature; free tier inserts raw).
- [ ] Never auto-sends. Insertion only.

### 5.2 Prompt import/export — P1 (F)
Import/export prompt library as JSON/CSV.

---

## 6. Export

### 6.1 Single-conversation export → Markdown — P0 (F)
- [ ] "Export" button on conversation view; downloads `.md` preserving roles, code blocks, and lists.
- [ ] Filename: `{conversation-title}-{YYYY-MM-DD}.md` (sanitized).

### 6.2 Bulk export — P0 (P)
- [ ] Export all chats, a folder, or search results as a ZIP (client-side, e.g., fflate) of Markdown and/or JSON.
- [ ] Artifacts extracted as separate files inside the ZIP, referenced from the parent conversation file.
- [ ] Handles 500+ conversations without freezing the UI (chunked/async, progress bar).

### 6.3 Additional formats (PDF, HTML) — P2 (P)

---

## 7. Monetization & account

### 7.1 License activation — P0
- [ ] Settings has "Enter license key" → validates against Dodo/Lemon Squeezy license API → stores activation record locally.
- [ ] Re-validation every 7 days via `alarms`; 14-day offline grace; clear error states (invalid, refunded, network fail ≠ scary).
- [ ] All Pro gates read from a single `entitlements` module; no scattered `isPro` checks.
- [ ] Upgrade CTAs are contextual and quiet (footer lines, locked-state tooltips) — never modal nags, never interrupts typing.

### 7.2 Onboarding — P0 (F)
- [ ] First-run: 3-step explainer (what syncs, where data lives, start indexing button). Sync is opt-in on this screen, not silent.
- [ ] Uninstall feedback URL set via `chrome.runtime.setUninstallURL` (1-question form).

---

## 8. Settings, privacy, quality

### 8.1 Settings page — P0 (F)
Keyboard-shortcut config, widget visibility/position, alert threshold, data controls: "Pause sync," "Delete all local data" (wipes IndexedDB + storage), license management.

### 8.2 Privacy guarantees — P0 (F)
- [ ] Zero network calls except: claude.ai (read-only, same-origin session) and the license API (sends license key + instance ID only).
- [ ] Verified by an automated test that fails the build if any other host appears in code, and by a human pass over the network tab before each release.
- [ ] Privacy policy page (static, on the landing-page domain) accurately reflecting the above; linked in CWS listing.

### 8.3 Theming & a11y — P1 (F)
Match Claude's light/dark mode automatically; overlay fully keyboard-navigable; visible focus states.

---

## Deferred ideas parking lot (P2, do not build without demand)
Multi-platform (Gemini/Grok port), team/shared prompt libraries, cloud backup, AI prompt enhancer, Notion/Obsidian direct export integrations, Firefox/Safari builds, usage analytics dashboards per project/client.
