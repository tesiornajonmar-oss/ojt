/* =====================================================================
   OJT-ERAMS — widgets.js : reusable pieces shared by the Faculty, Supervisor
   and Super Admin portals (attendance cards, photo viewer, history tables).
   Load with  data-with="widgets"  in boot.js.
   ===================================================================== */
const Widgets = (() => {
  const sec = ms => ms; // (kept for readability)

  /* ---- ask for a short note (reject / escalate / dispute) ---- */
  function askNote({ title, label, placeholder = '', confirmText = 'Confirm', required = false, danger = false }) {
    return new Promise(resolve => {
      let finished = false;
      const done = v => { if (!finished) { finished = true; resolve(v); } };
      Modal.open({
        title: esc(title), onClose: () => done(null),
        body: `<div class="field"><label>${esc(label)}</label><textarea id="noteTxt" rows="4" placeholder="${esc(placeholder)}"></textarea></div><p class="error" id="noteErr"></p>`,
        footer: `<button class="btn btn-outline" id="noteCancel" type="button">Cancel</button><button class="btn ${danger ? 'btn-red' : 'btn-navy'}" id="noteOk" type="button">${esc(confirmText)}</button>`
      });
      document.getElementById('noteCancel').onclick = () => Modal.close();
      document.getElementById('noteOk').onclick = () => {
        const v = document.getElementById('noteTxt').value.trim();
        if (required && !v) { document.getElementById('noteErr').textContent = 'Please write a short note.'; return; }
        done(v); Modal.close();
      };
    });
  }

  /* ---- photos of one shift (data may already contain them, otherwise fetched) ---- */
  async function showPhotos(shiftOrId) {
    let s = typeof shiftOrId === 'string' ? null : shiftOrId;
    if (!s || (!s.photo_in && !s.photo_out && (s.has_photo_in || s.has_photo_out))) {
      s = await API.staff.shiftPhotos({ id: typeof shiftOrId === 'string' ? shiftOrId : shiftOrId.id });
    }
    const fig = (src, cap, face) => `<figure>${src ? `<img src="${src}" alt="${esc(cap)}">` : '<div class="muted small" style="padding:40px 0">No photo</div>'}
        <figcaption>${esc(cap)}<br>${faceChip(face)}</figcaption></figure>`;
    Modal.open({
      wide: true, title: `${esc(s.studentName || 'Attendance')} <span class="muted small">${U.fmtShortDate(s.date)}</span>`,
      body: `<div class="photo-pair">${fig(s.photo_in, 'Time in ' + U.fmtTime(s.time_in), s.face_in)}${fig(s.photo_out, 'Time out ' + (s.time_out ? U.fmtTime(s.time_out) : '—'), s.face_out)}</div>
        <div class="flag-list" style="margin-top:14px">${gpsChip(s.gps_status)} ${s.distance_m != null ? `<span class="small muted">${s.distance_m} m from the company</span>` : '<span class="small muted">No GPS distance</span>'} ${flagChips(s.flags)}</div>
        <p class="small muted" style="margin-top:10px">Photos are taken live by the trainee's camera at the moment of clock-in/out — no uploads are possible.</p>`,
      footer: '<button class="btn btn-outline" id="phClose" type="button">Close</button>'
    });
    document.getElementById('phClose').onclick = () => Modal.close();
  }

  /* ---- attendance card used in approval queues ---- */
  function slipCard(s, { actions = [], hours = true, pick = false, note = '' } = {}) {
    const lvl = s.risk === 'HIGH' ? 'high' : s.risk === 'MEDIUM' ? 'med' : 'low';
    const age = s.age_days >= 1 ? `<span class="${s.age_days >= 3 ? 'late' : 'muted'} small">waiting ${s.age_days} d</span>` : '<span class="muted small">today</span>';
    return `<div class="appr-card risk-card-${lvl}" data-id="${esc(s.id)}">
      ${s.photo_in ? `<img class="slip-thumb" src="${s.photo_in}" alt="Clock-in photo" data-zoom="${esc(s.id)}" title="Click to enlarge">`
        : '<div class="slip-thumb small muted" style="display:flex;align-items:center;justify-content:center">No photo</div>'}
      <div>
        <div class="appr-title">${pick ? `<input type="checkbox" class="pick" data-pick="${esc(s.id)}" ${s.risk === 'HIGH' ? 'disabled title="High-risk items must be reviewed one by one"' : ''}>` : ''}${esc(s.studentName)}</div>
        <div class="appr-meta"><span>${U.fmtDateLong(s.date)}</span><span>${U.fmtTime(s.time_in)} – ${U.fmtTime(s.time_out)}</span><b>${s.computed_hours} h</b> ${age}</div>
        <div class="appr-meta"><span class="muted">${esc(s.companyName)}</span></div>
        <div class="appr-meta">${riskChip(s.risk)} ${gpsChip(s.gps_status)} ${s.distance_m != null ? `<span class="small muted">${s.distance_m} m</span>` : ''}
          <span class="small muted">In</span> ${faceChip(s.face_in)} <span class="small muted">Out</span> ${faceChip(s.face_out)}</div>
        ${(s.flags || []).length ? `<div class="flag-list">${flagChips(s.flags)}</div>` : ''}
        ${(s.late_min || s.under_min || s.ot_hours) ? `<div class="appr-meta small">${s.late_min ? `<span class="late">Late ${s.late_min} min</span>` : ''}${s.under_min ? `<span class="late">Undertime ${s.under_min} min</span>` : ''}${s.ot_hours ? `<b>Overtime ${s.ot_hours} h (${s.ot_status === 'APPROVED' ? 'approved' : 'not counted until approved'})</b>` : ''}<span class="muted">Regular ${s.regular_hours != null ? s.regular_hours : s.computed_hours} h</span></div>` : ''}
        ${s.note ? `<div class="small" style="margin-top:6px">📝 ${esc(s.note)}</div>` : ''}${note}
      </div>
      <div class="appr-actions">
        ${hours ? `<label class="hrs">Hours <input type="number" min="0" max="24" step="0.25" value="${s.computed_hours}" data-hrs="${esc(s.id)}"></label>` : ''}
        ${actions.map(a => `<button class="btn ${a.cls || 'btn-outline'} btn-sm" data-act="${esc(a.act)}" type="button">${a.label}</button>`).join('')}
        ${s.ot_hours > 0 && s.ot_status !== 'APPROVED' && actions.some(a => a.act === 'ok') ? '<button class="btn btn-navy btn-sm" data-act="okot" type="button" title="Approve and also count the overtime">✓ Approve + OT</button>' : ''}
      </div></div>`;
  }

  // Wires clicks inside `root` for slip cards. onAction(act, shift, hoursValue) may be async.
  function bindSlips(root, items, onAction) {
    const find = id => items.find(x => x.id === id);
    root.querySelectorAll('[data-zoom]').forEach(img => { img.onclick = () => showPhotos(find(img.dataset.zoom)).catch(e => toast(e.message, 'err')); });
    root.querySelectorAll('[data-act]').forEach(btn => {
      const card = btn.closest('[data-id]'), it = find(card.dataset.id), inp = card.querySelector('[data-hrs]');
      guarded(btn, () => onAction(btn.dataset.act, it, inp ? inp.value : null));
    });
  }
  const picked = root => [...root.querySelectorAll('[data-pick]:checked')].map(c => c.dataset.pick);

  /* ---- history tables ---- */
  function shiftTable(rows, { photos = true } = {}) {
    if (!rows.length) return '<p class="muted">No attendance logs yet.</p>';
    return `<div class="table-wrap"><table class="logs-table"><thead><tr><th>Date</th><th>Time in / out</th><th>Hours</th><th>GPS</th><th>Face</th><th>Status</th><th>Verified by</th>${photos ? '<th></th>' : ''}</tr></thead><tbody>
      ${rows.map(s => `<tr><td>${U.fmtShortDate(s.date)}</td><td>${U.fmtTime(s.time_in)} – ${s.time_out ? U.fmtTime(s.time_out) : '—'}</td><td>${s.computed_hours || 0}</td>
        <td>${gpsChip(s.gps_status)}</td><td>${faceChip(s.face_in)}</td><td>${shiftStatusPill(s)}${s.spot_status === 'DISPUTED' ? ' <span class="chip chip-warn">disputed</span>' : ''}</td>
        <td class="small">${esc(s.verified_by || '—')}</td>
        ${photos ? `<td>${s.has_photo_in || s.has_photo_out ? `<button class="btn btn-outline btn-sm" data-photos="${esc(s.id)}" type="button">📷</button>` : ''}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>`;
  }
  function reportsTable(rows) {
    window.__lastReports = rows;
    if (!rows.length) return '<p class="muted">No narrative reports submitted yet.</p>';
    const stl = { APPROVED: '<span class="pill-approved">Approved</span>', PENDING: '<span class="pill-pending">Pending</span>', REVISION: '<span class="pill-revision">Revision</span>' };
    return `<div class="table-wrap"><table class="logs-table"><thead><tr><th>Date</th><th>Title</th><th>Status</th><th>Feedback</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td>${U.fmtShortDate(x.date)}</td><td><b>${esc(x.title)}</b><div class="small muted" style="max-width:420px">${esc((x.body || '').slice(0, 140))}${(x.body || '').length > 140 ? '…' : ''}</div>${attachmentsHtml(x)}</td><td>${stl[x.status] || ''}</td><td class="small">${esc(x.feedback || '—')}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function bindPhotoButtons(root) {
    if (window.__lastReports) bindAttachments(root, window.__lastReports);
    root.querySelectorAll('[data-photos]').forEach(b => { b.onclick = () => showPhotos(b.dataset.photos).catch(e => toast(e.message, 'err')); });
  }

  /* ---- attachments of a narrative report (scan / photo / PDF of the handwritten copy) ---- */
  const attSrc = a => a.url || a.data;
  function attachmentsHtml(r) {
    const list = (r && r.attachments) || [];
    if (!list.length) return '';
    return `<div class="att-row" data-rep="${esc(r.id)}">${list.map((a, i) => /^image\//.test(a.type)
      ? `<img class="att-thumb" src="${esc(attSrc(a))}" alt="${esc(a.name)}" title="${esc(a.name)}" data-att="${i}">`
      : `<button type="button" class="chip chip-neutral" data-att="${i}">📄 ${esc(a.name)}</button>`).join('')}</div>`;
  }
  async function openAttachment(a) {
    if (/^image\//.test(a.type)) {
      Modal.open({ wide: true, title: esc(a.name), body: `<img src="${esc(attSrc(a))}" alt="${esc(a.name)}" style="max-width:100%;display:block;margin:0 auto">`, footer: '<button class="btn btn-outline" id="atClose" type="button">Close</button>' });
      document.getElementById('atClose').onclick = () => Modal.close();
    } else {
      const src = attSrc(a);
      const url = src.startsWith('data:') ? URL.createObjectURL(await (await fetch(src)).blob()) : src;   // browsers block data: PDFs in a new tab
      window.open(url, '_blank', 'noopener');
    }
  }
  function bindAttachments(root, reports) {
    root.querySelectorAll('.att-row [data-att]').forEach(el => {
      el.onclick = () => { const r = reports.find(x => x.id === el.closest('[data-rep]').dataset.rep); if (r) openAttachment(r.attachments[+el.dataset.att]).catch(e => toast(e.message, 'err')); };
    });
  }

  /* ---- evaluation (read-only summary) ---- */
  const CRITERIA = [['attendance', 'Attendance & punctuality'], ['quality', 'Quality of work'], ['initiative', 'Initiative'], ['teamwork', 'Teamwork'],
    ['communication', 'Communication'], ['technical', 'Technical / job skills'], ['professionalism', 'Professionalism & attitude']];
  function evaluationView(ev) {
    if (!ev) return '<p class="muted">The company supervisor has not started an evaluation yet.</p>';
    const stars = n => '★'.repeat(n || 0) + '☆'.repeat(5 - (n || 0));
    const vals = Object.values(ev.ratings || {});
    const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
    return `<div class="eval-card"><b>${esc(ev.supervisor_name || '')}</b> <span class="chip ${ev.status === 'SUBMITTED' ? 'moa-approved' : 'moa-pending'}">${ev.status === 'SUBMITTED' ? 'Submitted' : 'Draft'}</span>
      <div class="small muted">Average ${avg} / 5${ev.recommend ? ' • ' + (ev.recommend === 'YES' ? 'Recommended ✓' : 'Not recommended') : ''}</div></div>
      ${CRITERIA.map(([k, l]) => `<div class="kv"><span>${l}</span><b style="color:#f0a500;letter-spacing:2px">${stars((ev.ratings || {})[k])}</b></div>`).join('')}
      ${ev.comments ? `<p style="margin-top:12px"><b>Comments</b></p><p class="small" style="white-space:pre-wrap">${esc(ev.comments)}</p>` : ''}`;
  }

  return { attachmentsHtml, bindAttachments, openAttachment, askNote, showPhotos, slipCard, bindSlips, picked, shiftTable, reportsTable, bindPhotoButtons, evaluationView, CRITERIA };
})();
