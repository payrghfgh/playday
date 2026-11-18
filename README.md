# Playday

A calendar with the shape of Google Calendar and the mood of a toy — plus a task list with the shape
of Google Tasks. Month, week, day and agenda views, events you can drag between days, lists you can
fill in one line at a time, and an XP loop that fires confetti when you actually finish something.

No frameworks, no build step, no dependencies. Five files, one localStorage key, one service worker.
It installs as an app and syncs with Google Calendar two ways — see below.

## Routes

| URL | What you get |
| --- | --- |
| `/` | the front page — what it is, what it does, doors into both halves |
| `/tasks` | the app, opened in Tasks |
| `/calendar`, `/cal` | the app, opened in Calendar |
| `/app.html` | the app, in whatever mode you last used |
| `?mode=tasks` | works on any static host, no rewrites needed |

Switching mode inside the app rewrites the URL (`/tasks` ⇄ `/calendar`), so the address bar always
matches what you're looking at and a copied link lands in the right place. The installed app's
`start_url` is `./tasks`, with Tasks and Calendar as launcher shortcuts.

`npm run dev` handles the routes itself. On Netlify, `_redirects` does the same. On a host with no
rewrites (plain GitHub Pages), `/tasks` will 404 — use `?mode=tasks` there, or put it behind Netlify.

## Deploy

The site is plain static files — no build, no environment variables, nothing to compile.

**Netlify** (what `netlify.toml` is written for):

```bash
npx netlify-cli deploy --prod --dir .
```

or drag the folder onto app.netlify.com. `netlify.toml` sets `publish = "."`, no build command, the
three pretty routes, a security header set (CSP, nosniff, referrer policy, frame options), `no-cache`
on HTML and `sw.js`, and a styled 404.

**Vercel** — `vercel deploy --prod`; add the same routes in `vercel.json` (`/tasks` → `/app.html`,
`/calendar` → `/app.html`, `/cal` → `/app.html`) if you want pretty URLs.

**GitHub Pages** — works as-is from the repo root, but Pages can't rewrite, so `/tasks` lands on
`404.html`, which reads the path and forwards to `app.html?mode=tasks`. Pretty URLs need Netlify or
Vercel; `?mode=` works everywhere.

**Anything else** (S3, Caddy, nginx, `python -m http.server`) — serve the folder and map the three
routes to `app.html` if you want them pretty.

Before you ship a change: bump `VERSION` in `sw.js` (`playday-v2` → `-v3`) so returning visitors get
the new build instead of the cached one. Nothing else needs touching — there are no secrets in the
repo, no `.env`, and the only network calls are to Google, made with a token the user supplies.

## Run it

```bash
npm run dev
# → http://localhost:5173
```

No `npm install` needed — there are no dependencies. `npm run dev` starts a 60-line static server
(`server.js`) on port 5173; `PORT=4000 npm run dev` if that one is taken.

You can also just open `index.html` directly. The only thing that needs a real origin is Google's
OAuth flow — everything else, including the `.ics` import, works from `file://`.

It works straight from `file://` — the two fonts are embedded in `styles.css` as base64, so there
is no network request at all after the page loads.

## What's in it

- **Two modes** — Calendar and Tasks, switched from the top bar (`L`). They share the design and the
  XP counter. Tasks with a due date also show up **on the calendar** (see below), and the toggle for
  that lives at the bottom of the calendar list.
- **Four calendar views** — Month (6×7 grid, Monday start), Week (7 columns, 6 AM–11 PM), Day (one wide
  column), Agenda (next 30 days, grouped by day).
- **Events** — create, edit, delete, per-calendar colour, location, notes, and a "done" flag.
- **Drag to reschedule** — drag any event chip onto another day in month view.
- **Click to create** — click a day cell, or an empty hour slot in week/day view, and the editor
  opens pre-filled with that date and time.
- **Search** — the field in the header matches titles, places and notes.
- **Calendars** — Work / Deep work / Life / Fun to start with, and you can add your own: name, colour,
  delete. Each one toggles on and off; hiding one filters every view.
- **Sound** — seven synthesised sounds (no audio files): a marimba chord with a sub and a puff of air
  when you finish something, a six-note run when you level up, a rising two-note "clack" on add, a
  falling one on delete, a woodblock tick on navigation, a filtered noise whoosh on every sheet, and
  a quiet double blip on errors. Volume slider in Settings.
- **Momentum** — finishing an event banks XP. Levels, a progress bar and a confetti burst come with
  it. Sound is synthesised with the Web Audio API (no audio files) and can
  be switched off in Settings.
- **Tasks on the calendar** — open, dated tasks render on their due date as outlined chips: inside
  month cells (a day with tasks always keeps one row for them), in a `TASKS` band under the header in
  week and day view, and as the first rows of each day in Agenda. Clicking a chip completes the task
  with the usual confetti and XP; in Agenda the row opens it in Tasks mode instead, and the round
  button completes it.
- **Tasks** — lists, one-line capture, a round checkbox with confetti, stars, due dates, notes,
  drag to reorder, a collapsible Completed section, clear-completed, rename/delete lists.
- **Google Tasks** — your task lists sync too: lists, titles, notes, due dates and the done state, both
  ways, on the same OAuth connection and the same auto-sync.
- **Google Calendar** — live two-way sync through the Calendar API, plus a zero-setup `.ics` import
  and export. Details in the next section.
- **Everything persists** — events, hidden calendars, sound preference, sync settings and the last
  view all live in `localStorage` under the key `playday.v1`.

The app ships with 37 demo events around today's date so the views aren't empty on first open. They
are seed data, not a sync — clear site data for this page to start blank.

## Install it (PWA)

Playday is a real PWA: install it and it opens in its own window, offline, with the icon on your
dock or home screen.

- **Chrome / Edge** — the install icon in the address bar, or **Settings → Install Playday** (that
  row only appears when the browser offers it).
- **Safari on iPhone / iPad** — Share → **Add to Home Screen**.
- **Android Chrome** — the "Add to Home screen" prompt, or the same Settings row.

What's cached is the shell only — `index.html`, `styles.css`, `app.js`, `ics.js`, the manifest and the
icons — so the app boots with no network at all. Anything on `googleapis.com` or
`accounts.google.com` is deliberately **never** cached: a stale calendar is worse than a spinner.
Your events and tasks were already local, so offline is genuinely offline.

Updates: when a new service worker lands you get a **New version ready · Reload** pill instead of a
silently stale app. The cache is versioned (`playday-v1`), so old copies are dropped on activation.

## Quick add

Type into search and the first row becomes a create button. Enter makes it.

```
chai with ananya fri 5pm        →  Fri 20 Nov, 5:00–6:00pm
standup every weekday 9:30      →  weekdays, 9:30–10:30, repeating
dentist 24 nov 4pm              →  24 Nov, 4pm
rent on 1 dec 10am              →  1 Dec, 10am
gym tomorrow 7am                →  tomorrow, 7am
```

It understands `today`, `tomorrow`, `next week`, weekday names, `24 nov` / `nov 24` / `24/11` /
`2026-11-24`, times as `5pm` `5:30 pm` `17:30` `9.15am`, and `every day` / `every weekday` / `every
week` / `every month`. No date or time in the text and it refuses rather than guessing. An hour is the
default length.

## Repeating events

The event editor has a **Repeats** row — just once, every day, every weekday, every week, every month,
with an optional **Until**. Occurrences are generated for the visible range, so the month grid, week,
day and agenda all show them without storing hundreds of copies. Opening any occurrence opens the
series and says so; changes and deletes apply to the whole series.

## Sync across devices (optional, Firebase)

Playday needs no account. With a Firebase project wired in, an email and password carry your events and
tasks between every device you sign in on.

**The config comes from environment variables**, so nothing is hardcoded:

| Env var | Firebase key |
| --- | --- |
| `FIREBASE_API_KEY` | `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `FIREBASE_PROJECT_ID` | `projectId` |
| `FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `FIREBASE_APP_ID` | `appId` |
| `FIREBASE_MEASUREMENT_ID` | `measurementId` (optional) |

`npm run build` runs `build.js`, which writes `config.js` with `window.__FIREBASE_CONFIG`. With no
`FIREBASE_*` vars set it writes `null` and the app stays local-only — that's the file committed in the
repo, so a plain clone works with no build.

Those values are **public by design** — every Firebase web app ships them to the browser. What protects
your data is the Firestore rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Setup: create a project, add a **Web app**, enable **Authentication → Email/Password**, create a
**Firestore** database, paste the rules, then set the env vars (Netlify: Site settings → Environment
variables) and deploy. `netlify.toml` already runs `npm run build`.

What syncs is **everything**: events, tasks, lists, calendars, `.ics` feeds, hidden-calendar choices and
all settings. One document at `users/{uid}/state/main`. Writes go up 1.5s after you stop editing,
tagged with a per-session id so a device ignores its own echo; changes from another device arrive live.
The first sign-in on a device with data asks **upload what's here** or **start with an empty account**.

Limits: one document means a ~1MB ceiling (roughly 5,000 events); whole-document writes mean two
devices editing in the same second is last-write-wins; and `config.js` is deliberately never cached by
the service worker.

## Tasks

Tasks is a second mode, not a panel inside the calendar. Switch with the Calendar/Tasks control in the
top bar or press `L`.

- **Two views** in the pane header: **List** (one list at a time, drag to reorder) and **Dates**
  (everything across every list, grouped as Overdue / Today / Tomorrow / Next 7 days / Later /
  No date, with the list name on each row). Clicking a list in the sidebar drops you back into List.
- **Lists** live in the sidebar. `+ New list` adds one; click a list name in the pane header to rename
  it; `Delete list` asks for a second tap before it goes.
- **Adding**: type in the add row and press `Enter` — the field clears and keeps focus so you can
  keep going. The new task lands at the top.
- **A task** has a title, optional notes, an optional due date, a star, and a round checkbox.
  Clicking the title opens the notes and date inline; they save as you type.
- **Finishing** a task fires the same confetti, pop and +12 XP as finishing an event, and the task
  drops into `Completed` at the bottom of the list.
- **Due dates** read as `Today`, `Tomorrow`, `Fri`, `26 Nov` — and `Yesterday` in red once they are
  late.
- **Reordering**: drag a task onto another to drop it above that row.
- **On the calendar**: `Tasks on calendar` at the bottom of the calendar list turns them off
  everywhere at once. Only open tasks with a due date appear — an undated task is a note, not a
  commitment, and a finished one doesn't need screen space.
- Tasks live in the same `localStorage` record as everything else (`tasks`, `lists` keys), so they
  are local to the browser. There is **no Google Tasks sync** — Google's Tasks API is a separate
  service from the Calendar API and this build only syncs calendars. Say the word and it can be added.

## Sync with Google Calendar

Two independent paths. You can use either, or both.

### 1. Import / export `.ics` — no setup, works offline

- **In:** in Google Calendar go to **Settings → Import & export → Export**, unzip it, then drag the
  `.ics` files onto the drop zone in Playday's sync panel (sidebar → **Sync from Google**). Each file
  becomes a calendar with its own colour, its own toggle in the calendar list, and read-only events.
  Dropping the same file again *refreshes* it — edits and deletions in Google come through, because
  the feed is replaced wholesale on each import.
- **Out:** **Download playday.ics** turns everything in Playday into one file you can import back
  into Google Calendar.

Google exports recurrence as `RRULE`, so the importer expands weekly/monthly/yearly rules, drops
cancelled events, honours `EXDATE`, converts `TZID` and UTC times into your local wall clock, and
spreads multi-day all-day events across their days.

### 2. Live two-way sync through the Google APIs

Playday reads your Google events on every sync and pushes back what you add, edit or delete here.
It runs entirely in the browser — no server, no build, nothing to deploy — so it needs an OAuth
Client ID from your own Google Cloud project:

1. [Create a project](https://console.cloud.google.com/projectcreate) and enable the **Google
   Calendar API**.
2. **OAuth consent screen** → External → add your own address as a **test user**.
3. **Credentials → Create credentials → OAuth client ID → Web application**. Add the page's origin
   (e.g. `http://localhost:8080`) to **Authorised JavaScript origins** *and* **Authorised redirect
   URIs**.
4. Paste the Client ID into Playday's sync panel and press **Connect & sync**.

**It syncs on its own.** Once connected, Playday pulls from Google without you pressing anything:
about a second after the page loads, every 5 minutes after that (1, 5, 15 or 30 — your pick in the
panel), and the moment you come back to the tab or the network returns. Local edits still push
immediately when a token is live; anything that could not push is queued and goes out on the next
pass. The sidebar card reads `Auto · 42 events · just now` so you can see it working.

One honest limit, and it is Google's, not the app's: an access token lasts an hour and this build
holds no refresh token (that would need a server). So after an hour the silent refresh is tried
**once**; if the browser blocks it — which it will without a user gesture in some setups — the card
flips to `Reconnect to keep syncing` and auto-sync pauses rather than looping popups at you. One tap
on **Sync now** resumes it for another hour. Everything else about the sync is unchanged.

What happens on sync: it lists your calendars, pulls the selected ones with Google's incremental
`syncToken` (falling back to a full re-pull when Google expires the token), stores each Google event
with its `id`, and pushes local edits as `PATCH` / new events as `POST` / deletions as `DELETE`.
Edits you make while offline stay flagged and are pushed on the next sync.

Things worth knowing:

- **Serve the page over http, not `file://`.** Google will only authorise a real origin:
  `npm run dev` then open `http://localhost:5173`, and register that origin in the OAuth client. The
  `.ics` path works from `file://` regardless.
- The **Client ID** is saved in `localStorage`; the **access token** is kept in memory only and
  expires after an hour. Auto-sync rides that token; when it lapses, one silent refresh is attempted
  and then it waits for a tap.
- While the consent screen is in **Testing**, Google expires sessions after 7 days and only listed
  test users can connect. Publish the app if you want it permanent.
- Which calendars sync is a checkbox list in the panel. Unticking one drops its events from Playday
  without touching Google.
- Scope requested: `calendar.events`, `calendar.readonly`, `tasks`.
- **Tasks** sync through the Google Tasks API. On the first sync a local list with the same name as a
  Google task list adopts it rather than duplicating it, and any tasks already in it get pushed up.
  New lists created while connected become Google task lists. Renames go both ways; a list rename you
  make here is pushed as a `PATCH` on the next sync. The Tasks API has no incremental token, so each
  pass re-reads the lists in full — cheap at personal scale, and it's how deletions are detected.
  Untick a task list in the sync panel to stop syncing it; its tasks stay local.

## Calendars

The calendar list in the sidebar is editable. Click a calendar's **name** to rename it, recolour it,
or delete it; click its **colour box** to show or hide it. **+ Add calendar** at the bottom of the
list makes a new one — it gets its own colour, its own toggle, and appears immediately in the event
editor's swatches and on every chip.

Deleting a calendar asks twice and tells you how many events go with it ("Delete and remove 3
events"); renaming or recolouring never touches a single event. Calendars that come from Google or an
`.ics` import are listed but not editable here — they belong to Google, and their name button is
disabled with a tooltip saying so.

## Settings

**Settings** is the gear in the top bar. It opens one panel for everything:

- **Skin** — Indigo, Sunset, Midnight, Karat, **Modern**, **Work** or **Minimal**. The first four repaint the room and the
  accent; the paper stays paper. Minimal is different in kind: flat fills, no gradients, hairline
  rules instead of shadows, tighter radii, system type, ink accents, no confetti and no card tilt.
  Every skin works in both light and dark.
- **Theme** — Device, Light or Dark. Device follows `prefers-color-scheme` and updates live when the
  system flips; Light and Dark pin it. The choice is applied before first paint, so there is no white
  flash on load.
- **Week starts on** — Monday or Sunday. Rotates the month header, the mini calendar and every week
  grid.
- **Day runs from** — the visible hour range in week and day view (6 AM – 11 PM by default).
- **Opens in** — Day, Week, Month or Agenda.
- **Show tasks on the calendar**, **Sound effects** and **Volume** — the only controls for those
  things; there is no second mute button in the header, on purpose.
- **Google Calendar** — a shortcut to the sync panel, with the current status.
- **Your data** — back up everything to JSON, restore a backup, download `.ics`, or reset (asks for a
  second tap).
- **Keyboard** — the shortcut list lives here now, so the sidebar stays short.

Everything is stored in the same `localStorage` record, so a backup really is a backup.

## Motion

Four moments, and nothing else moves without a reason:

- **Opening and closing a sheet** — 300ms in (fade + 10px lift), 170ms out. Closing animates rather
  than vanishing, and a reopen mid-exit cancels the pending hide instead of stranding the sheet.
- **Finishing a task** — the circle pops, the title sweeps a strikethrough across itself, the row
  slides away, and only then does the list re-flow, the XP count up and the confetti fire.
- **Creating an event** — the new chip flashes a ring and scrolls itself into view, so you can see
  where it landed.
- **Levelling up** — the momentum card breathes once; XP counts up over 320ms instead of jumping.

Everything is `transform` and `opacity` only, everything sits under 320ms, and
`prefers-reduced-motion` collapses the lot.

## Sound

Everything is generated with the Web Audio API at runtime — there is not one audio file in the repo.

| Moment | Sound |
| --- | --- |
| Finish an event or task | marimba chord (root randomised from a pentatonic), a fifth above, a sub, a puff of air |
| Level up | six-note pentatonic run, shimmer on top, sub underneath |
| Add / save | rising two-note clack with a click transient |
| Delete / un-complete | falling two notes with a soft thud |
| Navigate, toggle a view | woodblock tick |
| Open or close any sheet | bandpass noise whoosh |
| Validation error | two quiet low blips |

They all share one signal chain — master gain → compressor → destination, with a generated plate
reverb (0.85s noise impulse) on a 0.3 send — so they sound like they belong together rather than like
seven beeps. Each completion is slightly different: the root note and a few cents of detune are
randomised, so it doesn't wear out. There's a 55ms rate limit per sound so a burst of ticks can't
machine-gun, and the volume slider drives the master gain live.

## Skins

Four of them, in Settings. A skin is a handful of tokens — the ground gradient, the primary accent,
the coral, the muted text on the ground — so it changes the whole mood without touching a component.
Text on a skin's fills is handled by `--on-primary` and `--on-coral`, which flip to dark ink on the
light accents (Sunset's pink, Midnight's sky, Karat's gold) so nothing ends up white on pale.

Karat is the one that also warms the momentum card to gold; everything else keeps the butter.

**Modern** is the contemporary-product read: cool graphite ground, one electric violet accent, 14px
radii, hairlines plus a single soft shadow, and no extruded type. **Work** is the office one: blue on
a blue-grey ground, 8px radii, flat panels, tabular numerals — built to be scanned, not admired. Both
have dark variants.

**Minimal** is the odd one out on purpose. It drops the whole lighting system — `--edge`,
`--shadow-object`, `--paper-grad`, `--raised` all become flat values or `none` — swaps the display
face for `system-ui`, sets radii to 10px, turns chips into a 9% tint with a colour dot, makes the
today pill a solid ink square, greys the brand mark, and switches confetti and the pointer tilt off.
It is still Playday underneath: same layout, same data, same shortcuts.

## The day

The mini calendar ends with the day draining: a bar and `7:51pm · 17% of today left`. It's there
because the point of this app is to savour the day, not just fill it — and because time-blindness is
the actual problem a calendar is meant to solve.

## Dark mode

Both themes are the same design with a different light: the paper surfaces become deep indigo, ink
becomes cream, and the tinted hovers and dividers are built with `color-mix` against `--ink`, so they
flip automatically instead of being hand-listed twice. Chips keep their saturated fills in both
themes — colour is the thing that carries through, the paper is what changes.

## Undo

`Cmd/Ctrl+Z`, or the **Undo** button that appears on the toast. Deleting an event, a task, a list or a
calendar, and clearing completed tasks, all push a restore closure onto a 24-deep stack, so undo puts
back exactly what left — including a calendar's events or a list's tasks. Deletes that touch Google
are pushed through to Google first and are not offered as undoable, since undoing would resurrect a
record the other side already dropped.

## Colour, and a second cue

Every calendar has a colour **and** a texture: solid, stripe, dots or hatch. Chips, timed blocks and
the legend swatch all carry it, so the grid is readable when the hues are not — roughly 8% of men
cannot separate the blue from the violet, and that pair is the most common one to collide. New
calendars pick the next texture automatically; Google and `.ics` calendars get a stable one derived
from their id.

## Keyboard

| Key | Does |
| --- | --- |
| `C` | new event on the current date |
| `T` | jump to today |
| `←` `→` | previous / next period |
| `D` `W` `M` `A` | day / week / month / agenda |
| `L` | switch between Calendar and Tasks |
| `C` | new task (in Tasks mode) / new event (in Calendar mode) |
| `/` | focus search |
| `Esc` | close the editor, search results or the mobile drawer |

## Making it yours

| Want to change | Where |
| --- | --- |
| App name, icon, theme colour | `manifest.webmanifest` and `icons/` |
| What the service worker caches | `SHELL` in `sw.js` (bump `VERSION` to force a refresh) |
| --- | --- |
| Calendar names and colours | `BASE_CALENDARS` at the top of `app.js` |
| Starting task lists and demo tasks | `seedLists()` / `seedTasks()` in `app.js` |
| The demo events | `seed()` in `app.js` — or delete the function body and start empty |
| Colours, type, corner radii, shadows | the token block at the top of `styles.css` (`:root`) |
| First day of the week | `startOfWeek()` in `app.js` (currently Monday) |
| Visible hours in week/day view | `HOUR_START` / `HOUR_END` in `app.js` |

## Deploying it

It's a static folder, so anything that serves files will do:

- **Netlify** — drag the folder onto https://app.netlify.com/drop, or point a site at the repo with
  build command *(none)* and publish directory `/`.
- **GitHub Pages** — push the repo, then Settings → Pages → deploy from the root of your branch.
- **Vercel** — `vercel` in this folder, framework preset "Other".

There is no server, no database and **no environment variables** — nothing to configure, and no
`.env.example` because there is nothing it could hold.

## Tests

The `.ics` reader/writer is a standalone module (`ics.js`) with a real test suite — no browser
needed:

```bash
node --test tests/
```

Seven cases: TZID and UTC conversion, all-day spans, weekly `RRULE` with `COUNT`/`BYDAY`/`EXDATE`,
cancelled events, line folding, escaped text, a `build()` → `parse()` round trip, and junk input.

## Notes on the build

- Accessibility: real `<button>`/`<form>` elements, labels on every field, `aria-pressed` on
  toggles, a visible focus ring, `prefers-reduced-motion` respected, and text sizes that don't drop
  below 11px.
- Responsive: 1440px down to 390px. Below 900px the sidebar becomes a drawer (hamburger in the
  header) and month cells switch to colour bars instead of clipped titles.
- No console errors and no external requests — except the two Google endpoints the sync feature
  itself needs (`accounts.google.com/gsi/client` and `www.googleapis.com/calendar/v3`), and only
  once you press sync.
- Verified in a headless browser: import, export round trip, read-only imported events, calendar
  toggles, and the sync pull/push paths against a mocked Calendar API. The live OAuth handshake
  itself was **not** exercised here — that needs a real Google account and Client ID.

## Licence

MIT for the code. The two fonts are under the SIL Open Font License and are embedded:
[Gabarito](https://fonts.google.com/specimen/Gabarito) and
[Archivo Black](https://fonts.google.com/specimen/Archivo+Black).
