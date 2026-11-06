/* =====================================================================
   OJT-ERAMS — dtr.js : printing.  Browser "Save as PDF" makes a PDF.
     DTR.print(dtr)         dtr = the object returned by API.dtr.get(...)
     DTR.report(report, student)   narrative report with accomplishments + evidence photos
   ===================================================================== */
const DTR = (() => {
  const STYLE = `body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:26px}
    h1{font-size:20px;margin:0}h2{font-size:14px;margin:2px 0 14px;color:#555;font-weight:normal}h3{font-size:14px;margin:18px 0 6px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:13px;margin-bottom:14px}
    table{border-collapse:collapse;width:100%;font-size:11.5px}th,td{border:1px solid #999;padding:5px 6px;text-align:left}th{background:#eee}
    td.n,th.n{text-align:right}tr.off td{color:#888;background:#fafafa}tr.abs td{color:#b3261e}
    .tot{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px;font-size:12px}.tot div{border:1px solid #999;padding:6px}
    .sig{display:flex;justify-content:space-between;margin-top:54px;font-size:12px}.sig div{width:30%;border-top:1px solid #333;text-align:center;padding-top:4px}
    .cert{margin-top:14px;font-size:12px;padding:8px;border:1px solid #2e7d32;color:#2e7d32}.ev{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.ev img{height:150px;border:1px solid #999}
    .acc{border:1px solid #ccc;padding:8px;margin:8px 0;page-break-inside:avoid}.small{font-size:11px;color:#555}`;
  const open = (title, body) => {
    const w = window.open('', '_blank');
    if (!w) { toast('Your browser blocked the pop-up. Allow pop-ups for this site to print.', 'warn', 5000); return; }
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}
      <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`);
    w.document.close();
  };
  const mins = m => m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`) : '';
  const STATE = { HOLIDAY: 'Holiday', REST: 'Rest day', ABSENT: 'Absent', TODAY: '—', ACTIVE: 'On duty' };

  function print(d) {
    const t = d.totals, c = d.certification, sup = (d.supervisors || []).join(', ') || '—';
    const rows = d.rows.map(r => {
      const cls = r.shift_id ? '' : r.state === 'ABSENT' ? 'abs' : 'off';
      if (!r.shift_id) return `<tr class="${cls}"><td>${esc(U.fmtShortDate(r.date))}</td><td colspan="9">${esc(r.holiday || STATE[r.state] || '')}</td></tr>`;
      const st = r.status === 'APPROVED' ? '' : r.status === 'REJECTED' ? 'Rejected' : 'Pending';
      return `<tr><td>${esc(U.fmtShortDate(r.date))}</td><td>${esc(U.fmtTime(r.time_in))}</td><td>${r.time_out ? esc(U.fmtTime(r.time_out)) : '—'}</td>
        <td class="n">${r.regular_hours}</td><td class="n">${mins(r.late_min)}</td><td class="n">${mins(r.under_min)}</td>
        <td class="n">${r.ot_hours ? r.ot_hours + (r.ot_status === 'APPROVED' ? '' : ' (pending)') : ''}</td><td class="n"><b>${r.counted_hours}</b></td>
        <td>${esc(st || (r.verified_by || (r.approval_method === 'AUTO' ? 'Auto-verified' : '')))}</td></tr>`;
    }).join('');
    open('DTR — ' + d.student.name, `
      <h1>City of Malabon University</h1><h2>Daily Time Record — On-the-Job Training</h2>
      <div class="meta"><div><b>Name:</b> ${esc(d.student.name)}</div><div><b>Student ID:</b> ${esc(d.student.sid)}</div>
        <div><b>Program / Section:</b> ${esc(d.student.program || '')} ${esc(d.student.section || '')}</div><div><b>Company:</b> ${esc(d.company ? d.company.name : '—')}</div>
        <div><b>Period:</b> ${esc(U.fmtShortDate(d.period.from))} – ${esc(U.fmtShortDate(d.period.to))}</div><div><b>Supervisor:</b> ${esc(sup)}</div>
        <div><b>Schedule:</b> ${esc(d.schedule.days_label)}, ${esc(d.schedule.start)} – ${esc(d.schedule.end)} (break ${d.schedule.break_min} min)</div><div><b>Printed:</b> ${esc(new Date().toLocaleString())}</div></div>
      <table><thead><tr><th>Date</th><th>Time in</th><th>Time out</th><th class="n">Regular h</th><th class="n">Late</th><th class="n">Undertime</th><th class="n">Overtime h</th><th class="n">Counted h</th><th>Verified</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="tot"><div>Days present<br><b>${t.present}</b> of ${t.required_days}</div><div>Absent<br><b>${t.absent}</b></div><div>Late / Undertime<br><b>${mins(t.late_min) || '0'}</b> / <b>${mins(t.under_min) || '0'}</b></div>
        <div>Overtime<br><b>${t.ot_approved}</b> h counted${t.ot_hours > t.ot_approved ? ` (${+(t.ot_hours - t.ot_approved).toFixed(2)} h not approved)` : ''}</div></div>
      <p style="font-size:14px"><b>Total counted hours in this period:</b> ${t.counted_hours}${d.target ? ` &nbsp;•&nbsp; Required: ${d.target} h` : ''}</p>
      ${c ? `<div class="cert">✔ Certified correct by ${esc(c.by)} on ${esc(new Date(c.at).toLocaleDateString())}${c.note ? ' — ' + esc(c.note) : ''}</div>` : ''}
      <div class="sig"><div>Trainee</div><div>Company supervisor</div><div>Faculty adviser</div></div>`);
  }

  function accHtml(a) {
    return `<div class="acc"><b>${esc(a.title)}</b> <span class="small">— ${esc(U.fmtDateLong(a.date))} • ${a.hours} h${a.status === 'VERIFIED' ? ' • verified by ' + esc(a.verified_by) : ''}</span>
      <div style="margin-top:4px">${esc(a.description)}</div><div class="ev">${(a.evidence || []).map(e => `<img src="${e.data}" alt="Evidence">`).join('')}</div></div>`;
  }
  function report(r, s) {
    const files = (r.attachments || []).filter(f => /^data:image/.test(f.data || ''));
    open('Narrative report — ' + r.title, `
      <h1>City of Malabon University</h1><h2>Narrative Report — On-the-Job Training</h2>
      <div class="meta"><div><b>Name:</b> ${esc(s.name)}</div><div><b>Student ID:</b> ${esc(s.sid || '')}</div><div><b>Company:</b> ${esc(s.company || '—')}</div><div><b>Date:</b> ${esc(U.fmtDateLong(r.date))}</div></div>
      <h3>${esc(r.title)}</h3><div style="white-space:pre-wrap;font-size:13px;line-height:1.5">${esc(r.body || '(Soft copy attached below.)')}</div>
      ${(r.accomplishments || []).length ? `<h3>Accomplishments</h3>${r.accomplishments.map(accHtml).join('')}` : ''}
      ${files.length ? `<h3>Attached soft copy</h3><div class="ev">${files.map(f => `<img src="${f.data}" style="height:420px" alt="">`).join('')}</div>` : ''}
      ${r.feedback ? `<h3>Adviser feedback</h3><p style="font-size:13px">${esc(r.feedback)}</p>` : ''}
      <div class="sig"><div>Trainee</div><div>Company supervisor</div><div>Faculty adviser</div></div>`);
  }
  return { print, report, accHtml };
})();
