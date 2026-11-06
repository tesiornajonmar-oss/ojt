/* =====================================================================
   OJT-ERAMS — ui.js : helpers shared by every page (no data, no mock code)
   ===================================================================== */
const STATUS_LABEL = { ACTIVE: 'Active', COMPLETED: 'Completed', NOT_STARTED: 'Not started', ON_HOLD: 'On hold' };

// Reasons a shift is not auto-approved (set by the server — see BACKEND_GUIDE.md "Attendance rules").
const FLAG_LABEL = {
  MANUAL_GPS: 'GPS outside the geofence or unavailable',
  FACE_LOW: 'Face did not match the enrolled face',
  FACE_NONE: 'Face check skipped',
  FACE_NOT_ENROLLED: 'Face ID not set up',
  NO_LIVENESS: 'Blink check not completed',
  NO_PHOTO: 'No camera photo',
  SHORT_SHIFT: 'Very short shift',
  LONG_SHIFT: 'Very long shift',
  FACE_REPEAT: 'Face did not match several times in a row',
  LATE: 'Late', UNDERTIME: 'Undertime', OVERTIME: 'Overtime — needs approval', OFF_SCHEDULE: 'Outside the schedule (rest day)'
};

/* ---------------------------------------------------------------- helpers */
const U = {
  pad: n => String(n).padStart(2, '0'),
  dateStr(d = new Date()) { return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`; },
  parseDate(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); },
  addDays(s, n) { const d = U.parseDate(s); d.setDate(d.getDate() + n); return U.dateStr(d); },
  daysBetween(a, b) { return Math.round((U.parseDate(b) - U.parseDate(a)) / 864e5); },
  fmtShortDate(s) { return s ? U.parseDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'; },
  fmtDateLong(s) { return s ? U.parseDate(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'; },
  fmtTime(iso) { return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'; },
  fmtTimer(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(U.pad).join(':');
  },
  fmtWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso), now = new Date();
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}), hour: 'numeric', minute: '2-digit' });
  },
  ago(iso) {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 1440) return Math.round(m / 60) + ' h ago';
    return Math.round(m / 1440) + ' d ago';
  },
  haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, type = 'ok', ms = 3200) {
  let wrap = document.getElementById('toastWrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toastWrap'; wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'warn' ? 'warn' : type === 'err' ? 'err' : 'ok');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

const Modal = (() => {
  let el = null, onClose = null;
  function close() {
    if (el) { el.remove(); el = null; }
    if (onClose) { const f = onClose; onClose = null; try { f(); } catch (e) { /* ignore */ } }
  }
  function open({ title = '', body = '', footer = '', wide = false, onClose: oc = null, locked = false } = {}) {
    close();
    onClose = oc;
    el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${title}</h3><button class="modal-x" type="button" aria-label="Close">✕</button></div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
    document.body.appendChild(el);
    el.querySelector('.modal-x').onclick = close;
    if (!locked) el.addEventListener('mousedown', e => { if (e.target === el) close(); });
    return el;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  return { open, close };
})();

function applyTheme(t) { document.documentElement.classList.toggle('dark-theme', t === 'dark'); }
applyTheme((() => { try { return localStorage.getItem('ojt_theme') || 'light'; } catch (e) { return 'light'; } })());

/* ---------------------------------------------------------------- chips */
function statusChip(s) { return `<span class="chip st-${String(s).toLowerCase()}">${esc(STATUS_LABEL[s] || s)}</span>`; }
function moaChip(s) {
  const L = { APPROVED: 'MOA approved', PENDING: 'MOA pending', EXPIRED: 'MOA expired', NOT_REQUIRED: 'MOA not required' };
  return `<span class="chip moa-${String(s).toLowerCase()}">${esc(L[s] || s)}</span>`;
}
function progBar(r) {
  const pend = r.target ? Math.min(100 - r.pct, Math.round(r.pending / r.target * 100)) : 0;
  return `<div class="tracker-bar mini"><div class="tracker-fill-approved" style="width:${r.pct}%"></div><div class="tracker-fill-pending" style="width:${Math.max(0, pend)}%"></div></div>`;
}
function gpsChip(s) { return `<span class="gps-chip ${s === 'In-Range' ? 'gps-inrange' : 'gps-manual'}">${esc(s || '—')}</span>`; }
function faceChip(f) {
  if (!f || !f.status) return '<span class="muted small">—</span>';
  const L = { MATCH: ['Face match', 'face-ok'], LOW: ['No match', 'face-bad'], NOT_ENROLLED: ['Not enrolled', 'face-warn'], NONE: ['Skipped', 'face-warn'] }[f.status] || [f.status, 'face-warn'];
  return `<span class="face-chip ${L[1]}" title="${f.score != null ? 'Distance ' + f.score + (f.liveness ? ' • blink ✓' : ' • no blink check') : ''}">${L[0]}</span>`;
}
function flagChips(flags) {
  return (flags || []).map(f => `<span class="chip chip-warn" title="${esc(FLAG_LABEL[f] || f)}">${esc(FLAG_LABEL[f] || f)}</span>`).join(' ');
}
function riskChip(r) {
  const L = { LOW: ['Low risk', 'risk-low'], MEDIUM: ['Medium risk', 'risk-med'], HIGH: ['High risk', 'risk-high'] }[r] || ['', ''];
  return `<span class="chip ${L[1]}">${L[0]}</span>`;
}
function shiftStatusPill(s) {
  const m = { APPROVED: ['Approved', 'pill-approved'], PENDING_VERIFICATION: ['Pending', 'pill-pending'], REJECTED: ['Rejected', 'pill-revision'], TIMED_IN: ['On duty', 'pill-pending'] }[s.status] || ['', ''];
  const by = s.status === 'APPROVED' && s.approval_method === 'AUTO' ? ' <span class="small muted">auto</span>' : '';
  return `<span class="${m[1]}">${m[0]}</span>${by}`;
}

/* ---------------------------------------------------------------- downloads */
function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function downloadCsv(filename, rows) {
  const q = v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  downloadBlob(filename, new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
}

/* ---------------------------------------------------------------- misc */
function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
// Wraps an async click handler: disables the button while it runs and shows errors as a toast.
function guarded(btn, fn) {
  btn.onclick = async e => {
    if (btn.disabled) return;
    btn.disabled = true;
    try { await fn(e); } catch (err) { toast(err.message || String(err), 'err', 5000); } finally { btn.disabled = false; }
  };
}
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
