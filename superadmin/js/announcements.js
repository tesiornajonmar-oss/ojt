(async () => {
  const me = await Shell.init('announcements');
  if (!me) return;
  const $ = id => document.getElementById(id);
  let advisers = [];
  try { advisers = await API.admin.advisers(); } catch (e) { toast(e.message, 'err'); }
  $('aAudience').innerHTML = '<option value="ALL">All trainees</option>' + advisers.map(a => `<option value="${esc(a.id)}">Trainees of ${esc(a.name)}</option>`).join('');
  const audLabel = aud => { if (aud === 'ALL') return 'All trainees'; const a = advisers.find(x => x.id === aud); return a ? `Trainees of ${a.name}` : aud; };

  async function render() {
    let list;
    try { list = await API.admin.announcements(); } catch (e) { return toast(e.message, 'err'); }
    const today = U.dateStr();
    $('annList').innerHTML = list.length ? list.map(a => {
      const expired = a.expires && a.expires < today;
      const state = expired ? ['Expired', 'moa-expired'] : a.active ? ['Live', 'moa-approved'] : ['Hidden', 'moa-not_required'];
      return `<div class="ann-item"><h4>${a.priority === 'important' ? '🔴' : '🟡'} ${esc(a.title)} <span class="chip ${state[1]}">${state[0]}</span></h4><p class="small">${esc(a.message)}</p>
        <div class="ann-meta">To: ${esc(audLabel(a.audience))} (${a.reach} trainees) • Posted ${U.fmtShortDate(a.created.slice(0, 10))} by ${esc(a.author)}${a.expires ? ` • Hides after ${U.fmtShortDate(a.expires)}` : ''}</div>
        <div class="ann-actions"><button class="btn btn-outline btn-sm" data-toggle="${esc(a.id)}" type="button">${a.active ? 'Hide' : 'Show'}</button>
          <button class="btn btn-outline btn-sm danger" data-del="${esc(a.id)}" type="button">Delete</button></div></div>`;
    }).join('') : '<p class="muted">No announcements yet. Post the first one on the left.</p>';
    $('annList').querySelectorAll('[data-toggle]').forEach(b => guarded(b, async () => { await API.admin.toggleAnnouncement({ id: b.dataset.toggle }); render(); }));
    $('annList').querySelectorAll('[data-del]').forEach(b => guarded(b, async () => {
      if (!confirm('Delete this announcement?')) return;
      await API.admin.removeAnnouncement({ id: b.dataset.del }); toast('Announcement deleted.', 'warn'); render();
    }));
  }

  guarded($('postBtn'), async () => {
    const err = $('aErr'), title = $('aTitle').value.trim(), message = $('aMessage').value.trim(), exp = $('aExpires').value;
    if (!title) { err.textContent = 'Please add a title.'; return; }
    if (message.length < 5) { err.textContent = 'Please write a short message.'; return; }
    if (exp && exp < U.dateStr()) { err.textContent = 'The hide-after date is already in the past.'; return; }
    err.textContent = '';
    try {
      await API.admin.postAnnouncement({ title, message, audience: $('aAudience').value, priority: $('aPriority').value, expires: exp });
      $('aTitle').value = ''; $('aMessage').value = ''; $('aExpires').value = '';
      toast('Announcement posted — trainees will see it on their dashboard.'); render();
    } catch (e) { err.textContent = e.message; }
  });
  render();
})();
