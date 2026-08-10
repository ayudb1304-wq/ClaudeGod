# PRD: ClaudeGod (working name)

**Version:** 1.0 · **Owner:** Solo founder · **Status:** Approved for build
**Target:** Chrome Web Store submission ~6 weeks from build start; public launch ~2 weeks after.

---

## 1. One-line summary

A Manifest V3 Chrome extension that gives claude.ai power users instant full-text search across their entire chat history, live usage-limit meters, folders, a prompt library, and one-click export — with all data stored locally in the browser.

## 2. Problem

Heavy Claude users (developers, researchers, writers with hundreds of conversations) have two chronic pains:

1. **Findability.** claude.ai lists chats reverse-chronologically and its native search is shallow. Users lose old conversations and artifacts constantly.
2. **Opaque usage limits.** Users hit the 5-hour session window or weekly cap with no warning, mid-task. This is the single most complained-about topic in the Claude community.

Secondary pains: no folders/tags, no way to reuse prompts, weak export options.

## 3. Target user

- Primary: professional/daily Claude users on Pro/Max plans — developers, researchers, consultants, writers. Global, primarily US/EU. They already pay $20–100+/mo for Claude, so a $29 tool is an easy add-on.
- Secondary: free-plan users who feel limits hardest (they drive installs, reviews, and word-of-mouth; low paid conversion expected).

## 4. Competitive positioning

Competitors each cover a subset: Easy Folders (folders-first, ~$187 lifetime), Claude Toolbox (search/export/usage display), Toolbox for Claude (folders/export/prompt library), Claude Exporter (export only). None leads with usage intelligence; none combines all features; the paid leader is priced 5–6x above our planned lifetime price.

**Positioning:** "The missing control panel for Claude power users. Everything stays in your browser."

Differentiators, in order: (1) usage meters + alerts as the headline, (2) fast local full-text search, (3) local-first privacy (zero backend), (4) aggressive lifetime pricing.

## 5. Goals & success metrics

| Metric | 30 days post-launch | 60 days post-launch |
|---|---|---|
| Installs | 1,000+ | 3,000+ |
| Paying customers | 10+ | 30+ |
| Free→paid conversion | trending to 2–5% | 2–5% |
| CWS rating | ≥4.5 with 10+ reviews | ≥4.5 with 25+ reviews |
| Cumulative revenue | — | ₹50,000–₹1,00,000 (~$600–1,200) |

Non-goals for v1: multi-platform support (ChatGPT/Gemini), team features, cloud sync beyond `chrome.storage.sync`, AI-powered prompt enhancement, Firefox/Safari ports, any server-side component beyond the payment provider.

## 6. Monetization

- **Free tier:** search limited to the 100 most recent chats; usage meter (no alerts/history); single-chat Markdown export; 3 folders; 10 saved prompts.
- **Pro:** $29 lifetime founder price (first 100 customers, then $39) and $4/mo subscription. Unlocks: unlimited search index + Projects search, usage alerts + history chart, unlimited folders with sync, unlimited prompt library with variables, bulk export + artifact extraction.
- **Payment rails:** Dodo Payments (primary) or Lemon Squeezy (fallback) as Merchant of Record. Hosted checkout → license key emailed to customer → user activates key in extension → extension validates via MoR license API, caches activation, re-validates every 7 days with a 14-day offline grace period. No payment code ships inside the extension.

## 7. User stories (MVP)

1. As a user with 500 chats, I press Cmd/Ctrl+K on claude.ai, type three words I remember, and land on the exact message within 2 seconds.
2. As a Pro-plan user, I glance at a small widget on claude.ai and see how much of my 5-hour window and weekly cap I've used, and get a browser notification at 80%.
3. As a consultant, I drag chats into per-client folders and find them again across my laptop and desktop.
4. As a repeat prompter, I type `/` in the chat input, pick a saved prompt with a `{{variable}}`, fill the variable, and send.
5. As a developer, I export a whole folder of conversations (including artifacts as separate files) to a ZIP of Markdown for my notes system.
6. As a privacy-conscious user, I can verify in the listing and settings that no conversation content ever leaves my browser.
7. As a buyer, I purchase on a hosted checkout page, paste my license key into settings, and Pro unlocks immediately.

## 8. Functional requirements

See FEATURES.md for the complete prioritized list with acceptance criteria. P0 = must ship in MVP; P1 = ship if schedule allows / fast-follow; P2 = post-launch.

## 9. Constraints & principles

- **Read-only:** the extension never sends messages, modifies, or deletes anything on the user's Claude account. It reads the logged-in user's own data only.
- **Local-first:** all conversation content and indexes live in IndexedDB on-device. `chrome.storage.sync` holds only metadata (folder names, chat-ID↔folder mappings, prompt texts, settings) — never conversation content.
- **Minimal permissions:** `storage`, `notifications`, `alarms`, host permission for `https://claude.ai/*` only. Nothing else. This is a hard rule (CWS review risk + trust).
- **No remote code** (MV3 requirement). No analytics SDK that transmits content; at most a privacy-safe ping (install/uninstall counts) — default to none in v1.
- **Resilience over cleverness:** all claude.ai internal-API access goes through one adapter module with version detection and a graceful degraded mode ("sync paused — update pending") when endpoints change.
- **Trademark care:** the name **ClaudeGod** is a founder decision that knowingly departs from the safer convention of not leading with "Claude" (see §11 risk 5). No Anthropic logos, wordmark styling, or brand colors anywhere in the icon, listing, or UI. Listing must include "Unofficial. Not affiliated with Anthropic." prominently, not buried at the bottom.
- **Solo maintainability:** prefer boring, well-documented libraries; no build steps or services a single part-time developer can't keep alive.

## 10. Release plan & milestones

| Milestone | Contents | Exit criteria |
|---|---|---|
| M1 Sync engine | API adapter, incremental sync to IndexedDB | Own account's full history mirrored locally; re-sync is incremental |
| M2 Search | Cmd+K overlay, index, jump-to-message | Story #1 passes on 500+ chats |
| M3 Usage meter | Widget, popup, estimation, 80% alert | Story #2 passes; clearly labeled "estimated" where inferred |
| M4 Organize | Folders, prompt library, single-chat export | Stories #3, #4 pass |
| M5 Monetize | License flow, gating, onboarding, settings | Story #7 passes end-to-end with a real test purchase |
| M6 Ship | Polish, a11y pass, store assets, submission | CWS submission accepted |

## 11. Top risks

1. Anthropic ships native search/usage dashboards → bundle of features + front-loaded lifetime revenue limits damage; keep Gemini port option.
2. Internal API changes break sync → adapter isolation, startup self-test, degraded mode, expect ~2–4 hrs/month maintenance.
3. CWS review friction → minimal permissions, honest privacy form, submit early.
4. ToS gray area → strictly read-only, user's own data, comply immediately if contacted.
5. Name leads with "Claude" → residual (not elevated) trademark risk. Checked Aug 2026: no "ClaudeGod" collision on CWS, and multiple Claude-leading extensions are live and established (Claude Folders, Claude Toolbox, Claude Search, Superpower for Claude™). CWS policy bans claiming you are "authorized by, endorsed by, or produced by" another company, which descriptive use does not do. Counter-signal: Claude Toolbox later renamed to "AI Toolbox for Claude", which is what post-hoc pressure looks like. Mitigations: no Anthropic marks/colors anywhere, prominent "Unofficial" disclaimer, factual single-purpose statement. Keep a fallback name + slug ready before M6 so a rename costs a listing edit, not a rebuild. Nothing outside `shared/strings.ts` may hardcode the display name.

## 12. Open questions (decide before M5)

- Domain for ClaudeGod (check CWS name collisions before M6 submission).
- Dodo vs Lemon Squeezy after testing both checkout flows from India.
- Whether the free-tier search cap is 100 chats or 30 days of history (pick whichever demos better).
