# ARCHITECTURE.md — Technical Specification

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Extension platform | Chrome Manifest V3 | Store requirement |
| Build | Vite + CRXJS plugin, TypeScript strict | Fast HMR for extensions, typed |
| UI | Preact + Tailwind (or vanilla + CSS modules if smaller) | Small bundle; popup/overlay UIs are simple |
| Local DB | IndexedDB via Dexie.js | Conversation mirror + checkpoints |
| Search | MiniSearch | Tiny, in-memory, serializable index |
| ZIP | fflate | Client-side bulk export |
| Payments | Dodo Payments (primary) / Lemon Squeezy (fallback), license-key API | MoR handles global tax; no Stripe-India dependency |
| Tests | Vitest (unit), Playwright (smoke, optional) | See §8 |

No backend. No analytics SDK in v1.

## 2. Extension anatomy

```
src/
  manifest.ts             # CRXJS manifest definition
  background/             # MV3 service worker
    index.ts              # alarms (revalidation, sync ticks), notifications
  content/
    index.ts              # bootstraps on https://claude.ai/*
    ui/                   # overlay (Cmd+K), folder panel, usage widget, slash-picker
    inject.ts             # DOM anchors + MutationObserver helpers
  api/
    claudeAdapter.ts      # ALL claude.ai internal API access lives here
    types.ts              # API response types (defensive, all fields optional)
  core/
    db.ts                 # Dexie schema + migrations
    sync.ts               # backfill + incremental sync state machine
    searchIndex.ts        # MiniSearch build/update/persist
    usage.ts              # usage signal reading + estimation
    entitlements.ts       # single source of truth for free/pro gates
    license.ts            # MoR license validation client
    exporter.ts           # md/json/zip generation
  popup/                  # toolbar popup (usage, folders quick view, search entry)
  options/                # settings page
  shared/                 # utils, constants, feature flags, i18n-ready strings
```

**Contexts & messaging:** content script owns DOM UI and same-origin API fetches (it inherits the user's claude.ai session — cookies flow automatically for same-origin requests made from the content-script/page context). Service worker owns alarms, notifications, license revalidation. Popup/options talk to data via shared modules; cross-context communication uses `chrome.runtime` messages with a small typed message schema in `shared/messages.ts`. IndexedDB is accessed from content script and popup directly (same extension origin — note: store DB under the extension's origin, not the page's; if same-origin fetch requires page context, proxy fetches through content script but persist in extension storage).

> Implementation note for the fetch pathway: MV3 content scripts execute in an isolated world but network requests from content scripts are made with the page's origin and credentials for same-origin URLs. Verify early (M1 spike) that `fetch('/api/organizations/...')` from the content script returns 200 with session auth. If Claude adds anti-CSRF headers, mirror the headers the web app itself sends (read them once from its own requests via a page-world interceptor as a last resort — keep this behind the adapter).

## 3. claudeAdapter — the only risky module

Known internal endpoints (verify shapes in the M1 spike; treat all as unstable):

- `GET /api/organizations` → find org UUID with chat capability
- `GET /api/organizations/{org}/chat_conversations?limit=50&offset=N` → paginated list (`uuid`, `name`, `updated_at`, ...)
- `GET /api/organizations/{org}/chat_conversations/{uuid}?tree=True&rendering_mode=messages&render_all_tools=true` → full conversation detail. **Verified divergences (docs/api-notes.md §3):** the message array is `chat_messages` (not `messages`), and `sender` is `"human"`/`"assistant"` (not `"user"`). Artifacts are not an entity here; they are `tool_use` blocks named `artifacts` (§4).
- `GET /api/organizations/{org}/usage` → authoritative usage windows (`five_hour`, `seven_day`); see §5.

Rules:
1. Read-only. The adapter exposes only non-mutating reads (`listOrganizations`, `getChatOrganization`, `listConversations`, `getConversation`, `getUsage`, `selfTest`). A unit test asserts no other HTTP verbs exist in the module.
2. Throttle ≤1 req/sec (token bucket), exponential backoff on 429/5xx, hard stop + degraded mode after 5 consecutive failures.
3. Defensive parsing: every response passes through a lenient parser (zod with `.passthrough()` and optionals); missing fields degrade features, never throw to UI.
4. `adapter.selfTest()` runs on startup: fetch 1 page of conversations; on failure set `syncStatus="degraded"` and surface the banner. Log the failing shape to local storage for debugging (never transmitted).
5. Version pinning: store `lastKnownGoodSchemaHash`; when parse failures spike, show "Claude updated their app — a fix is coming" instead of generic errors.

## 4. Data model (Dexie)

```ts
// db.ts — schema v1 (as built; see docs/api-notes.md for why it differs)
conversations: 'uuid, updatedAt, title, indexedAt'  // indexedAt null until detail persisted
messages:      '[convUuid+index], convUuid, uuid'   // text, sender, createdAt, hasArtifact
artifacts:     '[convUuid+id], convUuid'            // title, type, content, possiblyStale
syncState:     'key'                                // backfill checkpoint, lastSyncAt
searchMeta:    'key'                                // serialized MiniSearch index + version
```

Three deliberate departures from the original sketch, all driven by observed API
behaviour rather than preference:

1. **`artifacts` is keyed `[convUuid+id]`, not `id`.** Artifact ids come from the
   model's own tool input and are only observed unique within a conversation.
2. **`artifacts` is a derived table.** Artifacts are not an API entity; they are
   `tool_use` blocks named `artifacts`, folded per `input.id` during sync
   (`core/artifacts.ts`). A partial `update` command after the last full snapshot
   sets `possiblyStale`.
3. **`usageEvents` is dropped.** An authoritative usage endpoint exists, so there
   are no estimation inputs to record. See §5.

`conversations.indexedAt` exists so a conversation listed but not yet
detail-fetched is retried rather than silently treated as complete.

`chrome.storage.sync` (metadata only, chunked): `folders` (id, name, color, convIds[]), `prompts` (id, title, body, category), `settings`, `licenseCache` (in `storage.local`, not sync). Enforce: nothing from `messages`/`artifacts` may be written to any `chrome.storage` area — add a lint-style unit test on the storage wrapper.

**Index strategy:** build MiniSearch over `messages.text` (chunk long messages to ~1KB fields) + titles; serialize to `searchMeta` after backfill; incremental `add` on sync; rebuild from Dexie if deserialization fails. Free tier: index only the 100 most recent conversations (drop + re-add on rotation).

## 5. Usage meter logic

**Resolved by the M0 spike: an authoritative endpoint exists, so there is no estimation tier.**

`GET /api/organizations/{org}/usage` returns `five_hour` and `seven_day`, each with
`utilization` (a number 0–100) and an ISO `resets_at`. Both the meter and the reset
countdown are direct reads.

1. Read via `adapter.getUsage()`. Display `utilization` as the percentage and
   `resets_at` as the countdown. No "est." labelling is required.
2. **No fallback estimation.** No DOM send hook, no `shared/limits.ts` ceilings,
   no per-plan setting, no `usageEvents` table. Estimation is a real feature with
   real bugs; building it speculatively when a true source exists is waste.
3. Degraded path instead: if `/usage` is non-200 or unparseable, hide the meter
   with a calm message. Never fall back to guessing a number.
4. Alerts: service worker checks on an `alarms` tick; fires once per window at
   threshold, keyed on `resets_at` so "once per window" is exact rather than
   inferred.

Ignore the internal codename keys in that response (`amber_ladder`, `tangelo`,
and similar). They are the fields most likely to churn.

## 6. License flow (Dodo / Lemon Squeezy)

1. Upgrade CTA → opens hosted checkout URL (utm-tagged) in new tab.
2. Customer receives license key by email (MoR feature).
3. Settings → paste key → `license.ts` calls MoR "activate/validate license" endpoint with key + generated `instanceId` (random UUID stored locally).
4. On success store `{key, instanceId, validatedAt, plan}` in `storage.local`; `entitlements.ts` derives `isPro`.
5. Weekly revalidation alarm; failures start a 14-day grace timer before downgrade; "refunded/disabled" response downgrades immediately with a polite notice.
6. Abstract behind `LicenseProvider` interface so Dodo↔LS is a config swap.

## 7. Permissions, privacy, compliance

`manifest.json` permissions: `storage`, `notifications`, `alarms`; host: `https://claude.ai/*`. Optional-nothing. No `tabs`, no `<all_urls>`, no `scripting` beyond declared content script.

- CWS single-purpose statement: "Productivity toolkit for claude.ai (search, organization, usage display, export)."
- Privacy form: collects no user data; conversation content processed and stored locally; license key sent to payment provider for validation only.
- Listing must state: "Unofficial. Not affiliated with Anthropic." Product name/icon must not use Anthropic marks.
- No remotely hosted code; all deps bundled.

## 8. Testing & quality bar

- Unit (Vitest): adapter parsing (fixture JSONs incl. malformed), sync state machine (resume, dedupe), search index ops, exporter output snapshots, entitlement gating, storage-content guard, read-only guard.
- Manual smoke checklist per release (RELEASE.md §): fresh install → onboard → backfill 100+ chats → search → folder DnD → prompt insert actually registers in Claude's editor → export md + zip → license activate/deactivate → degraded-mode simulation (block claude.ai API via devtools) → light/dark.
- Performance budgets: content script bundle <250KB gz; search <200ms @1k convs; backfill CPU never janks Claude's UI (use idle callbacks/web worker for indexing if needed).
- Error handling policy: user-visible errors are calm and actionable; unexpected exceptions caught at UI boundaries; no console spam in production build.

## 9. Build, release, environments

- `pnpm dev` (CRXJS HMR against unpacked), `pnpm build` (production zip), `pnpm test`.
- Version scheme `0.x.y` until launch, then semver; CHANGELOG.md maintained.
- Two MoR test-mode keys checked via `.env.local` (never committed); production keys injected at build.
- Keep a Firefox-compat pass in mind (webextension-polyfill) but do not spend time on it pre-launch.
