# Changelog

Every stage this thing went through, in order. Dates are when the build happened.

## v3.0.2 — docs lead with publishing, not test users
- README and the Google panel now say **publish the app** (Auth Platform → Audience) as the way to open
  it up, with *Testing* described as the 100-user alternative rather than the default.

## v3.0.1 — optional API keys, and the daily cap fixed
- `GOOGLE_CAL_API` and `GOOGLE_TASKS_API` are read at build time and, when set, sent as `?key=` on their
  API. Neither is required for OAuth calls — keys are project-wide, not per-API — but they attribute
  quota to the project if you have them.
- `build.js` was still defaulting the daily cap to 4,000 while the app expected 8,000; both agree now.

## v3.0.0 — Google is the backend
- Firebase is gone: no accounts, no Firestore, no email/password. One credential (`GOOGLE_CLIENT_ID`),
  one sign-in, and the calendars themselves are the storage.
- On first sign-in the app **creates one Google calendar per Playday calendar** and moves this device's
  events into them, so two-way sync covers all four calendars instead of only Google's own.
- Events are routed to their calendar's Google copy on create and on edit; pulls land back on the
  Playday calendar rather than inventing a duplicate.
- **Sign-in gate**: with a Client ID configured, the app asks you to sign in before it opens, with an
  "use it offline for now" escape.
- Polling every minute while the tab is visible, plus on focus. Daily call cap raised to 8,000 to suit it.

## v2.6.8 — the Google Client ID can come from the build
- `GOOGLE_CLIENT_ID` is written into `config.js` by `build.js` and used as the default, so a device no
  longer needs it pasted into Settings. When it comes from the build the field is locked and says why.
- No API key and no client secret are involved anywhere: Calendar and Tasks authorise with the OAuth
  access token, and the popup flow needs neither.

## v2.6.7 — call caps, tuned for limits Google has not published yet
- Every Calendar **and Tasks** call passes a budget before it goes out: **120/min** and **4,000/day**
  per browser, against Google's current 600/min and 1,000,000/day billing threshold. At the cap the app
  stops calling and pauses itself for 5 minutes, then 15, then an hour.
- Both numbers are env vars — `PLAYDAY_CALLS_PER_MINUTE` and `PLAYDAY_CALLS_PER_DAY` — so when Google
  publishes the Workspace standard tier later in 2026, raising them is a variable and a rebuild, not a patch.
- A real `429` / `rateLimitExceeded` walks the same backoff ladder instead of retrying; a clean sync resets it.
- The sync panel shows today's spend against the cap.
- Also in this patch: v2.6.5's calendar-delete pencil and v2.6.6's disabled-API message.

## v2.6.6 — a disabled API reads like a sentence
- When Google returns `SERVICE_DISABLED` (the Calendar or Tasks API switched off in the Cloud project),
  the app now names the API, prints the activation link from Google's own response, and says no redeploy
  is needed — instead of pasting Google's paragraph into the status line.
- Tasks and Calendar are told apart, so the second failure does not look like the first.

## v2.6.5 — deleting a calendar is findable
- Every calendar you own gets a pencil on its row, revealed on hover and always visible on touch.
  Before this the only way in was clicking the calendar's *name*, which nothing advertised.
- The editor it opens carries **Delete calendar** with a two-tap confirm that names the cost
  ("Delete and remove 7 events"), keeps at least one calendar, and is undoable with `Cmd/Ctrl+Z`.

## v2.6.4 — the Firebase SDK is self-hosted
- `build.js` now downloads `firebase-app.js`, `firebase-auth.js` and `firebase-firestore.js` into
  `vendor/` when a config is present, and the app imports them from its own origin. Nothing is fetched
  from `gstatic.com` at runtime, so ad blockers, Brave Shields, DNS filters and strict CSP can no longer
  break sign-in. If the download fails the build still succeeds and the app falls back to the CDN.
- A failed SDK load now says what it is: a blocked request, not a wrong password — and names the
  blocker as the likely cause, with the app still usable without sync.

## v2.6.3 — the origin Google wants, printed in the panel
- The setup steps now show the **live** origin of the page you are on, ready to copy into Authorised
  JavaScript origins — not a hardcoded example.
- Opened from disk, the panel says plainly that a `file://` page cannot be authorised at all and points
  at `npm run dev` / the deployed URL.

## v2.6.2 — catch a bad Client ID before Google does
- The Client ID is validated on the page: wrong shape or a stray space now says so instead of opening a
  window that lands on "Access blocked: no registered origin / 401 invalid_client".
- `invalid_client` gets its own sentence naming the usual cause — a client that is not type
  **Web application**.
- The setup steps now say plainly: choose Web application, add the origin only (no redirect URI), and
  no client secret is involved.

## v2.6.1 — say why auth failed
- `auth/unauthorized-domain`, `auth/configuration-not-found`, `auth/api-key-not-valid`,
  `auth/app-not-authorized` and `auth/internal-error` now read as sentences that name the fix.
- The account block shows the exact origin to register, with a Copy button.
- Google sign-in names the origin when the Client ID does not recognise the site
  (`origin_mismatch`, `idpiframe_initialization_failed`, `invalid_client`, `access_denied`).

## v2.6.0 — no demo data
- A new install starts empty: no invented meetings, no sample tasks, no fake history. One list,
  "My tasks", and the four default calendars — nothing else.
- The empty states do the teaching instead: the momentum card says nothing is checked off yet, the
  agenda says thirty quiet days, the task list says type above and press Enter.

## v2.5.0 — Firebase sync, config from env vars
- Cloud sync is back, this time configured by environment variables: `build.js` turns `FIREBASE_*` into
  `config.js`, and with none set it writes `null` so the app stays local-only.
- Email + password sign-in through Firebase Auth (no Google button), Firestore state at
  `users/{uid}/state/main`, live `onSnapshot`, debounced whole-state writes, the upload/start-empty
  question on first sign-in.
- `npm run build` wired into `netlify.toml`; `.env.example` lists the seven names; the service worker
  never caches `config.js` and is bumped to `playday-v3`.
- Local device-only accounts removed — one account system, not two.

## v2.4.0 — deploy ready
- `netlify.toml`: publish root, no build, three pretty routes, CSP + security headers, `no-cache` on
  HTML and the service worker, styled 404.
- `404.html` forwards `/tasks` and `/calendar` to `app.html?mode=…` on hosts that cannot rewrite
  (GitHub Pages), so those URLs still work there.
- Router is subpath-safe: it rebuilds the URL from the current directory, so a project-page deploy
  keeps working.
- `robots.txt`; service worker bumped to `playday-v2` and now caches `404.html`.
- The dev server mirrors the host: unknown paths get the styled 404 instead of a bare string.

## v2.3.0 — quick add, repeating events, local accounts
- **Quick add**: type "chai fri 5pm" or "standup every weekday 9:30" into search; the first result row
  is a create button, Enter commits. Parses weekday names, `24 nov`, `24/11`, ISO dates, `5pm` /
  `17:30` / `9.15am`, and every day/weekday/week/month.
- **Repeating events**: a Repeats row in the editor (daily, weekdays, weekly, monthly, optional until).
  Occurrences are generated per visible range rather than stored.
- **Accounts are local**: email + password with PBKDF2-SHA-256 (150k, per-account salt), one data slot
  per profile, a lock screen when accounts exist and nobody is signed in, and a two-tap device reset.
- Removed the Drive/Google sign-in sync entirely — it needed Google auth, which this build no longer has.

## v2.2.0 — sync over Drive, no Firebase
- Removed Firebase entirely: no config paste, no second project, no Firestore rules, no email/password
  store. One sign-in button in its place.
- Sync now rides the Google OAuth client the Calendar section already uses, with `drive.appdata`: one
  private `playday.json` in your own Drive app folder. Full state, same merge rules, same "upload or
  start empty" question.
- Writes 1.5s after you stop, pulls on tab focus and on **Sync now**.

## v2.1.0 — email and password
- Sign in with an email and password as well as Google: **Sign in**, **Create account**, **Forgot
  password?** in the same block, under an "or with an email" rule.
- Firebase's error codes are translated — `auth/invalid-credential` reads "Email or password is
  wrong.", `auth/weak-password` says passwords need six characters, `auth/operation-not-allowed` says
  the provider is off in your project.
- Empty-field checks happen before the network; Enter submits from either field; the password field
  clears on success.

## v2.0.0 — optional accounts (Firebase)
- **Sync across devices**, off by default. Paste a Firebase config in Settings, sign in with Google,
  and your events, tasks, lists and calendars live in Firestore under `users/{uid}/state/main`.
- `localStorage` stays the source of truth: the app is identical with no account, no config, and no
  network. Firebase is loaded lazily, only after a config is saved and a sign-in is attempted.
- First sign-in on a device with data asks: **upload what's here** or **start with an empty account**.
  Signing into an account that already has data merges by id (local wins on collisions, remote-only
  items are added) and then live `onSnapshot` keeps both sides equal — including deletions.
- Writes are debounced 1.4s, tagged with a per-session client id so a device ignores its own echo.
- Ships the Firestore rules to paste, inline in the panel.

## v1.9.0 — Modern and Work
- **Modern**: cool graphite ground, one electric violet accent, 14px radii, hairline + one soft
  shadow. The contemporary-product read, without the playfulness of the default skins.
- **Work**: office blue on a blue-grey ground, 8px radii, flat panels, tabular numerals. Built to be
  scanned at 9am rather than enjoyed.
- Both have dark variants; both drop the gold momentum card, the dark search well and the extruded
  page title.
- Seven skins total.

## v1.8.0 — routes and a front door
- `/` is now a **front page** — the pitch, four feature cards, the honest bits, and two big doors —
  not the app. `app.html` is the app.
- `/tasks`, `/calendar` and `/cal` open the app in that mode; switching mode rewrites the URL, so a
  link you copy always points where you were.
- `server.js` rewrites the routes; `_redirects` does the same on Netlify; `?mode=tasks` works anywhere.
- Manifest `start_url` is `./tasks`, with shortcuts for Tasks and Calendar.
- The service worker caches the front page and the hero image too, so `/tasks` boots offline.

## v1.7.0 — undo, shapes, and tasks as objects
- **Undo.** `Cmd/Ctrl+Z` plus an Undo action on the toast, covering event, task, list and calendar
  deletions and "Clear done". A 24-entry stack of closures, so each undo restores exactly what went.
- **Shape cue.** Every calendar now carries a texture beside its colour — solid, stripe, dots, hatch —
  on chips, timed blocks and the legend swatch. Colour alone fails for ~8% of men; the legend teaches
  the mapping in one glance.
- **Tasks are objects.** Rows are cards with a hairline and a soft lift, the check is a 26px well that
  squashes on press and fills green when done, a due date is a torn-off tab (notched corner), and the
  add row is the empty slot in the stack.

## v1.6.0 — Minimal
- A fifth skin, **Minimal**, that is a different set of manners rather than a repaint: flat fills, no
  gradients anywhere, hairline rules instead of shadows, 10px radii, system type, ink accents.
- Chips become a 9% tint with a 6px colour dot; the momentum card loses its gold; the today pill is a
  solid ink square; the brand mark goes greyscale; confetti and the pointer tilt are off.
- Works in light (`#F6F6F4`) and dark (`#0D0D0F`).
- Fixed while building it: the all-day task band could push the week grid wider than its columns, and
  the month chips needed `min-width:0` to truncate.

## v1.5.0 — skins and the day
- Four skins in Settings — Indigo, Sunset, Midnight, Karat — that repaint the ground and the accent
  while the paper stays paper, in light and dark. `--on-primary` / `--on-coral` keep text readable on
  each skin's fills.
- The day, draining: a progress bar and "7:51pm · 17% of today left" at the foot of the mini calendar,
  so the app is about savouring the day, not just scheduling it.
- The momentum card leans towards the pointer (perspective tilt, transform only, off for touch and
  reduced motion).
- Skins are applied in `<head>` before first paint, alongside the theme.

## v1.4.0 — motion
- Sheets animate both ways: 170ms exit (fade + lift) instead of vanishing, with a guard so a reopen
  mid-exit can't get stuck.
- Finishing a task has a choreography: the check circle pops, the title sweeps a strikethrough across
  itself, then the row slides away — and only then does the list re-flow and the confetti fire.
- A newly created event flashes its chip and scrolls itself into view, so you can see where it landed.
- XP counts up over 320ms instead of jumping; the momentum card pulses once on a level-up.
- Dragging a chip lifts and tilts it.
- All of it collapses under `prefers-reduced-motion`.

## v1.3.0 — sound design
- Replaced the four-beep synth with a small instrument: pluck + filtered-noise voices through a
  compressor and a generated plate reverb.
- Seven sounds: complete (randomised marimba chord + sub + air), level (six-note run + shimmer),
  add, remove, tick, whoosh, error.
- Whoosh on every sheet open/close, error blip on validation failures.
- Volume slider (0–100, default 70) in Settings, driving the master gain live; muted creates no nodes.

## v1.2.0 — Google Tasks sync
- Tasks API added to the OAuth scope; task lists sync both ways alongside calendars.
- First sync adopts a same-named local list instead of duplicating it, then pushes its existing tasks.
- Create / edit / complete / delete push immediately when a token is live, else queue for the next pass.
- New lists while connected create a Google task list; list renames push both ways.
- Sync panel grew `CALENDARS` and `TASK LISTS` groups with per-list toggles.

## v1.1.0 — PWA
- `manifest.webmanifest`, four icons (192 / 384 / 512 + maskable), `sw.js` service worker.
- Cache-first shell, background refresh, versioned cache (`playday-v1`). Google is never cached.
- Install row in Settings (appears only on `beforeinstallprompt`), "New version ready · Reload" pill.
- iOS meta tags and a 180px apple-touch-icon.

## v1.0.0 — the Not Boring pass
- Removed every 2px ink outline and hard offset shadow; depth is now one lighting system
  (inner top edge + contact shadow + ambient shadow, gradient fills).
- Display face swapped Archivo Black → Fredoka; ground became a lit radial indigo.
- Streak removed. Momentum is level + XP + "N done today", nothing to break.

## v0.9.0 — settings and dark mode
- Settings panel: theme (Device / Light / Dark), week start, visible hours, opens-in, tasks on the
  calendar, sound, Google status, JSON backup / restore, `.ics` export, reset, keyboard list.
- Dark mode as a token swap (`[data-theme="dark"]`), not a second stylesheet; applied in `<head>`.
- Sound moved out of the top bar into Settings. Settings gear in the top bar only.

## v0.8.0 — editable calendars
- Calendars are user data (`state.calendars`), not a constant.
- Click a name to rename / recolour / delete; click the colour box to toggle visibility.
- `+ Add calendar`; two-tap delete that names how many events go with it.

## v0.7.0 — tasks on the calendar
- Open, dated tasks render as outlined chips on their due date (month), in a `TASKS` band
  (week / day), and first in each day (agenda). A day with tasks always keeps one row for them.
- `Tasks on calendar` toggle at the bottom of the calendar list.

## v0.6.0 — Google Calendar
- `.ics` import (RRULE / EXDATE / TZID / all-day / cancelled) and export, via `ics.js` + tests.
- Two-way Calendar API sync: OAuth via Google Identity Services (Client ID only, no secret),
  incremental `syncToken`, pull + `PATCH` / `POST` / `DELETE` push, queued retries.
- Auto-sync: on load, every 1/5/15/30 min, on tab focus, on reconnect; one silent token refresh then
  a tap-to-reconnect state instead of popup spam.

## v0.5.0 — tasks
- Second mode (Calendar / Tasks, `L`): lists, one-line capture, round checkboxes with confetti,
  stars, due dates, notes, drag to reorder, collapsible Completed, clear done, rename / delete lists.
- List / Dates views; Dates groups everything across lists by Overdue / Today / Tomorrow / Next 7
  days / Later / No date.

## v0.1.0 — the calendar
- Month / week / day / agenda, events with calendar colours, drag between days, click-a-slot to
  create, search, keyboard shortcuts, XP + confetti, everything in `localStorage`.
