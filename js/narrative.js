// Soft limits for the demo (it stores files in the browser). A real server can allow more — see BACKEND_GUIDE.md.
const ATT = { MAX_FILES: 3, MAX_PDF_BYTES: 1.5 * 1024 * 1024, MAX_IMG_SIDE: 1400 };
function readAsDataUrl(file) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error('Could not read that file.')); fr.readAsDataURL(file); }); }
async function prepareAttachment(file) {
  if (file.type === 'application/pdf') {
    if (file.size > ATT.MAX_PDF_BYTES) throw new Error(`"${file.name}" is too big for the demo (PDF max ${ATT.MAX_PDF_BYTES / 1048576} MB). Take a photo instead.`);
    return { name: file.name, type: file.type, data: await readAsDataUrl(file) };
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`"${file.name}" is not a JPG, PNG or PDF file.`);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open that image.')); i.src = URL.createObjectURL(file); });
  const k = Math.min(1, ATT.MAX_IMG_SIDE / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return { name: file.name.replace(/\.\w+$/, '') + '.jpg', type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.78) };
}

(async () => {
  const me = await Shell.init('narrative');
  if (!me) return;
  const $ = id => document.getElementById(id);
  const stl = { DRAFT: ['Draft', 'pill-pending'], PENDING: ['Waiting for review', 'pill-pending'], APPROVED: ['Approved', 'pill-approved'], REVISION: ['Needs revision', 'pill-revision'] };
  let list = [], accs = [];

  async function render() {
    try { list = await API.student.reports(); accs = await API.student.accomplishments(); } catch (e) { return toast(e.message, 'err'); }
    $('revBox').innerHTML = list.filter(r => r.status === 'REVISION').map(r => `
      <div class="revision-banner" style="margin-bottom:12px">
        <div><b>✏️ Revision requested — ${esc(r.title)}</b><p class="small" style="margin-top:4px">${esc(r.feedback)}</p></div>
        <button class="btn btn-outline btn-sm" data-edit="${esc(r.id)}" type="button">Revise now</button></div>`).join('');
    $('tbody').innerHTML = list.map(r => {
      const [txt, cls] = stl[r.status] || [r.status, ''];
      const editable = r.status === 'DRAFT' || r.status === 'REVISION';
      return `<tr><td>${U.fmtShortDate(r.date)}</td><td><b>${esc(r.title)}</b>${r.attachments && r.attachments.length ? ` <span class="small muted" title="Attached copy">📎 ${r.attachments.length}</span>` : ''}</td><td><span class="${cls}">${txt}</span></td><td class="small">${esc(r.feedback || '—')}</td>
        <td style="white-space:nowrap"><button class="btn btn-outline btn-sm" data-${editable ? 'edit' : 'view'}="${esc(r.id)}" type="button">${editable ? 'Edit' : 'View'}</button>
        ${r.status === 'DRAFT' ? `<button class="btn btn-outline danger btn-sm" data-del="${esc(r.id)}" type="button" style="margin-left:6px">Delete</button>` : ''}</td></tr>`;
    }).join('');
    $('emptyNote').hidden = list.length > 0;
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openEditor(b.dataset.edit));
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openView(b.dataset.view));
    document.querySelectorAll('[data-del]').forEach(b => guarded(b, async () => {
      if (!confirm('Delete this draft?')) return;
      await API.student.deleteReport({ id: b.dataset.del }); toast('Draft deleted.', 'warn'); render();
    }));
  }

  function openView(id) {
    const r = list.find(x => x.id === id); if (!r) return;
    Modal.open({ wide: true, title: esc(r.title), body: `<p class="small muted">${U.fmtDateLong(r.date)}</p>${r.body ? `<div class="report-body">${esc(r.body)}</div>` : ''}${(r.accomplishments || []).length ? `<h4 style="margin:12px 0 6px">Accomplishments</h4>${r.accomplishments.map(a => `<div class="small"><b>${esc(a.title)}</b> — ${a.hours} h <div class="att-row">${a.evidence.map(e => `<img class="att-thumb" src="${esc(e.data)}" alt="">`).join('')}</div></div>`).join('')}` : ''}${Widgets.attachmentsHtml(r)}`,
      footer: '<button class="btn btn-outline" id="vPrint" type="button">🖨️ Print</button><button class="btn btn-outline" id="vClose" type="button">Close</button>' });
    $('vPrint').onclick = () => DTR.report(r, { name: me.name, sid: me.student_id, company: '' });
    Widgets.bindAttachments(document, [r]);
    $('vClose').onclick = () => Modal.close();
  }

  function openEditor(id) {
    const r = id ? list.find(x => x.id === id) : null;
    Modal.open({
      wide: true, title: r ? 'Edit report' : 'New narrative report',
      body: `${r && r.status === 'REVISION' ? `<div class="revision-banner" style="margin-bottom:12px"><div><b>Adviser feedback</b><p class="small">${esc(r.feedback)}</p></div></div>` : ''}
        <div class="form-grid">
          <div class="field"><label>Date</label><input id="nDate" type="date" value="${esc(r ? r.date : U.dateStr())}"></div>
          <div class="field"><label>Title *</label><input id="nTitle" maxlength="90" value="${esc(r ? r.title : '')}" placeholder="e.g., Week 4 – Database Migration"></div>
          <div class="field full"><label>Narrative *</label><textarea id="nBody" rows="8" placeholder="What did you do, what tools did you use, and what did you learn?">${esc(r ? r.body : '')}</textarea></div>
          <div class="field full"><label>Attach your written report <span class="muted">(optional — scan, photo or PDF, up to ${ATT.MAX_FILES} files)</span></label>
            <label class="dropzone" for="nFiles"><input id="nFiles" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden>
              <span>📎 <b>Choose files</b> to attach a photo or scan of your handwritten report</span></label>
            <div id="nAtt" class="att-row"></div></div>
          <div class="field full"><label>Include accomplishments <span class="muted">(their evidence photos are printed with the report)</span></label>${accs.length ? accs.map(a => `<label class="small" style="display:block;margin:3px 0"><input type="checkbox" data-acc="${esc(a.id)}" ${r && (r.accomplishment_ids || []).includes(a.id) ? 'checked' : ''}> ${esc(a.title)} <span class="muted">(${U.fmtShortDate(a.date)}, ${a.status === 'VERIFIED' ? 'verified' : 'not yet verified'})</span></label>`).join('') : '<p class="small muted">No accomplishments yet — add them under Accomplishments.</p>'}</div>
        </div><p class="error" id="nErr"></p>`,
      footer: `<button class="btn btn-outline" id="nCancel" type="button">Cancel</button><button class="btn btn-outline" id="nDraft" type="button">Save draft</button><button class="btn btn-navy" id="nSubmit" type="button">Submit for review</button>`
    });
    const g = k => $(k).value.trim();
    let files = (r && r.attachments ? r.attachments : []).map(a => ({ ...a }));
    const paintFiles = () => {
      $('nAtt').innerHTML = files.map((a, i) => `<span class="att-item">${/^image\//.test(a.type) ? `<img class="att-thumb" src="${esc(a.url || a.data)}" alt="">` : '📄'} <span class="small">${esc(a.name)}</span>
        <button type="button" class="att-x" data-rm="${i}" aria-label="Remove">✕</button></span>`).join('');
      $('nAtt').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { files.splice(+b.dataset.rm, 1); paintFiles(); });
    };
    paintFiles();
    $('nFiles').onchange = async e => {
      $('nErr').textContent = '';
      for (const f of [...e.target.files]) {
        if (files.length >= ATT.MAX_FILES) { $('nErr').textContent = `You can attach up to ${ATT.MAX_FILES} files.`; break; }
        try { files.push(await prepareAttachment(f)); } catch (x) { $('nErr').textContent = x.message; }
      }
      e.target.value = ''; paintFiles();
    };
    $('nCancel').onclick = () => Modal.close();
    const save = submit => async () => {
      try {
        await API.student.saveReport({ id: r ? r.id : null, title: g('nTitle'), body: g('nBody'), date: g('nDate') || U.dateStr(), attachments: files, accomplishment_ids: [...document.querySelectorAll('[data-acc]:checked')].map(c => c.dataset.acc), submit });
        Modal.close(); toast(submit ? 'Report submitted to your adviser.' : 'Draft saved.'); render();
      } catch (e) { $('nErr').textContent = e.message; }
    };
    guarded($('nDraft'), save(false)); guarded($('nSubmit'), save(true));
  }

  $('newBtn').onclick = () => openEditor(null);
  render();
})();
