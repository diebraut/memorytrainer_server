(function () {
  function switchTab(to) {
    const btns = document.querySelectorAll('.auth-tabs .tab-btn');
    const panes = document.querySelectorAll('.tab-pane');

    btns.forEach(b => {
      const active = b.dataset.tab === to;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    panes.forEach(p => {
      const active = p.id === 'tab-' + to;
      p.classList.toggle('active', active);
      p.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    e.preventDefault();
    const to = btn.dataset.tab;
    if (to) {
      switchTab(to);
      // optional: URL-Hash setzen, damit Reload die Auswahl merkt
      if (history && history.replaceState) {
        history.replaceState(null, '', '#' + to);
      }
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    const hash = (location.hash || '').replace('#', '');
    if (hash === 'register' || hash === 'login') {
      switchTab(hash);
    } else {
      switchTab('login');
    }
  });
})();
(function(){
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if(!btn) return;
    const to = btn.dataset.tab;
    if(!to) return;

    // Deaktivieren, wenn nur ein Panel existiert
    const panes = document.querySelectorAll('.panels .panel');
    if(panes.length <= 1) return;

    document.querySelectorAll('.tabs .tab').forEach(b => b.classList.toggle('active', b === btn));
    panes.forEach(p => p.classList.toggle('active', p.id === 'panel-' + to));
  });
})();
