# RELEASE.md — Release checklist & Chrome Web Store listing kit

## A. Pre-submission checklist

Rewritten 2026-08-12 against the built product. The original was drafted at M0
and assumed things that changed: usage is authoritative (no "est." labels), the
theme follows Claude's own toggle rather than the OS, and the build is
environment-switched.

Ordered so nothing is redone: configure, verify, then capture assets from the
verified build.

### 0. Ship-build configuration — the easiest thing to get wrong

The extension reads its payment environment at build time, and a wrong value
fails silently in the worst direction: a test build rejects every real
customer's key, and a live build during testing charges real money.

- [ ] Product created in **live** mode (test-mode products do not carry over)
- [ ] `.env` → `VITE_DODO_PRODUCT_ID` set to the **live** product id
- [ ] `.env` → `VITE_DODO_ENV` **unset or removed** (anything but `test` means live)
- [ ] `VITE_DEV_HOOKS` unset — a dev-hooks build ships a postMessage bridge
- [ ] `VITE_UNINSTALL_URL` points at the live feedback form
- [ ] Rebuild, then confirm the bundle carries the live hosts:
      `grep -o 'https://[a-z.]*dodopayments.com' dist/assets/*.js | sort -u`
- [ ] `DODO_API_KEY` is nowhere in `dist` (it is not `VITE_`-prefixed, so it
      cannot be, but check anyway — this is the one that ends a launch)

### 1. Automated

- [ ] `pnpm verify` green — 280+ tests including the guards that encode the
      hard rules: network-allowlist, read-only, storage-content, gate coverage,
      design-system, and copy vocabulary
- [ ] `pnpm build` — content script under 250KB gz (currently ~91KB)
- [ ] `dist` clean: no `.map`, no `console.log`, no `CLAUDEGOD_DEV_CMD`
- [ ] Manifest permissions unchanged: `storage`, `notifications`, `alarms`,
      host `https://claude.ai/*`
- [ ] **Known gap:** the network-allowlist test scans `src/` only. Two inert
      dependency strings (`tinyurl.com` in Dexie's error copy, `json-schema.org`
      in Zod) reach the bundle without tripping it. Scan `dist` by hand until
      that guard covers it.

### 2. Manual verification

- [ ] **Run `docs/verification-run.md` end to end** on a fresh Chrome profile
      with a real 100+ chat account. 13 steps, 60–75 minutes.

Two steps in it matter more than the rest:

- [ ] Step 12, theming: toggle **Claude's own** light/dark switch with your OS
      set the opposite way. The extension follows Claude, not the OS, and no
      test can prove that.
- [ ] Step 13, privacy: whole-session network review shows only `claude.ai`
      and `dodopayments.com`, and no request body carries conversation text.
      Everything else on this page is a bug; a failure here is a broken promise
      and the CWS privacy form's answer.

### 3. Purchase flow, end to end, in live mode

- [ ] Real purchase with a real card on the live checkout link
- [ ] Licence key arrives by email
- [ ] Customer lands on a **success page that shows the key** (Dodo appends it
      to `redirect_url`). Without this a buyer pays and lands nowhere
- [ ] Key activates in Settings; Pro gates unlock with no reload
- [ ] Remove licence frees the activation seat
- [ ] **Refund that purchase and confirm Pro actually drops.** Still unproven:
      sandbox refunds need a funded wallet, so this has only been simulated by
      disabling a key. If a real refund does not invalidate the key, refunded
      customers keep Pro silently and nothing signals it

### 4. Store hygiene

- [ ] Version bumped in `package.json`; CHANGELOG.md written
- [ ] Privacy policy live on the domain and accurate
- [ ] Screenshots taken from the **verified** build, not an earlier one
- [ ] "Unofficial. Not affiliated with or endorsed by Anthropic." prominent in
      the listing, not buried at the bottom. The name leads with "Claude" and
      the accent is now orange (PRD §11 risk 5), so this line carries more
      weight than it would otherwise
- [ ] Fallback name and slug genuinely decided, so a rejection costs a listing
      edit rather than a rebuild
- [ ] CWS name-collision check repeated immediately before submitting

### 5. Open product decisions

- [ ] Free-tier search cap: built as 100 chats; PRD §12 never formally chose
      between that and 30 days of history
- [ ] Founder pricing: $29 lifetime for the first 100, then $39. Purchasing
      power parity is enabled on the product, so confirm what a non-US customer
      is actually quoted

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
