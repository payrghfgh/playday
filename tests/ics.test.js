// Times below are written for IST, which is what a Playday user in India sees.
process.env.TZ = 'Asia/Kolkata';
const test = require('node:test');
const assert = require('node:assert');
const ICS = require('../ics.js');

const wrap = body => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Google Inc//Google Calendar 70.9054//EN\r\n' +
  'X-WR-CALNAME:Rushan — Work\r\n' + body + 'END:VCALENDAR\r\n';

test('timed event with TZID lands on the right local date and time', () => {
  const ics = wrap('BEGIN:VEVENT\r\nUID:a1\r\nDTSTART;TZID=Asia/Kolkata:20261117T093000\r\nDTEND;TZID=Asia/Kolkata:20261117T101500\r\nSUMMARY:Design review\r\nLOCATION:Studio\\, 3rd floor\r\nDESCRIPTION:Line one\\nLine two\r\nEND:VEVENT\r\n');
  const out = ICS.parse(ics);
  assert.equal(out.name, 'Rushan — Work');
  assert.equal(out.events.length, 1);
  const e = out.events[0];
  assert.equal(e.date, '2026-11-17');
  assert.equal(e.start, '09:30');
  assert.equal(e.end, '10:15');
  assert.equal(e.title, 'Design review');
  assert.equal(e.where, 'Studio, 3rd floor');
  assert.equal(e.notes, 'Line one\nLine two');
  assert.equal(e.allDay, false);
});

test('UTC event is converted to local wall clock', () => {
  const ics = wrap('BEGIN:VEVENT\r\nUID:a2\r\nDTSTART:20261117T040000Z\r\nDTEND:20261117T050000Z\r\nSUMMARY:Call with Berlin\r\nEND:VEVENT\r\n');
  const e = ICS.parse(ics).events[0];
  // 04:00Z == 09:30 IST
  assert.equal(e.start, '09:30');
  assert.equal(e.date, '2026-11-17');
});

test('all-day event spans every day it covers', () => {
  const ics = wrap('BEGIN:VEVENT\r\nUID:a3\r\nDTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261123\r\nSUMMARY:Alibaug trip\r\nEND:VEVENT\r\n');
  const evs = ICS.parse(ics).events;
  assert.deepEqual(evs.map(e => e.date), ['2026-11-20', '2026-11-21', '2026-11-22']);
  assert.ok(evs.every(e => e.allDay && e.start === '00:00' && e.end === '23:59'));
});

test('weekly RRULE with COUNT and BYDAY expands, EXDATE removes one instance', () => {
  const ics = wrap([
    'BEGIN:VEVENT',
    'UID:a4',
    'DTSTART;TZID=Asia/Kolkata:20261102T100000',
    'DTEND;TZID=Asia/Kolkata:20261102T104500',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6',
    'EXDATE;TZID=Asia/Kolkata:20261104T100000',
    'SUMMARY:Standup',
    'END:VEVENT'
  ].join('\r\n') + '\r\n');
  const evs = ICS.parse(ics).events;
  const dates = evs.map(e => e.date);
  assert.deepEqual(dates, ['2026-11-02', '2026-11-09', '2026-11-11', '2026-11-16', '2026-11-18']);
  assert.ok(evs.every(e => e.start === '10:00' && e.end === '10:45'));
});

test('cancelled events are dropped, folding and escaped text survive', () => {
  const ics = wrap([
    'BEGIN:VEVENT',
    'UID:a5',
    'DTSTART:20261118T120000Z',
    'DTEND:20261118T130000Z',
    'STATUS:CANCELLED',
    'SUMMARY:Nope',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:a6',
    'DTSTART:20261119T120000Z',
    'DTEND:20261119T130000Z',
    'SUMMARY:A very long title that Google wraps across two lines becau',
    ' se of the 75 octet rule',
    'END:VEVENT'
  ].join('\r\n') + '\r\n');
  const evs = ICS.parse(ics).events;
  assert.equal(evs.length, 1);
  assert.equal(evs[0].title, 'A very long title that Google wraps across two lines because of the 75 octet rule');
});

test('build() round-trips through parse()', () => {
  const events = [
    { id: 'x1', title: 'Ship it, then nap', date: '2026-11-17', start: '09:00', end: '10:30', where: 'Studio', notes: 'Two things; not three' },
    { id: 'x2', title: 'Chai', date: '2026-11-18', start: '17:30', end: '18:15' }
  ];
  const text = ICS.build(events, 'Playday');
  assert.match(text, /BEGIN:VCALENDAR/);
  const back = ICS.parse(text);
  assert.equal(back.name, 'Playday');
  assert.equal(back.events.length, 2);
  assert.equal(back.events[0].title, 'Ship it, then nap');
  assert.equal(back.events[0].where, 'Studio');
  assert.equal(back.events[1].start, '17:30');
});

test('junk input does not throw', () => {
  assert.deepEqual(ICS.parse('').events, []);
  assert.deepEqual(ICS.parse('not a calendar at all').events, []);
  assert.deepEqual(ICS.parse(null).events, []);
});
