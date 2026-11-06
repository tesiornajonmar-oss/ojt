(async () => {
  const me = await Shell.init('evaluations');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let rows = [];

  async function render() {
    try { rows = await API.supervisor.evaluations(); } catch (e) { return toast(e.message, 'err'); }
    $('tbody').innerHTML = rows.map(r => {
      const ev = r.evaluation, vals = ev ? Object.values(ev.ratings || {}) : [];
      const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
      return `<tr><td><b>${esc(r.name)}</b><div class="small muted">${esc(r.sid)} • ${esc(r.program)}</div></td>
        <td class="prog-cell">${progBar(r)}<div class="small muted">${r.pct}% • ${statusChip(r.status)}</div></td>
        <td>${ev ? `<span class="chip ${ev.status === 'SUBMITTED' ? 'moa-approved' : 'moa-pending'}">${ev.status === 'SUBMITTED' ? 'Submitted' : 'Draft'}</span>${avg ? ` <span class="small">⭐ ${avg}</span>` : ''}` : '<span class="muted small">Not started</span>'}</td>
        <td><button class="btn ${ev && ev.status === 'SUBMITTED' ? 'btn-outline' : 'btn-navy'} btn-sm" data-sid="${esc(r.sid)}" type="button">${ev ? (ev.status === 'SUBMITTED' ? 'View' : 'Continue') : 'Evaluate'}</button></td></tr>`;
    }).join('');
    $('emptyNote').hidden = rows.length > 0;
    $('tbody').querySelectorAll('[data-sid]').forEach(b => b.onclick = () => openForm(b.dataset.sid));
  }

  function openForm(sid) {
    const r = rows.find(x => x.sid === sid), ev = r.evaluation;
    if (ev && ev.status === 'SUBMITTED') {
      Modal.open({ wide: true, title: `Evaluation — ${esc(r.name)}`, body: Widgets.evaluationView(ev), footer: '<button class="btn btn-outline" id="eClose" type="button">Close</button>' });
      $('eClose').onclick = () => Modal.close(); return;
    }
    const ratings = { ...(ev ? ev.ratings : {}) };
    Modal.open({
      wide: true, title: `Evaluate — ${esc(r.name)}`,
      body: `<p class="small muted">Rate each area from 1 (poor) to 5 (excellent).</p>
        ${Widgets.CRITERIA.map(([k, l]) => `<div class="rate-row"><span>${l}</span><span class="stars" data-k="${k}">${[1, 2, 3, 4, 5].map(i => `<label data-v="${i}" title="${i}">★</label>`).join('')}</span></div>`).join('')}
        <div class="field" style="margin-top:14px"><label>Comments</label><textarea id="eComments" rows="4" maxlength="2000" placeholder="Strengths, areas to improve, notable work…">${esc(ev ? ev.comments : '')}</textarea></div>
        <div class="field" style="margin-top:10px"><label>Would you recommend this trainee for employment / future OJT?</label>
          <select id="eRec"><option value="">— choose —</option><option value="YES" ${ev && ev.recommend === 'YES' ? 'selected' : ''}>Yes, I recommend</option><option value="NO" ${ev && ev.recommend === 'NO' ? 'selected' : ''}>No</option></select></div>
        <p class="error" id="eErr"></p>`,
      footer: '<button class="btn btn-outline" id="eCancel" type="button">Cancel</button><button class="btn btn-outline" id="eDraft" type="button">Save draft</button><button class="btn btn-navy" id="eSubmit" type="button">Submit evaluation</button>'
    });
    const paint = () => document.querySelectorAll('.stars').forEach(s => s.querySelectorAll('label').forEach(l => l.classList.toggle('on', +l.dataset.v <= (ratings[s.dataset.k] || 0))));
    document.querySelectorAll('.stars label').forEach(l => l.onclick = () => { ratings[l.closest('.stars').dataset.k] = +l.dataset.v; paint(); });
    paint();
    $('eCancel').onclick = () => Modal.close();
    const save = submit => async () => {
      try {
        await API.supervisor.saveEvaluation({ sid, ratings, comments: $('eComments').value.trim(), recommend: $('eRec').value || null, submit });
        Modal.close(); toast(submit ? 'Evaluation submitted — your faculty adviser was notified.' : 'Draft saved.'); render();
      } catch (e) { $('eErr').textContent = e.message; }
    };
    guarded($('eDraft'), save(false));
    guarded($('eSubmit'), async () => { if (confirm('Submit this evaluation? You will not be able to edit it afterwards.')) await save(true)(); });
  }
  render();
})();
