/* Shared by admin/messages.html and supervisor/messages.html */
(async () => {
  const me = await Shell.init('messages');
  if (!me) return;
  Messages.mount(document.getElementById('msgRoot'));
})();
