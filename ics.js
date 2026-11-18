/* Playday ICS — a small, dependency-free iCalendar reader/writer.
   Reads what Google Calendar exports (VEVENT, TZID, UTC, all-day, RRULE, EXDATE,
   RECURRENCE-ID overrides, cancelled events) and writes a file Google can import.
   Works in the browser as window.PlaydayICS and in Node for tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlaydayICS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_INSTANCES = 500;
  var MAX_YEARS = 2;

  /* ------------------------------------------------------------ text utils */

  function unescapeText(v) {
    return String(v || '')
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  function escapeText(v) {
    return String(v == null ? '' : v)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  /* --------------------------------------------------------------- timezone */

  function zoneOffsetMs(date, tz) {
    try {
      var dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      var parts = dtf.formatToParts(date).reduce(function (a, p) { a[p.type] = p.value; return a; }, {});
      var asUTC = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
      );
      return asUTC - date.getTime();
    } catch (err) {
      return 0;
    }
  }

  /* wall-clock time in a zone -> real instant */
  function wallToInstant(y, mo, d, h, mi, s, tz) {
    var guess = Date.UTC(y, mo - 1, d, h, mi, s);
    if (!tz || tz === 'floating' || tz === 'local') return new Date(y, mo - 1, d, h, mi, s);
    var off = zoneOffsetMs(new Date(guess), tz);
    var inst = guess - off;
    var off2 = zoneOffsetMs(new Date(inst), tz);
    if (off2 !== off) inst = guess - off2;
    return new Date(inst);
  }

  /* -------------------------------------------------------------- line parse */

  function unfold(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n[ \t]/g, '');
  }

  function parseLine(line) {
    var idx = line.indexOf(':');
    if (idx === -1) return null;
    var left = line.slice(0, idx);
    var value = line.slice(idx + 1);
    var bits = left.split(';');
    var name = bits.shift().toUpperCase();
    var params = {};
    bits.forEach(function (b) {
      var eq = b.indexOf('=');
      if (eq === -1) return;
      params[b.slice(0, eq).toUpperCase()] = b.slice(eq + 1).replace(/^"|"$/g, '');
    });
    return { name: name, params: params, value: value };
  }

  /* value -> {date:'YYYY-MM-DD', time:'HH:MM'|null, instant:Date, allDay:bool, tz:string|null} */
  function parseDateProp(prop) {
    if (!prop) return null;
    var v = prop.value.trim();
    var tz = prop.params.TZID || null;
    var isDate = (prop.params.VALUE || '').toUpperCase() === 'DATE' || /^\d{8}$/.test(v);

    if (isDate) {
      var y = Number(v.slice(0, 4)), mo = Number(v.slice(4, 6)), d = Number(v.slice(6, 8));
      var local = new Date(y, mo - 1, d, 0, 0, 0);
      return { date: ymd(local), time: null, instant: local, allDay: true, tz: null, ymdParts: [y, mo, d] };
    }

    var m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (!m) return null;
    var yy = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
    var hh = Number(m[4]), mi = Number(m[5]), ss = Number(m[6]);
    var inst = m[7]
      ? new Date(Date.UTC(yy, mm - 1, dd, hh, mi, ss))
      : wallToInstant(yy, mm, dd, hh, mi, ss, tz);
    return { date: ymd(inst), time: hm(inst), instant: inst, allDay: false, tz: tz, ymdParts: [yy, mm, dd] };
  }

  /* ---------------------------------------------------------------- RRULE */

  function parseRule(value) {
    var out = {};
    String(value).split(';').forEach(function (part) {
      var eq = part.indexOf('=');
      if (eq === -1) return;
      out[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
    });
    var byday = out.BYDAY
      ? out.BYDAY.split(',').map(function (d) { return d.replace(/^[+-]?\d+/, '').toUpperCase(); })
      : null;
    return {
      freq: (out.FREQ || '').toUpperCase(),
      interval: Math.max(1, Number(out.INTERVAL || 1)),
      count: out.COUNT ? Number(out.COUNT) : null,
      until: out.UNTIL || null,
      byday: byday,
      bymonthday: out.BYMONTHDAY ? Number(out.BYMONTHDAY) : null
    };
  }

  var DAY_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  /* every start instant an event occurs at, capped */
  function expandStarts(ev) {
    var start = ev.start;
    if (!ev.rule) return [start];

    var rule = ev.rule;
    var until = rule.until ? parseDateProp({ value: rule.until, params: rule.until.length === 8 ? { VALUE: 'DATE' } : {} }) : null;
    var limit = new Date(start.instant.getTime());
    limit.setFullYear(limit.getFullYear() + MAX_YEARS);

    var out = [];
    var guard = 0;

    function push(instant, allDayLike) {
      if (out.length >= MAX_INSTANCES || guard > 4000) return false;
      if (until && instant.getTime() > until.instant.getTime() + (allDayLike ? 86400000 : 0)) return false;
      if (instant.getTime() > limit.getTime()) return false;
      out.push({ instant: instant });
      return true;
    }

    var base = new Date(start.instant.getTime());
    var count = 0;

    if (rule.freq === 'DAILY') {
      for (var i = 0; guard++ < 4000; i++) {
        if (rule.count && count >= rule.count) break;
        var inst = addDays(base, i * rule.interval);
        if (!push(inst, start.allDay)) break;
        count++;
      }
    } else if (rule.freq === 'WEEKLY') {
      var days = (rule.byday && rule.byday.length ? rule.byday : [null])
        .map(function (d) { return d ? DAY_INDEX[d] : base.getDay(); });
      var weekStart = addDays(base, -base.getDay());
      for (var w = 0; guard++ < 4000; w++) {
        var broke = false;
        for (var k = 0; k < days.length; k++) {
          if (rule.count && count >= rule.count) { broke = true; break; }
          var cand = addDays(weekStart, w * 7 * rule.interval + days[k]);
          cand.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), 0);
          if (cand.getTime() < base.getTime()) continue;
          if (!push(cand, start.allDay)) { broke = true; break; }
          count++;
        }
        if (broke) break;
      }
    } else if (rule.freq === 'MONTHLY') {
      for (var mI = 0; guard++ < 4000; mI++) {
        if (rule.count && count >= rule.count) break;
        var mo = new Date(base.getFullYear(), base.getMonth() + mI * rule.interval,
          rule.bymonthday || base.getDate(), base.getHours(), base.getMinutes(), 0);
        if (mo.getDate() !== (rule.bymonthday || base.getDate())) continue; // skipped short month
        if (!push(mo, start.allDay)) break;
        count++;
      }
    } else if (rule.freq === 'YEARLY') {
      for (var yI = 0; guard++ < 4000; yI++) {
        if (rule.count && count >= rule.count) break;
        var yr = new Date(base.getFullYear() + yI * rule.interval, base.getMonth(), base.getDate(),
          base.getHours(), base.getMinutes(), 0);
        if (!push(yr, start.allDay)) break;
        count++;
      }
    } else {
      return [start];
    }
    return out.length ? out : [start];
  }

  /* ----------------------------------------------------------------- parse */

  function parse(text) {
    var lines = unfold(text).split('\n');
    var calName = null;
    var blocks = [];
    var cur = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (/^BEGIN:VEVENT$/i.test(line)) { cur = {}; continue; }
      if (/^END:VEVENT$/i.test(line)) { if (cur) blocks.push(cur); cur = null; continue; }
      var p = parseLine(line);
      if (!p) continue;
      if (!cur) {
        if (p.name === 'X-WR-CALNAME' && !calName) calName = unescapeText(p.value);
        continue;
      }
      if (p.name === 'EXDATE') {
        (cur.EXDATE = cur.EXDATE || []).push(p);
      } else if (!(p.name in cur)) {
        cur[p.name] = p;
      }
    }

    var out = [];

    blocks.forEach(function (b) {
      var status = b.STATUS ? String(b.STATUS.value).toUpperCase() : '';
      if (status === 'CANCELLED') return;

      var start = parseDateProp(b.DTSTART);
      if (!start) return;
      var end = parseDateProp(b.DTEND);
      var durMin = 60;
      if (end) {
        durMin = Math.max(start.allDay ? 1440 : 15,
          Math.round((end.instant.getTime() - start.instant.getTime()) / 60000));
      }

      var uid = b.UID ? String(b.UID.value) : ('no-uid-' + out.length);
      var title = b.SUMMARY ? unescapeText(b.SUMMARY.value) : 'Untitled event';
      var where = b.LOCATION ? unescapeText(b.LOCATION.value) : '';
      var notes = b.DESCRIPTION ? unescapeText(b.DESCRIPTION.value) : '';
      var rule = b.RRULE ? parseRule(b.RRULE.value) : null;

      var skipKeys = {};
      (b.EXDATE || []).forEach(function (prop) {
        String(prop.value).split(',').forEach(function (v) {
          var dp = parseDateProp({ value: v, params: prop.params });
          if (dp) skipKeys[dp.date + (dp.time ? 'T' + dp.time : '')] = true;
        });
      });

      var ev = { uid: uid, title: title, where: where, notes: notes, allDay: start.allDay, start: start, rule: rule };
      var starts = expandStarts(ev);

      starts.forEach(function (s, idx) {
        var key = ymd(s.instant) + (start.allDay ? '' : 'T' + hm(s.instant));
        if (skipKeys[key]) return;

        if (start.allDay) {
          var spanDays = Math.max(1, Math.round(durMin / 1440));
          for (var d = 0; d < spanDays; d++) {
            var day = addDays(s.instant, d);
            out.push({
              uid: uid + (idx ? '-' + idx : '') + (spanDays > 1 ? '-' + d : ''),
              title: title,
              date: ymd(day),
              start: '00:00',
              end: '23:59',
              allDay: true,
              where: where,
              notes: notes
            });
          }
        } else {
          var endInstant = new Date(s.instant.getTime() + durMin * 60000);
          out.push({
            uid: uid + (idx ? '-' + idx : ''),
            title: title,
            date: ymd(s.instant),
            start: hm(s.instant),
            end: hm(endInstant),
            allDay: false,
            where: where,
            notes: notes
          });
        }
      });
    });

    return { name: calName, events: out };
  }

  /* ----------------------------------------------------------------- build */

  function stamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  function icsDateTime(dateStr, timeStr) {
    return String(dateStr).replace(/-/g, '') + 'T' + String(timeStr || '00:00').replace(':', '') + '00';
  }

  /* events: [{id,title,date,start,end,where,notes,done}] -> iCalendar text */
  function build(events, calendarName) {
    var now = stamp(new Date());
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Playday//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:' + escapeText(calendarName || 'Playday')
    ];
    (events || []).forEach(function (e) {
      var uid = (e.id || Math.random().toString(36).slice(2)) + '@playday';
      lines.push(
        'BEGIN:VEVENT',
        'UID:' + escapeText(uid),
        'DTSTAMP:' + now,
        'DTSTART:' + icsDateTime(e.date, e.start),
        'DTEND:' + icsDateTime(e.date, e.end),
        'SUMMARY:' + escapeText(e.title || 'Untitled event')
      );
      if (e.where) lines.push('LOCATION:' + escapeText(e.where));
      if (e.notes) lines.push('DESCRIPTION:' + escapeText(e.notes));
      if (e.done) lines.push('STATUS:CONFIRMED', 'X-PLAYDAY-DONE:TRUE');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  return { parse: parse, build: build, escapeText: escapeText, unescapeText: unescapeText };
});
