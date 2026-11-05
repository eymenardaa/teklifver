// Tema sayfa çizilmeden önce uygulanır; böylece siyah temada beyaz bir an parlamaz.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (err) { /* depolama kapalı olabilir */ }
  var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
