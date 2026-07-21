/* ============================================================================
   dashboard-clean.js — Dashboard declutter + Layout FAB (append-only).
   1. Flags body.dc-active  → CSS hides the cat banner + header badge row
      (date / streak / study-time). Elements stay mounted, so the telemetry
      loop, streak/date writers and switchTab() never crash.
   2. Reparents the Cloud Link cluster into the ☁ Cloud Storage settings card
      (listeners + IDs travel with the node).
   3. Adopts the bento .bento-toolbar as a floating glass panel, opened by a
      small pencil FAB that only exists on the dashboard.
   No changes to app.js / bento.js / storage.js.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__dashCleanInit) return;
  window.__dashCleanInit = true;

  var fab = null, panel = null, dash = null, tries = 0;

  /* ── Cloud Link → Settings → Cloud Storage card ─────────────────────── */
  function moveCloudCluster() {
    var cluster = document.querySelector('.header-badges .sync-cluster') ||
                  document.querySelector('.sync-cluster');
    if (!cluster || cluster.classList.contains('dc-cloud-row')) return;
    var card = null;
    var cards = document.querySelectorAll('.settings-card');
    for (var i = 0; i < cards.length; i++) {
      var h = cards[i].querySelector('h3');
      if (h && /cloud/i.test(h.textContent)) { card = cards[i]; break; }
    }
    if (!card) card = document.querySelector('#view-settings .settings-card') ||
                      document.querySelector('.settings-card');
    if (!card) return;                    // leave it in place if Config is missing
    cluster.classList.add('dc-cloud-row');
    card.appendChild(cluster);
  }

  /* ── Pencil FAB ─────────────────────────────────────────────────────── */
  function buildFab() {
    fab = document.createElement('button');
    fab.id = 'dc-layout-fab';
    fab.type = 'button';
    fab.title = 'Layout settings';
    fab.setAttribute('aria-label', 'Open layout settings');
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    dash.appendChild(fab);               // inside #view-dashboard → auto-hides on other tabs

    fab.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel && panel.classList.contains('open')) closePanel(); else openPanel();
    });
    document.addEventListener('pointerdown', function (e) {
      if (!panel || !panel.classList.contains('open')) return;
      if (panel.contains(e.target) || (fab && fab.contains(e.target))) return;
      closePanel();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePanel();
    });
    // Leaving the dashboard tab → tuck the panel away.
    new MutationObserver(function () {
      if (!dash.classList.contains('active')) closePanel();
    }).observe(dash, { attributes: true, attributeFilter: ['class'] });
  }

  function openPanel() {
    if (!panel) return;
    panel.classList.add('open');
    if (fab) { fab.classList.add('active'); fab.setAttribute('aria-expanded', 'true'); }
  }
  function closePanel() {
    if (!panel) return;
    panel.classList.remove('open');
    if (fab) { fab.classList.remove('active'); fab.setAttribute('aria-expanded', 'false'); }
  }

  /* ── Boot + poll (bento.js injects the toolbar after we run) ────────── */
  function tick() {
    tries++;
    if (!document.body) { requestAnimationFrame(tick); return; }
    document.body.classList.add('dc-active');
    moveCloudCluster();
    if (!dash) dash = document.getElementById('view-dashboard');
    if (dash && !fab) buildFab();
    if (!panel) {
      var tb = (dash && dash.querySelector('.bento-toolbar')) ||
               document.querySelector('.bento-toolbar');
      if (tb) { panel = tb; panel.classList.add('dc-fab-panel'); }
    }
    if (!panel) {
      if (tries < 60) setTimeout(tick, 400);          // keep looking ~24s
      else if (fab && fab.parentNode) {               // no layout engine → no FAB
        fab.parentNode.removeChild(fab); fab = null;
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick);
  else tick();

  window.__dashClean = { open: openPanel, close: closePanel };
})();
