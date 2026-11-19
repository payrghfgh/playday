/* Playday — a calendar that doesn't feel like homework.
   Vanilla JS, no build step, no dependencies. State lives in localStorage. */
(() => {
  'use strict';

  /* ---------------------------------------------------------------- data */

  const DEFAULT_CALENDARS = [
    { id: 'work', name: 'Work',      color: '#2B3BFF', text: '#FFFFFF', shape: 'solid' },
    { id: 'deep', name: 'Deep work', color: '#A21CAF', text: '#FFFFFF', shape: 'stripe' },
    { id: 'life', name: 'Life',      color: '#3FDDA8', text: '#06231A', shape: 'dots' },
    { id: 'fun',  name: 'Fun',       color: '#FFC53D', text: '#2A1B00', shape: 'hatch' }
  ];

  /* every calendar in play: the four built-ins, imported .ics feeds, and Google calendars */
  const CAL_SHAPES = ['solid', 'stripe', 'dots', 'hatch'];

  function shapeFor(id) {
    let h = 0;
    const str = String(id);
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 997;
    return CAL_SHAPES[h % CAL_SHAPES.length];
  }

  function calendars() {
    const feeds = ((state && state.feeds) || []).map(f => ({
      id: 'feed:' + f.id, name: f.name, color: f.color, text: contrastText(f.color), src: 'ics'
    }));
    const google = (((state && state.google) || {}).calendars || [])
      .filter(c => c.selected !== false)
      .map(c => ({
        id: 'g:' + c.id, name: c.summary || 'Google calendar',
        color: c.backgroundColor || '#2B3BFF',
        text: contrastText(c.backgroundColor || '#2B3BFF'), src: 'gapi'
      }));
    return state.calendars.concat(feeds, google);
  }

  function calOf(e) {
    const all = calendars();
    const id = e && e.cal;
    return all.find(c => c.id === id) || all[0];
  }

  const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DOW_TINY_ALL = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  function dowLabels(tiny) {
    const shift = state.settings.weekStart === 0 ? 6 : 0;
    const src = tiny ? DOW_TINY_ALL : DOW_SHORT;
    return src.slice(shift).concat(src.slice(0, shift));
  }

  function hourName(h) {
    if (h === 0) return '12 AM';
    if (h < 12) return h + ' AM';
    if (h === 12) return '12 PM';
    return (h - 12) + ' PM';
  }
  const DOW_TINY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3));

  let HOUR_START = 6;
  let HOUR_END = 23;
  const HOUR_H = 54;

  /* ------------------------------------------------------------- helpers */

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const addDays = (d, n) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  };
  const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
  const startOfWeek = d => addDays(d, -(((d.getDay() - (state.settings.weekStart || 0)) + 7) % 7));
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const toMin = t => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const fmtTime = t => {
    let [h, m] = t.split(':').map(Number);
    const ap = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    return `${h}:${pad(m)} ${ap}`;
  };
  const fmtTimeShort = t => {
    let [h, m] = t.split(':').map(Number);
    const ap = h < 12 ? 'am' : 'pm';
    h = h % 12 || 12;
    return m === 0 ? `${h}${ap}` : `${h}:${pad(m)}${ap}`;
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => 'e' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  function resolveTheme() {
    const pick = (state.settings && state.settings.theme) || 'device';
    if (pick === 'light' || pick === 'dark') return pick;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function applyTheme() {
    const theme = resolveTheme();
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.skin = (state.settings && state.settings.skin) || 'indigo';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#120C2E' : '#271768');
  }

  const TODAY = new Date();
  const TODAY_STR = ymd(TODAY);

  /* --------------------------------------------------------------- store */

  const KEY = 'playday.v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.events)) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) { /* storage full or blocked: the session still works */ }
    if (typeof fbQueuePush === 'function') fbQueuePush();
  }

  /* a new install starts empty — no invented meetings, no fake history */
  function seed() {
    return [];
  }

  function seedLists() {
    return [{ id: 'l1', name: 'My tasks', color: '#3B5BFF' }];
  }

  function seedTasks() {
    return [];
  }

  const saved = load();
  const state = saved || { events: seed(), hidden: [], sound: true, view: 'month' };
  if (!state.hidden) state.hidden = [];
  if (!Array.isArray(state.calendars) || !state.calendars.length) {
    state.calendars = DEFAULT_CALENDARS.map(c => Object.assign({}, c));
  }
  state.calendars.forEach((c, i) => {
    if (!c.shape) c.shape = CAL_SHAPES[i % CAL_SHAPES.length];
    // the old Deep work violet was indistinguishable from Work blue
    if (c.id === 'deep' && c.color === '#6B4BFF') {
      c.color = '#A21CAF';
      c.text = contrastText(c.color);
    }
    if (!c.text) c.text = contrastText(c.color);
  });
  if (!Array.isArray(state.feeds)) state.feeds = [];
  if (!state.google || typeof state.google !== 'object') state.google = {};
  if (!Array.isArray(state.google.calendars)) state.google.calendars = [];
  if (!Array.isArray(state.google.taskLists)) state.google.taskLists = [];
  if (typeof state.google.tasksEnabled !== 'boolean') state.google.tasksEnabled = true;
  if (typeof state.google.clientId !== 'string') state.google.clientId = '';
  if (typeof state.google.auto !== 'boolean') state.google.auto = true;
  if (!state.google.interval) state.google.interval = 5;
  if (typeof state.google.needsAuth !== 'boolean') state.google.needsAuth = false;
  if (!Array.isArray(state.lists) || !state.lists.length) state.lists = seedLists();
  if (!Array.isArray(state.tasks)) state.tasks = seedTasks();
  if (!state.taskList || !state.lists.some(l => l.id === state.taskList)) state.taskList = state.lists[0].id;
  if (state.mode !== 'tasks') state.mode = 'calendar';
  if (state.taskView !== 'dates') state.taskView = 'list';
  if (typeof state.showTasks !== 'boolean') state.showTasks = true;
  if (typeof state.soundVolume !== 'number') state.soundVolume = 0.7;
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  if (['device', 'light', 'dark'].indexOf(state.settings.theme) === -1) state.settings.theme = 'device';
  if (state.settings.weekStart !== 0) state.settings.weekStart = 1;
  if (typeof state.settings.dayStart !== 'number') state.settings.dayStart = 6;
  if (typeof state.settings.dayEnd !== 'number') state.settings.dayEnd = 23;
  if (['indigo', 'sunset', 'midnight', 'karat', 'modern', 'work', 'minimal'].indexOf(state.settings.skin) === -1) state.settings.skin = 'indigo';
  if (typeof state.sound !== 'boolean') state.sound = true;
  if (!state.view) state.view = 'month';

  /* --------------------------------------------------------------- state */

  let view = state.view;
  let cursor = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  let lastScroll = null;
  let editingId = null;
  let pickedCal = 'work';

  const hiddenSet = () => new Set(state.hidden);
  const visible = e => !hiddenSet().has(e.cal);

  /* tasks that belong on the calendar: open, and dated */
  function calendarTasks() {
    if (!state.showTasks) return [];
    return state.tasks.filter(t => !t.done && t.due);
  }

  function tasksByDate() {
    const map = new Map();
    calendarTasks().forEach(t => {
      if (!map.has(t.due)) map.set(t.due, []);
      map.get(t.due).push(t);
    });
    map.forEach(list => list.sort((a, b) => a.title.localeCompare(b.title)));
    return map;
  }

  function taskChip(t) {
    const owner = listById(t.list);
    return `<button class="chip is-task" style="--c:${owner.color}" data-shape="${owner.shape || 'solid'}" data-task-done="${t.id}"
        draggable="false" title="Mark done: ${esc(t.title)}">
      <span class="task-dot" aria-hidden="true"></span>
      <span class="ctitle">${esc(t.title)}</span>
    </button>`;
  }

  const REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];

  function occurrences(ev, fromYmd, toYmd) {
    if (!ev.repeat || ev.repeat === 'none') return [ev];
    const out = [];
    const to = parseYmd(toYmd);
    const until = ev.repeatUntil ? parseYmd(ev.repeatUntil) : null;
    let d = parseYmd(ev.date);
    let guard = 0;
    while (d <= to && guard++ < 900) {
      const key = ymd(d);
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      const inWindow = key >= fromYmd && key >= ev.date && (!until || d <= until);
      const allowed = ev.repeat !== 'weekdays' || !weekend;
      if (inWindow && allowed) {
        out.push(Object.assign({}, ev, { id: ev.id + '~' + key, date: key, seriesId: ev.id }));
      }
      if (ev.repeat === 'daily' || ev.repeat === 'weekdays') d = addDays(d, 1);
      else if (ev.repeat === 'weekly') d = addDays(d, 7);
      else if (ev.repeat === 'monthly') {
        const n = new Date(d);
        n.setMonth(n.getMonth() + 1);
        d = n;
      } else break;
    }
    return out;
  }

  const baseId = id => String(id).split('~')[0];

  const byDate = (fromYmd, toYmd) => {
    const map = new Map();
    const from = fromYmd || ymd(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    const to = toYmd || ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
    state.events.filter(e => !e.deleted).filter(visible).forEach(e => {
      occurrences(e, from, to).forEach(inst => {
        if (!map.has(inst.date)) map.set(inst.date, []);
        map.get(inst.date).push(inst);
      });
    });
    map.forEach(list => list.sort((a, b) => toMin(a.start) - toMin(b.start)));
    return map;
  };

  /* -------------------------------------------------------------- rhythm */

  function stats() {
    const tasks = state.tasks || [];
    const doneTotal = state.events.filter(e => e.done).length + tasks.filter(t => t.done).length;
    const doneToday = state.events.filter(e => e.done && e.date === TODAY_STR).length +
      tasks.filter(t => t.done && t.doneAt && ymd(new Date(t.doneAt)) === TODAY_STR).length;
    const xp = doneTotal * 12;
    const level = 1 + Math.floor(xp / 100);
    return { doneTotal, doneToday, xp, level, into: xp % 100 };
  }

  /* --------------------------------------------------------------- sound */

  /* A small synth instead of a beep: every sound is built from plucks, noise and a
     generated reverb, so it has air and character without shipping audio files. */

  const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
  let ac = null;
  let masterGain = null;
  let reverbNode = null;
  const lastSound = {};

  function soundVolume() {
    const v = typeof state.soundVolume === 'number' ? state.soundVolume : 0.7;
    return Math.max(0, Math.min(1, v));
  }

  function makeImpulse(ctx, seconds, decay) {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buffer = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buffer;
  }

  function audio() {
    if (ac) return ac;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      ac = new Ctx();
      masterGain = ac.createGain();
      masterGain.gain.value = soundVolume() * 0.9;

      const comp = ac.createDynamicsCompressor();
      if (comp.threshold) comp.threshold.value = -16;
      if (comp.ratio) comp.ratio.value = 3;
      if (comp.attack) comp.attack.value = 0.003;
      if (comp.release) comp.release.value = 0.25;
      masterGain.connect(comp);
      comp.connect(ac.destination);

      reverbNode = ac.createConvolver();
      reverbNode.buffer = makeImpulse(ac, 0.85, 2.6);
      const wet = ac.createGain();
      wet.gain.value = 0.3;
      reverbNode.connect(wet);
      wet.connect(masterGain);
    } catch (err) {
      ac = null;
    }
    return ac;
  }

  function setSoundVolume(v) {
    state.soundVolume = Math.max(0, Math.min(1, v));
    if (masterGain && ac) masterGain.gain.setTargetAtTime(soundVolume() * 0.9, ac.currentTime, 0.02);
  }

  /* a struck note: fast attack, exponential decay, optional pitch bend and reverb send */
  function pluck(freq, when, dur, opts) {
    const o = opts || {};
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    if (o.bend) osc.frequency.linearRampToValueAtTime(freq * (1 + o.bend), when + dur * 0.6);
    const peak = Math.max(0.0002, o.gain == null ? 0.15 : o.gain);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(masterGain);
    if (o.send) g.connect(reverbNode);
    osc.start(when);
    osc.stop(when + dur + 0.03);
  }

  /* filtered noise: the "air" in a sound */
  function air(when, dur, opts) {
    const o = opts || {};
    const len = Math.max(1, Math.ceil(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = o.filter || 'highpass';
    filter.frequency.setValueAtTime(o.from || 3000, when);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, when + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, o.gain == null ? 0.04 : o.gain), when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    if (o.send) g.connect(reverbNode);
    src.start(when);
    src.stop(when + dur + 0.03);
  }

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /* ---------------- the recipes ---------------- */

  function sndComplete() {
    const t = ac.currentTime + 0.012;
    const root = pick([PENTA[2], PENTA[3], PENTA[4]]);
    const detune = 1 + (Math.random() * 0.012 - 0.006);
    pluck(root * detune, t, 0.3, { gain: 0.17, bend: 0.008, send: true });
    pluck(root * 1.5 * detune, t + 0.075, 0.36, { type: 'sine', gain: 0.11, send: true });
    pluck(root * 0.5, t, 0.22, { type: 'sine', gain: 0.08 });
    air(t + 0.03, 0.18, { from: 4200, gain: 0.03, send: true });
  }

  function sndLevel() {
    const t = ac.currentTime + 0.02;
    [0, 1, 2, 3, 5, 6].forEach((step, i) => {
      pluck(PENTA[step], t + i * 0.082, 0.42, { gain: 0.14, send: true });
    });
    pluck(PENTA[6] * 2, t + 0.5, 0.7, { type: 'sine', gain: 0.09, send: true });
    pluck(72, t + 0.02, 0.34, { type: 'sine', gain: 0.15 });
    air(t + 0.46, 0.55, { from: 5200, gain: 0.035, send: true });
  }

  function sndAdd() {
    const t = ac.currentTime + 0.012;
    pluck(660, t, 0.14, { gain: 0.13, bend: 0.05 });
    pluck(990, t + 0.055, 0.2, { gain: 0.1, send: true });
    air(t, 0.05, { from: 2500, gain: 0.025 });
  }

  function sndRemove() {
    const t = ac.currentTime + 0.01;
    pluck(392, t, 0.16, { gain: 0.11, bend: -0.04 });
    pluck(294, t + 0.06, 0.26, { type: 'sine', gain: 0.09, send: true });
    pluck(98, t, 0.18, { type: 'sine', gain: 0.1 });
  }

  function sndTick() {
    const t = ac.currentTime + 0.005;
    pluck(1180 + Math.random() * 60, t, 0.045, { type: 'sine', gain: 0.05 });
    air(t, 0.025, { from: 5200, gain: 0.014 });
  }

  function sndWhoosh() {
    const t = ac.currentTime + 0.005;
    air(t, 0.22, { filter: 'bandpass', from: 380, to: 2400, gain: 0.05, send: true });
  }

  function sndError() {
    const t = ac.currentTime + 0.01;
    pluck(196, t, 0.12, { type: 'square', gain: 0.05 });
    pluck(185, t + 0.11, 0.16, { type: 'square', gain: 0.045 });
  }

  const SOUNDS = {
    complete: sndComplete,
    add: sndAdd,
    remove: sndRemove,
    tick: sndTick,
    level: sndLevel,
    whoosh: sndWhoosh,
    error: sndError,
    /* older names still work */
    pop: sndComplete,
    undo: sndRemove
  };

  function play(kind) {
    if (!state.sound || soundVolume() <= 0) return;
    const recipe = SOUNDS[kind] || SOUNDS.tick;
    const now = Date.now();
    if (lastSound[kind] && now - lastSound[kind] < 55) return; // never machine-gun a tick
    lastSound[kind] = now;
    if (!audio()) return;
    try {
      if (ac.state === 'suspended') ac.resume();
      recipe();
    } catch (err) { /* audio is a nicety, never a blocker */ }
  }

  /* ------------------------------------------------------------ confetti */

  const CONFETTI_COLORS = ['#2B3BFF', '#FF5A36', '#3FDDA8', '#FFC53D', '#6B4BFF', '#FFFCF4'];
  const confLayer = document.getElementById('confetti');

  function burst(x, y, count) {
    const n = count || 22;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'conf';
      const angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const dist = 55 + Math.random() * 105;
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle) * dist + 55 + 'px');
      p.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
      if (i % 3 === 0) p.style.borderRadius = '50%';
      p.style.animationDelay = (Math.random() * 60) + 'ms';
      confLayer.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
  }

  /* ---------------------------------------------------------------- toast */

  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  const undoStack = [];

  function pushUndo(label, restore) {
    undoStack.push({ label, restore });
    if (undoStack.length > 24) undoStack.shift();
  }

  function undoLast() {
    const entry = undoStack.pop();
    if (!entry) { toast('Nothing to undo', false); return; }
    entry.restore();
    save();
    render();
    play('remove');
    toast('Undone — ' + entry.label);
  }

  function toast(msg, tick, action) {
    toastEl.innerHTML = (tick === false ? '' : '<span class="tick"><svg viewBox="0 0 24 24" width="13" height="13"><path d="M5 12.6 9.6 17 19 7" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>') + '<span>' + esc(msg) + '</span>' +
      (action ? '<button class="toast-action" type="button">' + esc(action.label || 'Undo') + '</button>' : '');
    toastEl.hidden = false;
    if (action) {
      const btn = toastEl.querySelector('.toast-action');
      if (btn) btn.addEventListener('click', () => {
        toastEl.hidden = true;
        clearTimeout(toastTimer);
        action.fn();
      }, { once: true });
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  /* --------------------------------------------------------------- render */

  const main = document.getElementById('main');
  const periodTitle = document.getElementById('periodTitle');

  const calStyle = e => {
    const c = calOf(e);
    return `--c:${c.color};--ct:${c.text};`;
  };

  function periodLabel() {
    if (view === 'day') {
      return `${DOW_LONG(cursor.getDay())}, ${cursor.getDate()} ${MONTHS_SHORT[cursor.getMonth()]} ${cursor.getFullYear()}`;
    }
    if (view === 'week') {
      const a = startOfWeek(cursor);
      const b = addDays(a, 6);
      const sameMonth = a.getMonth() === b.getMonth();
      return sameMonth
        ? `${a.getDate()} – ${b.getDate()} ${MONTHS[a.getMonth()]} ${b.getFullYear()}`
        : `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
    }
    if (view === 'agenda') {
      const end = addDays(cursor, 29);
      return `${cursor.getDate()} ${MONTHS_SHORT[cursor.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
    }
    return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  }

  const DOW_LONG_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function DOW_LONG(i) { return DOW_LONG_NAMES[i]; }

  /* ---- month ---- */
  function renderMonth() {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const gridEnd = addDays(gridStart, 41);
    const map = byDate(ymd(gridStart), ymd(gridEnd));
    const taskMap = tasksByDate();
    const maxChips = window.innerWidth < 620 ? 2 : 3;
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const key = ymd(d);
      const inMonth = d.getMonth() === cursor.getMonth();
      const isToday = key === TODAY_STR;
      const wd = (d.getDay() + 6) % 7;
      const list = map.get(key) || [];
      const tasks = taskMap.get(key) || [];
      // a day with tasks always keeps one row for them, even when events crowd the cell
      const eventCap = tasks.length ? Math.max(1, maxChips - 1) : maxChips;
      const shown = list.slice(0, eventCap);
      const taskSlots = Math.max(tasks.length ? 1 : 0, maxChips - shown.length);
      const shownTasks = tasks.slice(0, taskSlots);
      const chips = shown.map(e => `
        <button class="chip${e.done ? ' done' : ''}" style="${calStyle(e)}" data-shape="${calOf(e).shape || 'solid'}" data-id="${e.id}" draggable="true" title="${esc(e.title)} · ${fmtTime(e.start)}">
          <span class="ct">${fmtTimeShort(e.start)}</span><span class="ctitle">${esc(e.title)}</span>
        </button>`).join('') + shownTasks.map(t => taskChip(t)).join('');
      const hidden = list.length + tasks.length - shown.length - shownTasks.length;
      const more = hidden > 0
        ? `<button class="more" data-date="${key}">+${hidden} more</button>` : '';
      cells += `
        <div class="cell${inMonth ? '' : ' other'}${wd > 4 ? ' weekend' : ''}${isToday ? ' today' : ''}" data-date="${key}">
          <div class="cell-top">
            <span class="num">${d.getDate()}</span>
            <button class="cell-add" data-date="${key}" aria-label="Add event on ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}">+</button>
          </div>
          <div class="chips">${chips}${more}</div>
        </div>`;
    }
    return `
      <section class="month">
        <div class="month-dow">${dowLabels().map(d => `<span>${d}</span>`).join('')}</div>
        <div class="month-grid">${cells}</div>
      </section>`;
  }

  /* ---- week + day share one time grid ---- */
  function layoutLanes(list) {
    const sorted = list.slice().sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(b.end) - toMin(a.end));
    const laneEnds = [];
    const placed = sorted.map(e => {
      const s = toMin(e.start);
      let lane = laneEnds.findIndex(end => end <= s);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = toMin(e.end);
      return { e, lane };
    });
    const total = Math.max(1, laneEnds.length);
    return placed.map(p => ({ e: p.e, lane: p.lane, total }));
  }

  function eventBlock(e, lane, total, wide) {
    const s = Math.max(toMin(e.start), HOUR_START * 60);
    const en = Math.min(toMin(e.end), HOUR_END * 60);
    const top = ((s - HOUR_START * 60) / 60) * HOUR_H;
    const height = Math.max(20, ((en - s) / 60) * HOUR_H - 2);
    const width = 100 / total;
    const left = width * lane;
    const tiny = height < 34 ? ' tiny' : '';
    return `
      <button class="ev${e.done ? ' done' : ''}${tiny}" data-shape="${calOf(e).shape || 'solid'}" data-id="${e.id}" style="${calStyle(e)}top:${top}px;height:${height}px;left:calc(${left}% + 2px);right:auto;width:calc(${width}% - 4px)">
        <span class="ev-t">${fmtTimeShort(e.start)} – ${fmtTimeShort(e.end)}</span>
        <span class="ev-title">${esc(e.title)}</span>
        ${wide && height >= 46 && e.where ? `<span class="ev-where">${esc(e.where)}</span>` : ''}
      </button>`;
  }

  function renderTimeGrid(days) {
    const map = byDate(ymd(days[0]), ymd(days[days.length - 1]));
    const taskMap = tasksByDate();
    const hasTasks = days.some(d => (taskMap.get(ymd(d)) || []).length);
    const hours = [];
    for (let h = HOUR_START; h < HOUR_END; h++) hours.push(h);

    const head = days.map(d => {
      const isToday = ymd(d) === TODAY_STR;
      return `<button class="hd${isToday ? ' is-today' : ''}" data-date="${ymd(d)}">
          <span class="hd-dow">${DOW_SHORT[(d.getDay() + 6) % 7]}</span>
          <span class="hd-num">${d.getDate()}</span>
        </button>`;
    }).join('');

    const cols = days.map(d => {
      const key = ymd(d);
      const wd = (d.getDay() + 6) % 7;
      const slots = hours.map(h => `
        <div class="tg-slot" data-date="${key}" data-hour="${h}" role="button" tabindex="-1"
             aria-label="Add event on ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} at ${h}:00"></div>`).join('');
      const blocks = layoutLanes(map.get(key) || []).map(p => eventBlock(p.e, p.lane, p.total, days.length === 1)).join('');
      return `<div class="tg-col${wd > 4 ? ' weekend' : ''}" data-date="${key}">${slots}${blocks}</div>`;
    }).join('');

    const gutter = hours.map(h => `<div class="tg-hour">${hourName(h)}</div>`).join('');

    const nowMin = TODAY.getHours() * 60 + TODAY.getMinutes();
    const showNow = nowMin >= HOUR_START * 60 && nowMin <= HOUR_END * 60;
    const nowTop = ((nowMin - HOUR_START * 60) / 60) * HOUR_H;
    const nowLine = showNow
      ? `<div class="nowline" style="top:${nowTop}px;left:0"><span class="nowlabel">${fmtTime(pad(TODAY.getHours()) + ':' + pad(TODAY.getMinutes()))}</span></div>`
      : '';

    return `
      <section class="timegrid">
        <div class="tg-head${days.length === 1 ? ' single' : ''}" style="grid-template-columns:64px repeat(${days.length},1fr)">
          <div class="hd"><span class="hd-dow">${days.length > 1 ? '' : 'Day'}</span></div>
          ${head}
        </div>
        ${hasTasks ? `
        <div class="tg-allday" style="grid-template-columns:64px repeat(${days.length},1fr)">
          <div class="tg-allday-label">Tasks</div>
          ${days.map(d => {
            const list = taskMap.get(ymd(d)) || [];
            return `<div class="tg-allday-cell">${list.map(t => taskChip(t, true)).join('')}</div>`;
          }).join('')}
        </div>` : ''}
        <div class="tg-scroll">
          <div class="tg-body" style="grid-template-columns:64px repeat(${days.length},1fr)">
            <div class="tg-gutter">${gutter}</div>
            ${cols}
          </div>
          ${nowLine}
        </div>
      </section>`;
  }

  function renderWeek() {
    const a = startOfWeek(cursor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(a, i));
    return renderTimeGrid(days);
  }

  function renderDay() {
    return renderTimeGrid([cursor]);
  }

  /* ---- agenda ---- */
  function renderAgenda() {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    const map = byDate(ymd(start), ymd(addDays(start, 29)));
    const taskMap = tasksByDate();
    let html = '';
    let totalShown = 0;
    for (let i = 0; i < 30; i++) {
      const d = addDays(start, i);
      const key = ymd(d);
      const list = map.get(key) || [];
      const tasks = taskMap.get(key) || [];
      if (!list.length && !tasks.length) continue;
      totalShown += list.length + tasks.length;
      const isToday = key === TODAY_STR;
      const taskRows = tasks.map(t => `
        <div class="ag-item is-task" data-task-open="${t.id}" role="button" tabindex="0" style="--c:${listById(t.list).color}">
          <span class="ag-time">Task</span>
          <span class="ag-bar" aria-hidden="true"></span>
          <span class="ag-main">
            <span class="ag-title">${esc(t.title)}</span>
            <span class="ag-meta">${esc(listById(t.list).name)} · task</span>
          </span>
          <button class="ag-check" data-task-done="${t.id}" aria-label="Mark done: ${esc(t.title)}" aria-pressed="false">
            <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.6 9.6 17 19 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>`).join('');

      const rows = list.map(e => `
        <div class="ag-item${e.done ? ' done' : ''}" data-id="${e.id}" role="button" tabindex="0" style="--c:${calOf(e).color}">
          <span class="ag-time">${fmtTime(e.start)}</span>
          <span class="ag-bar" aria-hidden="true"></span>
          <span class="ag-main">
            <span class="ag-title">${esc(e.title)}</span>
            <span class="ag-meta">${calOf(e).name}${e.where ? ' · ' + esc(e.where) : ''}${e.src === 'gapi' ? ' · Google' : e.src === 'ics' ? ' · imported' : ''}${e.done ? ' · done' : ''}</span>
          </span>
          <button class="ag-check" data-check="${e.id}" aria-label="${e.done ? 'Mark not done' : 'Mark done'}: ${esc(e.title)}" aria-pressed="${e.done}">
            <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.6 9.6 17 19 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>`).join('');
      html += `
        <div class="ag-day">
          <div class="ag-day-row">
            <span class="ag-date${isToday ? ' is-today' : ''}">${isToday ? 'Today' : d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()]}</span>
            <span class="ag-dow">${DOW_LONG(d.getDay())}</span>
            <span class="ag-count">${list.length + tasks.length} item${list.length + tasks.length > 1 ? 's' : ''}</span>
          </div>
        </div>
        ${taskRows}${rows}`;
    }
    if (!totalShown) {
      html = `<div class="ag-empty">
        <svg viewBox="0 0 48 48" width="46" height="46" aria-hidden="true">
          <rect x="6" y="9" width="36" height="33" rx="9" fill="none" stroke="#141126" stroke-width="2.6"/>
          <path d="M6 18h36M16 5v7M32 5v7" stroke="#141126" stroke-width="2.6" stroke-linecap="round"/>
          <circle cx="24" cy="31" r="4" fill="#FF5A36"/>
        </svg>
        <span>Thirty quiet days. That's either a win or a gap — press <kbd>C</kbd> to fill one.</span>
      </div>`;
    }
    return `<section class="agenda">${html}</section>`;
  }

  /* ---- sidebar pieces ---- */
  function renderMini() {
    const el = document.getElementById('miniGrid');
    const title = document.getElementById('miniTitle');
    title.textContent = `${MONTHS_SHORT[cursor.getMonth()]} ${cursor.getFullYear()}`;
    const dowEl = document.getElementById('miniDow');
    if (dowEl) dowEl.innerHTML = dowLabels(true).map(d => `<span>${d}</span>`).join('');
    const withEvents = new Set(state.events.filter(visible).map(e => e.date));
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    let html = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const key = ymd(d);
      const cls = [
        'mini-day',
        d.getMonth() === cursor.getMonth() ? '' : 'dim',
        key === TODAY_STR ? 'today' : '',
        sameDay(d, cursor) && key !== TODAY_STR ? 'sel' : ''
      ].filter(Boolean).join(' ');
      html += `<button class="${cls}" data-mini="${key}" aria-label="${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}">${d.getDate()}${withEvents.has(key) ? '<span class="dot"></span>' : ''}</button>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-mini]').forEach(b => {
      b.addEventListener('click', () => {
        cursor = parseYmd(b.dataset.mini);
        if (view === 'month' || view === 'agenda') { /* keep view */ }
        lastScroll = null;
        render();
        play('tick');
      });
    });
  }

  function renderCalList() {
    const el = document.getElementById('calList');
    const counts = {};
    state.events.forEach(e => { if (visible(e)) counts[e.cal] = (counts[e.cal] || 0) + 1; });

    const rows = calendars().map(c => {
      const on = !hiddenSet().has(c.id);
      const editable = state.calendars.some(x => x.id === c.id);
      return `<li class="cal-row${on ? ' on' : ''}">
        <button class="cal-toggle" data-cal="${c.id}" aria-pressed="${on}" aria-label="${on ? 'Hide' : 'Show'} ${esc(c.name)}">
          <span class="cal-box" data-shape="${c.shape || 'solid'}" style="background:${c.color};color:${c.text}">
            <svg viewBox="0 0 24 24" width="11" height="11"><path d="M5 12.6 9.6 17 19 7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </button>
        <button class="cal-name" data-cal-edit="${editable ? c.id : ''}" ${editable ? '' : 'disabled'} title="${editable ? 'Edit ' + esc(c.name) : esc(c.name) + ' comes from Google or an .ics file'}">${esc(c.name)}</button>
        <span class="cal-count">${counts[c.id] || 0}</span>
      </li>`;
    }).join('');

    el.innerHTML = rows +
      `<li class="cal-row"><button class="cal-toggle" data-tasks-toggle="1" aria-pressed="${state.showTasks}" aria-label="Show tasks on the calendar">
          <span class="cal-box${state.showTasks ? '' : ' is-off'}" style="background:#2EE6A8;color:#06231A">
            <svg viewBox="0 0 24 24" width="11" height="11"><path d="M5 12.6 9.6 17 19 7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </button>
        <button class="cal-name" id="tasksOnCalName">Tasks on calendar</button>
        <span class="cal-count">${calendarTasks().length}</span>
      </li>
      <li><button class="cal-add" id="addCalBtn">
        <span class="cal-add-plus" aria-hidden="true">+</span> Add calendar
      </button></li>`;

    el.querySelectorAll('[data-tasks-toggle]').forEach(b => {
      b.addEventListener('click', () => {
        state.showTasks = !state.showTasks;
        save();
        play('tick');
        render();
      });
    });
    const tasksName = document.getElementById('tasksOnCalName');
    if (tasksName) tasksName.addEventListener('click', () => {
      state.showTasks = !state.showTasks;
      save();
      play('tick');
      render();
    });
    el.querySelectorAll('[data-cal]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.cal;
        const set = hiddenSet();
        if (set.has(id)) set.delete(id); else set.add(id);
        state.hidden = [...set];
        save();
        play('tick');
        render();
      });
    });
    el.querySelectorAll('[data-cal-edit]').forEach(b => {
      if (!b.dataset.calEdit) return;
      b.addEventListener('click', () => openCalendarEditor(b.dataset.calEdit));
    });
    const addBtn = document.getElementById('addCalBtn');
    if (addBtn) addBtn.addEventListener('click', () => openCalendarEditor(null));
  }

  let shownXp = null;
  let xpTicker = null;

  function xpLabelFor(value) {
    const into = ((value % 100) + 100) % 100;
    const level = 1 + Math.floor(value / 100);
    return value + ' XP · ' + (100 - into) + ' to Lv ' + (level + 1);
  }

  function renderDayProgress() {
    const bar = document.getElementById('dayBar');
    const fill = document.getElementById('dayFill');
    const clock = document.getElementById('dayClock');
    const left = document.getElementById('dayLeft');
    if (!bar || !fill) return;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const remaining = Math.max(0, 24 * 60 - minutes);
    const pct = Math.round((remaining / (24 * 60)) * 100);
    fill.style.width = pct + '%';
    bar.setAttribute('aria-valuenow', String(pct));
    const hh = now.getHours() % 12 || 12;
    if (clock) clock.textContent = hh + ':' + pad(now.getMinutes()) + (now.getHours() < 12 ? 'am' : 'pm');
    if (left) left.textContent = pct + '% of today left';
  }

  function renderMomentum() {
    renderDayProgress();
    const s = stats();
    document.getElementById('levelPill').textContent = 'Lv ' + s.level;
    document.getElementById('xpFill').style.width = s.into + '%';
    document.getElementById('xpBar').setAttribute('aria-valuenow', String(s.into));

    const xpEl = document.getElementById('xpLabel');
    if (xpTicker) { cancelAnimationFrame(xpTicker); xpTicker = null; }
    if (shownXp === null || shownXp === s.xp) {
      xpEl.textContent = xpLabelFor(s.xp);
    } else {
      // count up instead of jumping, so the number feels earned
      const from = shownXp;
      const to = s.xp;
      const started = performance.now();
      const tick = now => {
        const k = Math.min(1, (now - started) / 320);
        const eased = 1 - Math.pow(1 - k, 3);
        xpEl.textContent = xpLabelFor(Math.round(from + (to - from) * eased));
        xpTicker = k < 1 ? requestAnimationFrame(tick) : null;
      };
      xpTicker = requestAnimationFrame(tick);
    }
    shownXp = s.xp;

    document.getElementById('doneLabel').textContent = s.doneToday + ' done today';
    let copy;
    if (!s.doneToday) copy = 'Nothing checked off today yet. One tap fills a slice of the bar.';
    else if (s.doneToday >= 3) copy = `${s.doneToday} things finished today. That is a good day by any measure.`;
    else copy = `${s.doneToday} finished today. Keep going while the day is still warm.`;
    document.getElementById('momentumCopy').textContent = copy;
  }

  function render() {
    const sc = document.querySelector('.tg-scroll');
    if (sc) lastScroll = sc.scrollTop;

    document.body.classList.toggle('mode-tasks', mode === 'tasks');
    document.querySelectorAll('.mode-btn').forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    searchInput.placeholder = mode === 'tasks' ? 'Search tasks  /' : 'Search events  /';

    if (mode === 'tasks') {
      renderTaskPane();
      renderTaskSidebar();
      renderMomentum();
      state.mode = mode;
      save();
      return;
    }

    periodTitle.textContent = periodLabel();
    document.querySelectorAll('.view-btn').forEach(b => {
      const on = b.dataset.view === view;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    let html;
    if (view === 'month') html = renderMonth();
    else if (view === 'week') html = renderWeek();
    else if (view === 'day') html = renderDay();
    else html = renderAgenda();
    main.innerHTML = html;

    if (view === 'week' || view === 'day') {
      const s = document.querySelector('.tg-scroll');
      if (s) s.scrollTop = lastScroll == null ? (8 - HOUR_START) * HOUR_H - 20 : lastScroll;
    }

    renderMini();
    renderCalList();
    renderMomentum();
    wireDrag();
    state.view = view;
    save();
  }

  /* ------------------------------------------------------------ dragging */

  function wireDrag() {
    main.querySelectorAll('.chip[draggable="true"]').forEach(chip => {
      chip.addEventListener('dragstart', ev => {
        ev.dataTransfer.setData('text/plain', chip.dataset.id);
        ev.dataTransfer.effectAllowed = 'move';
        chip.classList.add('dragging');
      });
      chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
    });
    main.querySelectorAll('.cell').forEach(cell => {
      cell.addEventListener('dragover', ev => {
        if (!ev.dataTransfer.types.includes('text/plain')) return;
        ev.preventDefault();
        cell.classList.add('drop');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('drop'));
      cell.addEventListener('drop', ev => {
        ev.preventDefault();
        cell.classList.remove('drop');
        const id = ev.dataTransfer.getData('text/plain');
        const e = state.events.find(x => x.id === id);
        if (!e || e.date === cell.dataset.date) return;
        e.date = cell.dataset.date;
        save();
        render();
        play('tick');
        toast('Moved to ' + parseYmd(e.date).getDate() + ' ' + MONTHS_SHORT[parseYmd(e.date).getMonth()]);
      });
    });
  }

  /* -------------------------------------------------------- done / XP */

  function afterComplete(x, y, message) {
    const before = stats().level;
    burst(x || window.innerWidth / 2, y || window.innerHeight / 2, 24);
    play('complete');
    render();
    const after = stats();
    if (after.level > before) {
      play('level');
      burst(window.innerWidth / 2, window.innerHeight / 2, 40);
      const card = document.getElementById('momentumCard');
      if (card) {
        card.classList.add('pulse');
        setTimeout(() => card.classList.remove('pulse'), 620);
      }
      toast('Level ' + after.level + ' — that is momentum');
    } else {
      toast(message);
    }
  }

  function toggleDone(id, x, y) {
    const e = state.events.find(x2 => x2.id === id);
    if (!e) return;
    e.done = !e.done;
    save();
    if (e.done) {
      afterComplete(x, y, e.title + ' · done, +12 XP');
    } else {
      play('remove');
      render();
      toast('Un-checked. It happens.');
    }
  }

  /* --------------------------------------------------------------- modal */

  const overlay = document.getElementById('overlay');

  /* sheets animate both ways: reveal instantly, dismiss with a 170ms exit */
  const closeTimers = new WeakMap();

  function revealOverlay(el) {
    if (!el) return;
    const pending = closeTimers.get(el);
    if (pending) { clearTimeout(pending); closeTimers.delete(el); }
    el.classList.remove('is-closing');
    el.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function dismissOverlay(el) {
    if (!el || el.hidden) return;
    el.classList.add('is-closing');
    const timer = setTimeout(() => {
      el.classList.remove('is-closing');
      el.hidden = true;
      document.body.style.overflow = '';
      closeTimers.delete(el);
    }, 170);
    closeTimers.set(el, timer);
  }
  const form = document.getElementById('eventForm');
  const fId = document.getElementById('fId');
  const fTitle = document.getElementById('fTitle');
  const fDate = document.getElementById('fDate');
  const fStart = document.getElementById('fStart');
  const fEnd = document.getElementById('fEnd');
  const fRepeat = document.getElementById('fRepeat');
  const fUntil = document.getElementById('fUntil');
  const fUntilField = document.getElementById('fUntilField');
  const fSeriesNote = document.getElementById('fSeriesNote');
  const fWhere = document.getElementById('fWhere');
  const fNotes = document.getElementById('fNotes');
  const fDone = document.getElementById('fDone');
  const fCal = document.getElementById('fCal');
  const formError = document.getElementById('formError');
  const deleteBtn = document.getElementById('deleteBtn');
  const sheetTitle = document.getElementById('sheetTitle');

  function renderSwatches() {
    fCal.innerHTML = calendars().map(c => `
      <button type="button" class="swatch" data-cal="${c.id}" aria-pressed="${c.id === pickedCal}" aria-label="${c.name}" style="--c:${c.color};--ct:${c.text}">
        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12.6 9.6 17 19 7" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`).join('');
    fCal.querySelectorAll('[data-cal]').forEach(b => {
      b.addEventListener('click', () => {
        pickedCal = b.dataset.cal;
        renderSwatches();
        play('tick');
      });
    });
  }

  function roundToNext(d) {
    const m = d.getMinutes();
    return pad(d.getHours()) + ':' + pad(m < 30 ? 30 : 0);
  }

  function openEditor(rawId, preset) {
    const id = rawId ? baseId(rawId) : rawId;
    editingId = id || null;
    formError.hidden = true;
    renderSwatches();

    if (id) {
      const e = state.events.find(x => x.id === id);
      if (!e) return;
      sheetTitle.textContent = 'Edit event';
      fId.value = e.id;
      fRepeat.value = e.repeat || 'none';
      fUntil.value = e.repeatUntil || '';
      fTitle.value = e.title;
      fDate.value = e.date;
      fStart.value = e.start;
      fEnd.value = e.end;
      fWhere.value = e.where || '';
      fNotes.value = e.notes || '';
      fDone.checked = !!e.done;
      pickedCal = e.cal;
      deleteBtn.hidden = false;
    if (fSeriesNote) {
      fSeriesNote.hidden = !e.repeat || e.repeat === 'none';
      fSeriesNote.textContent = 'This is a repeating event — changes here apply to the whole series.';
    }
    } else {
      const p = preset || {};
      const base = p.date ? parseYmd(p.date) : new Date(cursor);
      sheetTitle.textContent = 'New event';
      fId.value = '';
      fTitle.value = '';
      fDate.value = p.date || ymd(base);
      if (p.hour != null) {
        fStart.value = pad(Number(p.hour)) + ':00';
        fEnd.value = pad(Math.min(23, Number(p.hour) + 1)) + ':00';
      } else if (p.start) {
        fStart.value = p.start;
        fEnd.value = p.end || p.start;
      } else {
        fStart.value = '09:00';
        fEnd.value = '10:00';
      }
      fWhere.value = '';
      fNotes.value = '';
      fDone.checked = false;
      pickedCal = (state.calendars[0] || { id: 'work' }).id;
      deleteBtn.hidden = true;
      fRepeat.value = 'none';
      fUntil.value = '';
      if (fSeriesNote) fSeriesNote.hidden = true;
    }
    renderSwatches();
    setEditorMode(editingId ? state.events.find(x => x.id === editingId) : null);
    play('whoosh');
    revealOverlay(overlay);
    if (!fTitle.disabled) setTimeout(() => fTitle.focus(), 30);
  }

  function setEditorMode(ev) {
    const readOnly = !!(ev && ev.src === 'ics');
    [fTitle, fDate, fStart, fEnd, fWhere, fNotes, fDone].forEach(el => { el.disabled = readOnly; });
    document.getElementById('saveBtn').hidden = readOnly;
    document.getElementById('copyBtn').hidden = !readOnly;
    deleteBtn.hidden = readOnly || !ev;
    const note = document.getElementById('sourceNote');
    note.hidden = !ev || (!readOnly && ev.src !== 'gapi');
    if (readOnly) {
      note.textContent = 'Imported from Google Calendar, so it is read-only here. Edit it in Google and re-import, or copy it to your own calendar.';
    } else if (ev && ev.src === 'gapi') {
      note.textContent = 'Live from Google Calendar — changes you save here are pushed back to Google.';
    }
  }

  function closeEditor() {
    play('whoosh');
    dismissOverlay(overlay);
    editingId = null;
  }

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const title = fTitle.value.trim();
    const date = fDate.value;
    const start = fStart.value;
    const end = fEnd.value;
    if (!title) { showError('Give it a name — "stuff" is not a name.'); fTitle.focus(); return; }
    if (!date) { showError('Pick a day for it.'); fDate.focus(); return; }
    if (!start || !end) { showError('It needs a start and an end time.'); return; }
    if (toMin(end) <= toMin(start)) { showError('End time has to be after the start time.'); fEnd.focus(); return; }

    const payload = {
      title, date, start, end,
      repeat: fRepeat.value,
      repeatUntil: fRepeat.value === 'none' ? null : (fUntil.value || null),
      cal: pickedCal,
      where: fWhere.value.trim(),
      notes: fNotes.value.trim(),
      done: fDone.checked
    };

    if (editingId) {
      const e = state.events.find(x => x.id === editingId);
      const wasGoogle = e.src === 'gapi';
      Object.assign(e, payload);
      if (wasGoogle) { e.dirty = true; e.gcal = String(payload.cal).replace(/^g:/, ''); }
      save();
      closeEditor();
      render();
      play('tick');
      toast('Saved');
      if (wasGoogle) googlePushSoon(e);
    } else {
      const ev = Object.assign({ id: uid() }, payload);
      if (String(payload.cal).startsWith('g:')) {
        ev.src = 'gapi';
        ev.gcal = String(payload.cal).slice(2);
        ev.dirty = true;
      }
      state.events.push(ev);
      save();
      closeEditor();
      cursor = parseYmd(date);
      lastScroll = null;
      render();
      play('add');
      toast('Added — ' + payload.title);
      const chip = document.querySelector('.chip[data-id="' + ev.id + '"]');
      if (chip) {
        chip.classList.add('chip-flash');
        chip.scrollIntoView({ block: 'nearest' });
        setTimeout(() => chip.classList.remove('chip-flash'), 900);
      }
      if (ev.src === 'gapi') googlePushSoon(ev);
    }
  });

  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
    play('error');
  }

  deleteBtn.addEventListener('click', () => {
    if (!editingId) return;
    const e = state.events.find(x => x.id === editingId);
    if (e && e.src === 'gapi' && e.gid) {
      e.deleted = true;
      e.dirty = true;
      save();
      googlePushSoon(e);
    } else {
      const at = state.events.findIndex(x => x.id === editingId);
      if (at > -1) {
        const [gone] = state.events.splice(at, 1);
        pushUndo('deleted "' + gone.title + '"', () => { state.events.splice(at, 0, gone); });
      }
      save();
    }
    closeEditor();
    render();
    play('remove');
    toast('Deleted' + (e ? ' — ' + e.title : ''), true, e && e.src !== 'gapi'
      ? { label: 'Undo', fn: undoLast } : undefined);
  });

  document.getElementById('copyBtn').addEventListener('click', () => {
    if (!editingId) return;
    const src = state.events.find(x => x.id === editingId);
    if (!src) return;
    const copy = Object.assign({}, src, {
      id: uid(), src: 'local', cal: 'work', feed: undefined, uid: undefined, gid: undefined, gcal: undefined, dirty: undefined
    });
    state.events.push(copy);
    save();
    editingId = copy.id;
    openEditor(copy.id);
    render();
    play('tick');
    toast('Copied into your calendar — edit away');
  });

  document.getElementById('closeSheet').addEventListener('click', closeEditor);
  document.getElementById('cancelBtn').addEventListener('click', closeEditor);
  overlay.addEventListener('click', ev => { if (ev.target === overlay) closeEditor(); });

  /* ------------------------------------------------------------- actions */

  function shift(dir) {
    if (view === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
    else if (view === 'week') cursor = addDays(cursor, dir * 7);
    else if (view === 'day') cursor = addDays(cursor, dir);
    else cursor = addDays(cursor, dir * 7);
    lastScroll = null;
    render();
  }

  function setView(v) {
    if (view === v) return;
    view = v;
    if (v === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    lastScroll = null;
    render();
    play('tick');
  }

  function goToday() {
    cursor = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    lastScroll = null;
    render();
    play('tick');
  }

  document.getElementById('prevBtn').addEventListener('click', () => shift(-1));
  document.getElementById('nextBtn').addEventListener('click', () => shift(1));
  document.getElementById('todayBtn').addEventListener('click', goToday);
  document.getElementById('newBtn').addEventListener('click', () => openEditor(null, { date: ymd(cursor) }));
  /* the brand is a link to the front page now; nothing to bind */
  document.getElementById('miniPrev').addEventListener('click', () => { cursor = addMonths(cursor, -1); lastScroll = null; render(); });
  document.getElementById('miniNext').addEventListener('click', () => { cursor = addMonths(cursor, 1); lastScroll = null; render(); });

  document.querySelectorAll('.view-btn').forEach(b => {
    b.addEventListener('click', () => setView(b.dataset.view));
  });

  const sideBtn = document.getElementById('sideBtn');
  const sidebar = document.getElementById('sidebar');
  sideBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

  /* ------------------------------------------------------ main delegated */

  main.addEventListener('click', ev => {
    const doneTask = ev.target.closest('[data-task-done]');
    if (doneTask) {
      ev.stopPropagation();
      const r = doneTask.getBoundingClientRect();
      toggleTask(doneTask.dataset.taskDone, r.left + r.width / 2, r.top + r.height / 2);
      return;
    }
    const openTaskRow = ev.target.closest('[data-task-open]');
    if (openTaskRow) {
      const t = state.tasks.find(x => x.id === openTaskRow.dataset.taskOpen);
      if (t) {
        state.taskList = t.list;
        setMode('tasks');
        state.taskView = 'list';
        openTaskId = t.id;
        render();
      }
      return;
    }
    const chip = ev.target.closest('.chip');
    if (chip) { openEditor(chip.dataset.id); return; }

    const evBlock = ev.target.closest('.ev');
    if (evBlock) { openEditor(evBlock.dataset.id); return; }

    const more = ev.target.closest('.more');
    if (more) {
      view = 'day';
      cursor = parseYmd(more.dataset.date);
      lastScroll = null;
      render();
      return;
    }

    const check = ev.target.closest('[data-check]');
    if (check) {
      ev.stopPropagation();
      const r = check.getBoundingClientRect();
      toggleDone(check.dataset.check, r.left + r.width / 2, r.top + r.height / 2);
      return;
    }

    const agItem = ev.target.closest('.ag-item');
    if (agItem) { openEditor(agItem.dataset.id); return; }

    const hd = ev.target.closest('.hd');
    if (hd && view === 'week') {
      view = 'day';
      cursor = parseYmd(hd.dataset.date);
      lastScroll = null;
      render();
      return;
    }

    const add = ev.target.closest('.cell-add');
    if (add) { openEditor(null, { date: add.dataset.date }); return; }

    const slot = ev.target.closest('.tg-slot');
    if (slot) { openEditor(null, { date: slot.dataset.date, hour: slot.dataset.hour }); return; }

    const cell = ev.target.closest('.cell');
    if (cell) { openEditor(null, { date: cell.dataset.date }); return; }
  });

  main.addEventListener('keydown', ev => {
    const item = ev.target.closest('.ag-item');
    if (item && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      openEditor(item.dataset.id);
    }
  });

  if (sidebar) {
    main.addEventListener('pointerdown', () => {
      if (sidebar.classList.contains('open')) sidebar.classList.remove('open');
    });
  }

  /* -------------------------------------------------------------- search */

  const searchInput = document.getElementById('search');
  const searchResults = document.getElementById('searchResults');


  /* ---------------------------- quick add ---------------------------- */
  /* "chai with ananya fri 5pm", "standup every weekday 9:30",
     "dentist 24 nov 4pm", "gym tomorrow 7am" — one field, no form. */

  const QW = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
  const QMONTH = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function parseQuickAdd(raw) {
    let text = ' ' + String(raw || '').toLowerCase().trim() + ' ';
    if (text.trim().length < 3) return null;
    let date = null, start = null, repeat = 'none';

    // repeat
    if (/\bevery ?day\b|\bdaily\b/.test(text)) { repeat = 'daily'; text = text.replace(/\bevery ?day\b|\bdaily\b/g, ' '); }
    else if (/\bevery ?week ?day\b|\bweekdays?\b/.test(text)) { repeat = 'weekdays'; text = text.replace(/\bevery ?week ?day\b|\bweekdays?\b/g, ' '); }
    else if (/\bevery ?week\b|\bweekly\b/.test(text)) { repeat = 'weekly'; text = text.replace(/\bevery ?week\b|\bweekly\b/g, ' '); }
    else if (/\bevery ?month\b|\bmonthly\b/.test(text)) { repeat = 'monthly'; text = text.replace(/\bevery ?month\b|\bmonthly\b/g, ' '); }

    // time: 5pm, 5:30 pm, 17:30, 9.15am
    let m = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/);
    if (m) {
      let h = Number(m[1]) % 12;
      const mins = m[2] ? Number(m[2]) : 0;
      if (m[3] === 'pm') h += 12;
      start = pad(h) + ':' + pad(mins);
      text = text.replace(m[0], ' ');
    } else {
      m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
      if (m) { start = pad(Number(m[1])) + ':' + m[2]; text = text.replace(m[0], ' '); }
    }

    // date words
    const today = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    if (/\btoday\b/.test(text)) { date = ymd(today); text = text.replace(/\btoday\b/g, ' '); }
    else if (/\btomorrow\b/.test(text)) { date = ymd(addDays(today, 1)); text = text.replace(/\btomorrow\b/g, ' '); }
    else if (/\bnext week\b/.test(text)) { date = ymd(addDays(today, 7)); text = text.replace(/\bnext week\b/g, ' '); }
    else {
      m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (m) { date = m[0]; text = text.replace(m[0], ' '); }
    }
    if (!date) {
      m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b/);
      if (m) {
        const d = new Date(today.getFullYear(), QMONTH[m[2]], Number(m[1]));
        if (d < today) d.setFullYear(d.getFullYear() + 1);
        date = ymd(d); text = text.replace(m[0], ' ');
      }
    }
    if (!date) {
      m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
      if (m) {
        const d = new Date(today.getFullYear(), QMONTH[m[1]], Number(m[2]));
        if (d < today) d.setFullYear(d.getFullYear() + 1);
        date = ymd(d); text = text.replace(m[0], ' ');
      }
    }
    if (!date) {
      m = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
      if (m) {
        const d = new Date(today.getFullYear(), Number(m[2]) - 1, Number(m[1]));
        if (d < today) d.setFullYear(d.getFullYear() + 1);
        date = ymd(d); text = text.replace(m[0], ' ');
      }
    }
    if (!date) {
      m = text.match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/);
      if (m) {
        const want = QW[m[1]];
        let d = new Date(today);
        let delta = (want - d.getDay() + 7) % 7;
        if (delta === 0) delta = 7;
        d = addDays(d, delta);
        date = ymd(d); text = text.replace(m[0], ' ');
      }
    }

    const title = text.replace(/\b(at|on|the|for|from|by)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!title) return null;
    if (!date && !start) return null;   // nothing to anchor it to
    if (!date) date = ymd(today);
    if (!start) start = '09:00';
    const endMin = Math.min(23 * 60 + 59, toMin(start) + 60);
    return {
      title: title.charAt(0).toUpperCase() + title.slice(1),
      date, start, end: pad(Math.floor(endMin / 60)) + ':' + pad(endMin % 60),
      repeat
    };
  }

  function quickAddRow(q) {
    const d = parseYmd(q.date);
    const when = DOW_SHORT[(d.getDay() + 6) % 7] + ' ' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] +
      ' · ' + fmtTime(q.start);
    const rep = q.repeat !== 'none' ? ' · repeats ' + q.repeat : '';
    return `<button class="sr-item sr-quick" data-quick="1">
      <span class="sr-dot" style="background:var(--blue)"></span>
      <span class="sr-main"><span class="sr-title">Create — ${esc(q.title)}</span>
      <span class="sr-when">${when}${rep}</span></span>
      <span class="sr-go">↵</span>
    </button>`;
  }

  function quickAddCommit(q) {
    const ev = {
      id: uid(), title: q.title, date: q.date, start: q.start, end: q.end,
      cal: (state.calendars[0] || { id: 'work' }).id,
      where: '', notes: '', done: false,
      repeat: q.repeat, repeatUntil: null
    };
    state.events.push(ev);
    save();
    cursor = parseYmd(q.date);
    lastScroll = null;
    render();
    play('add');
    toast('Added — ' + q.title);
    searchInput.value = '';
    searchResults.hidden = true;
  }

  function runSearch() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { searchResults.hidden = true; searchResults.innerHTML = ''; return; }
    const hits = state.events
      .filter(e => visible(e) && (e.title.toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q) ||
        (e.where || '').toLowerCase().includes(q)))
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
      .slice(0, 8);
    const taskHits = (state.tasks || [])
      .filter(t => t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q))
      .slice(0, 4);

    const quick = parseQuickAdd(searchInput.value);
    searchResults.hidden = false;
    searchResults.innerHTML = (quick ? quickAddRow(quick) : '') +
      ((hits.length || taskHits.length || quick) ? '' : `<div class="sr-empty">Nothing matches "${esc(searchInput.value)}".</div>`);
    searchResults.innerHTML += taskHits.map(t => {
      const list = listById(t.list);
      return `<button class="sr-item" data-task-hit="${t.id}">
          <span class="sr-dot" style="background:${esc(list.color)}"></span>
          <span>${esc(t.title)}</span>
          <span class="sr-when">${esc(list.name)}${t.done ? ' · done' : ''}</span>
        </button>`;
    }).join('');
    searchResults.innerHTML += hits.length
      ? hits.map(e => {
        const d = parseYmd(e.date);
        return `<button class="sr-item" data-id="${e.id}">
            <span class="sr-dot" style="background:${calOf(e).color}"></span>
            <span>${esc(e.title)}</span>
            <span class="sr-when">${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} · ${fmtTimeShort(e.start)}</span>
          </button>`;
      }).join('')
      : '';
    const quickBtn = searchResults.querySelector('[data-quick]');
    if (quickBtn) quickBtn.addEventListener('click', () => { const q = parseQuickAdd(searchInput.value); if (q) quickAddCommit(q); });

    searchResults.querySelectorAll('[data-id]').forEach(b => {
      b.addEventListener('click', () => {
        openEditor(b.dataset.id);
        searchResults.hidden = true;
      });
    });
    searchResults.querySelectorAll('[data-task-hit]').forEach(b => {
      b.addEventListener('click', () => {
        const t = state.tasks.find(x => x.id === b.dataset.taskHit);
        if (t) {
          state.taskList = t.list;
          setMode('tasks');
          openTaskId = t.id;
          render();
        }
        searchResults.hidden = true;
      });
    });
  }

  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('focus', runSearch);
  searchInput.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return;
    const q = parseQuickAdd(searchInput.value);
    if (q) { ev.preventDefault(); quickAddCommit(q); }
  });
  document.addEventListener('click', ev => {
    if (!ev.target.closest('.search-wrap')) searchResults.hidden = true;
  });

  /* ------------------------------------------------------------ keyboard */

  document.addEventListener('keydown', ev => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable;

    if (ev.key === 'Escape') {
      if (!overlay.hidden) { closeEditor(); return; }
      if (typeof syncOverlay !== 'undefined' && !syncOverlay.hidden) { closeSyncPanel(); return; }
      if (typeof settingsOverlay !== 'undefined' && !settingsOverlay.hidden) { closeSettings(); return; }
      if (typeof calOverlay !== 'undefined' && !calOverlay.hidden) { closeCalendarEditor(); return; }
      if (typeof mergeOverlay !== 'undefined' && !mergeOverlay.hidden) { mergeOverlay.hidden = true; return; }
      if (!searchResults.hidden) { searchResults.hidden = true; searchInput.blur(); return; }
      if (sidebar.classList.contains('open')) sidebar.classList.remove('open');
      return;
    }

    if (typing) {
      if (ev.key === 'Enter' && searchInput === document.activeElement) {
        const first = searchResults.querySelector('[data-id]');
        if (first) { ev.preventDefault(); first.click(); }
      }
      return;
    }
    if (!overlay.hidden) return;

    const k = ev.key.toLowerCase();
    if ((ev.metaKey || ev.ctrlKey) && k === 'z' && !ev.shiftKey) {
      ev.preventDefault();
      undoLast();
      return;
    }
    if (k === 'l') { ev.preventDefault(); setMode(mode === 'tasks' ? 'calendar' : 'tasks'); return; }
    if (mode === 'tasks') {
      if (k === 'c') {
        ev.preventDefault();
        const input = document.getElementById('taskAddInput');
        if (input) input.focus();
      }
      return;
    }
    if (k === 'c') { ev.preventDefault(); openEditor(null, { date: ymd(cursor) }); }
    else if (k === 't') { goToday(); }
    else if (k === 'd') { setView('day'); }
    else if (k === 'w') { setView('week'); }
    else if (k === 'm') { setView('month'); }
    else if (k === 'a') { setView('agenda'); }
    else if (ev.key === 'ArrowLeft') { shift(-1); }
    else if (ev.key === 'ArrowRight') { shift(1); }
    else if (ev.key === '/') { ev.preventDefault(); searchInput.focus(); searchInput.select(); }
  });





  /* ------------------------- calendar editor ------------------------- */

  const CAL_PALETTE = ['#3B5BFF', '#7B68FF', '#2EE6A8', '#FFC53D', '#FF6B4A', '#FF2E7A', '#38BDF8', '#A3E635'];
  const calOverlay = document.getElementById('calOverlay');
  const calNameInput = document.getElementById('calName');
  const calColorsEl = document.getElementById('calColors');
  const calDeleteBtn = document.getElementById('calDelete');
  const calErrorEl = document.getElementById('calError');
  let editingCalId = null;
  let pickedColor = CAL_PALETTE[0];
  let confirmCalDelete = false;

  function renderCalColors() {
    const list = CAL_PALETTE.slice();
    const current = editingCalId ? (state.calendars.find(c => c.id === editingCalId) || {}).color : null;
    if (current && list.indexOf(current) === -1) list.unshift(current);
    calColorsEl.innerHTML = list.map(c => `
      <button type="button" class="cal-swatch" data-color="${c}" aria-pressed="${c === pickedColor}"
        aria-label="Colour ${c}" style="--c:${c};--ct:${contrastText(c)}">
        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12.6 9.6 17 19 7" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`).join('');
    calColorsEl.querySelectorAll('[data-color]').forEach(b => {
      b.addEventListener('click', () => {
        pickedColor = b.dataset.color;
        renderCalColors();
        play('tick');
      });
    });
  }

  function openCalendarEditor(id) {
    editingCalId = id || null;
    confirmCalDelete = false;
    const cal = id ? state.calendars.find(c => c.id === id) : null;
    pickedColor = cal ? cal.color : CAL_PALETTE[state.calendars.length % CAL_PALETTE.length];
    document.getElementById('calSheetTitle').textContent = cal ? 'Edit calendar' : 'New calendar';
    calNameInput.value = cal ? cal.name : '';
    calErrorEl.hidden = true;
    calDeleteBtn.hidden = !cal;
    calDeleteBtn.textContent = 'Delete calendar';
    const count = cal ? state.events.filter(e => e.cal === cal.id).length : 0;
    document.getElementById('calHint').textContent = cal
      ? count + ' event' + (count === 1 ? '' : 's') + ' in this calendar. Renaming or recolouring keeps them all.'
      : 'Its own colour, its own toggle, and it never touches your other calendars.';
    renderCalColors();
    play('whoosh');
    revealOverlay(calOverlay);
    setTimeout(() => calNameInput.focus(), 30);
  }

  function closeCalendarEditor() {
    play('whoosh');
    dismissOverlay(calOverlay);
    editingCalId = null;
    confirmCalDelete = false;
  }

  function calError(msg) {
    calErrorEl.textContent = msg;
    calErrorEl.hidden = false;
    play('error');
  }

  function saveCalendar() {
    const name = calNameInput.value.trim();
    if (!name) { calError('Give it a name — "Untitled" will not survive a week.'); calNameInput.focus(); return; }
    const clash = state.calendars.some(c => c.id !== editingCalId && c.name.toLowerCase() === name.toLowerCase());
    if (clash) { calError('You already have a calendar called that.'); calNameInput.focus(); return; }

    if (editingCalId) {
      const cal = state.calendars.find(c => c.id === editingCalId);
      cal.name = name;
      cal.color = pickedColor;
      cal.text = contrastText(pickedColor);
      save();
      closeCalendarEditor();
      render();
      play('tick');
      toast('Saved — ' + name);
    } else {
      state.calendars.push({
        id: 'c' + Math.random().toString(36).slice(2, 8),
        name,
        color: pickedColor,
        text: contrastText(pickedColor),
        shape: CAL_SHAPES[state.calendars.length % CAL_SHAPES.length]
      });
      save();
      closeCalendarEditor();
      render();
      play('add');
      toast('Calendar added — ' + name);
    }
  }

  function deleteCalendar() {
    if (!editingCalId) return;
    if (state.calendars.length < 2) { calError('Keep at least one calendar.'); return; }
    const cal = state.calendars.find(c => c.id === editingCalId);
    if (!cal) return;
    const n = state.events.filter(e => e.cal === cal.id).length;
    if (!confirmCalDelete) {
      confirmCalDelete = true;
      calDeleteBtn.textContent = n
        ? 'Delete and remove ' + n + ' event' + (n === 1 ? '' : 's')
        : 'Tap again to delete';
      return;
    }
    const calAt = state.calendars.findIndex(c => c.id === cal.id);
    const itsEvents = state.events.filter(e => e.cal === cal.id);
    state.calendars = state.calendars.filter(c => c.id !== cal.id);
    state.events = state.events.filter(e => e.cal !== cal.id);
    state.hidden = state.hidden.filter(h => h !== cal.id);
    pushUndo('deleted the calendar "' + cal.name + '"', () => {
      state.calendars.splice(calAt, 0, cal);
      state.events = state.events.concat(itsEvents);
    });
    save();
    closeCalendarEditor();
    render();
    play('remove');
    toast('Deleted ' + cal.name, true, { label: 'Undo', fn: undoLast });
  }

  if (fRepeat) {
    const syncUntil = () => { fUntilField.hidden = fRepeat.value === 'none'; };
    fRepeat.addEventListener('change', syncUntil);
    syncUntil();
  }

  document.getElementById('calSave').addEventListener('click', saveCalendar);
  document.getElementById('calCancel').addEventListener('click', closeCalendarEditor);
  document.getElementById('closeCal').addEventListener('click', closeCalendarEditor);
  calDeleteBtn.addEventListener('click', deleteCalendar);
  calOverlay.addEventListener('click', ev => { if (ev.target === calOverlay) closeCalendarEditor(); });
  calNameInput.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); saveCalendar(); }
  });

  /* ============================= settings ============================= */

  const settingsOverlay = document.getElementById('settingsOverlay');
  const themeSeg = document.getElementById('themeSeg');
  const weekSeg = document.getElementById('weekSeg');
  const viewSeg = document.getElementById('viewSeg');
  const dayStartSel = document.getElementById('dayStart');
  const dayEndSel = document.getElementById('dayEnd');
  const setTasksOnCal = document.getElementById('setTasksOnCal');
  const setSound = document.getElementById('setSound');
  let confirmReset = false;

  function fillHourSelects() {
    const opts = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${hourName(h)}</option>`).join('');
    dayStartSel.innerHTML = opts;
    dayEndSel.innerHTML = opts;
  }

  function applyHours() {
    HOUR_START = Math.min(22, Math.max(0, Number(state.settings.dayStart)));
    HOUR_END = Math.min(24, Math.max(HOUR_START + 2, Number(state.settings.dayEnd)));
  }

  function renderSettings() {
    const st = state.settings;
    themeSeg.querySelectorAll('[data-theme-pick]').forEach(b => {
      const on = b.dataset.themePick === st.theme;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.getElementById('themeHint').textContent = st.theme === 'device'
      ? 'Following your system setting — currently ' + resolveTheme() + '.'
      : 'Always ' + st.theme + ', whatever the system says.';

    weekSeg.querySelectorAll('[data-week-start]').forEach(b => {
      const on = Number(b.dataset.weekStart) === st.weekStart;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    viewSeg.querySelectorAll('[data-default-view]').forEach(b => {
      const on = b.dataset.defaultView === view;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (!dayStartSel.options.length) fillHourSelects();
    dayStartSel.value = String(st.dayStart);
    dayEndSel.value = String(st.dayEnd);
    renderSkins();
    if (typeof accRender === 'function') accRender();
    setTasksOnCal.checked = !!state.showTasks;
    setSound.checked = !!state.sound;
    const volRow = document.querySelector('.set-row-volume');
    if (volRow) volRow.classList.toggle('is-muted', !state.sound);
    const vol = document.getElementById('soundVolume');
    const volVal = document.getElementById('soundVolumeValue');
    if (vol) vol.value = String(Math.round(soundVolume() * 100));
    if (volVal) volVal.textContent = Math.round(soundVolume() * 100) + '%';

    const g = state.google;
    const taskCount = state.tasks.filter(t => t.gtid && !t.deleted).length;
    document.getElementById('googleSummary').textContent = (g.connected && g.calendars.length)
      ? 'Connected · ' + googleEventCount() + ' events · ' + taskCount + ' tasks · ' +
        (g.auto ? 'auto every ' + (g.interval || 5) + ' min' : 'manual')
      : (state.feeds.length ? state.feeds.length + ' imported .ics calendar' + (state.feeds.length > 1 ? 's' : '') : 'Not connected.');
  }

  function openSettings() {
    play('whoosh');
    revealOverlay(settingsOverlay);
    renderSettings();
  }

  function closeSettings() {
    play('whoosh');
    dismissOverlay(settingsOverlay);
  }

  const SKINS = [
    { id: 'indigo', name: 'Indigo', swatch: 'radial-gradient(120% 120% at 50% 0%, #3B2288, #170F4B)' },
    { id: 'sunset', name: 'Sunset', swatch: 'radial-gradient(120% 120% at 50% 0%, #8A2B63, #2E0C36)' },
    { id: 'midnight', name: 'Midnight', swatch: 'radial-gradient(120% 120% at 50% 0%, #10305A, #060D1C)' },
    { id: 'karat', name: 'Karat', swatch: 'radial-gradient(120% 120% at 50% 0%, #2A2016, #0D0906)' },
    { id: 'modern', name: 'Modern', swatch: 'radial-gradient(120% 120% at 50% 0%, #F7F7FB, #E8E8F0)' },
    { id: 'work', name: 'Work', swatch: 'linear-gradient(180deg, #EAF0F7 0%, #2563EB 140%)' },
    { id: 'minimal', name: 'Minimal', swatch: 'linear-gradient(180deg, #FFFFFF 0%, #EDEDEA 100%)' }
  ];

  function renderSkins() {
    const row = document.getElementById('skinRow');
    if (!row) return;
    row.innerHTML = SKINS.map(sk => `
      <button type="button" class="skin-btn" data-skin="${sk.id}" role="radio"
        aria-pressed="${state.settings.skin === sk.id}" aria-label="${sk.name} skin" title="${sk.name}"
        style="background:${sk.swatch}">
        <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.6 9.6 17 19 7" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`).join('');
    row.querySelectorAll('[data-skin]').forEach(b => {
      b.addEventListener('click', () => {
        state.settings.skin = b.dataset.skin;
        applyTheme();
        save();
        renderSkins();
        play('tick');
      });
    });
    const hint = document.getElementById('skinHint');
    if (hint) {
      const found = SKINS.find(sk => sk.id === state.settings.skin);
      hint.textContent = 'Skin repaints the room and the accent. Paper stays paper, in light and dark.';
      if (found) hint.textContent = found.name + ' — ' + hint.textContent;
    }
  }

  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('closeSettings').addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', ev => { if (ev.target === settingsOverlay) closeSettings(); });

  themeSeg.querySelectorAll('[data-theme-pick]').forEach(b => {
    b.addEventListener('click', () => {
      state.settings.theme = b.dataset.themePick;
      applyTheme();
      save();
      renderSettings();
      play('tick');
    });
  });

  weekSeg.querySelectorAll('[data-week-start]').forEach(b => {
    b.addEventListener('click', () => {
      state.settings.weekStart = Number(b.dataset.weekStart);
      save();
      lastScroll = null;
      render();
      renderSettings();
      play('tick');
    });
  });

  viewSeg.querySelectorAll('[data-default-view]').forEach(b => {
    b.addEventListener('click', () => {
      view = b.dataset.defaultView;
      state.view = view;
      save();
      render();
      renderSettings();
      play('tick');
    });
  });

  dayStartSel.addEventListener('change', () => {
    state.settings.dayStart = Number(dayStartSel.value);
    if (state.settings.dayEnd <= state.settings.dayStart) state.settings.dayEnd = Math.min(23, state.settings.dayStart + 6);
    applyHours();
    save();
    lastScroll = null;
    render();
    renderSettings();
  });

  dayEndSel.addEventListener('change', () => {
    state.settings.dayEnd = Number(dayEndSel.value);
    if (state.settings.dayEnd <= state.settings.dayStart) state.settings.dayStart = Math.max(0, state.settings.dayEnd - 6);
    applyHours();
    save();
    lastScroll = null;
    render();
    renderSettings();
  });

  setTasksOnCal.addEventListener('change', () => {
    state.showTasks = setTasksOnCal.checked;
    save();
    render();
  });

  setSound.addEventListener('change', () => {
    state.sound = setSound.checked;
    save();
    const volRow = document.querySelector('.set-row-volume');
    if (volRow) volRow.classList.toggle('is-muted', !state.sound);
    if (state.sound) play('complete');
  });

  const volumeInput = document.getElementById('soundVolume');
  if (volumeInput) {
    volumeInput.addEventListener('input', () => {
      setSoundVolume(Number(volumeInput.value) / 100);
      const volVal = document.getElementById('soundVolumeValue');
      if (volVal) volVal.textContent = Math.round(soundVolume() * 100) + '%';
      save();
    });
    volumeInput.addEventListener('change', () => {
      setSoundVolume(Number(volumeInput.value) / 100);
      save();
      play('complete');
    });
  }

  document.getElementById('openGoogle').addEventListener('click', () => {
    closeSettings();
    openSyncPanel();
  });

  document.getElementById('backupBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'playday-backup-' + TODAY_STR + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Backup downloaded');
  });

  const restoreInput = document.getElementById('restoreInput');
  document.getElementById('restoreBtn').addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files && restoreInput.files[0];
    restoreInput.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.events) || !Array.isArray(parsed.tasks)) {
        document.getElementById('dataHint').textContent = 'That file does not look like a Playday backup.';
        return;
      }
      localStorage.setItem(KEY, JSON.stringify(parsed));
      location.reload();
    } catch (err) {
      document.getElementById('dataHint').textContent = 'Could not read that file: ' + err.message;
    }
  });

  document.getElementById('exportFromSettings').addEventListener('click', downloadIcs);

  document.getElementById('resetBtn').addEventListener('click', () => {
    const btn = document.getElementById('resetBtn');
    if (!confirmReset) {
      confirmReset = true;
      btn.textContent = 'Tap again to erase';
      setTimeout(() => {
        confirmReset = false;
        btn.textContent = 'Reset everything';
      }, 4000);
      return;
    }
    localStorage.removeItem(KEY);
    location.reload();
  });

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (state.settings.theme !== 'device') return;
      applyTheme();
      if (!settingsOverlay.hidden) renderSettings();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ============================== tasks ============================== */

  let mode = state.mode === 'tasks' ? 'tasks' : 'calendar';
  let openTaskId = null;
  let addingList = false;
  let confirmDeleteList = false;
  let confirmClearDone = false;

  const TICK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12.6 9.6 17 19 7" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const STAR_SVG = '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z" fill="currentColor"/></svg>';

  function listById(id) { return state.lists.find(l => l.id === id) || state.lists[0]; }
  function currentList() { return listById(state.taskList); }
  function openTasksOf(listId) { return state.tasks.filter(t => t.list === listId && !t.done); }
  function doneTasksOf(listId) {
    return state.tasks.filter(t => t.list === listId && t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  }

  function dueInfo(due) {
    if (!due) return null;
    const d = parseYmd(due);
    const today = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    const diff = Math.round((d - today) / 86400000);
    let text;
    if (diff === 0) text = 'Today';
    else if (diff === 1) text = 'Tomorrow';
    else if (diff === -1) text = 'Yesterday';
    else if (diff > 1 && diff < 7) text = DOW_SHORT[(d.getDay() + 6) % 7];
    else text = d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
    return { text, cls: diff < 0 ? 'is-over' : diff === 0 ? 'is-today' : '' };
  }

  function taskRow(t, isDone, opts) {
    const o = opts || {};
    const due = dueInfo(t.due);
    const open = openTaskId === t.id;
    const owner = o.showList ? listById(t.list) : null;
    return `
      <li class="task${isDone ? ' is-done' : ''}${open ? ' is-open' : ''}" data-task="${t.id}" draggable="${isDone || o.noDrag ? 'false' : 'true'}">
        <button class="task-check" data-toggle="${t.id}" aria-pressed="${t.done}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${TICK_SVG}</button>
        <div class="task-main">
          <button class="task-title" data-open="${t.id}">${esc(t.title)}</button>
          <div class="task-meta">
            ${due ? `<span class="due ${due.cls}">${due.text}</span>` : ''}
            ${owner ? `<span class="task-list-tag"><span class="list-dot" style="background:${esc(owner.color)}"></span>${esc(owner.name)}</span>` : ''}
            ${t.notes ? '<span class="task-note-dot" title="Has notes"></span>' : ''}
          </div>
        </div>
        <button class="task-star${t.starred ? ' is-on' : ''}" data-star="${t.id}" aria-pressed="${t.starred}" aria-label="Star task">${STAR_SVG}</button>
        ${open ? `
          <div class="task-edit">
            <label class="task-field"><span>Notes</span>
              <textarea id="taskNotes" rows="2" maxlength="600" placeholder="Anything worth remembering">${esc(t.notes || '')}</textarea>
            </label>
            <div class="task-edit-row">
              <label class="task-field"><span>Due</span>
                <input type="date" id="taskDue" value="${t.due || ''}" />
              </label>
              <div class="spacer"></div>
              <button class="btn btn-danger btn-mini" data-del="${t.id}">Delete</button>
              <button class="btn btn-mini" data-close="${t.id}">Done</button>
            </div>
          </div>` : ''}
      </li>`;
  }

  function dateBuckets() {
    const today = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    const buckets = [
      { key: 'over', label: 'Overdue', note: 'deal with these first', items: [] },
      { key: 'today', label: 'Today', note: '', items: [] },
      { key: 'tomorrow', label: 'Tomorrow', note: '', items: [] },
      { key: 'week', label: 'Next 7 days', note: '', items: [] },
      { key: 'later', label: 'Later', note: '', items: [] },
      { key: 'none', label: 'No date', note: 'waiting for a day', items: [] }
    ];
    state.tasks.filter(t => !t.done).forEach(t => {
      if (!t.due) { buckets[5].items.push(t); return; }
      const diff = Math.round((parseYmd(t.due) - today) / 86400000);
      if (diff < 0) buckets[0].items.push(t);
      else if (diff === 0) buckets[1].items.push(t);
      else if (diff === 1) buckets[2].items.push(t);
      else if (diff <= 7) buckets[3].items.push(t);
      else buckets[4].items.push(t);
    });
    buckets.forEach(b => b.items.sort((a, b2) =>
      String(a.due || '9999-99-99').localeCompare(String(b2.due || '9999-99-99')) ||
      a.title.localeCompare(b2.title)));
    return buckets.filter(b => b.items.length);
  }

  function renderTaskPane() {
    const list = currentList();
    const open = openTasksOf(list.id);
    const done = doneTasksOf(list.id);
    const dates = state.taskView === 'dates';
    const allOpen = state.tasks.filter(t => !t.done);
    const overdue = dateBuckets().find(b => b.key === 'over');

    const switcher = `
      <div class="task-views" role="tablist" aria-label="Task view">
        <button class="tv-btn${dates ? '' : ' is-on'}" data-taskview="list" role="tab" aria-selected="${!dates}">List</button>
        <button class="tv-btn${dates ? ' is-on' : ''}" data-taskview="dates" role="tab" aria-selected="${dates}">Dates</button>
      </div>`;

    const heading = dates
      ? `<h2 class="tasks-title tasks-title-static">All tasks by date</h2>
         <span class="tasks-count">${allOpen.length} open${overdue ? ' · ' + overdue.items.length + ' late' : ''}</span>`
      : `${state.editingList === list.id
            ? `<input class="tasks-title-input" id="listNameInput" value="${esc(list.name)}" maxlength="40" aria-label="List name" />`
            : `<button class="tasks-title" id="listTitleBtn" title="Rename list">${esc(list.name)}</button>`}
         <span class="tasks-count">${open.length} open${done.length ? ' · ' + done.length + ' done' : ''}</span>`;

    const actions = dates
      ? switcher
      : `${switcher}
         ${done.length ? `<button class="btn btn-mini" id="clearDone">${confirmClearDone ? 'Clear ' + done.length + ' for good?' : 'Clear done'}</button>` : ''}
         <button class="btn btn-mini${confirmDeleteList ? ' is-armed' : ''}" id="deleteList">${confirmDeleteList ? 'Tap again to delete' : 'Delete list'}</button>`;

    const groups = dates
      ? dateBuckets().map(b => `
          <section class="task-group">
            <h3 class="task-group-head">
              <span class="task-group-label${b.key === 'over' ? ' is-late' : ''}">${b.label}</span>
              <span class="task-group-count">${b.items.length}</span>
              ${b.note ? `<span class="task-group-note">${b.note}</span>` : ''}
            </h3>
            <ul class="task-list">${b.items.map(t => taskRow(t, false, { showList: true, noDrag: true })).join('')}</ul>
          </section>`).join('')
      : (open.length
          ? `<ul class="task-list" id="taskList">${open.map(t => taskRow(t, false)).join('')}</ul>`
          : `<div class="task-empty">
               <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
                 <rect x="7" y="7" width="34" height="34" rx="12" fill="none" stroke="#191436" stroke-width="2.6" opacity=".55"/>
                 <path d="M16 24.5 22 30l11-12" fill="none" stroke="#2EE6A8" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>
               <b>Nothing on this list.</b>
               <span>Type above and press Enter. A task is a promise you can keep in one tap.</span>
             </div>`);

    const completed = (!dates && done.length)
      ? `<details class="task-done"><summary>Completed · ${done.length}</summary>
           <ul class="task-list is-done">${done.map(t => taskRow(t, true)).join('')}</ul>
         </details>`
      : '';

    main.innerHTML = `
      <section class="tasks">
        <header class="tasks-head">
          <div class="tasks-head-main">${heading}</div>
          <div class="tasks-head-actions">${actions}</div>
        </header>

        <div class="task-add">
          <span class="task-add-dot" aria-hidden="true"></span>
          <input id="taskAddInput" placeholder="Add ${dates ? 'to ' + esc(list.name) : 'a task'}" autocomplete="off" maxlength="140" aria-label="New task" />
          <button class="btn btn-primary btn-mini" id="taskAddBtn">Add</button>
        </div>

        ${dates
          ? (groups || `<div class="task-empty">
               <b>No tasks anywhere yet.</b>
               <span>Add one above and give it a date — it will show up here under the right day.</span>
             </div>`)
          : groups}

        ${completed}

        <p class="task-hint">${dates
          ? 'Everything with a date, across every list. Click a title to change it, or switch to List to add tasks to a specific list.'
          : 'Enter adds the next one. Click a title for notes and a due date. Dated tasks also show on the calendar — switch that off in the calendar list.'}</p>
      </section>`;

    wireTaskRows();
  }

  function renderTaskSidebar() {
    const el = document.getElementById('listList');
    if (!el) return;
    el.innerHTML = state.lists.map(l => {
      const open = openTasksOf(l.id).length;
      return `<li><button class="list-row${l.id === state.taskList ? ' is-on' : ''}" data-list="${l.id}">
        <span class="list-dot" style="background:${esc(l.color)}"></span>
        <span class="list-name">${esc(l.name)}</span>
        <span class="list-count">${open || ''}</span>
      </button></li>`;
    }).join('');

    el.querySelectorAll('[data-list]').forEach(b => {
      b.addEventListener('click', () => {
        state.taskList = b.dataset.list;
        state.taskView = 'list';
        openTaskId = null;
        save();
        render();
        play('tick');
      });
    });

    const addBtn = document.getElementById('newListBtn');
    const existing = document.getElementById('newListInput');
    if (addingList) {
      addBtn.hidden = true;
      if (!existing) {
        const input = document.createElement('input');
        input.id = 'newListInput';
        input.placeholder = 'List name, then Enter';
        input.maxLength = 40;
        input.setAttribute('aria-label', 'New list name');
        addBtn.parentNode.insertBefore(input, addBtn);
        input.focus();
        input.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') {
            const name = input.value.trim();
            if (name) createList(name);
          } else if (ev.key === 'Escape') {
            addingList = false;
            renderTaskSidebar();
          }
        });
        input.addEventListener('blur', () => {
          if (addingList) { addingList = false; renderTaskSidebar(); }
        });
      }
    } else {
      addBtn.hidden = false;
      if (existing) existing.remove();
    }
  }

  function wireTaskRows() {
    main.querySelectorAll('.task[draggable="true"]').forEach(row => {
      row.addEventListener('dragstart', ev => {
        ev.dataTransfer.setData('text/plain', row.dataset.task);
        ev.dataTransfer.effectAllowed = 'move';
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', ev => {
        if (!ev.dataTransfer.types.includes('text/plain')) return;
        ev.preventDefault();
        row.classList.add('drop-before');
      });
      row.addEventListener('dragleave', () => row.classList.remove('drop-before'));
      row.addEventListener('drop', ev => {
        ev.preventDefault();
        row.classList.remove('drop-before');
        moveTaskBefore(ev.dataTransfer.getData('text/plain'), row.dataset.task);
      });
    });
  }

  function moveTaskBefore(id, targetId) {
    const from = state.tasks.findIndex(t => t.id === id);
    if (from < 0 || id === targetId) return;
    const item = state.tasks[from];
    state.tasks.splice(from, 1);
    const to = state.tasks.findIndex(t => t.id === targetId);
    state.tasks.splice(to < 0 ? state.tasks.length : to, 0, item);
    save();
    render();
    play('tick');
  }

  function addTask(title) {
    const list = currentList();
    const task = {
      id: uid(), list: list.id, title: title.trim(), notes: '', due: null,
      starred: false, done: false, doneAt: null, created: Date.now()
    };
    if (list.gtl) { task.src = 'gtasks'; task.dirty = true; }
    state.tasks.unshift(task);
    save();
    render();
    taskPushSoon(task);
    const input = document.getElementById('taskAddInput');
    if (input) { input.value = ''; input.focus(); }
    play('tick');
  }

  function toggleTask(id, x, y) {
    const t = state.tasks.find(x2 => x2.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    if (t.gtid) t.dirty = true;
    save();
    taskPushSoon(t);
    if (t.done) {
      // let the row do its thing before the list re-flows
      const row = document.querySelector('.task[data-task="' + id + '"]');
      if (row) row.classList.add('is-completing');
      setTimeout(() => afterComplete(x, y, t.title + ' · done, +12 XP'), row ? 240 : 0);
    } else {
      play('remove');
      render();
      toast('Back on the list');
    }
  }

  function deleteTask(id) {
    const t = state.tasks.find(x2 => x2.id === id);
    if (t && t.gtid) {
      // keep a tombstone so the next sync can delete it in Google
      if (hasFreshToken()) { taskDeleteSoon(t); state.tasks = state.tasks.filter(x2 => x2.id !== id); }
      else { t.deleted = true; t.dirty = true; }
    } else {
      const at = state.tasks.findIndex(x2 => x2.id === id);
      if (at > -1) {
        const [gone] = state.tasks.splice(at, 1);
        pushUndo('deleted "' + gone.title + '"', () => { state.tasks.splice(at, 0, gone); });
      }
    }
    if (openTaskId === id) openTaskId = null;
    save();
    render();
    play('remove');
    toast('Deleted' + (t ? ' — ' + t.title : ''), true, t && !t.gtid ? { label: 'Undo', fn: undoLast } : undefined);
  }

  function createList(name) {
    const list = { id: 'l' + Math.random().toString(36).slice(2, 8), name: name.slice(0, 40), color: LIST_COLORS[state.lists.length % LIST_COLORS.length] };
    state.lists.push(list);
    if (state.google.connected && state.google.tasksEnabled && hasFreshToken()) {
      tFetch('/users/@me/lists', { method: 'POST', body: JSON.stringify({ title: list.name }) })
        .then(created => {
          if (created && created.id) { list.gtl = created.id; save(); render(); }
        })
        .catch(() => { /* stays a local list */ });
    }
    state.taskList = list.id;
    addingList = false;
    save();
    render();
    play('add');
    toast('List added — ' + list.name);
  }

  function deleteList() {
    if (state.lists.length < 2) { toast('Keep at least one list', false); return; }
    if (!confirmDeleteList) {
      confirmDeleteList = true;
      render();
      setTimeout(() => {
        if (confirmDeleteList) { confirmDeleteList = false; if (mode === 'tasks') render(); }
      }, 4000);
      return;
    }
    const list = currentList();
    const listAt = state.lists.findIndex(l => l.id === list.id);
    const itsTasks = state.tasks.filter(t => t.list === list.id);
    const prevListId = state.taskList;
    state.lists = state.lists.filter(l => l.id !== list.id);
    state.tasks = state.tasks.filter(t => t.list !== list.id);
    state.taskList = state.lists[0].id;
    confirmDeleteList = false;
    openTaskId = null;
    pushUndo('deleted the list "' + list.name + '"', () => {
      state.lists.splice(listAt, 0, list);
      state.tasks = state.tasks.concat(itsTasks);
      state.taskList = prevListId;
    });
    save();
    render();
    toast('Deleted list — ' + list.name, true, { label: 'Undo', fn: undoLast });
  }

  /* ---- mode switch + task events ---- */

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    state.mode = mode;
    lastScroll = null;
    openTaskId = null;
    addingList = false;
    confirmDeleteList = false;
    save();
    render();
    play('tick');
    syncUrl();
  }

  document.querySelectorAll('.mode-btn').forEach(b => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });

  main.addEventListener('click', ev => {
    if (mode !== 'tasks') return;

    const toggle = ev.target.closest('[data-toggle]');
    if (toggle) {
      const r = toggle.getBoundingClientRect();
      toggleTask(toggle.dataset.toggle, r.left + r.width / 2, r.top + r.height / 2);
      return;
    }
    const star = ev.target.closest('[data-star]');
    if (star) {
      const t = state.tasks.find(x => x.id === star.dataset.star);
      if (!t) return;
      t.starred = !t.starred;
      save();
      render();
      play('tick');
      return;
    }
    const openBtn = ev.target.closest('[data-open]');
    if (openBtn) {
      openTaskId = openTaskId === openBtn.dataset.open ? null : openBtn.dataset.open;
      render();
      const notes = document.getElementById('taskNotes');
      if (notes) notes.focus();
      return;
    }
    const close = ev.target.closest('[data-close]');
    if (close) { openTaskId = null; render(); return; }
    const del = ev.target.closest('[data-del]');
    if (del) { deleteTask(del.dataset.del); return; }

    if (ev.target.closest('#taskAddBtn')) {
      const input = document.getElementById('taskAddInput');
      if (input && input.value.trim()) addTask(input.value);
      else if (input) input.focus();
      return;
    }
    if (ev.target.closest('#listTitleBtn')) {
      state.editingList = currentList().id;
      render();
      const input = document.getElementById('listNameInput');
      if (input) { input.focus(); input.select(); }
      return;
    }
    if (ev.target.closest('#clearDone')) {
      const list = currentList();
      const n = doneTasksOf(list.id).length;
      if (!confirmClearDone) {
        confirmClearDone = true;
        render();
        setTimeout(() => { if (confirmClearDone) { confirmClearDone = false; if (mode === 'tasks') render(); } }, 3200);
        return;
      }
      confirmClearDone = false;
      const removed = state.tasks.filter(t => t.list === list.id && t.done);
      state.tasks = state.tasks.filter(t => !(t.list === list.id && t.done));
      pushUndo('cleared ' + n + ' finished task' + (n === 1 ? '' : 's'), () => { state.tasks = state.tasks.concat(removed); });
      save();
      render();
      toast('Cleared ' + n + ' finished task' + (n === 1 ? '' : 's'), true, { label: 'Undo', fn: undoLast });
      return;
    }
    if (ev.target.closest('#deleteList')) { deleteList(); return; }
    const tv = ev.target.closest('[data-taskview]');
    if (tv) {
      state.taskView = tv.dataset.taskview === 'dates' ? 'dates' : 'list';
      openTaskId = null;
      save();
      render();
      play('tick');
      return;
    }
  });

  main.addEventListener('keydown', ev => {
    if (mode !== 'tasks') return;
    const id = ev.target.id;
    if (id === 'taskAddInput' && ev.key === 'Enter') {
      ev.preventDefault();
      const value = ev.target.value.trim();
      if (value) addTask(value);
      return;
    }
    if (id === 'listNameInput') {
      if (ev.key === 'Enter') {
        const value = ev.target.value.trim();
        const list = currentList();
        if (value) {
          list.name = value.slice(0, 40);
          if (list.gtl) list.dirtyName = true;
        }
        state.editingList = null;
        save();
        render();
      } else if (ev.key === 'Escape') {
        state.editingList = null;
        render();
      }
      return;
    }
    if (id === 'taskNotes' || id === 'taskDue') {
      if (ev.key === 'Escape') { openTaskId = null; render(); }
      return;
    }
    if (ev.key === 'Escape' && openTaskId) { openTaskId = null; render(); }
  });

  /* notes and due dates save as you type, without a re-render */
  main.addEventListener('input', ev => {
    if (mode !== 'tasks') return;
    const id = ev.target.id;
    if (id !== 'taskNotes' && id !== 'taskDue') return;
    const t = state.tasks.find(x => x.id === openTaskId);
    if (!t) return;
    if (id === 'taskNotes') t.notes = ev.target.value;
    else t.due = ev.target.value || null;
    if (t.gtid) { t.dirty = true; taskPushSoon(t); }
    save();
    if (id === 'taskDue') {
      const row = document.querySelector('.task.is-open .task-meta');
      if (row) {
        const info = dueInfo(t.due);
        row.innerHTML = (info ? `<span class="due ${info.cls}">${info.text}</span>` : '') +
          (t.notes ? '<span class="task-note-dot" title="Has notes"></span>' : '');
      }
    }
  });

  document.getElementById('newListBtn').addEventListener('click', () => {
    addingList = true;
    renderTaskSidebar();
  });

  /* ======================= google calendar sync ======================= */

  const FEED_COLORS = ['#2B3BFF', '#6B4BFF', '#3FDDA8', '#FFC53D', '#FF5A36', '#0EA5E9'];
  const GIS_SRC = 'https://accounts.google.com/gsi/client';
  const GOOGLE_SCOPE = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/drive.appdata'
  ].join(' ');

  let googleAccessToken = null;
  let googleTokenExpiry = 0;
  let gisLoad = null;
  let silentFailures = 0;
  let syncInFlight = false;

  function contrastText(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return '#FFFFFF';
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.62 ? '#141126' : '#FFFFFF';
  }

  function relTime(ts) {
    if (!ts) return 'never';
    const secs = Math.round((Date.now() - ts) / 1000);
    if (secs < 45) return 'just now';
    if (secs < 3600) return Math.round(secs / 60) + ' min ago';
    if (secs < 86400) return Math.round(secs / 3600) + ' h ago';
    return Math.round(secs / 86400) + ' d ago';
  }

  function googleEventCount() {
    return state.events.filter(e => e.src === 'gapi' && !e.deleted).length;
  }

  /* ---------------- .ics in and out ---------------- */

  function ingestIcs(text, label) {
    const parsed = window.PlaydayICS.parse(text);
    const name = (parsed.name || label || 'Google calendar').replace(/\.ics$/i, '').trim().slice(0, 42) || 'Google calendar';
    let feed = state.feeds.find(f => f.name.toLowerCase() === name.toLowerCase());
    if (feed) {
      state.events = state.events.filter(e => !(e.src === 'ics' && e.feed === feed.id));
    } else {
      feed = { id: 'f' + Math.random().toString(36).slice(2, 8), name, color: FEED_COLORS[state.feeds.length % FEED_COLORS.length], importedAt: 0, count: 0 };
      state.feeds.push(feed);
    }
    feed.importedAt = Date.now();
    feed.count = parsed.events.length;
    parsed.events.forEach(ev => {
      state.events.push({
        id: uid(), src: 'ics', feed: feed.id, uid: ev.uid, cal: 'feed:' + feed.id,
        title: ev.title, date: ev.date, start: ev.start, end: ev.end,
        allDay: !!ev.allDay, where: ev.where || '', notes: ev.notes || '', done: false
      });
    });
    return feed;
  }

  async function handleIcsFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => /\.ics$/i.test(f.name) || /text\/calendar/.test(f.type || ''));
    if (!files.length) {
      syncStatus('That file is not a .ics — Google puts them inside the zip it exports.', true);
      return;
    }
    let total = 0;
    const names = [];
    for (const file of files) {
      try {
        const feed = ingestIcs(await file.text(), file.name);
        total += feed.count;
        names.push(feed.name);
      } catch (err) {
        syncStatus('Could not read ' + file.name + ': ' + (err && err.message ? err.message : err), true);
      }
    }
    save();
    render();
    renderSyncPanel();
    if (names.length) {
      toast('Imported ' + total + ' events from ' + names.length + (names.length > 1 ? ' calendars' : ' calendar'));
      play('add');
    }
  }

  function removeFeed(id) {
    const feed = state.feeds.find(f => f.id === id);
    state.feeds = state.feeds.filter(f => f.id !== id);
    state.events = state.events.filter(e => !(e.src === 'ics' && e.feed === id));
    save();
    render();
    renderSyncPanel();
    toast('Removed ' + (feed ? feed.name : 'feed'));
  }

  function downloadIcs() {
    const text = window.PlaydayICS.build(state.events.filter(e => !e.deleted), 'Playday');
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'playday.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('playday.ics downloaded — import it in Google');
  }

  /* ---------------- google api ---------------- */

  function loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    if (gisLoad) return gisLoad;
    gisLoad = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gisLoad = null;
        reject(new Error('Could not load Google sign-in — check your connection (or an extension blocking it).'));
      };
      document.head.appendChild(script);
    });
    return gisLoad;
  }

  function hasFreshToken() {
    return !!googleAccessToken && Date.now() < googleTokenExpiry - 60000;
  }

  async function googleToken(interactive) {
    if (hasFreshToken()) return googleAccessToken;
    if (!state.google.clientId) throw new Error('Paste your OAuth Client ID first.');
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(state.google.clientId.trim())) {
      throw new Error('That does not look like a Client ID — it should end in .apps.googleusercontent.com with no spaces. ' +
        'If it is right, check the client type is "Web application": Desktop, Android and Chrome-extension clients all fail with invalid_client.');
    }
    if (!interactive && silentFailures > 0) {
      throw new Error('Google needs one tap to reconnect.');
    }
    await loadGis();
    return new Promise((resolve, reject) => {
      let done = false;
      let client;
      try {
        client = window.google.accounts.oauth2.initTokenClient({
          client_id: state.google.clientId,
          scope: GOOGLE_SCOPE,
          callback: resp => {
            done = true;
            if (resp && resp.access_token) {
              googleAccessToken = resp.access_token;
              googleTokenExpiry = Date.now() + Number(resp.expires_in || 3600) * 1000;
              silentFailures = 0;
              resolve(googleAccessToken);
            } else {
              reject(new Error((resp && (resp.error_description || resp.error)) || 'Google did not return a token.'));
            }
          },
          error_callback: err => {
            if (done) return;
            done = true;
            const code = err && (err.type || err.message);
            if (!interactive) silentFailures++;
            if (code === 'popup_closed') { reject(new Error('Sign-in window was closed.')); return; }
            if (code === 'invalid_client') {
              reject(new Error('Google does not recognise that Client ID. Re-copy it in full from Credentials, and make sure the ' +
                'client type is "Web application" — Desktop, Android and Chrome-extension clients fail with exactly this error.'));
              return;
            }
            if (code === 'origin_mismatch' || code === 'idpiframe_initialization_failed') {
              reject(new Error('Google does not recognise this site for that Client ID. Add ' + location.origin +
                ' under "Authorized JavaScript origins" in Google Cloud → Credentials.'));
              return;
            }
            if (code === 'access_denied') { reject(new Error('Access was denied on the Google consent screen.')); return; }
            reject(new Error('Sign-in failed: ' + (code || 'unknown error')));
          }
        });
        client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function gfetch(path, options) {
    const opts = options || {};
    const token = await googleToken(false);
    const res = await fetch('https://www.googleapis.com/calendar/v3' + path, {
      method: opts.method || 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: opts.body
    });
    if (res.status === 401) {
      googleAccessToken = null;
      googleTokenExpiry = 0;
      throw new Error('Google session expired — press Sync now again.');
    }
    if (res.status === 410) {
      const err = new Error('Sync token expired');
      err.gone = true;
      throw err;
    }
    if (!res.ok) {
      let message = res.status + ' ' + res.statusText;
      try {
        const body = await res.json();
        if (body && body.error && body.error.message) message = body.error.message;
      } catch (err) { /* keep the status text */ }
      throw new Error(message);
    }
    return res.status === 204 ? null : res.json();
  }

  async function tFetch(path, options) {
    const opts = options || {};
    const token = await googleToken(false);
    const res = await fetch('https://tasks.googleapis.com/tasks/v1' + path, {
      method: opts.method || 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: opts.body
    });
    if (res.status === 401) {
      googleAccessToken = null;
      googleTokenExpiry = 0;
      throw new Error('Google session expired — press Sync now again.');
    }
    if (!res.ok) {
      let message = res.status + ' ' + res.statusText;
      try {
        const body = await res.json();
        if (body && body.error && body.error.message) message = body.error.message;
      } catch (err) { /* keep the status text */ }
      throw new Error(message);
    }
    return res.status === 204 ? null : res.json();
  }

  function isoLocal(dateStr, timeStr) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm).toISOString();
  }

  function toGoogleBody(e) {
    const body = { summary: e.title };
    if (e.where) body.location = e.where;
    if (e.notes) body.description = e.notes;
    if (e.allDay) {
      body.start = { date: e.date };
      body.end = { date: ymd(addDays(parseYmd(e.date), 1)) };
    } else {
      let end = e.end;
      if (toMin(end) <= toMin(e.start)) {
        const startMin = toMin(e.start) + 30;
        end = pad(Math.floor(startMin / 60) % 24) + ':' + pad(startMin % 60);
        if (startMin >= 1440) end = '23:59';
      }
      body.start = { dateTime: isoLocal(e.date, e.start) };
      body.end = { dateTime: isoLocal(e.date, end) };
    }
    return body;
  }

  async function googlePush(e) {
    if (!e.gcal) return;
    const body = JSON.stringify(toGoogleBody(e));
    if (!e.gid) {
      const created = await gfetch('/calendars/' + encodeURIComponent(e.gcal) + '/events', { method: 'POST', body });
      e.gid = created && created.id;
    } else {
      await gfetch('/calendars/' + encodeURIComponent(e.gcal) + '/events/' + encodeURIComponent(e.gid), { method: 'PATCH', body });
    }
    e.dirty = false;
    save();
  }

  async function googleDelete(e) {
    if (!e.gcal || !e.gid) return;
    await gfetch('/calendars/' + encodeURIComponent(e.gcal) + '/events/' + encodeURIComponent(e.gid), { method: 'DELETE' });
  }

  function googlePushSoon(e) {
    if (!hasFreshToken()) return; // queued: the next manual sync pushes it
    googlePush(e).catch(err => {
      e.dirty = true;
      save();
      syncStatus('Saved here — Google push failed (' + err.message + '). It will retry on the next sync.', true);
      toast('Saved locally — Google sync will retry', false);
    });
  }

  function upsertGoogleEvent(cal, item) {
    const calId = 'g:' + cal.id;
    const existing = state.events.find(e => e.src === 'gapi' && e.gid === item.id && e.gcal === cal.id);
    if (item.status === 'cancelled') {
      if (existing) state.events = state.events.filter(e => e !== existing);
      return;
    }
    if (existing && existing.dirty) return; // a local edit wins until it is pushed
    const allDay = !!(item.start && item.start.date);
    let date, start, end;
    if (allDay) {
      date = item.start.date;
      start = '00:00';
      end = '23:59';
    } else {
      const s = new Date(item.start.dateTime);
      const en = new Date(item.end.dateTime);
      date = ymd(s);
      start = pad(s.getHours()) + ':' + pad(s.getMinutes());
      end = ymd(en) === date ? pad(en.getHours()) + ':' + pad(en.getMinutes()) : '23:59';
      if (toMin(end) <= toMin(start)) end = '23:59';
    }
    const fields = {
      title: item.summary || 'Untitled event',
      date, start, end, allDay,
      where: item.location || '',
      notes: item.description || '',
      cal: calId, gcal: cal.id, gid: item.id, src: 'gapi', deleted: false
    };
    if (existing) Object.assign(existing, fields);
    else state.events.push(Object.assign({ id: uid(), done: false }, fields));
  }

  async function pullCalendar(cal) {
    let pulled = 0;
    let page = 0;
    const params = new URLSearchParams({ singleEvents: 'true', maxResults: '2500', showDeleted: 'true' });
    if (cal.token) params.set('syncToken', cal.token);
    else params.set('timeMin', new Date(Date.now() - 120 * 864e5).toISOString());
    while (page++ < 15) {
      let data;
      try {
        data = await gfetch('/calendars/' + encodeURIComponent(cal.id) + '/events?' + params.toString());
      } catch (err) {
        if (err.gone && cal.token) {
          cal.token = null;
          state.events = state.events.filter(e => !(e.src === 'gapi' && e.gcal === cal.id));
          return pullCalendar(cal);
        }
        throw err;
      }
      (data.items || []).forEach(item => { upsertGoogleEvent(cal, item); pulled++; });
      if (data.nextPageToken) {
        params.set('pageToken', data.nextPageToken);
        continue;
      }
      if (data.nextSyncToken) cal.token = data.nextSyncToken;
      break;
    }
    return pulled;
  }

  async function pushQueue() {
    let pushed = 0;
    const queue = state.events.filter(e => e.src === 'gapi' && e.dirty);
    for (const e of queue) {
      try {
        if (e.deleted) {
          await googleDelete(e);
          state.events = state.events.filter(x => x !== e);
        } else {
          await googlePush(e);
        }
        pushed++;
      } catch (err) {
        syncStatus('Could not push "' + e.title + '": ' + err.message, true);
      }
    }
    return pushed;
  }


  /* ------------------------- google tasks sync ------------------------- */

  const LIST_COLORS = ['#3B5BFF', '#7B68FF', '#2EE6A8', '#FFC53D', '#FF6B4A', '#FF2E7A'];

  function googleDueToDate(due) {
    return due ? String(due).slice(0, 10) : null;
  }

  function toGoogleTask(t) {
    return {
      title: t.title,
      notes: t.notes || '',
      due: t.due ? new Date(t.due + 'T00:00:00.000Z').toISOString() : null,
      status: t.done ? 'completed' : 'needsAction'
    };
  }

  function listForGoogle(gtl) {
    let list = state.lists.find(l => l.gtl === gtl.id);
    if (!list) {
      // a local list with the same name adopts the Google one instead of duplicating it
      const sameName = state.lists.find(l => !l.gtl &&
        l.name.trim().toLowerCase() === String(gtl.title || '').trim().toLowerCase());
      if (sameName) {
        sameName.gtl = gtl.id;
        list = sameName;
      } else {
        list = {
          id: 'l' + Math.random().toString(36).slice(2, 8),
          name: gtl.title || 'Google list',
          color: LIST_COLORS[state.lists.length % LIST_COLORS.length],
          gtl: gtl.id
        };
        state.lists.push(list);
      }
    } else if (!list.dirtyName && gtl.title && list.name !== gtl.title) {
      list.name = gtl.title;
    }
    return list;
  }

  async function pullGoogleTaskLists() {
    const data = await tFetch('/users/@me/lists?maxResults=100');
    const items = data.items || [];
    const known = new Map(state.google.taskLists.map(l => [l.id, l]));
    state.google.taskLists = items.map(l => {
      const prev = known.get(l.id);
      return {
        id: l.id,
        title: l.title,
        updated: l.updated,
        selected: prev ? prev.selected !== false : true
      };
    });
    return state.google.taskLists;
  }

  function upsertGoogleTask(listId, item) {
    const existing = state.tasks.find(t => t.src === 'gtasks' && t.gtid === item.id && t.list === listId);
    if (item.deleted) {
      if (existing) state.tasks = state.tasks.filter(t => t !== existing);
      return 0;
    }
    if (existing && existing.dirty) return 0;
    const done = item.status === 'completed';
    const fields = {
      title: item.title || 'Untitled task',
      notes: item.notes || '',
      due: googleDueToDate(item.due),
      done,
      doneAt: done ? (item.completed ? Date.parse(item.completed) : Date.now()) : null,
      list: listId,
      src: 'gtasks',
      gtid: item.id
    };
    if (existing) {
      Object.assign(existing, fields);
    } else {
      state.tasks.push(Object.assign({ id: uid(), starred: false, created: Date.now() }, fields));
    }
    return 1;
  }

  async function pullGoogleTasks(list) {
    let pulled = 0;
    let pageToken = '';
    let pages = 0;
    const seen = new Set();
    while (pages++ < 12) {
      const query = '?showCompleted=true&showHidden=true&maxResults=100' +
        (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      const data = await tFetch('/lists/' + encodeURIComponent(list.gtl) + '/tasks' + query);
      (data.items || []).forEach(item => {
        seen.add(item.id);
        pulled += upsertGoogleTask(list.id, item);
      });
      if (data.nextPageToken) { pageToken = data.nextPageToken; continue; }
      break;
    }
    // anything that came from Google and is no longer there was deleted in Google
    const stale = state.tasks.filter(t => t.src === 'gtasks' && t.list === list.id && !seen.has(t.gtid) && !t.dirty);
    if (stale.length) state.tasks = state.tasks.filter(t => stale.indexOf(t) === -1);
    // tasks that existed before this list was linked still need to go up
    state.tasks.forEach(t => {
      if (t.list === list.id && !t.gtid && !t.deleted) t.dirty = true;
    });
    return pulled;
  }

  async function pushTask(t) {
    const list = state.lists.find(l => l.id === t.list);
    if (!list || !list.gtl) return false;
    const body = JSON.stringify(toGoogleTask(t));
    if (!t.gtid) {
      const created = await tFetch('/lists/' + encodeURIComponent(list.gtl) + '/tasks', { method: 'POST', body });
      t.gtid = created && created.id;
    } else {
      await tFetch('/lists/' + encodeURIComponent(list.gtl) + '/tasks/' + encodeURIComponent(t.gtid), { method: 'PATCH', body });
    }
    t.src = 'gtasks';
    t.dirty = false;
    return true;
  }

  async function deleteTaskRemote(t) {
    const list = state.lists.find(l => l.id === t.list);
    if (!list || !list.gtl || !t.gtid) return false;
    await tFetch('/lists/' + encodeURIComponent(list.gtl) + '/tasks/' + encodeURIComponent(t.gtid), { method: 'DELETE' });
    return true;
  }

  async function pushTaskQueue() {
    let pushed = 0;
    const queue = state.tasks.filter(t => t.dirty);
    for (const t of queue) {
      try {
        if (t.deleted) {
          await deleteTaskRemote(t);
          state.tasks = state.tasks.filter(x => x !== t);
        } else if (await pushTask(t)) {
          pushed++;
        }
      } catch (err) {
        syncStatus('Could not push task "' + t.title + '": ' + err.message, true);
      }
    }
    // renames of synced lists
    for (const list of state.lists.filter(l => l.gtl && l.dirtyName)) {
      try {
        await tFetch('/users/@me/lists/' + encodeURIComponent(list.gtl), {
          method: 'PATCH',
          body: JSON.stringify({ title: list.name })
        });
        list.dirtyName = false;
        pushed++;
      } catch (err) {
        syncStatus('Could not rename list: ' + err.message, true);
      }
    }
    return pushed;
  }

  async function syncGoogleTasks() {
    const g = state.google;
    if (!g.tasksEnabled) return { pulled: 0, pushed: 0 };
    await pullGoogleTaskLists();
    let pulled = 0;
    for (const gtl of g.taskLists.filter(l => l.selected !== false)) {
      const list = listForGoogle(gtl);
      pulled += await pullGoogleTasks(list);
    }
    const pushed = await pushTaskQueue();
    return { pulled, pushed };
  }

  function taskPushSoon(t) {
    const list = state.lists.find(l => l.id === t.list);
    if (!list || !list.gtl) return;
    if (!hasFreshToken()) return; // queued for the next sync
    pushTask(t).catch(err => {
      t.dirty = true;
      save();
      syncStatus('Saved here — Google Tasks push failed (' + err.message + ')', true);
    });
  }

  function taskDeleteSoon(t) {
    const list = state.lists.find(l => l.id === t.list);
    if (!list || !list.gtl || !t.gtid) return;
    if (!hasFreshToken()) return;
    deleteTaskRemote(t).catch(() => { /* stays queued as a tombstone */ });
  }

  async function googleSyncNow(opts) {
    const auto = !!(opts && opts.auto);
    const g = state.google;
    if (!g.clientId) {
      if (!auto) syncStatus('Paste your OAuth Client ID first.', true);
      return;
    }
    if (syncInFlight) return;
    if (auto && (!g.auto || !g.connected || !g.calendars.length)) return;
    syncInFlight = true;
    if (!auto) {
      setBusy(true);
      syncStatus('Talking to Google…');
    }
    try {
      await googleToken(!auto);
      const list = await gfetch('/users/me/calendarList?minAccessRole=reader&maxResults=250');
      const items = list.items || [];
      if (!g.calendars.length) {
        g.calendars = items.map(c => ({
          id: c.id, summary: c.summary, backgroundColor: c.backgroundColor,
          primary: !!c.primary, selected: !!c.primary, token: null
        }));
        if (!g.calendars.some(c => c.selected) && g.calendars[0]) g.calendars[0].selected = true;
      } else {
        g.calendars = g.calendars.map(c => {
          const found = items.find(i => i.id === c.id);
          return found ? Object.assign({}, c, { summary: found.summary, backgroundColor: found.backgroundColor }) : c;
        });
      }
      let pulled = 0;
      for (const cal of g.calendars.filter(c => c.selected)) pulled += await pullCalendar(cal);
      let pushed = await pushQueue();
      let taskInfo = { pulled: 0, pushed: 0 };
      if (g.tasksEnabled) {
        try {
          taskInfo = await syncGoogleTasks();
        } catch (err) {
          syncStatus('Calendars synced, tasks failed: ' + err.message, true);
        }
      }
      g.connected = true;
      g.lastSync = Date.now();
      g.lastError = '';
      g.needsAuth = false;
      save();
      // never yank focus out of a field inside the calendar/task pane
      const active = document.activeElement;
      const typingInPane = active && main.contains(active) &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
      if (!typingInPane) render();
      updateSyncCard();
      if (syncOverlay && !syncOverlay.hidden) renderSyncPanel();
      if (!auto) {
        const bits = [];
        if (pulled) bits.push(pulled + ' event' + (pulled === 1 ? '' : 's'));
        if (taskInfo.pulled) bits.push(taskInfo.pulled + ' task' + (taskInfo.pulled === 1 ? '' : 's'));
        const up = pushed + taskInfo.pushed;
        syncStatus((bits.length ? 'Pulled ' + bits.join(' and ') + ' from Google' : 'Nothing new from Google') +
          (up ? ' · pushed ' + up + ' up' : '') + '.', false);
        toast('Google Calendar synced');
      }
      startAutoSync();
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      state.google.lastError = message;
      // an auth problem needs a click; anything else just retries on the next tick
      if (auto && /reconnect|sign-in|popup|token|expired|credential/i.test(message)) {
        state.google.needsAuth = true;
      }
      save();
      updateSyncCard();
      if (syncOverlay && !syncOverlay.hidden) renderSyncPanel();
      if (!auto) syncStatus(message, true);
    } finally {
      syncInFlight = false;
      if (!auto) setBusy(false);
    }
  }

  /* ---------------- sync panel ui ---------------- */

  const syncOverlay = document.getElementById('syncOverlay');
  const clientIdInput = document.getElementById('clientIdInput');
  const apiStatusEl = document.getElementById('apiStatus');
  const apiPill = document.getElementById('apiPill');
  const connectBtn = document.getElementById('connectBtn');
  const syncNowBtn = document.getElementById('syncNowBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const syncCalList = document.getElementById('syncCalList');
  const feedListEl = document.getElementById('feedList');
  const dropzone = document.getElementById('dropzone');
  const icsInput = document.getElementById('icsInput');

  function syncStatus(msg, isErr) {
    apiStatusEl.textContent = msg || '';
    apiStatusEl.className = 'sync-status' + (isErr ? ' err' : msg ? ' ok' : '');
  }

  function setBusy(busy) {
    [connectBtn, syncNowBtn, disconnectBtn].forEach(b => { b.disabled = busy; });
    connectBtn.textContent = busy ? 'Working…' : 'Connect & sync';
  }

  function openSyncPanel() {
    play('whoosh');
    revealOverlay(syncOverlay);
    renderSyncPanel();
  }

  function closeSyncPanel() {
    play('whoosh');
    dismissOverlay(syncOverlay);
  }

  function renderSyncPanel() {
    const g = state.google;
    const connected = !!(g.connected && g.calendars.length);
    clientIdInput.value = g.clientId || '';
    apiPill.textContent = connected ? 'connected' : g.clientId ? 'ready' : 'not set up';
    apiPill.className = 'sync-pill' + (connected ? ' on' : '');
    connectBtn.hidden = connected;
    syncNowBtn.hidden = !connected;
    syncNowBtn.textContent = g.needsAuth ? 'Reconnect' : 'Sync now';
    disconnectBtn.hidden = !connected;

    const originHintEl = document.getElementById('originHint');
    const fileWarnEl = document.getElementById('originFileWarn');
    const liveOrigin = /^https?:/.test(location.protocol);
    if (originHintEl) originHintEl.textContent = liveOrigin ? location.origin : 'file:// — cannot be authorised';
    if (fileWarnEl) fileWarnEl.hidden = liveOrigin;

    if (connected && g.needsAuth) {
      syncStatus('Google needs one tap to reconnect — auto-sync is paused until then.', true);
    } else if (connected) {
      syncStatus('Connected' + (g.auto ? ' · auto-sync every ' + (g.interval || 5) + ' min' : ' · manual') +
        ' · ' + googleEventCount() + ' Google events · last sync ' + relTime(g.lastSync) + '.', false);
    } else if (g.lastError) {
      syncStatus(g.lastError, true);
    } else if (g.clientId) {
      syncStatus('Client ID saved. Press Connect & sync to authorise.');
    } else {
      syncStatus('');
    }

    const autoRow = document.getElementById('autoRow');
    if (autoRow) {
      autoRow.hidden = !connected;
      const toggle = document.getElementById('autoToggle');
      const every = document.getElementById('autoInterval');
      if (toggle) toggle.checked = !!g.auto;
      if (every) every.value = String(g.interval || 5);
    }

    const calLabel = document.getElementById('syncCalLabel');
    if (calLabel) calLabel.hidden = !g.calendars.length;
    syncCalList.hidden = !g.calendars.length;
    syncCalList.innerHTML = g.calendars.map(c => `
      <label class="sync-cal">
        <input type="checkbox" data-gcal="${esc(c.id)}" ${c.selected ? 'checked' : ''} />
        <span class="dot" style="background:${esc(c.backgroundColor || '#2B3BFF')}"></span>
        <span>${esc(c.summary || c.id)}</span>
      </label>`).join('');
    syncCalList.querySelectorAll('[data-gcal]').forEach(input => {
      input.addEventListener('change', () => {
        const cal = state.google.calendars.find(c => c.id === input.dataset.gcal);
        if (!cal) return;
        cal.selected = input.checked;
        cal.token = null;
        if (!cal.selected) state.events = state.events.filter(e => !(e.src === 'gapi' && e.gcal === cal.id));
        save();
        render();
      });
    });

    // google task lists
    const taskLists = g.taskLists || [];
    const taskLabel = document.getElementById('syncTaskLabel');
    const taskEl = document.getElementById('syncTaskLists');
    if (taskLabel) taskLabel.hidden = !taskLists.length;
    if (taskEl) {
      taskEl.hidden = !taskLists.length;
      taskEl.innerHTML = taskLists.map(l => {
        const local = state.lists.find(x => x.gtl === l.id);
        const open = local ? state.tasks.filter(t => t.list === local.id && !t.done && !t.deleted).length : 0;
        return `<label class="sync-cal">
          <input type="checkbox" data-gtl="${esc(l.id)}" ${l.selected !== false ? 'checked' : ''} />
          <span class="dot" style="background:${local ? esc(local.color) : '#2EE6A8'}"></span>
          <span>${esc(l.title)}</span>
          <span class="sync-count">${open}</span>
        </label>`;
      }).join('');
      taskEl.querySelectorAll('[data-gtl]').forEach(input => {
        input.addEventListener('change', () => {
          const gtl = state.google.taskLists.find(l => l.id === input.dataset.gtl);
          if (!gtl) return;
          gtl.selected = input.checked;
          save();
          renderSyncPanel();
        });
      });
    }

    feedListEl.innerHTML = state.feeds.length
      ? state.feeds.map(f => `
        <li class="feed-row">
          <span class="dot" style="background:${esc(f.color)}"></span>
          <span>${esc(f.name)}</span>
          <span class="meta">${f.count} events · ${relTime(f.importedAt)}</span>
          <button data-remove-feed="${esc(f.id)}" aria-label="Remove ${esc(f.name)}">Remove</button>
        </li>`).join('')
      : '';
    feedListEl.querySelectorAll('[data-remove-feed]').forEach(b => {
      b.addEventListener('click', () => removeFeed(b.dataset.removeFeed));
    });
  }

  function updateSyncCard() {
    const g = state.google;
    const statusEl = document.getElementById('gsyncStatus');
    const btn = document.getElementById('gsyncBtn');
    if (!statusEl || !btn) return;
    const imported = state.events.filter(e => e.src === 'ics' && !e.deleted).length;
    void imported;
    const google = googleEventCount();
    statusEl.classList.remove('is-warn');
    if (g.connected && g.calendars.length) {
      if (g.needsAuth) {
        statusEl.textContent = 'Reconnect to keep syncing';
        statusEl.classList.add('is-warn');
        btn.textContent = 'Reconnect';
      } else {
        statusEl.textContent = (g.auto ? 'Auto · ' : '') + google + (google === 1 ? ' event' : ' events') + ' · ' + relTime(g.lastSync);
        btn.textContent = 'Sync now';
      }
    } else if (imported) {
      statusEl.textContent = imported + (imported === 1 ? ' imported event' : ' imported events');
      btn.textContent = 'Sync from Google';
    } else {
      statusEl.textContent = 'Not connected';
      btn.textContent = 'Sync from Google';
    }
  }

  clientIdInput.addEventListener('input', () => {
    state.google.clientId = clientIdInput.value.trim();
    save();
    renderSyncPanel();
  });
  connectBtn.addEventListener('click', () => googleSyncNow());
  syncNowBtn.addEventListener('click', () => googleSyncNow());
  disconnectBtn.addEventListener('click', () => {
    state.google = { clientId: state.google.clientId, calendars: [], lastSync: null, connected: false };
    googleAccessToken = null;
    googleTokenExpiry = 0;
    silentFailures = 0;
    state.events = state.events.filter(e => e.src !== 'gapi');
    save();
    stopAutoSync();
    render();
    renderSyncPanel();
    toast('Disconnected from Google');
  });
  document.getElementById('closeSync').addEventListener('click', closeSyncPanel);
  syncOverlay.addEventListener('click', ev => { if (ev.target === syncOverlay) closeSyncPanel(); });
  document.getElementById('exportBtn').addEventListener('click', downloadIcs);

  dropzone.addEventListener('click', () => icsInput.click());
  icsInput.addEventListener('change', () => { handleIcsFiles(icsInput.files); icsInput.value = ''; });
  ['dragenter', 'dragover'].forEach(type => {
    dropzone.addEventListener(type, ev => { ev.preventDefault(); dropzone.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(type => {
    dropzone.addEventListener(type, ev => { ev.preventDefault(); dropzone.classList.remove('over'); });
  });
  dropzone.addEventListener('drop', ev => {
    if (ev.dataTransfer && ev.dataTransfer.files) handleIcsFiles(ev.dataTransfer.files);
  });

  document.getElementById('gsyncBtn').addEventListener('click', () => {
    if (state.google.connected && state.google.calendars.length) googleSyncNow();
    else openSyncPanel();
  });
  document.getElementById('gsyncMore').addEventListener('click', openSyncPanel);


  /* ---- automatic sync ---- */

  let autoTimer = null;
  let clockTimer = null;

  function stopAutoSync() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }

  function startAutoSync() {
    stopAutoSync();
    if (state.google.auto && state.google.connected && state.google.calendars.length) {
      const mins = Math.max(1, Number(state.google.interval) || 5);
      autoTimer = setInterval(() => maybeAutoSync('timer'), mins * 60000);
    }
    if (!clockTimer) {
      clockTimer = setInterval(() => {
        updateSyncCard();
        if (syncOverlay && !syncOverlay.hidden) {
          const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
          if (!typing) renderSyncPanel();
        }
      }, 30000);
    }
  }

  function maybeAutoSync(reason) {
    const g = state.google;
    if (!g.auto || !g.connected || !g.calendars.length) return;
    if (g.needsAuth) return;
    if (syncInFlight) return;
    if (document.visibilityState !== 'visible') return;
    if (reason === 'focus' && Date.now() - (g.lastSync || 0) < 30000) return;
    googleSyncNow({ auto: true, reason: reason });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybeAutoSync('focus');
  });
  window.addEventListener('online', () => maybeAutoSync('online'));
  window.addEventListener('focus', () => maybeAutoSync('focus'));

  const autoToggle = document.getElementById('autoToggle');
  if (autoToggle) {
    autoToggle.addEventListener('change', () => {
      state.google.auto = autoToggle.checked;
      save();
      startAutoSync();
      renderSyncPanel();
      updateSyncCard();
      toast(state.google.auto ? 'Auto-sync on' : 'Auto-sync off', false);
      if (state.google.auto) maybeAutoSync('manual-toggle');
    });
  }

  const autoInterval = document.getElementById('autoInterval');
  if (autoInterval) {
    autoInterval.addEventListener('change', () => {
      state.google.interval = Number(autoInterval.value) || 5;
      save();
      startAutoSync();
      renderSyncPanel();
      toast('Syncing every ' + state.google.interval + ' min', false);
    });
  }

  /* keep the sidebar card honest after every render */
  const baseRender = render;
  render = function () {
    baseRender();
    updateSyncCard();
  };



  /* ============================ firebase sync ============================ */
  /* Optional cloud sync. The config comes from window.__FIREBASE_CONFIG, which
     build.js writes from env vars. Nothing here loads until you sign in. */

  const FB_VERSION = '11.0.2';
  const FB_BASE = 'https://www.gstatic.com/firebasejs/' + FB_VERSION + '/';
  const FB_CFG = window.__FIREBASE_CONFIG || null;
  let fb = null;
  let fbUnsub = null;
  let fbPushTimer = null;
  let fbApplying = false;
  let fbQuiet = false;
  const FB_CLIENT = 'c' + Math.random().toString(36).slice(2, 8);

  const accEmailEl = document.getElementById('accEmail');
  const accPassEl = document.getElementById('accPass');
  const accErrorEl = document.getElementById('accError');
  const accPill = document.getElementById('fbPill');
  const accStatusEl = document.getElementById('fbStatus');
  const accAuthBox = document.getElementById('fbAuth');
  const accOutRow = document.getElementById('accOutRow');
  const fbNoConfig = document.getElementById('fbNoConfig');
  const fbNote = document.getElementById('fbNote');
  const mergeOverlay = document.getElementById('mergeOverlay');

  const FB_ERRORS = {
    'auth/invalid-email': 'That email address does not look right.',
    'auth/missing-password': 'Type a password too.',
    'auth/user-not-found': 'No account with that email on this project.',
    'auth/wrong-password': 'That password does not match.',
    'auth/invalid-credential': 'Email or password is wrong.',
    'auth/invalid-login-credentials': 'Email or password is wrong.',
    'auth/email-already-in-use': 'That email already has an account — sign in instead.',
    'auth/weak-password': 'Passwords need at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/operation-not-allowed': 'Email/Password sign-in is off in your Firebase project.',
    'auth/network-request-failed': 'No network — try again when you are back.',
    'auth/unauthorized-domain': 'This domain is not authorised in your Firebase project. Add it under Authentication → Settings → Authorized domains.',
    'auth/configuration-not-found': 'Email/Password sign-in is not enabled in your Firebase project.',
    'auth/api-key-not-valid': 'The Firebase apiKey in this build is not valid — check FIREBASE_API_KEY.',
    'auth/invalid-api-key': 'The Firebase apiKey in this build is not valid — check FIREBASE_API_KEY.',
    'auth/app-not-authorized': 'This domain is not authorised for this Firebase app.',
    'auth/internal-error': 'Firebase returned an internal error — usually a bad config value.'
  };

  function accError(msg) {
    accErrorEl.textContent = msg;
    accErrorEl.hidden = false;
    play('error');
  }
  function fbNiceError(err) {
    const code = err && err.code ? err.code : '';
    return FB_ERRORS[code] || (err && err.message ? err.message : 'Something went wrong.');
  }

  async function fbLoad() {
    if (fb) return fb;
    if (!FB_CFG) throw new Error('No Firebase config in this build.');
    const [appMod, authMod, fsMod] = await Promise.all([
      import(FB_BASE + 'firebase-app.js'),
      import(FB_BASE + 'firebase-auth.js'),
      import(FB_BASE + 'firebase-firestore.js')
    ]);
    const app = appMod.initializeApp(FB_CFG);
    fb = { app, auth: authMod.getAuth(app), db: fsMod.getFirestore(app), A: authMod, F: fsMod };
    authMod.onAuthStateChanged(fb.auth, user => {
      state.account = user ? { uid: user.uid, email: user.email || '' } : null;
      save();
      accRender();
      if (user) fbStart(); else fbStop();
    });
    return fb;
  }

  const fbDoc = () => fb.F.doc(fb.db, 'users', state.account.uid, 'state', 'main');

  function fbPayload() {
    return {
      writer: FB_CLIENT,
      updatedAt: Date.now(),
      events: state.events,
      tasks: state.tasks,
      lists: state.lists,
      calendars: state.calendars,
      feeds: state.feeds,
      hidden: state.hidden,
      settings: state.settings,
      sound: state.sound,
      showTasks: state.showTasks
    };
  }

  function fbMerge(remote) {
    const ids = k => new Set((state[k] || []).map(x => x.id));
    const add = (k, list) => {
      const seen = ids(k);
      const extra = (list || []).filter(x => !seen.has(x.id));
      state[k] = state[k].concat(extra);
      return extra.length;
    };
    return add('events', remote.events) + add('tasks', remote.tasks) +
      add('lists', remote.lists) + add('calendars', remote.calendars);
  }

  function fbApply(remote) {
    if (!remote || fbApplying) return;
    fbApplying = true;
    try {
      if (Array.isArray(remote.events)) state.events = remote.events;
      if (Array.isArray(remote.tasks)) state.tasks = remote.tasks;
      if (Array.isArray(remote.lists) && remote.lists.length) state.lists = remote.lists;
      if (Array.isArray(remote.calendars) && remote.calendars.length) state.calendars = remote.calendars;
      if (Array.isArray(remote.feeds)) state.feeds = remote.feeds;
      if (Array.isArray(remote.hidden)) state.hidden = remote.hidden;
      if (remote.settings) state.settings = remote.settings;
      if (typeof remote.sound === 'boolean') state.sound = remote.sound;
      if (typeof remote.showTasks === 'boolean') state.showTasks = remote.showTasks;
      fbQuiet = true;
      save();
      fbQuiet = false;
      render();
      accRender();
    } finally {
      fbApplying = false;
    }
  }

  async function fbStart() {
    if (!fb || !state.account) return;
    if (fbUnsub) { fbUnsub(); fbUnsub = null; }
    try {
      const snap = await fb.F.getDoc(fbDoc());
      const localHasData = state.events.length > 0 || state.tasks.length > 0;
      if (!snap.exists() && localHasData) {
        if (typeof closeSettings === 'function') closeSettings();
        mergeOverlay.hidden = false;
        document.getElementById('mergeUpload').onclick = () => {
          mergeOverlay.hidden = true;
          fbPushNow().then(() => toast('Uploaded this device into your account'));
        };
        document.getElementById('mergeEmpty').onclick = () => {
          mergeOverlay.hidden = true;
          fbPushNow().then(() => toast('Starting empty — this device stays as it is'));
        };
      } else if (snap.exists()) {
        const added = fbMerge(snap.data());
        save();
        render();
        if (added) toast('Pulled ' + added + ' item' + (added === 1 ? '' : 's') + ' from your account');
        await fbPushNow();
      } else {
        await fbPushNow();
      }
      fbUnsub = fb.F.onSnapshot(fbDoc(), doc => {
        if (!doc.exists()) return;
        const data = doc.data();
        if (data.writer === FB_CLIENT) return;
        fbApply(data);
      }, err => accError('Live sync stopped: ' + err.message));
    } catch (err) {
      accError('Could not read your account: ' + err.message);
    }
    accRender();
  }

  function fbStop() {
    if (fbUnsub) { fbUnsub(); fbUnsub = null; }
    if (fbPushTimer) { clearTimeout(fbPushTimer); fbPushTimer = null; }
    accRender();
  }

  async function fbPushNow() {
    if (!fb || !state.account) return;
    try {
      await fb.F.setDoc(fbDoc(), fbPayload());
      state.account.lastSync = Date.now();
      fbQuiet = true;
      save();
      fbQuiet = false;
      accRender();
    } catch (err) {
      accError('Could not save to your account: ' + err.message);
    }
  }

  function fbQueuePush() {
    if (fbQuiet || !state.account || !fb) return;
    if (fbPushTimer) clearTimeout(fbPushTimer);
    fbPushTimer = setTimeout(() => { fbPushTimer = null; fbPushNow(); }, 1500);
  }

  function accRender() {
    if (!accPill) return;
    const originBox = document.getElementById('fbOrigin');
    const originVal = document.getElementById('fbOriginValue');
    if (originBox) {
      const live = /^https?:/.test(location.protocol);
      originBox.hidden = !FB_CFG || !live;
      if (originVal) originVal.textContent = location.origin;
    }
    const signedIn = !!(state.account && state.account.uid);
    accPill.textContent = signedIn ? 'on' : (FB_CFG ? 'ready' : 'off');
    accPill.className = 'sync-pill' + (signedIn ? ' on' : (FB_CFG ? ' ready' : ''));
    accAuthBox.hidden = signedIn || !FB_CFG;
    accOutRow.hidden = !signedIn;
    fbNoConfig.hidden = !!FB_CFG;
    fbNote.hidden = !signedIn;
    if (signedIn) {
      const when = state.account.lastSync ? ' · last sync ' + relTime(state.account.lastSync) : '';
      accStatusEl.textContent = 'Signed in as ' + state.account.email + when;
    } else if (FB_CFG) {
      accStatusEl.textContent = 'Not signed in — everything stays on this device.';
    } else {
      accStatusEl.textContent = 'Sync is off in this build — the app works fine without it.';
    }
  }

  async function fbEmailCreds() {
    const email = (accEmailEl.value || '').trim();
    const pass = accPassEl.value || '';
    if (!email || email.indexOf('@') === -1) { accError('Type your email address first.'); accEmailEl.focus(); return null; }
    if (!pass) { accError('Type your password too.'); accPassEl.focus(); return null; }
    return { email, pass };
  }

  if (accPill) {
    accErrorEl.hidden = true;

    document.getElementById('accIn').addEventListener('click', async () => {
      accErrorEl.hidden = true;
      const creds = await fbEmailCreds();
      if (!creds) return;
      try {
        const { auth, A } = await fbLoad();
        await A.signInWithEmailAndPassword(auth, creds.email, creds.pass);
        accPassEl.value = '';
      } catch (err) { accError(fbNiceError(err)); }
    });

    document.getElementById('accUp').addEventListener('click', async () => {
      accErrorEl.hidden = true;
      const creds = await fbEmailCreds();
      if (!creds) return;
      try {
        const { auth, A } = await fbLoad();
        await A.createUserWithEmailAndPassword(auth, creds.email, creds.pass);
        accPassEl.value = '';
      } catch (err) { accError(fbNiceError(err)); }
    });

    document.getElementById('accReset').addEventListener('click', async () => {
      accErrorEl.hidden = true;
      const email = (accEmailEl.value || '').trim();
      if (!email || email.indexOf('@') === -1) { accError('Type your email first, then ask for a reset.'); return; }
      try {
        const { auth, A } = await fbLoad();
        await A.sendPasswordResetEmail(auth, email);
        toast('Reset link sent to ' + email);
      } catch (err) { accError(fbNiceError(err)); }
    });

    document.getElementById('accOut').addEventListener('click', async () => {
      if (!fb) return;
      try { await fb.A.signOut(fb.auth); toast('Signed out — your data stays on this device'); }
      catch (err) { accError(err.message); }
    });

    document.getElementById('accSyncNow').addEventListener('click', async () => {
      await fbPushNow();
      toast('Synced');
    });

    const copyBtn = document.getElementById('fbOriginCopy');
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.origin); copyBtn.textContent = 'Copied'; }
      catch (e) { copyBtn.textContent = location.origin; }
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1800);
    });

    [accEmailEl, accPassEl].forEach(el => el.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); document.getElementById('accIn').click(); }
    }));

    accRender();
  }

  /* =============================== pwa =============================== */

  const updatePill = document.getElementById('updatePill');
  const installRow = document.getElementById('installRow');
  const installBtn = document.getElementById('installBtn');
  let installPrompt = null;

  function offerUpdate(reg) {
    if (!updatePill) return;
    updatePill.hidden = false;
    updatePill.addEventListener('click', () => {
      if (reg && reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
      setTimeout(() => location.reload(), 150);
    }, { once: true });
  }

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg);
        reg.addEventListener('updatefound', () => {
          const incoming = reg.installing;
          if (!incoming) return;
          incoming.addEventListener('statechange', () => {
            if (incoming.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(reg);
          });
        });
      }).catch(() => { /* no service worker: the app still runs */ });
    });
  }

  window.addEventListener('beforeinstallprompt', ev => {
    ev.preventDefault();
    installPrompt = ev;
    if (installRow) installRow.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (installRow) installRow.hidden = true;
    toast('Installed — find it with your other apps');
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      installPrompt = null;
      if (installRow) installRow.hidden = true;
      toast(choice && choice.outcome === 'accepted' ? 'Installing Playday…' : 'No rush — the button stays here', false);
    });
  }

  /* a little physics: the momentum card leans towards the pointer */
  (function tiltCard() {
    const card = document.getElementById('momentumCard');
    if (!card || !window.matchMedia) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = null;
    card.addEventListener('pointermove', ev => {
      if (state.settings.skin === 'minimal') return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const r = card.getBoundingClientRect();
        const dx = (ev.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (ev.clientY - (r.top + r.height / 2)) / (r.height / 2);
        card.classList.add('tilting');
        card.style.transform = 'perspective(700px) rotateY(' + (dx * 6).toFixed(2) + 'deg) rotateX(' + (-dy * 5).toFixed(2) + 'deg) translateY(-1px)';
      });
    });
    card.addEventListener('pointerleave', () => {
      card.classList.remove('tilting');
      card.style.transform = '';
    });
  })();

  /* ------------------------------ routing ------------------------------ */

  function routedMode() {
    const path = (location.pathname || '').toLowerCase().replace(/\/+$/, '');
    if (/\/tasks$/.test(path)) return 'tasks';
    if (/\/(calendar|cal)$/.test(path)) return 'calendar';
    const q = new URLSearchParams(location.search).get('mode');
    if (q === 'tasks' || q === 'calendar') return q;
    return null;
  }

  function syncUrl() {
    if (location.protocol.indexOf('http') !== 0) return;
    const path = (location.pathname || '').toLowerCase().replace(/\/+$/, '');
    const isRouted = /\/(tasks|calendar|cal)$/.test(path);
    if (!isRouted) return;
    // works whether the app is at the domain root or under a subpath
    const base = location.pathname.replace(/\/(tasks|calendar|cal|app\.html)\/?$/, '/');
    const want = base + (mode === 'tasks' ? 'tasks' : 'calendar');
    if (location.pathname !== want) history.replaceState({ mode }, '', want);
  }

  const startMode = routedMode();
  if (startMode) {
    mode = startMode;
    state.mode = startMode;
  }

  if (state.account && state.account.email) {
    acct = { email: state.account.email, fileId: state.account.fileId || null, updatedAt: state.account.updatedAt || 0 };
  }

  /* ---------------------------------------------------------------- boot */

  applyTheme();
  applyHours();
  render();
  startAutoSync();
  setTimeout(() => maybeAutoSync('boot'), 1500);

})();
