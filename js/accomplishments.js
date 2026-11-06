async function preparePhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`"${file.name}" is not a JPG, PNG or WebP photo.`);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open that image.')); i.src = URL.createObjectURL(file); });
  const k = Math.min(1, 1100 / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
  return { name: file.name.replace(/\.\w+$/, '') + '.jpg', type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.72) };
}
(async () => {
  const me = await Shell.init('accomplishments');
  if (!me) return;
  const $ = id => document.getElementById(id);
  const STL = { SUBMITTED: ['Waiting for verification', 'pill-pending'], VERIFIED: ['Verified', 'pill-approved'], REVISION: ['Needs improvement', 'pill-revision'] };
  let list = [];
  async function render() {
    try { list = await API.student.accomplishments(); } catch (e) { return toast(e.message, 'err'); }
    $('revBox').innerHTML = list.filter(x => x.status === 'REVISION').map(x => `<div class="revision-banner" style="margin-bottom:12px"><div><b>✏️ ${esc(x.title)}</b><p class="small" style="margin-top:4px">${esc(x.feedback)}</p></div>
      <button class="btn btn-outline btn-sm" data-edit="${esc(x.id)}" type="button">Improve now</button></div>`).join('');
    $('grid').innerHTML = list.map(x => { const [t, c] = STL[x.status] || [x.status, '']; const ed = x.status !== 'VERIFIED';
      return `<div class="card acc-card"><div class="acc-photos">${x.evidence.map((e, i) => `<img src="${esc(e.data)}" alt="Evidence ${i + 1}" data-zoom="${esc(x.id)}:${i}">`).join('')}</div>
        <div class="acc-body"><b>${esc(x.title)}</b><div class="small muted">${U.fmtDateLong(x.date)} • ${x.hours} h</div><p class="small" style="margin:6px 0">${esc(x.description)}</p>
        <span class="${c}">${t}</span>${x.verified_by ? ` <span class="small muted">by ${esc(x.verified_by)}</span>` : ''}
        <div style="margin-top:8px">${ed ? `<button class="btn btn-outline btn-sm" data-edit="${esc(x.id)}" type="button">Edit</button> <button class="btn btn-outline danger btn-sm" data-del="${esc(x.id)}" type="button">Delete</button>` : ''}</div></div></div>`; }).join('');
    $('emptyNote').hidden = list.length > 0;
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(b.dataset.edit));
    document.querySelectorAll('[data-del]').forEach(b => guarded(b, async () => { if (!confirm('Delete this accomplishment?')) return; await API.student.deleteAccomplishment({ id: b.dataset.del }); toast('Deleted.', 'warn'); render(); }));
    document.querySelectorAll('[data-zoom]').forEach(i => i.onclick = () => { const [id, n] = i.dataset.zoom.split(':'); Modal.open({ wide: true, title: 'Evidence', body: `<img src="${esc(list.find(x => x.id === id).evidence[+n].data)}" style="max-width:100%;border-radius:8px" alt="">` }); });
  }
  function edit(id) {
    const x = id ? list.find(y => y.id === id) : null; let ev = x ? x.evidence.map(e => ({ ...e })) : [];
    Modal.open({ wide: true, title: x ? 'Edit accomplishment' : 'New accomplishment', body: `<div class="form-grid">
      <div class="field"><label>Date</label><input id="aDate" type="date" max="${U.dateStr()}" value="${esc(x ? x.date : U.dateStr())}"></div>
      <div class="field"><label>Hours spent</label><input id="aHrs" type="number" min="0.25" max="24" step="0.25" value="${x ? x.hours : ''}"></div>
      <div class="field full"><label>Title *</label><input id="aTitle" maxlength="120" value="${esc(x ? x.title : '')}" placeholder="e.g., Installed and configured 12 workstations"></div>
      <div class="field full"><label>What did you do? *</label><textarea id="aDesc" rows="4">${esc(x ? x.description : '')}</textarea></div>
      <div class="field full"><label>Photo evidence * <span class="muted">(1–4 photos of the work, output or activity)</span></label>
        <label class="dropzone" for="aFiles"><input id="aFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden><span>📷 <b>Choose or take photos</b></span></label><div id="aEv" class="att-row"></div></div></div><p class="error" id="aErr"></p>`,
      footer: '<button class="btn btn-outline" id="aCancel" type="button">Cancel</button><button class="btn btn-navy" id="aSave" type="button">Submit for verification</button>' });
    const paint = () => { $('aEv').innerHTML = ev.map((e, i) => `<span class="att-item"><img class="att-thumb" src="${esc(e.data)}" alt=""><button type="button" class="att-x" data-rm="${i}" aria-label="Remove">✕</button></span>`).join('');
      $('aEv').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { ev.splice(+b.dataset.rm, 1); paint(); }); };
    paint();
    $('aFiles').onchange = async e => { $('aErr').textContent = '';
      for (const f of [...e.target.files]) { if (ev.length >= 4) { $('aErr').textContent = 'Up to 4 photos.'; break; } try { ev.push(await preparePhoto(f)); } catch (err) { $('aErr').textContent = err.message; } }
      e.target.value = ''; paint(); };
    $('aCancel').onclick = () => Modal.close();
    guarded($('aSave'), async () => { try {
      await API.student.saveAccomplishment({ id: x ? x.id : null, date: $('aDate').value, hours: $('aHrs').value, title: $('aTitle').value, description: $('aDesc').value, evidence: ev });
      Modal.close(); toast('Submitted to your supervisor.'); render(); } catch (err) { $('aErr').textContent = err.message; } });
  }
  $('newBtn').onclick = () => edit(null);
  render();
})();
