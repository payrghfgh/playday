# Playday — design system

One page of rules for the surface as it is built. If a change fights these, change the file first.

## The idea

A calendar you operate every day, drawn like a set of physical objects on a lit surface: soft paper
panels that catch light from above, jelly-bright event blocks, one warm butter card, and a loud
celebration when you finish something. Built like a game, runs like an app — no outlines, no flat
rectangles, no spreadsheet energy.

## The account block

Lives inside Settings, not in the chrome — an app with no account should not wear a "Sign in" button in
its header. A pill carries the state (`off` / `ready` / `on`), the setup steps are a `<details>` so the
block stays three lines tall until you want it, and the Firestore rules sit in a monospace well you can
copy. The one modal this feature owns is the merge question, which outranks every other sheet
(`z-index: 900`) because answering it decides what happens to your data.

## Skins

A skin is not a theme. The theme is the light (light/dark); the skin is the room and the accent.
`[data-skin="…"]` re-points `--ground-grad`, `--blue`, `--blue-deep`, `--coral`, `--magenta`,
`--muted-ground` and the two "ink on a fill" tokens, and nothing else — components never know which
skin is on. `--on-primary` and `--on-coral` exist because Karat's gold and Sunset's pink are light
enough that white text would fail contrast; they flip to dark ink per skin.

## Modern and Work

Two skins for people who want the app to look like work software rather than a toy, without going as
far as Minimal.

| | Modern | Work |
| --- | --- | --- |
| Ground | cool graphite `#F7F7FB → #E8E8F0` | blue-grey `#EAF0F7 → #E3EAF3` |
| Accent | violet `#5B5BD6` | office blue `#2563EB` |
| Radii | 14 / 11 / 8 | 8 / 6 / 4 |
| Depth | hairline + one soft shadow | hairline only |
| Type | as-is, no extrusion | as-is, tabular numerals |

Both keep the layout and the components untouched — they only re-point tokens — which is the test of
whether a skin system is worth having.

## Minimal

A skin is normally a repaint. Minimal is a different set of manners, and it is the only skin allowed
to change *structure* of the visual language:

| | The others | Minimal |
| --- | --- | --- |
| Depth | light edge + contact + ambient shadow | a 1px rule, `box-shadow:none` |
| Fills | gradients, top-lit | flat colour |
| Radii | 30 / 18 / 12 | 10 / 8 / 6 |
| Type | Gabarito + Fredoka | `system-ui` throughout |
| Accent | blue / pink / sky / gold | ink (`#111` light, `#F2F2F0` dark) |
| Chips | saturated slab | 9% tint + 6px colour dot |
| Momentum | gold card | hairline outline, ink bar |
| Celebration | confetti, tilt, glow | none |

The rule it follows: if a pixel is decoration, it goes. If it carries state — today, selected view,
calendar colour, progress — it stays, in ink or as a hairline.

## Theme

One design, two lights. `:root` holds the light tokens; `[data-theme="dark"]` re-points the same
names. Nothing is styled twice — components reference `--paper-grad`, `--raised`, `--sunken`,
`--head-grad`, `--band-grad`, `--weekend-tint`, `--danger-bg` and friends, and the dark block swaps
their values. Tinted hovers, dividers and rings are written as
`color-mix(in srgb, var(--ink) N%, transparent)` rather than fixed ink alphas, so they invert for
free. `Device` resolves through `matchMedia` and is written to `<html data-theme>` by an inline script
in `<head>`, before the stylesheet paints.

In dark mode: paper `#241E45 → #1C1739`, ink `#F4EFE4`, muted `#9E95C2`, and shadows deepen rather
than blur out. Chips, the momentum card and the coral today pill keep their light-theme colour — the
saturated fills are the constant, the paper is the variable.

## Colour

| Token | Value | Role |
| --- | --- | --- |
| `--ground` | `#1A1157` | the room. A radial gradient (`#3B2288 → #271768 → #170F4B`) so the page is lit, not flat |
| `--cream-text` / `--muted-ground` | `#F7F1E6` / `#BBAFEA` | text directly on the ground |
| `--surface` / `--surface-2` | `#FFFCF5` / `#F8F2E6` | paper panels |
| `--paper` / `--paper-deep` | `#F1E9D9` / `#E7DCC6` | tints inside paper, headers, wells |
| `--ink` | `#191436` | text, the "done" fill, the XP bar |
| `--ink-2` / `--ink-3` | `#3D3560` / `#635C80` | secondary and tertiary text on paper |
| `--blue` / `--blue-deep` | `#3B5BFF` / `#2A3FD6` | primary action, Work calendar |
| `--violet` | `#7B68FF` | Deep work calendar |
| `--mint` | `#2EE6A8` | Life calendar, done checks |
| `--butter` | `#FFC53D` | Fun calendar, the momentum card |
| `--coral` / `--magenta` | `#FF6B4A` / `#FF2E7A` | today, the now-line |

Rules: saturated colour fills whole objects, never hairlines. Every filled object gets the same
treatment — a gradient from a lightened top to the true colour, a white inset edge on top, and a soft
shadow tinted with that colour. Text on a colour is `#FFFFFF` or `--ink`, whichever clears 4.5:1; the
pairing is declared per calendar in `BASE_CALENDARS` (`color` + `text`) and reaches CSS as `--c`/`--ct`.

## Type

- **Display:** Fredoka 600 — round, heavy, a little toy-like. Month name, period title, day numbers,
  sheet titles, the Google badge. Tracking `-0.015em`. On the dark ground the period title carries a
  hard dark shadow two or three pixels down (`text-shadow: 0 3px 0 #0D0830`) so it reads as extruded
  rather than dropped on.
- **UI:** Gabarito (variable 400–900). Everything else. Body 15px, controls 13.5px, chips 11.5px,
  micro labels 11px uppercase at `0.13em`. Nothing functional goes below 11px.
- Both faces are embedded base64 in `styles.css` (OFL), so the file has no external requests.

## Depth

One light source, from above. No outlines anywhere — depth comes from a white inner edge, a tight
contact shadow, and a wide ambient one:

```
--edge:          inset 0 1px 0 #ffffffd9;
--shadow-object: 0 1px 2px #19143612, 0 10px 20px -12px #1914364d, 0 30px 60px -34px #1914368c;
--shadow-soft:   0 1px 2px #1914361a, 0 8px 16px -10px #19143640;
--shadow-press:  inset 0 2px 5px #1914362b;
--well:          inset 0 2px 6px #1914361f, inset 0 -1px 0 #ffffffb3;
```

Buttons lift 1.5px on hover and squash to `scale(.965)` on press. Inputs are *wells* (inset shadow),
objects are *raised* (outset). Filled things — chips, event blocks, swatches, the momentum card, the
today pill — use a vertical gradient plus a shadow tinted with their own colour, so each reads as a
lit solid rather than a flat rectangle. Paper surfaces use `--paper-grad`, never flat `#FFF`.

## Shape cue

Colour is never the only channel. Each calendar carries a texture token (`solid` / `stripe` / `dots` /
`hatch`) rendered as a `::after` overlay at 8-14% white on chips and timed blocks, and stronger on the
18px legend swatch where it has to be learnable. The rule: the pattern must be invisible at a glance
and unmistakable on a second look.

## Tasks as objects

Task rows are physical: a 16px-radius card with a hairline, a contact shadow and a wide ambient one,
lifting 1px on hover. The check is a 26px well — inset shadow, no fill — that squashes to .88 on press
and fills green when done. A due date is a torn tab: `clip-path` notches the bottom-left corner so it
reads as something you could tear off. The add row is an empty slot in the same stack, so the list
looks like a pile with room for one more.

## Motion

- Curve: `cubic-bezier(.23,1,.32,1)` for anything entering or responding; `.16,1,.3,1` for the sheet.
- Durations: 120–140ms for press/hover, 220ms for a view change, 300ms for the editor.
- One authored moment: finishing an event — a confetti burst from the click point, a synthesised pop,
  the XP bar refilling. Level-ups get a second, larger burst.
- Press is always `transform: scale(.965)` with the same 130ms curve; nothing bounces.
- Hover transforms are gated behind `@media (hover:none)` opt-outs; `prefers-reduced-motion` collapses
  every duration to ~0.

## Components

- **Google badge** (`gsync-card`): a 28px conic-gradient tile in the four Google colours, 2px ink
  border, 2px hard offset. It is the only gradient in the product, and it is a logo stand-in, not a
  surface.

- **Chip** (month): lit block, 9px radius, gradient fill, time then title, strikethrough when done.
- **Task chip**: the same shape, inverted — white gradient, a 1.5px ring in the list colour instead of
  a fill, and a 9px ringed circle where the time would be. A task must never be mistakable for an
  event at a glance, so it gets no solid fill anywhere on the calendar.
- **Event block** (week/day): same block stretched to duration, two lines (time range, title), plus
  location in day view when there's room.
- **Row** (agenda): time, 5px colour bar, title, meta, 26px square check on the right.
- **Sheet** (editor): 30px radius, no border, a deep soft shadow, centred — modals stay centred.
- **Momentum card**: the only butter surface — a warm gradient object with a hard dark shadow; ink
  pill for level, ink fill for XP. No streak: momentum is today's XP and level, nothing to break.
- **Settings sheet**: the same sheet shell, blocks separated by 2px rules. Controls are the shared
  `.seg` (a cream groove with the active segment in ink — inverted in dark), `select`s on
  `--raised`, and the standard `.check` box. Destructive actions sit on `--danger-bg` and ask twice.
- **Auto-sync row**: a `.check` toggle (mint when on) plus a small cream `select` for the interval,
  set apart by a 2px inset rule. Sync state is always text, never a spinner: `Auto · 42 events ·
  just now` when healthy, coral `Reconnect to keep syncing` when the token lapsed.
- **Sync sheet**: two checkbox groups (`CALENDARS`, `TASK LISTS`) under 11px uppercase labels, each row
  a colour dot, a name and a right-aligned count. Same sheet shell as the editor, but 620px wide and built from blocks separated by
  2px rules. Status pills are uppercase 11px; `on` is mint, `err` is coral on blush. The `.ics` drop
  zone is a dashed 2px panel that turns blue on drag-over. Feed rows are flat 10px chips, no nesting.

## Tasks mode

The same world, a second surface. `body.mode-tasks` hides the calendar-only sidebar sections and the
view switcher, and shows the lists. The mode switch is a cream pill with a dark active segment —
deliberately the inverse of the view switcher's dark track, because it is the higher-level choice.

- **Calendar rows**: the colour box is its own button (toggle visibility), the name is another
  (opens the editor). Hiding a calendar dims and greys its box and strikes the name; calendars you
  cannot edit keep a flat, non-hovering name. `+ Add calendar` sits under the list as a quiet row.
- **Lists**: 12px-radius rows on the dark ground, 9px colour dot, count on the right, active row lit
  with `#ffffff24` plus an inset highlight. `+ New list` turns into an inline input.
- **Task row**: 23px round checkbox (soft well when open, mint gradient when done), title at 14.5/650,
  meta line under it, star button on the far right. Rows are 15px radius and only get a background on
  hover or when open — no boxes, no dividers.
- **Due chip**: 99px pill, cream by default, coral gradient for today, blush for overdue.
- **Editor**: opens inline under the row inside the same `<li>`, a white card inset in the row, so
  nothing floats over the list.
- **List / Dates switch**: a cream segmented control with a dark active segment, sitting in the pane
  header before the actions. In Dates view the destructive list actions step aside.
- **Tasks band**: in week and day view a strip sits under the day header (`TASKS` label in the
  gutter), with one column per day, 11px chips, and a 2px inset rule below it.
- **Date groups**: a Fredoka 15px label, a count pill, and an italic note on Overdue ("deal with these
  first") in coral. Groups are separated by a 2px inset rule, not cards.
- **The pane** is a paper page capped at 1040px and centred, not a full-bleed panel: a task list reads
  badly at 1400px wide.

## Motion

The rule: motion explains a state change or it doesn't happen. Curves are `cubic-bezier(.2,.8,.2,1)`
for UI and `.16,1,.3,1` for sheets; nothing is longer than 320ms; only transform and opacity animate.

- **Sheet exit** (170ms) is shorter than the entry (300ms) — leaving should feel instant.
- **Task completion** is the one authored moment: 34ms circle pop → 260ms strikethrough sweep →
  the row fades out over 280ms, and the re-render waits 240ms so the choreography is never cut off.
- **Chip flash** on creation: a ring that expands and fades (0 → 4px → 7px) so the eye can find the
  new event without the layout moving.
- **Pointer tilt** on the momentum card: ±6° rotateY / ±5° rotateX through a 700px perspective,
  attached only where `(hover: hover) and (pointer: fine)` matches and disabled under reduced motion.
- **XP ticker**: 320ms, cubic ease-out, `requestAnimationFrame`, cancelled if a new value arrives.
- Reduced motion removes the choreography but keeps the outcome (the strikethrough snaps on).

## Sound

Sound is part of the design, not an afterthought bolted on. One chain: master gain → compressor →
destination, plus a generated plate reverb on a 0.3 send, so every voice shares the same space.
Voices are built from two primitives — a **pluck** (oscillator with an 8ms attack, exponential decay,
optional pitch bend, optional reverb send) and **air** (filtered noise buffer, swept) — which is
enough for marimba, woodblock, thud and whoosh without a sample library.

Rules: nothing plays twice within 55ms; completion sounds randomise root and detune; the tick is
quiet enough to be felt rather than heard (gain 0.05); muted means no nodes are created at all, not
nodes at zero volume.

## Install and update chrome

Two pieces of UI exist only for the PWA and only when relevant. The **install row** lives inside
Settings and stays `hidden` until the browser fires `beforeinstallprompt` — no dead button on Safari
or Firefox. The **update pill** is a coral-free blue pill (`--blue` gradient, 99px radius, 78px from
the bottom so it never fights the toast) that appears only when a new service worker is waiting.

## The front page

`index.html` is a shop window, not the product. It borrows the app's tokens and type so the two feel
like one thing, but it is allowed to be quiet: one headline, one paragraph, two doors, four cards, and
a block of honest limitations. No app chrome, no state, no localStorage except the theme, which it
reads so the front page never flashes light at someone who chose dark.

The `fixed` background gradient only paints the viewport, so `html` carries `--ground` as a solid
underneath — otherwise everything below the fold lands on white.

## Layout

App shell is `topbar / [sidebar 254px | main]`. Settings lives as a gear in the top bar — one entry point, no
duplicates; sound is a row inside it, not a second button in the chrome. The topbar is `brand · mode switch · period nav ·
search · views · sound · new`; in Tasks mode the period nav and views step aside. Month grid is 6 rows of equal height, Monday start,
weekend tinted. Week and day views share one time grid: 64px gutter, 54px per hour, 6 AM–11 PM,
events laid out in lanes when they overlap. Below 900px the sidebar becomes a drawer and the topbar
splits into two rows.
