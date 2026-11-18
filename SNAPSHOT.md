# Snapshot — v2.5.0 (Firebase sync from env vars)

Where the project stands right now. If you come back in a month, read this first.

**What it is:** Playday — a calendar and task list with the shape of Google Calendar / Google Tasks
and the mood of a (Not Boring) app. Local-first, no backend, no accounts.

**Stack:** plain HTML, CSS, vanilla JS. No framework, no bundler, no dependencies. `npm run dev` runs
a 70-line static server (`server.js`) on port 5173 — `npm install` is not needed.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | the front page: pitch, feature cards, links into the app |
| `app.html` | the whole shell: top bar, sidebar, four sheets (event, calendar, sync, settings), toasts |
| `_redirects` | the same routes for static hosts (Netlify) |
| `styles.css` | tokens, light + dark theme, every component |
| `app.js` | state, rendering, events, tasks, settings, calendar editing, Google sync, PWA glue |
| `ics.js` | iCalendar reader/writer, standalone and unit-tested |
| `sw.js` | service worker: shell cache, background refresh, `SKIP_WAITING` |
| `manifest.webmanifest` + `icons/` | install metadata |
| `server.js`, `package.json`, `build.js` | `npm run dev`, `npm run build`, `npm test` |
| `config.js`, `.env.example` | generated Firebase config + the env var names |
| `netlify.toml`, `_redirects`, `404.html` | deploy config: routes, headers, fallback |
| `tests/ics.test.js` | 7 tests, run with `npm test` |
| `README.md` / `DESIGN.md` | how to use it / how it is built |

## Working, and verified in a headless browser

Calendar (month, week, day, agenda) · events CRUD + drag between days · search (events + tasks) ·
tasks with lists, stars, notes, due dates, drag order, completed section, List and Dates views ·
tasks on the calendar with a toggle · XP, levels, confetti · seven synthesised sounds with a volume
slider · motion: sheet exits, task-completion choreography, chip flash, XP count-up · seven skins · a day
progress bar · pointer tilt on the momentum card · Google Calendar: `.ics` in/out and
two-way API sync with auto-sync · editable calendars (create / rename / recolour / delete) ·
settings (theme, week start, hours, opens-in, sound) · light + dark themes · PWA install, offline
boot, update pill · responsive 375 → 1440 with no horizontal overflow · no console errors.

## Known limits (not bugs — the edges of local-first)

- **Storage is per-origin.** `file://`, `http://localhost:5173` and any other port are separate
  worlds. Pick one. The dev server is the only one that installs.
- **A LAN IP over plain http is not a secure context** — no service worker, no install. Needs https
  or a tunnel.
- **Two tabs fight.** Last write wins; there is no cross-tab locking.
- Clearing site data wipes everything; the JSON backup in Settings is the parachute.
- Google Tasks sync needs the `tasks` scope; if you connected before v1.2.0 you will be asked to
  re-consent once. The Tasks API has no incremental token, so every pass re-reads each list in full.
- Sync needs a Firebase project and the `FIREBASE_*` env vars at build time; with none set the app is
  local-only and says so.
- Google OAuth needs your own Client ID; in Testing mode the session expires after 7 days and the
  access token lasts an hour (one silent refresh, then one tap).
- iOS installs manually (Share → Add to Home Screen); Safari can evict storage after a week of no use.

## Data

One key: `localStorage["playday.v1"]` — `{ events, tasks, lists, calendars, feeds, hidden, settings,
google, view, mode, taskView, sound, showTasks }`. Google access tokens are never persisted.

## Next up, in the agreed order

1. **Undo** — `Cmd/Ctrl+Z` plus an undo action on the toast (shipped in v1.7.0; keep it working).
2. **Per-occurrence editing** — "this event / this and following / all" for repeats.
3. **Real cross-device sync** — needs storage somewhere; Firestore or Drive `appdata` both work, both
   were built and removed. Re-adding either is a self-contained change.
4. Then, if wanted: reminders via Notification API, drag-to-resize and
   drag-across-slots in week/day, all-day and multi-day events, move events between calendars,
   command palette.
