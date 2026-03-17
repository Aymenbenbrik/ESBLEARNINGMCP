// Bolt-inspired sidebar collapse + small UX helpers
(function () {
  const KEY = 'esb_sidebar_collapsed';

  function setCollapsed(isCollapsed) {
    const app = document.querySelector('.esb-app');
    if (!app) return;
    app.classList.toggle('esb-collapsed', !!isCollapsed);
    try { localStorage.setItem(KEY, isCollapsed ? '1' : '0'); } catch (e) {}
  }

  function getCollapsed() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Restore collapsed state
    setCollapsed(getCollapsed());

    const btn = document.getElementById('esbSidebarToggle');
    if (btn) {
      btn.addEventListener('click', function () {
        const app = document.querySelector('.esb-app');
        const isCollapsed = app ? app.classList.contains('esb-collapsed') : false;
        setCollapsed(!isCollapsed);
      });
    }
  });
})();
