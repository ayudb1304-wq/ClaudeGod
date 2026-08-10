# api-notes.md — Observed claude.ai response shapes

**Status: EMPTY. The M0 spike has not been run yet.**

Everything in `src/api/claudeAdapter.ts` is written against the *assumed* shapes in
ARCHITECTURE §3. None of it is verified. Do not build sync (M1) on these
assumptions until this file has real recorded output.

Per CLAUDE.md: when an endpoint or DOM anchor does not match the ARCHITECTURE
assumption, implement the degraded-mode path first, record the actual observed
shape here, then adapt the adapter.

---

## Spike checklist (TASKS.md M0)

- [ ] `GET /api/organizations` returns 200 from the content script on a logged-in tab
- [ ] `GET /api/organizations/{org}/chat_conversations?limit=50&offset=0` returns 200
- [ ] Confirm which org UUID carries chat capability when several are returned
- [ ] Confirm whether same-origin `fetch` from the content script carries session auth,
      or whether the page-world proxy fallback (ARCHITECTURE §2 note) is required
- [ ] Check for anti-CSRF headers the web app sends that we would need to mirror
- [ ] Note any usage/limit fields exposed anywhere (feeds M3; see §5 below)

---

## 1. GET /api/organizations

Observed: _(not yet run)_

Fields we depend on: org `uuid`, and whatever marks chat capability.

```json
// paste redacted real response here
```

## 2. GET /api/organizations/{org}/chat_conversations

Observed: _(not yet run)_

Fields we depend on: `uuid`, `name`, `updated_at`. Pagination behaviour: does
`offset` beyond the end return `[]` or an error? Is there a total count?

```json
// paste redacted real response here
```

## 3. GET /api/organizations/{org}/chat_conversations/{uuid}

Observed: _(not yet run)_

Fields we depend on: message list, per-message `text`/`role`/`created_at`,
artifact payloads.

```json
// paste redacted real response here
```

## 4. Auth pathway

Observed: _(not yet run)_

Record here whether plain same-origin `fetch` worked, and if not, exactly what
was missing. This determines the whole fetch architecture for M1.

## 5. Usage / limit signals

Observed: _(not yet run)_

M3's headline feature depends on whether any authoritative usage figure is
exposed. If nothing is, the meter falls back to client-side estimation and every
displayed number must be labelled "est." (FEATURES 3.1). Worth answering during
this spike rather than in week 4.

---

## Redaction rule

Never paste real conversation text, titles, org UUIDs, or account identifiers
into this file. Replace values with `<redacted>` and keep only the *shape*.
This file is committed to the repo.
