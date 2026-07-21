/* ============================================================================
   theme.js — JEEMaxxing Theme Engine (append-only, self-wiring).
   Injects a glass theme-switcher pill next to the logo, opens an aesthetic
   dropdown, and re-skins the whole app by flipping [data-theme] on <html>.
   Palettes live in styles.css (THEME ENGINE block). Choice persists in
   localStorage('jeemax_theme'). Zero dependencies on app.js / storage.js.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__themeInit) return;
  window.__themeInit = true;

  var LS = 'jeemax_theme';

  var THEMES = [
    { id: 'furnace',    name: 'Furnace',    desc: 'Amber heat · stock build', dots: ['#ffb224', '#ff7a1a', '#3ddcff'] },
    { id: 'synthwave',  name: 'Synthwave',  desc: 'Violet neon haze',         dots: ['#c084fc', '#e879f9', '#818cf8'] },
    { id: 'glacier',    name: 'Glacier',    desc: 'Ice-blue deep focus',      dots: ['#38bdf8', '#0ea5e9', '#22d3ee'] },
    { id: 'overgrowth', name: 'Overgrowth', desc: 'Bioluminescent green',     dots: ['#34d399', '#10b981', '#a3e635'] },
    { id: 'bloodmoon',  name: 'Blood Moon', desc: 'Crimson aggression',       dots: ['#ef4444', '#f97316', '#fbbf24'] },
    { id: 'sakura',     name: 'Sakura',     desc: 'Rose quartz calm',         dots: ['#f472b6', '#fb7185', '#c4b5fd'] },
    { id: 'stealth',    name: 'Stealth',    desc: 'Monochrome ops',           dots: ['#e5e7eb', '#9ca3af', '#4b5563'] }
  ];

  var btn = null, panel = null;

  function current() {
    try { return localStorage.getItem(LS) || 'furnace'; } catch (e) { return 'furnace'; }
  }
  function byId(id) {
    for (var i = 0; i < THEMES.length; i++) { if (THEMES[i].id === id) return THEMES[i]; }
    return THEMES[0];
  }
  function dotBg(t) {
    return 'conic-gradient(from 210deg,' + t.dots[0] + ',' + t.dots[1] + ',' + t.dots[2] + ',' + t.dots[0] + ')';
  }

  function apply(id, persist) {
    var t = byId(id);
    document.documentElement.setAttribute('data-theme', t.id);
    if (persist !== false) { try { localStorage.setItem(LS, t.id); } catch (e) {} }
    if (btn) {
      var d = btn.querySelector('.theme-btn-dot');
      if (d) d.style.background = dotBg(t);
      btn.title = 'Theme: ' + t.name;
    }
    if (panel) {
      var opts = panel.querySelectorAll('.theme-opt');
      for (var i = 0; i < opts.length; i++) {
        var on = opts[i].getAttribute('data-theme-id') === t.id;
        opts[i].classList.toggle('active', on);
        opts[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }
    }
    try {
      document.dispatchEvent(new CustomEvent('jeemax:themechange', { detail: { theme: t.id } }));
    } catch (e) {}
  }

  function isOpen() { return !!(panel && panel.classList.contains('open')); }

  function position() {
    if (!btn || !panel) return;
    var r = btn.getBoundingClientRect();
    var pw = panel.offsetWidth || 264;
    var ph = panel.offsetHeight || 400;
    var left = Math.max(12, Math.min(r.left, window.innerWidth - pw - 12));
    var top = r.bottom + 10;
    if (top + ph > window.innerHeight - 12) top = Math.max(12, r.top - ph - 10);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }
  function open()  { panel.classList.add('open');    btn.setAttribute('aria-expanded', 'true');  position(); }
  function close() { panel.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }

  function mount() {
    if (btn) return;
    var sb = document.getElementById('sidebar') || document.querySelector('.sidebar');
    if (!sb) { requestAnimationFrame(mount); return; }

    // ── Trigger pill — docks right after the logo in either layout ──
    btn = document.createElement('button');
    btn.id = 'theme-btn';
    btn.className = 'theme-btn';
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML =
      '<span class="theme-btn-dot"></span>' +
      '<span class="theme-btn-label">Theme</span>' +
      '<span class="theme-btn-chev">▾</span>';
    var logo = sb.querySelector('.logo-container');
    if (logo && logo.parentNode === sb) sb.insertBefore(btn, logo.nextSibling);
    else sb.insertBefore(btn, sb.firstChild);

    // ── Dropdown panel — fixed + appended to body so it's never clipped ──
    panel = document.createElement('div');
    panel.id = 'theme-panel';
    panel.className = 'theme-panel';
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', 'App theme');
    var html = ['<div class="theme-panel-head">THEME ENGINE</div>'];
    for (var i = 0; i < THEMES.length; i++) {
      var t = THEMES[i];
      html.push(
        '<button type="button" class="theme-opt" role="option" aria-selected="false" data-theme-id="' + t.id + '">' +
          '<span class="theme-opt-dot" style="background:' + dotBg(t) + '"></span>' +
          '<span class="theme-opt-txt">' +
            '<span class="theme-opt-name">' + t.name + '</span>' +
            '<span class="theme-opt-desc">' + t.desc + '</span>' +
          '</span>' +
          '<span class="theme-opt-check">✓</span>' +
        '</button>'
      );
    }
    panel.innerHTML = html.join('');
    document.body.appendChild(panel);

    // ── Wiring ──
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isOpen()) close(); else open();
    });
    var opts = panel.querySelectorAll('.theme-opt');
    for (var j = 0; j < opts.length; j++) {
      opts[j].addEventListener('click', function () {
        apply(this.getAttribute('data-theme-id'));   // panel stays open → live preview
      });
    }
    document.addEventListener('pointerdown', function (e) {
      if (!isOpen()) return;
      if (btn.contains(e.target) || panel.contains(e.target)) return;
      close();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });
    window.addEventListener('resize', function () { if (isOpen()) position(); });
    window.addEventListener('scroll', function () { if (isOpen()) position(); }, true);

    apply(current(), false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  // Debug / programmatic surface:  JEEMaxTheme.set('sakura')
  window.JEEMaxTheme = {
    set: function (id) { apply(id, true); },
    get: current,
    themes: THEMES
  };
})();
