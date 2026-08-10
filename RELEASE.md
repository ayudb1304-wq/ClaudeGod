# RELEASE.md — Release checklist & Chrome Web Store listing kit

## A. Pre-submission checklist (every release)

**Automated**
- [ ] `pnpm verify` (typecheck + lint + tests) green, including network-allowlist, read-only guard, storage-content guard
- [ ] `pnpm build` — content script <250KB gz; no sourcemaps/dev logs in bundle
- [ ] Manifest diff reviewed: permissions unchanged (`storage`, `notifications`, `alarms`, `https://claude.ai/*`)

**Manual smoke (fresh Chrome profile, real account with 100+ chats)**
- [ ] Install → onboarding → explicit "Start indexing" → backfill completes with progress; re-open browser → incremental sync only
- [ ] Cmd+K search: known phrase from an old chat found <1s; jump-to-message lands and highlights; zero-result state OK
- [ ] Usage widget shows values (or "est." values); simulate threshold → exactly one notification
- [ ] Create folder, drag chat in from native sidebar and from search results; visible in popup; survives browser restart; (Pro) syncs to second profile signed into same Chrome account
- [ ] `/` picker inserts prompt and Claude actually accepts the text on send (type one extra char to confirm editor registered it)
- [ ] Export single chat → Markdown renders code blocks correctly; bulk export folder → ZIP with artifacts as files
- [ ] License: activate test key → Pro unlocks; deactivate/refund in MoR test mode → graceful downgrade message
- [ ] Degraded mode: block `claude.ai/api/*` in devtools → calm banner, search over existing index still works, no console errors
- [ ] Light/dark both readable; overlay fully keyboard-navigable
- [ ] Network tab whole-session review: only claude.ai + license endpoint

**Store hygiene**
- [ ] Version bumped, CHANGELOG.md updated
- [ ] Privacy policy URL live and accurate
- [ ] Screenshots current with actual UI

## B. Chrome Web Store listing (draft copy — edit freely)

**Name:** ClaudeGod *(founder's choice; see PRD §9 — this name leads with "Claude", which is an accepted trademark/CWS-rejection risk. Check store collisions before submission.)*

**Summary (132 chars max):**
Search all your Claude chats instantly, track your usage limits, organize with folders, save prompts, export everything. Local-first.

**Description (structure):**
1. Hook: "Never lose a Claude conversation — or get cut off by a limit — again."
2. Feature blocks with one-line benefits: 🔍 Instant full-text search (Cmd+K) · 📊 Live usage meters + alerts before you hit the wall · 🗂 Folders that sync across devices · ⚡ Prompt library with `/` insertion · 📦 One-click export (Markdown/ZIP incl. artifacts)
3. Privacy paragraph: all conversation data stays in your browser; nothing is uploaded; no analytics; the only external call is license validation.
4. Free vs Pro table; founder lifetime price note.
5. Disclaimer: "Unofficial. Not affiliated with or endorsed by Anthropic."

**Category:** Productivity → Tools. **Language:** English.

**Screenshots (order matters — first two do the selling):**
1. Usage meter widget with "82% of your 5-hour window" state
2. Cmd+K search overlay with highlighted result
3. Folders panel with drag-in-progress
4. Slash prompt picker
5. Free vs Pro comparison card

**Privacy practices form answers:** does NOT collect user data; conversation content processed locally only; license key transmitted solely for purchase validation; no sale of data; no remote code.

**Single purpose:** "Adds productivity tools (search, organization, usage display, prompt reuse, export) to the claude.ai website."

## C. Launch-day runbook
1. Publish → verify listed version installs cleanly.
2. Email waitlist (short, one CTA, founder-price mention + deadline).
3. Reply-post in the original r/ClaudeAI validation thread; new launch post ("You asked for X — I built it. Free tier, everything stays in your browser."); answer every comment for 48h.
4. X thread: usage-meter GIF first tweet; build-in-public numbers thereafter.
5. Product Hunt Tue–Thu; AlternativeTo, There's An AI For That, extension directories.
6. Ask every happy user (politely, once) for a CWS review — 10 early 5★ reviews materially move store ranking.
7. Daily for 2 weeks: check CWS stats + Dodo dashboard + reviews; fix bugs same-day; note feature requests in TASKS backlog with counts.

## D. Incident playbook
- **Sync breaks (Anthropic changed API):** degraded banner should already be showing. Reproduce, update adapter + fixtures, ship patch. Target <48h turnaround; post a pinned note in reviews/Reddit if >24h.
- **CWS rejection:** read cited policy, respond with minimal targeted change; permissions are already minimal so most rejections will be listing/privacy-form wording.
- **Refund/chargeback:** MoR handles it; extension downgrade path already automatic.
- **Anthropic contact/objection:** comply immediately, respond politely, have the Gemini-port pivot (TASKS backlog) as plan B.
