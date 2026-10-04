(function () {
  function switchTab(to) {
    document.querySelectorAll('.auth-tabs .tab-btn').forEach(btn => {
      const active = btn.dataset.tab === to;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      const active = pane.id === 'tab-' + to;
      pane.classList.toggle('active', active);
      pane.setAttribute('aria-hidden', !active);
    });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn?.dataset.tab) {
      e.preventDefault();
      switchTab(btn.dataset.tab);
      history.replaceState?.(null, '', '#' + btn.dataset.tab);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    const hash = location.hash.replace('#', '');
    switchTab(['register', 'login'].includes(hash) ? hash : 'login');
  });
})();
