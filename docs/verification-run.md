# verification-run.md — One ordered pass over the whole extension

**Purpose:** every milestone has passing unit tests and several have never run in a
browser. Five bugs so far were found by using the extension, not by testing it, and
four shared one shape: a code path that was individually correct and never actually
reached. This run is designed to reach all of them once, in an order where each step
sets up the next.

**Budget:** about 60–75 minutes. Steps 1–6 are the load-bearing ones; if you run out
of time, stop after step 9 and the remainder can wait for M6.

**How to record failures:** note the step number and what you saw, then keep going.
Do not stop to fix. A full pass with six findings is worth more than a third of a
pass with one fixed.

---

## Before you start

- [ ] `pnpm build` is current with `main`
- [ ] `.env` has `VITE_DODO_ENV=test` and a `VITE_DODO_CHECKOUT_URL`
- [ ] Your Dodo test licence key is to hand (`CGOD-…`)
- [ ] Use a **fresh Chrome profile** so onboarding and first-run state are real.
      New profile → `chrome://extensions` → Developer mode → Load unpacked → `dist/`
- [ ] Sign into claude.ai in that profile, on an account with 100+ chats

> **Reset between runs:** Settings → *Delete all local data*, then remove and re-add
> the unpacked extension. That clears IndexedDB, both storage areas, the licence and
> the onboarding flag. Anything short of this leaves first-run state behind.

---

## 1. Install and onboarding (M5, never verified)

- [ ] Loading the extension **opens the options page by itself**
- [ ] The 3-step explainer is the first thing on that page
- [ ] Step 2 lists the four privacy points
- [ ] **Back** returns to step 1 with nothing lost
- [ ] On step 3, **Not now** is a full button beside Start indexing, not a link
- [ ] Press **Not now**: the explainer disappears and settings appear
- [ ] Reload the options page: the explainer does **not** come back

*Then reset (remove + re-add) so you can take the other branch.*

- [ ] Press **Start indexing** on step 3 instead
- [ ] It works **with no claude.ai tab open** — a background tab appears

> Watch for: a dead end telling you to reload a tab. That was the bug fixed in
> `resolveBridge`; it should now open a tab itself.

---

## 2. First real backfill (M5)

- [ ] The sync banner appears bottom-right on claude.ai with a rising count
- [ ] Claude stays fully usable while it runs (type a message, scroll)
- [ ] Requests pace at roughly 1/sec — check the Network tab, not vibes
- [ ] The banner disappears when the run finishes
- [ ] Popup → **Local index** shows a count matching your real chat count

- [ ] **Interrupt test:** start a fresh backfill, reload the Claude tab mid-run,
      then press *Check for new chats*. It resumes rather than restarting from 0
- [ ] **Incremental test:** press *Check for new chats* on a finished index. It
      completes almost instantly and the count does not change

---

## 3. Search (M2, partly verified)

- [ ] `Ctrl/Cmd+K` opens the overlay
- [ ] With the cursor **in Claude's composer**, `Ctrl/Cmd+K` goes to Claude's own
      palette, and `Ctrl/Cmd+Shift+K` still opens ours
- [ ] Search a phrase you remember from an old chat: results in well under a second
- [ ] Matched words are highlighted in the snippet
- [ ] Arrow keys move the selection; the list scrolls to follow
- [ ] **Enter opens the conversation and lands on the matched message**
- [ ] A nonsense query shows the zero-result state, not a blank pane
- [ ] `Escape` closes; clicking the backdrop closes

> Watch for: jump-to-message. It depends on Claude's DOM, which was never verified.
> The accepted fallback is the conversation opening at the top. Note which happens.

---

## 4. Usage meter (M3, popup never verified)

- [ ] The floating widget shows a session percentage on claude.ai
- [ ] Collapse it, reload the page: it is still collapsed
- [ ] Drag it; reload: it stays where you put it
- [ ] **Click the toolbar icon**: the popup shows the same percentages
- [ ] A reset countdown appears and is plausible

---

## 5. Folders (M4)

- [ ] The folder panel handle is visible at the right edge; clicking opens it
- [ ] Create a folder
- [ ] **Drag a chat from Claude's own sidebar into it**
- [ ] Open the search overlay and **drag a result into a folder**
- [ ] The chat appears under the folder in the **popup** too
- [ ] Reload the browser: folders and their contents survive
- [ ] Deleting a folder does **not** delete the conversations

---

## 6. Prompt library and slash insertion (M4, CRUD never verified)

- [ ] Options → create a prompt with a title and body
- [ ] Edit it, then delete a different one: the list updates correctly
- [ ] On claude.ai, type `/` at the **start** of an empty composer: the picker opens
- [ ] Filter by typing; select with Enter
- [ ] **The text lands in the composer**
- [ ] **Type one more character afterwards, then send.** The message Claude receives
      must contain the whole inserted text

> This last check is the point. ProseMirror can show text the editor never
> registered, so visually-present is not the same as actually inserted.

- [ ] Typing `/` **mid-sentence** does not open the picker

---

## 7. Export (M4, ZIP button never verified)

- [ ] Conversation view → export a single chat to Markdown
- [ ] Open it: roles are labelled, code blocks survive, lists are intact
- [ ] Popup → **Export all chats (.zip)** with Pro active
- [ ] The ZIP downloads and opens
- [ ] Artifacts are separate files inside it, referenced from the parent chat
- [ ] Progress was shown during the export; the popup never froze

---

## 8. Licence and the Pro gates (M5)

Do this in order. The first half is free-tier behaviour, so **do not activate yet.**

- [ ] Search overlay footer says you are searching your last 100 chats, with an
      **Upgrade** link beside it
- [ ] Create a 4th folder: blocked, with an upgrade link
- [ ] Create an 11th prompt: blocked, with an upgrade link
- [ ] Popup export: shows the Pro line with an upgrade link
- [ ] Click any upgrade link: checkout opens in a new tab, and the URL carries
      `utm_campaign` naming the gate you clicked from

Now activate:

- [ ] Settings → paste the test key → **Pro is active on this device**
- [ ] Your email from the Dodo customer record appears
- [ ] **Without reloading anything**, open the popup: bulk export is now unlocked
- [ ] The search overlay footer changes to full history
- [ ] A 4th folder and 11th prompt can now be created

> Watch for: gates that stay locked until a reload. That was the entitlements
> hydration bug; each context now hydrates and listens for changes.

- [ ] Settings → **Remove licence from this device** → gates return to free

---

## 9. Settings page (M5, never verified)

- [ ] **Rebind the shortcut:** click the button, press `Ctrl/Cmd+J`. The label updates
- [ ] Press a bare letter while capturing: you get an explanation, not silence
- [ ] `Escape` cancels a capture
- [ ] On an **already-open** claude.ai tab, the new binding works without reloading it
- [ ] Rebind back to `K`
- [ ] Uncheck **Show the widget**: it disappears from claude.ai
- [ ] Re-check it; **Reset widget position** returns it to the corner
- [ ] Move the alert threshold slider; reopen the page: the value persisted
- [ ] Tick **Pause indexing**. The popup replaces its button with the paused note
- [ ] Untick it: the button returns

---

## 10. Usage alert (M3, notification never verified)

- [ ] With Pro active, set the threshold **below** your current session usage
- [ ] Within a minute, a system notification appears
- [ ] It fires **once**, not repeatedly
- [ ] Remove the licence and repeat: **no notification** (alerts are Pro)

---

## 11. Degraded mode (M1)

- [ ] DevTools → Network → block request URL `claude.ai/api/*`
- [ ] Press *Check for new chats*
- [ ] A calm banner appears; nothing alarming, no stack traces
- [ ] **Search still works** over what is already indexed
- [ ] Console shows no uncaught errors
- [ ] Unblock, retry: it recovers without a reload

---

## 12. Theming and appearance (M6 input)

This is a survey, not a pass/fail. Note every surface that looks wrong; the output
feeds the M6 theming task.

- [ ] Switch Claude to **dark mode**
- [ ] Search overlay: readable?
- [ ] Folder panel: readable?
- [ ] Usage widget: readable?
- [ ] Slash picker: readable?
- [ ] Popup: readable?
- [ ] Options page: readable?

> Expect failures here. Only the overlay follows `prefers-color-scheme` today; the
> rest are hardcoded light. This step exists to size the work, not to pass.

---

## 13. Privacy claim (the one that must not fail)

- [ ] DevTools → Network, cleared, then use every feature for a few minutes
- [ ] Filter to third-party requests
- [ ] **The only hosts are `claude.ai` and `dodopayments.com`**
- [ ] No request body anywhere contains conversation text
- [ ] `chrome://extensions` → the manifest still lists exactly `storage`,
      `notifications`, `alarms` and `https://claude.ai/*`

> This is the listing's core claim and the CWS privacy form's answer. Everything
> else on this page is a bug; a failure here is a broken promise.

---

## After the run

- [ ] Findings written up, worst first
- [ ] Anything privacy-related from step 13 fixed before anything cosmetic
- [ ] `docs/verification-run.md` updated if a step was unclear or missing
- [ ] TASKS.md manual-check items ticked for whatever passed
