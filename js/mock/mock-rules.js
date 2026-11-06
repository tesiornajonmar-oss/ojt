/* =====================================================================
   MOCK BACKEND (0/3) — pure attendance rules: schedules, late / undertime / overtime.
   No database access in here, so your real backend can port this file one-to-one
   (see BACKEND_GUIDE.md → "DTR rules"). Used by mock-db.js (seed data) and mock-api.js.
   ===================================================================== */
window.MockRules = (() => {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ORDER = [1, 2, 3, 4, 5, 6, 0];                       // Monday-first
  const hrs = n => +(+n).toFixed(2);

  /* "8:00 AM" | "08:00" | "17:30" → minutes since midnight (null if invalid) */
  function parseTime(str) {
    const m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$/i.exec(String(str || ''));
    if (!m) return null;
    let h = +m[1]; const mi = +m[2], ap = m[3] && m[3].toUpperCase();
    if (mi > 59 || h > 23 || (ap && (h < 1 || h > 12))) return null;
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + mi;
  }
  function fmtTime(min) {
    const h = Math.floor(min / 60) % 24, m = min % 60;
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  /* "Monday – Friday" | "Mon, Wed, Fri" | "Every day" → [1,2,3,4,5] */
  function parseDays(str) {
    const s = String(str || '').toLowerCase();
    if (/every\s*day|daily|7\s*days/.test(s)) return [0, 1, 2, 3, 4, 5, 6];
    const idx = w => DAYS.findIndex(d => d.toLowerCase().startsWith(w.slice(0, 3)));
    const range = /(sun|mon|tue|wed|thu|fri|sat)\w*\s*(?:–|—|-|to)\s*(sun|mon|tue|wed|thu|fri|sat)\w*/.exec(s);
    if (range) {
      const a = idx(range[1]), b = idx(range[2]), out = [];
      for (let d = a; ; d = (d + 1) % 7) { out.push(d); if (d === b) break; }
      return out;
    }
    const found = [...s.matchAll(/(sun|mon|tue|wed|thu|fri|sat)/g)].map(m => idx(m[1]));
    return [...new Set(found)];
  }
  function fmtDays(list) {
    const set = [...new Set((list || []).map(Number))].filter(d => d >= 0 && d <= 6);
    if (set.length === 7) return 'Every day';
    const seq = ORDER.filter(d => set.includes(d));
    if (seq.length >= 3) {
      const first = ORDER.indexOf(seq[0]);
      if (seq.every((d, i) => ORDER[first + i] === d)) return `${DAYS[seq[0]]} – ${DAYS[seq[seq.length - 1]]}`;
    }
    return seq.map(d => DAYS[d].slice(0, 3)).join(', ') || '—';
  }

  /* Normalised schedule of one trainee. `ojt` = OJT record, `st` = system settings. */
  function schedFrom(ojt, st) {
    const o = ojt || {};
    const start = parseTime(o.shift_start || st.shift_start) ?? 480, end = parseTime(o.shift_end || st.shift_end) ?? 1020;
    const dur = ((end - start + 1440) % 1440) || 1440;                  // minutes; end <= start means an overnight shift
    const brkSetting = o.break_min != null ? +o.break_min : +st.break_min;
    const brk = dur >= 300 ? (isNaN(brkSetting) ? 60 : brkSetting) : 0;
    const days = parseDays(o.work_days || st.work_days);
    return { start, end, dur, brk, grace: +st.grace_min >= 0 ? +st.grace_min : 15, days, hours: hrs((dur - brk) / 60),
      start_label: fmtTime(start), end_label: fmtTime(end), days_label: fmtDays(days) };
  }

  /* Finishes a shift: fills worked/regular/late/undertime/overtime on `s` (needs s.time_in, s.time_out)
     and returns the schedule flags. Overtime is NOT counted until a supervisor approves it. */
  function computeShift(s, sc) {
    const inD = new Date(s.time_in), outD = new Date(s.time_out), flags = [];
    // schedule window that starts closest to the clock-in (handles overnight shifts)
    const base = new Date(inD); base.setHours(0, 0, 0, 0);
    let S = null, best = Infinity;
    [-1, 0, 1].forEach(off => {
      const c = new Date(base); c.setDate(c.getDate() + off); c.setMinutes(sc.start);
      const d = Math.abs(c - inD); if (d < best) { best = d; S = c; }
    });
    const E = new Date(S.getTime() + sc.dur * 60000);
    const mins = ms => ms / 60000;
    const rawSpan = Math.max(0, mins(outD - inD));
    const breakOf = span => (span >= 300 ? sc.brk : 0);
    const workedMin = Math.max(0, rawSpan - breakOf(rawSpan));
    s.sched = { start: sc.start_label, end: sc.end_label, break_min: sc.brk, hours: sc.hours, days: sc.days_label };
    s.worked_hours = hrs(workedMin / 60);
    s.late_min = 0; s.under_min = 0; s.ot_hours = 0; s.ot_status = null;

    const scheduledDay = sc.days.includes(S.getDay());
    if (!scheduledDay || inD >= E) {
      // outside the schedule (rest day, or arrived after the shift ended): nothing is "regular" — it is overtime to be approved
      s.regular_hours = 0; s.ot_hours = hrs(workedMin / 60);
      if (!scheduledDay) flags.push('OFF_SCHEDULE');
    } else {
      const late = mins(inD - S), under = mins(E - outD);
      s.late_min = late > sc.grace ? Math.round(late) : 0;
      s.under_min = under > sc.grace ? Math.round(under) : 0;
      const effIn = s.late_min ? inD : S, effOut = s.under_min ? outD : E;
      const span = Math.max(0, mins(effOut - effIn));
      s.regular_hours = hrs(Math.max(0, span - breakOf(span)) / 60);
      const ot = mins(outD - Math.max(E, inD));
      s.ot_hours = ot > sc.grace ? hrs(ot / 60) : 0;
      if (s.late_min) flags.push('LATE');
      if (s.under_min) flags.push('UNDERTIME');
    }
    if (s.ot_hours > 0) { flags.push('OVERTIME'); s.ot_status = 'PENDING'; }
    s.computed_hours = s.regular_hours;
    return flags;
  }

  return { DAYS, parseTime, fmtTime, parseDays, fmtDays, schedFrom, computeShift, hrs };
})();
