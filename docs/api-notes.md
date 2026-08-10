# api-notes.md — Observed claude.ai response shapes

**Status: M0 spike RUN 2026-08-10.** All three assumed endpoints verified against a
real logged-in account (~298 conversations). Shapes below are observed, not assumed.

Treat everything here as unstable anyway: these are internal endpoints with no
compatibility contract. Defensive parsing per CLAUDE.md rule 8 still applies.

## Redaction rule

Never paste real conversation text, titles, org UUIDs, or account identifiers into
this file. Only shapes. This file is committed to a public repo.

---

## 0. Auth pathway (the question that gated everything)

`fetch(path, { credentials: 'include' })` against a same-origin `/api/...` path
returns **200 with session auth**. No CSRF header, no bearer token, no page-world
proxy needed.

- Verified from the **page context** on a logged-in `https://claude.ai/chats` tab.
- **STILL UNVERIFIED: the content-script isolated world.** MV3 content scripts
  send same-origin requests with page credentials, so this is expected to work,
  but it has not been observed yet. Confirm by loading `dist/` unpacked and
  calling `listOrganizations()` from the content script before building M1 sync.
- The page-world proxy fallback in ARCHITECTURE §2 looks unnecessary. Do not
  build it until something actually fails.

---

## 1. GET /api/organizations

Returns a **top-level array** (not an object with a `data` key).

Two orgs on the test account. Selection rule confirmed:

```js
orgs.find(o => (o.capabilities || []).includes('chat'))
```

Observed `capabilities` values: `["chat","claude_max"]` and `["api"]`. Picking
`[0]` would have been wrong roughly half the time. Always filter on `chat`.

Item keys (29): `active_flags, api_disabled_reason, api_disabled_until,
billable_usage_paused_until, billing_type, capabilities,
claude_ai_bootstrap_models_config, created_at, data_retention,
data_retention_periods, external_mapping, free_credits_status, has_icon,
home_stripe_account_region, id, is_internal_org, is_workbench_cmek_blocked,
merchant_of_record, monitoring_notice, name, parent_organization_uuid,
rate_limit_tier, rate_limit_upsell, raven_type, settings, subscription_pause,
updated_at, uuid, visibility_status`

We depend on `uuid` and `capabilities` only. `rate_limit_tier` may be useful for
labelling the plan in the usage widget.

## 2. GET /api/organizations/{org}/chat_conversations?limit&offset

Returns a **top-level array**.

Item keys (17): `created_at, current_leaf_message_uuid, effective_thinking_mode,
is_starred, is_temporary, is_wiggle_enabled, model, name, platform, project,
project_uuid, session_id, settings, summary, updated_at, user_uuid, uuid`

- `updated_at` format: `2026-08-10T13:55:23.662768Z` (ISO 8601, microseconds, Z).
  Parses with `new Date()`. This is the incremental-sync comparison key.
- **Pagination terminator: offset past the end returns `200` with `[]`**, not a
  404 or an error. Loop until the array is empty.
- `limit=1000` was accepted and returned all 298 conversations in one response.
  No observed cap at 50. Still page at ≤50 and throttle to 1 req/sec per
  CLAUDE.md rule 7; do not exploit this to hammer the endpoint.
- No `x-total-count` header, so "Indexed N/M" progress needs either an initial
  full-list call or an optimistic denominator.
- Free bonuses for later milestones: `is_starred` (pinned chats, FEATURES 4.2)
  and `project_uuid`/`project` (Projects sync, FEATURES 1.2). Both null on
  non-project chats.

## 3. GET /api/organizations/{org}/chat_conversations/{uuid}

Query params `?tree=True&rendering_mode=messages&render_all_tools=true` work as
documented in ARCHITECTURE §3.

**DIVERGENCE: the message array is `chat_messages`, not `messages`.**

Top-level keys (14): `chat_messages, created_at, current_leaf_message_uuid,
effective_thinking_mode, is_starred, is_temporary, is_wiggle_enabled, model,
name, platform, settings, summary, updated_at, uuid`

Message keys (12): `attachments, content, created_at, files, index,
parent_message_uuid, sender, sync_sources, text, truncated, updated_at, uuid`

- **`sender` is `"human"` or `"assistant"`** (not `"user"`). Exporter must map this.
- Each message carries **both** `text` (a flattened string) and `content` (an
  array of typed blocks). **CORRECTION (verified 2026-08-10 on a real 298-chat
  backfill): `text` is `""` on every message sampled (500/500).** The flattened
  field exists but is not populated; the payload lives exclusively in `content`
  blocks. Sync must always derive text from `text`-type blocks — treat an empty
  `text` exactly like a missing one (`core/sync.ts` does since the M3
  verification pass).
- Observed `content[].type` values: **`text`, `tool_use`, `tool_result`,
  `thinking`**.
- `truncated` exists as a field. Check it before trusting message text.
- `index` and `parent_message_uuid` expose the conversation tree. With
  `rendering_mode=messages` the array appears already linearised, so branch
  handling can stay out of scope for v1.

### Decision: thinking blocks are excluded by default (2026-08-10)

`thinking` blocks are **excluded from the search index and from export by
default**: they are noise in search results, and users do not expect internal
reasoning in an exported transcript. An opt-in setting can come post-launch if
anyone asks. Implemented in `core/sync.ts` (`toMessageRecords` keeps only `text`
blocks when flattening) — the exporter (M4) must apply the same filter to
`content` blocks.

**Caveat resolved (2026-08-10):** moot — the real API ships `text: ""` (see §3
correction above), so stored text always comes from our own block filter, which
keeps only `text`-type blocks. Thinking content structurally cannot enter the
index or exports.

## 4. Artifacts

**DIVERGENCE: artifacts are not a top-level entity.** ARCHITECTURE §4 models an
`artifacts` table as if the API returned them separately. It does not.

Artifacts are `tool_use` content blocks with `name === "artifacts"`:

```
block: { id, input, name, start_timestamp, stop_timestamp, type }
block.input: { command, id, title, type, language, content, source,
               md_citations, version_uuid }
```

- `input.content` is the artifact body as a string.
- `input.command` distinguishes create vs update vs rewrite, and `version_uuid`
  implies **artifacts are versioned across multiple blocks in one conversation**.
  Bulk export (FEATURES 6.2) must fold versions down to the final state per
  `input.id`, or it will emit one file per edit.
- `input.language` was `null` on the sample (typed `object`); treat as optional.

The Dexie `artifacts` table stays valid as a **derived** store: extract from
`tool_use` blocks during sync rather than expecting the API to supply it.

## 5. Usage / limit signals — GET /api/organizations/{org}/usage

**This is the headline finding. An authoritative usage endpoint exists.**

```json
"five_hour": {
  "utilization": 61,
  "resets_at": "2026-08-10T16:50:00.094759+00:00",
  "limit_dollars": null,
  "used_dollars": null,
  "remaining_dollars": null
}
```

`seven_day` has the identical shape. Also present: `seven_day_opus`,
`seven_day_sonnet`, `seven_day_cowork`, `seven_day_oauth_apps`,
`seven_day_omelette`, plus `limits`, `spend`, `extra_usage`,
`member_dashboard_available`.

- `utilization` is a **number 0–100**, already a percentage.
- `resets_at` is an ISO 8601 timestamp, so the reset countdown in FEATURES 3.1 is
  a direct read, not a derivation.
- `*_dollars` fields were `null` on this plan. Do not depend on them.
- Several top-level keys are internal codenames (`amber_ladder`, `cinder_cove`,
  `iguana_necktie`, `nimbus_quill`, `tangelo`, `omelette`). Ignore them entirely;
  they are the most likely fields to churn.

### Impact on M3 (scope reduction)

FEATURES 3.1 specifies a two-tier data source: authoritative if available, else
client-side estimation from observed sends, with everything labelled "est.".
**Tier 1 is available.** That means:

- No DOM send-button hook needed.
- No estimation math, and no `shared/limits.ts` per-plan ceiling constants.
- No "est." labels, and no user-adjustable "my plan" setting.
- The Dexie `usageEvents` table (ARCHITECTURE §4) may be unnecessary in v1.

Keep the degraded path: if `/usage` returns non-200 or an unparseable shape, hide
the meter with a calm message rather than falling back to guessing. Estimation is
a real feature with real bugs; do not build it speculatively now that a real
source exists.

---

## Endpoint probe results (GET only, read-only)

| Path | Result |
|---|---|
| `/api/organizations` | 200, array |
| `/api/organizations/{org}/chat_conversations` | 200, array |
| `/api/organizations/{org}/chat_conversations/{uuid}` | 200, object |
| `/api/organizations/{org}/usage` | 200, authoritative usage |
| `/api/bootstrap` | 200; keys include `account, statsig, growthbook, intercom_account_hash, intercom_user_jwt, locale, system_prompts, feature_flags`. Contains third-party auth tokens. **Do not read, store, or log this endpoint.** No feature needs it. |

`/api/bootstrap` is listed only so a future reader knows it was checked and
deliberately rejected.
