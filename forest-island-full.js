/* ============================================================================
forest-island-full.js  ·  INTERACTIVE JOURNEY MAP (full replacement)
A popup that is a draggable / zoomable 3D map of everything you did.
• Time ranges: Today · Yesterday · Week · Month · Year · All  (+ a date anchor)
• Trees = solved questions (persistent, all-time)  +  manual "+" taps
  (manual taps are persisted per-day by an always-on observer, so they
   survive refresh and show up in past ranges too — no double counting).
• Re-uses the Daily Grove island's already-loaded Three.js (no CDN freeze);
  falls back to a CDN only if that isn't ready in time.
• Self-wires ONE obvious 🗺 button, hides the dead iframe button, and
  re-points the island-canvas click here (capture phase) — so there is
  never a second broken button and never an iframe.
• On boot it also heals today's dashboard counters from storage, so the
  little island card and this map agree after a refresh.
Touch nothing else. This file is isolated: if it throws, the app is unaffected.
============================================================================ */
(function () {
'use strict';
if (window.__forestIslandFullInit) return;
window.__forestIslandFullInit = true;

var LS = 'jeemax_forest_daily_v1';
var SUBJ = ['physics', 'chemistry', 'maths'];
var CAP = 3500;
var THREE = null, threePromise = null;
var overlay = null, canvas = null, renderer = null, scene = null, camera = null;
var controls = null, world = null, skyEnv = null, treeMat = null, treeGeos = null, currentWater = null;
var built = false, isOpen = false, raf = null, elT = 0, lastT = 0, LAND_R = 14;
var rebuildTimer = null;
var state = { period: 'all', endDate: todayKey() };
var ui = {};

var TOD = [
  { t:0,   top:0x0a0e1c, bot:0x141a2a, sun:0x3a4a6a, sunI:0.15, hemi:0x2a3040, fog:0x0e1220 },
  { t:22,  top:0x2a3a5e, bot:0xe8956a, sun:0xffb27a, sunI:0.70, hemi:0x5a5a6a, fog:0x3a3040 },
  { t:50,  top:0x4a7ec0, bot:0xc4dcec, sun:0xfff2e0, sunI:1.15, hemi:0x8aa0b8, fog:0x9ab4c8 },
  { t:78,  top:0x3a2a52, bot:0xe07a44, sun:0xff8a4a, sunI:0.75, hemi:0x6a5060, fog:0x4a3444 },
  { t:100, top:0x0a0e1c, bot:0x141a2a, sun:0x3a4a6a, sunI:0.15, hemi:0x2a3040, fog:0x0e1220 }
];

/* ───────────────────────── tiny utils ───────────────────────── */
function el(tag, a) { var n = document.createElement(tag); if (a) for (var k in a) { if (k === 'html') n.innerHTML = a[k]; else if (k === 'class') n.className = a[k]; else n.setAttribute(k, a[k]); } return n; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function dateKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayKey() { return dateKey(Date.now()); }
function dayStartMs(iso) { return new Date(iso + 'T00:00:00').getTime(); }
function dayEndMs(iso) { return new Date(iso + 'T23:59:59.999').getTime(); }
function isoMinus(iso, n) { var d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - n); return dateKey(d.getTime()); }
function hash(x, z) { var n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); }
function vnoise(x, z) { var xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf), a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v; }
function coastR(th) { return LAND_R * (1 + 0.22 * Math.sin(th * 3 + 1.3) + 0.14 * Math.sin(th * 5 + 0.4) + 0.12 * (vnoise(Math.cos(th) * 2 + 5, Math.sin(th) * 2 + 5) - 0.5)); }
function heightAt(x, z) { var r = Math.hypot(x, z), th = Math.atan2(z, x), cr = coastR(th); if (r > cr) return -1.2; var t = r / cr; var dome = (1 - t * t) * 1.7; var beach = t > 0.80 ? -0.7 * ((t - 0.80) / 0.20) : 0; var hills = (vnoise(x * 0.5 + 10, z * 0.5 + 10) - 0.5) * 0.9 * (1 - t); return Math.max(-0.5, dome + hills + beach); }
function realTOD() { var d = new Date(); return ((d.getHours() + d.getMinutes() / 60) / 24) * 100; }
function normSub(s) { s = (s || '').toString().toLowerCase().trim(); if (s === 'math' || s === 'mathematics') return 'maths'; return (s === 'physics' || s === 'chemistry' || s === 'maths') ? s : 'physics'; }
function qEloOf(q) { return (typeof q.qElo === 'number' && q.qElo > 0) ? q.qElo : 1200; }
function getTimeMs(q) { var s = q.lastReviewedAt || q.solvedAt || q.createdAt || q.date || q.ts; if (!s) return null; var t = new Date(s).getTime(); return isNaN(t) ? null : t; }
function getBank() { try { if (window.AppState && Array.isArray(window.AppState.questionBank) && window.AppState.questionBank.length) return window.AppState.questionBank; if (Array.isArray(window.questionBank) && window.questionBank.length) return window.questionBank; } catch (e) {} return []; }
function pretty(iso) { var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; var d = new Date(iso + 'T00:00:00'); return m[d.getMonth()] + ' ' + d.getDate(); }

/* ───────────────────────── persistence (per-day totals) ─────────────────────────
   An always-on observer records, for today, the highest counter value it sees,
   and respects the "−" button (a real decrease). On a refresh the app may
   repaint the counters lower than what you actually did → on boot we push them
   back up to the stored total (date-keyed, so a brand-new day stays 0).       */
function loadStore() { try { var o = JSON.parse(localStorage.getItem(LS) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
function saveStore(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
function storedOf(store, dk) { var c = store[dk] || {}; return { physics: (+c.physics || 0), chemistry: (+c.chemistry || 0), maths: (+c.maths || 0) }; }
function liveCounts() {
  function g(id) { var e = document.getElementById(id); return e ? (parseInt(e.textContent, 10) || 0) : 0; }
  var l = { physics: g('physics-count'), chemistry: g('chemistry-count'), maths: g('maths-count') };
  try { if (window.solved) { l.physics = Math.max(l.physics, +window.solved.physics || 0); l.chemistry = Math.max(l.chemistry, +window.solved.chemistry || 0); l.maths = Math.max(l.maths, +window.solved.maths || 0); } } catch (e) {}
  return l;
}
function setNode(s, v) { var n = document.getElementById(s + '-count'); if (n && (parseInt(n.textContent, 10) || 0) !== v) n.textContent = String(v); try { if (window.solved) window.solved[s] = v; } catch (e) {} }

var lastBtn = { kind: null, at: 0 };
var lastLive = liveCounts();
var userTouched = false;

function startPersistence() {
  // remember whether a + or − was just pressed (capture phase, before app logic)
  document.addEventListener('pointerdown', function (e) {
    try {
      var b = e.target && e.target.closest && e.target.closest('.counter-btn');
      if (!b) return;
      userTouched = true;
      var txt = (b.textContent || '').trim();
      lastBtn = { kind: (txt === '-' || txt === '−' || txt === '–') ? '-' : '+', at: Date.now() };
    } catch (_) {}
  }, true);

  function tick() {
    var live = liveCounts();
    var st = loadStore(); var tk = todayKey();
    var cur = st[tk] || { physics: 0, chemistry: 0, maths: 0 };
    var changed = false;
    SUBJ.forEach(function (s) {
      var d = (live[s] || 0) - (lastLive[s] || 0);
      if (d > 0) {                       // an increase (manual + OR a real solve) → remember the new high
        if ((live[s] || 0) > (cur[s] || 0)) { cur[s] = live[s] || 0; changed = true; }
      } else if (d < 0) {                // a decrease
        var recentMinus = (Date.now() - lastBtn.at < 600 && lastBtn.kind === '-');
        if (recentMinus) {               // the user pressed − → accept the lower value
          if ((cur[s] || 0) !== (live[s] || 0)) { cur[s] = live[s] || 0; changed = true; }
        }
        // otherwise it's a spurious drop (e.g. a refresh repaint) → ignore, keep the stored high
      }
    });
    if (changed) { st[tk] = cur; saveStore(st); }
    lastLive = liveCounts();
  }

  function attachObserver() {
    var nodes = SUBJ.map(function (s) { return document.getElementById(s + '-count'); });
    if (nodes.some(function (n) { return !n; })) { setTimeout(attachObserver, 400); return; }
    try {
      var mo = new MutationObserver(function () { requestAnimationFrame(tick); });
      nodes.forEach(function (n) { mo.observe(n, { childList: true, subtree: true, characterData: true }); });
    } catch (e) {}
    setInterval(tick, 1500);
  }

  // boot-heal: if the app repainted today's counters below what you actually did,
  // push them back up. Date-keyed store means a fresh day has nothing → stays 0.
  function bootHeal() {
    var st = loadStore(); var cur = st[todayKey()]; if (!cur) return;
    var live = liveCounts(); var healed = false;
    SUBJ.forEach(function (s) { if ((cur[s] || 0) > (live[s] || 0)) { setNode(s, cur[s] || 0); healed = true; } });
    if (healed) lastLive = liveCounts();
  }

  attachObserver();
  var tries = 0;
  (function healLoop() { if (userTouched) return; bootHeal(); if (++tries < 24) setTimeout(healLoop, 250); })();
}

/* ───────────────────────── time ranges ───────────────────────── */
function getRange(period, anchor) {
  var endMs = dayEndMs(anchor), startMs, prevStart = null, prevEnd = null;
  if (period === 'today') { startMs = dayStartMs(anchor); }
  else if (period === 'yesterday') { var y = isoMinus(anchor, 1); startMs = dayStartMs(y); endMs = dayEndMs(y); }
  else if (period === 'week') { startMs = dayStartMs(isoMinus(anchor, 6)); }
  else if (period === 'month') { startMs = dayStartMs(isoMinus(anchor, 29)); }
  else if (period === 'year') { startMs = dayStartMs(isoMinus(anchor, 364)); }
  else { startMs = 0; } // all
  if (startMs > 0) {
    var days = Math.round((endMs - startMs) / 86400000) + 1;
    prevEnd = new Date(startMs - 1); prevEnd.setHours(23, 59, 59, 999);
    prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000); prevStart.setHours(0, 0, 0, 0);
  }
  return { startMs: startMs, endMs: endMs, prevStart: prevStart, prevEnd: prevEnd };
}
function rangeCaption() {
  var r = getRange(state.period, state.endDate);
  var s = dateKey(r.startMs || Date.now());
  if (state.period === 'today') return 'Today · ' + pretty(state.endDate);
  if (state.period === 'yesterday') return 'Yesterday · ' + pretty(state.endDate);
  if (state.period === 'all') return 'All time';
  var name = state.period.charAt(0).toUpperCase() + state.period.slice(1);
  return name + ' · ' + pretty(s) + '–' + pretty(state.endDate);
}

/* ───────────────────────── data: solved + manual, no double count ───────────────────────── */
function computeData() {
  var bank = getBank();
  var range = getRange(state.period, state.endDate);
  var store = loadStore();
  var tk = todayKey();

  // solved questions, bucketed by date
  var solvedByDate = {};
  var list = [];
  var bySubject = { physics: 0, chemistry: 0, maths: 0 };
  var oaks = 0, eloSum = 0, maxElo = 0;

  function addStats(subj, elo) { if (bySubject[subj] != null) bySubject[subj]++; eloSum += elo; if (elo > maxElo) maxElo = elo; if (elo >= 2300) oaks++; }

  for (var i = 0; i < bank.length; i++) {
    var q = bank[i]; if (!q || q.status !== 'solved') continue;
    var t = getTimeMs(q); var subj = normSub(q.subject); var elo = qEloOf(q);
    if (t != null) { var dk = dateKey(t); if (!solvedByDate[dk]) solvedByDate[dk] = { physics: 0, chemistry: 0, maths: 0 }; solvedByDate[dk][subj]++; }
    var inCur = (state.period === 'all') ? (t == null || t <= range.endMs) : (t != null && t >= range.startMs && t <= range.endMs);
    if (inCur) { list.push(q); addStats(subj, elo); }
  }

  // manual-tap extras per day = storedDailyTotal − solvedThatDay  (≥ 0)
  function authFor(dk) { var sv = storedOf(store, dk); if (dk === tk) { var l = liveCounts(); return { physics: Math.max(l.physics, sv.physics), chemistry: Math.max(l.chemistry, sv.chemistry), maths: Math.max(l.maths, sv.maths) }; } return sv; }
  function extrasIn(a, b) {
    var keys = {}; var k; for (k in store) keys[k] = 1; for (k in solvedByDate) keys[k] = 1; keys[tk] = 1;
    var n = 0; var out = [];
    for (k in keys) {
      var ms = dayStartMs(k); if (ms < a || ms > b) continue;
      var au = authFor(k); var sd = solvedByDate[k] || { physics: 0, chemistry: 0, maths: 0 };
      SUBJ.forEach(function (s) { var ex = Math.max(0, (au[s] || 0) - (sd[s] || 0)); n += ex; for (var j = 0; j < ex; j++) out.push({ subject: s, qElo: 1000 + Math.floor(hash(k.length + j * 7 + 3, s.length * 3 + j * 11 + 1) * 800), lastReviewedAt: k + 'T12:00:00', status: 'solved', synthetic: true }); });
    }
    return { n: n, list: out };
  }

  var curExtras = extrasIn(range.startMs, range.endMs);
  list = list.concat(curExtras.list);
  curExtras.list.forEach(function (q) { addStats(normSub(q.subject), q.qElo); });

  var prevCount = 0;
  if (range.prevStart) {
    for (var pk in solvedByDate) { var pms = dayStartMs(pk); if (pms >= range.prevStart.getTime() && pms <= range.prevEnd.getTime()) { var psd = solvedByDate[pk]; prevCount += (psd.physics || 0) + (psd.chemistry || 0) + (psd.maths || 0); } }
    prevCount += extrasIn(range.prevStart.getTime(), range.prevEnd.getTime()).n;
  }

  list.sort(function (a, b) { return (getTimeMs(a) || 0) - (getTimeMs(b) || 0); });
  var delta = range.prevStart ? (list.length - prevCount) : 0;
  return { list: list, stats: { count: list.length, delta: delta, bySubject: bySubject, oaks: oaks, maxElo: maxElo, avgElo: list.length ? Math.round(eloSum / list.length) : 0 } };
}

/* ───────────────────────── overlay UI ───────────────────────── */
function ensureOverlay() {
  if (overlay) return;
  overlay = el('div', { id: 'fi-full-overlay', class: 'fi-full-overlay', html:
    '<div class="fi-full-shell">' +
      '<canvas id="fi-full-canvas"></canvas>' +
      '<div class="fi-full-top">' +
        '<div class="fi-full-brand"><span class="fi-full-kicker">// JOURNEY MAP</span><span class="fi-full-title">Growth Island</span><span class="fi-full-range" id="fi-full-range" style="font-size:11px;color:#9aa3b5;margin-top:2px;"></span></div>' +
        '<div class="fi-full-controls">' +
          '<label class="fi-full-date"><span>Anchor</span><input id="fi-full-date" type="date"></label>' +
          '<div class="fi-full-periods" id="fi-full-periods">' +
            '<button data-period="today">Today</button>' +
            '<button data-period="yesterday">Yesterday</button>' +
            '<button data-period="week">Week</button>' +
            '<button data-period="month">Month</button>' +
            '<button data-period="year">Year</button>' +
            '<button data-period="all" class="active">All</button>' +
          '</div>' +
        '</div>' +
        '<div class="fi-full-top-actions">' +
          '<button id="fi-full-reset" class="fi-full-icon-btn" type="button" title="Reset view">⟳</button>' +
          '<button id="fi-full-close" class="fi-full-icon-btn" type="button" title="Close">✕</button>' +
        '</div>' +
      '</div>' +
      '<button id="fi-full-side-toggle" class="fi-full-side-toggle" type="button" title="Toggle stats">📊</button>' +
      '<aside class="fi-full-side" id="fi-full-side"><div class="fi-full-side-inner">' +
        '<div class="fi-full-stat-hero"><div class="fi-full-stat-value" id="fi-stat-total">0</div><div class="fi-full-stat-label">Trees Standing</div></div>' +
        '<div class="fi-full-stat-grid">' +
          '<div><b id="fi-stat-delta">+0</b><span>vs Prev</span></div>' +
          '<div><b id="fi-stat-oaks">0</b><span>Ancient Oaks</span></div>' +
          '<div><b id="fi-stat-tall">—</b><span>Tallest qElo</span></div>' +
          '<div><b id="fi-stat-avg">—</b><span>Avg qElo</span></div>' +
        '</div>' +
        '<div class="fi-full-subject" data-subject="physics"><span>Physics</span><div class="fi-full-bar"><i id="fi-bar-physics"></i></div><b id="fi-count-physics">0</b></div>' +
        '<div class="fi-full-subject" data-subject="chemistry"><span>Chemistry</span><div class="fi-full-bar"><i id="fi-bar-chemistry"></i></div><b id="fi-count-chemistry">0</b></div>' +
        '<div class="fi-full-subject" data-subject="maths"><span>Maths</span><div class="fi-full-bar"><i id="fi-bar-maths"></i></div><b id="fi-count-maths">0</b></div>' +
        '<div class="fi-full-hint">Drag: orbit · Wheel / pinch: zoom · Right-drag / two-finger: pan</div>' +
      '</div></aside>' +
      '<div class="fi-full-loading" id="fi-full-loading">Growing forest…</div>' +
    '</div>' });
  document.body.appendChild(overlay);
  canvas = document.getElementById('fi-full-canvas');
  ui.loading = document.getElementById('fi-full-loading');
  ui.date = document.getElementById('fi-full-date');
  ui.periods = document.getElementById('fi-full-periods');
  ui.range = document.getElementById('fi-full-range');
  ui.side = document.getElementById('fi-full-side');
  ui.total = document.getElementById('fi-stat-total');
  ui.delta = document.getElementById('fi-stat-delta');
  ui.oaks = document.getElementById('fi-stat-oaks');
  ui.tall = document.getElementById('fi-stat-tall');
  ui.avg = document.getElementById('fi-stat-avg');
  ui.countPhysics = document.getElementById('fi-count-physics');
  ui.countChemistry = document.getElementById('fi-count-chemistry');
  ui.countMaths = document.getElementById('fi-count-maths');
  ui.barPhysics = document.getElementById('fi-bar-physics');
  ui.barChemistry = document.getElementById('fi-bar-chemistry');
  ui.barMaths = document.getElementById('fi-bar-maths');
  ui.date.value = state.endDate; ui.date.max = todayKey();
  ui.date.addEventListener('change', function () { state.endDate = this.value || todayKey(); scheduleRebuild(); });
  ui.periods.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; state.period = b.getAttribute('data-period') || 'all'; syncPeriodUI(); scheduleRebuild(); });
  document.getElementById('fi-full-close').addEventListener('click', closeFull);
  document.getElementById('fi-full-reset').addEventListener('click', function () { if (controls) controls.reset(viewRadius()); });
  document.getElementById('fi-full-side-toggle').addEventListener('click', function () { ui.side.classList.toggle('open'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) closeFull(); });
  // live-update while open (a solve / + tap elsewhere reflects immediately)
  try {
    var mo = new MutationObserver(function () { if (isOpen) scheduleRebuild(); });
    SUBJ.forEach(function (s) { var n = document.getElementById(s + '-count'); if (n) mo.observe(n, { childList: true, subtree: true, characterData: true }); });
    window.addEventListener('storage', function () { if (isOpen) scheduleRebuild(); });
  } catch (e) {}
}
function syncPeriodUI() {
  if (!ui.periods) return;
  var bs = ui.periods.querySelectorAll('button');
  for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('active', bs[i].getAttribute('data-period') === state.period);
  if (ui.date) ui.date.value = state.endDate;
  if (ui.range) ui.range.textContent = rangeCaption();
}
function showLoading(on, msg) { if (!ui.loading) return; ui.loading.textContent = msg || 'Growing forest…'; ui.loading.classList.toggle('visible', !!on); }
function renderStats(s) {
  if (!ui.total) return;
  ui.total.textContent = s.count;
  ui.delta.textContent = (s.delta >= 0 ? '+' : '') + s.delta;
  ui.oaks.textContent = s.oaks;
  ui.tall.textContent = s.maxElo ? Math.round(s.maxElo) : '—';
  ui.avg.textContent = s.avgElo ? s.avgElo : '—';
  ui.countPhysics.textContent = s.bySubject.physics;
  ui.countChemistry.textContent = s.bySubject.chemistry;
  ui.countMaths.textContent = s.bySubject.maths;
  var mx = Math.max(1, s.bySubject.physics, s.bySubject.chemistry, s.bySubject.maths);
  ui.barPhysics.style.width = Math.round(s.bySubject.physics / mx * 100) + '%';
  ui.barChemistry.style.width = Math.round(s.bySubject.chemistry / mx * 100) + '%';
  ui.barMaths.style.width = Math.round(s.bySubject.maths / mx * 100) + '%';
}

/* ───────────────────────── open / close ───────────────────────── */
function openFull() {
  ensureOverlay();
  overlay.classList.add('open'); document.body.classList.add('fi-full-open');
  isOpen = true; syncPeriodUI(); showLoading(true);
  ensureThree().then(function () { if (!built) initScene(); resize(); startLoop(); rebuildWorld(); })
    .catch(function () { showLoading(true, 'Could not load 3D engine.'); });
}
function closeFull() { if (!overlay) return; isOpen = false; overlay.classList.remove('open'); document.body.classList.remove('fi-full-open'); if (ui.side) ui.side.classList.remove('open'); stopLoop(); }
function scheduleRebuild() { if (rebuildTimer) clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuildWorld, 120); }

/* ───────────────────────── three.js (reuse island's, else CDN) ───────────────────────── */
function loadCDN() {
  var urls = ['https://esm.sh/three@0.160.0', 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', 'https://unpkg.com/three@0.160.0/build/three.module.js'];
  function tryOne(i) { return new Promise(function (res, rej) { if (i >= urls.length) return rej(new Error('CDN fail')); import(urls[i]).then(function (m) { THREE = m; buildTreeAssets(); res(m); }).catch(function () { tryOne(i + 1).then(res, rej); }); }); }
  return tryOne(0);
}
function ensureThree() {
  if (THREE) return Promise.resolve(THREE);
  if (threePromise) return threePromise;
  threePromise = new Promise(function (resolve, reject) {
    function useExisting() { try { if (window.__forestIslandAPI && window.__forestIslandAPI.THREE) { THREE = window.__forestIslandAPI.THREE; buildTreeAssets(); resolve(THREE); return true; } } catch (e) {} return false; }
    if (useExisting()) return;
    var waited = 0;
    var iv = setInterval(function () { waited += 120; if (useExisting()) { clearInterval(iv); return; } if (waited >= 1500) { clearInterval(iv); loadCDN().then(resolve, reject); } }, 120);
  });
  return threePromise;
}

/* ───────────────────────── tree geometry ───────────────────────── */
function prep(g) { return g.index ? g.toNonIndexed() : g; }
function paint(g, r, gr, b) { g = prep(g); g.deleteAttribute('uv'); var n = g.attributes.position.count, c = new Float32Array(n * 3); for (var i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gr; c[i * 3 + 2] = b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; }
function paintGrad(g, base, top) { g = prep(g); g.deleteAttribute('uv'); var p = g.attributes.position, n = p.count, c = new Float32Array(n * 3), ymin = 1e9, ymax = -1e9; for (var i = 0; i < n; i++) { var y = p.getY(i); if (y < ymin) ymin = y; if (y > ymax) ymax = y; } for (var j = 0; j < n; j++) { var t = (p.getY(j) - ymin) / Math.max(0.001, ymax - ymin); c[j * 3] = base[0] + (top[0] - base[0]) * t; c[j * 3 + 1] = base[1] + (top[1] - base[1]) * t; c[j * 3 + 2] = base[2] + (top[2] - base[2]) * t; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; }
function mergeGeos(list) { list = list.map(function (g) { return g.index ? g.toNonIndexed() : g; }); var n = 0; list.forEach(function (g) { n += g.attributes.position.count; }); var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), o = 0; list.forEach(function (g) { var c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3); if (g.attributes.color) col.set(g.attributes.color.array, o * 3); o += c; }); var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; }
function spruceGeo() { var t = paint(new THREE.CylinderGeometry(0.09, 0.16, 0.9, 6).translate(0, 0.45, 0), 0.30, 0.20, 0.12); var c1 = paintGrad(new THREE.ConeGeometry(0.78, 1.15, 7).translate(0, 1.35, 0), [0.02, 0.46, 0.58], [0.10, 0.66, 0.82]); var c2 = paintGrad(new THREE.ConeGeometry(0.60, 0.98, 7).translate(0, 1.98, 0), [0.05, 0.56, 0.72], [0.15, 0.76, 0.92]); var c3 = paintGrad(new THREE.ConeGeometry(0.42, 0.82, 7).translate(0, 2.55, 0), [0.10, 0.68, 0.84], [0.22, 0.80, 0.92]); return mergeGeos([t, c1, c2, c3]); }
function roundGeo() { var t = paint(new THREE.CylinderGeometry(0.11, 0.18, 1.0, 6).translate(0, 0.5, 0), 0.32, 0.21, 0.12); var b1 = paintGrad(new THREE.IcosahedronGeometry(0.82, 1).translate(0, 1.55, 0), [0.05, 0.55, 0.10], [0.16, 0.80, 0.18]); var b2 = paintGrad(new THREE.IcosahedronGeometry(0.55, 1).translate(0.35, 2.05, 0.1), [0.10, 0.68, 0.16], [0.24, 0.92, 0.26]); return mergeGeos([t, b1, b2]); }
function goldenGeo() { var t = paint(new THREE.CylinderGeometry(0.10, 0.17, 0.95, 6).translate(0, 0.47, 0), 0.32, 0.20, 0.11); var d1 = paintGrad(new THREE.DodecahedronGeometry(0.78, 0).translate(0, 1.5, 0), [0.85, 0.46, 0.02], [1.0, 0.72, 0.06]); var d2 = paintGrad(new THREE.DodecahedronGeometry(0.50, 0).translate(-0.2, 2.1, -0.1), [0.95, 0.60, 0.04], [1.0, 0.84, 0.12]); return mergeGeos([t, d1, d2]); }
function oakGeo() { var t = paint(new THREE.CylinderGeometry(0.22, 0.42, 2.4, 7).translate(0, 1.2, 0), 0.16, 0.11, 0.07); var c1 = paintGrad(new THREE.IcosahedronGeometry(1.7, 1).scale(1.25, 0.95, 1.25).translate(0, 3.1, 0), [0.06, 0.16, 0.05], [0.13, 0.30, 0.09]); var c2 = paintGrad(new THREE.IcosahedronGeometry(1.35, 1).scale(1.2, 0.9, 1.2).translate(0.7, 3.9, 0.4), [0.08, 0.20, 0.06], [0.16, 0.36, 0.12]); var c3 = paintGrad(new THREE.IcosahedronGeometry(1.2, 1).scale(1.15, 0.9, 1.15).translate(-0.6, 3.8, -0.3), [0.07, 0.18, 0.06], [0.15, 0.34, 0.11]); var c4 = paintGrad(new THREE.IcosahedronGeometry(1.0, 1).scale(1.1, 0.85, 1.1).translate(0.1, 4.5, 0.1), [0.10, 0.24, 0.07], [0.19, 0.42, 0.14]); return mergeGeos([t, c1, c2, c3, c4]); }
function buildTreeAssets() { if (treeGeos) return; treeGeos = { physics: spruceGeo(), chemistry: roundGeo(), maths: goldenGeo(), oak: oakGeo() }; treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, flatShading: true }); treeMat.onBeforeCompile = function (sh) { sh.uniforms.uTime = { value: 0 }; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', "#include <begin_vertex>\nfloat sw = max(transformed.y - 0.7, 0.0);\nfloat ph = instanceMatrix[3][0] * 0.6 + instanceMatrix[3][2] * 0.6;\ntransformed.x += sin(uTime * 1.3 + ph) * sw * 0.03;\ntransformed.z += cos(uTime * 1.0 + ph) * sw * 0.024;"); treeMat.userData.shader = sh; }; }

/* ───────────────────────── scene + controls ───────────────────────── */
function makeSky() { var skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, off: { value: 18 }, exp: { value: 0.62 } }, vertexShader: 'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'uniform vec3 top;uniform vec3 bottom;uniform float off;uniform float exp;varying vec3 vW;void main(){float h=normalize(vW+vec3(0.0,off,0.0)).y;float t=pow(max(h,0.0),exp);gl_FragColor=vec4(mix(bottom,top,t),1.0);}' }); return { mesh: new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat), top: skyMat.uniforms.top.value, bottom: skyMat.uniforms.bottom.value }; }
function applyTOD(v) { if (!skyEnv || !scene || !scene.fog) return; var a = TOD[0], b = TOD[TOD.length - 1]; for (var i = 0; i < TOD.length - 1; i++) if (v >= TOD[i].t && v <= TOD[i + 1].t) { a = TOD[i]; b = TOD[i + 1]; break; } var f = (v - a.t) / Math.max(0.0001, b.t - a.t); function L(x, y) { return new THREE.Color(x).lerp(new THREE.Color(y), f); } skyEnv.top.copy(L(a.top, b.top)); skyEnv.bottom.copy(L(a.bot, b.bot)); scene.fog.color.copy(L(a.fog, b.fog)); }
function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.14;
  scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x0e1220, 0.0045);
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1400);
  scene.add(new THREE.HemisphereLight(0x8aa0b8, 0x3a3020, 0.88));
  var sun = new THREE.DirectionalLight(0xfff2e0, 1.2); sun.position.set(30, 80, 40); scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.16));
  skyEnv = makeSky(); scene.add(skyEnv.mesh); applyTOD(realTOD());
  controls = makeControls(canvas);
  window.addEventListener('resize', resize);
  try { new ResizeObserver(resize).observe(canvas); } catch (e) {}
  built = true;
}
function resize() { if (!renderer || !camera || !canvas) return; var w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
function startLoop() { if (raf == null) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }
function stopLoop() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } }
function frame(t) { if (!isOpen || !built) { raf = null; return; } raf = requestAnimationFrame(frame); var dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t; elT += dt; if (controls) controls.update(); if (treeMat && treeMat.userData.shader) treeMat.userData.shader.uniforms.uTime.value = elT; if (currentWater) currentWater.position.y = -0.2 + Math.sin(elT * 0.8) * 0.02; renderer.render(scene, camera); }
function viewRadius() { return Math.max(16, LAND_R * 1.55); }
function makeControls(cv) {
  var target = new THREE.Vector3(0, 0, 0), theta = 0.7, phi = 1.05, radius = viewRadius(), minR = 5;
  var pointers = new Map(), mode = null, lastPinchDist = 0, lastMid = { x: 0, y: 0 };
  function clampR() { radius = Math.max(minR, Math.min(Math.max(140, LAND_R * 5), radius)); }
  function update() { var sp = Math.sin(phi), cp = Math.cos(phi); camera.position.set(target.x + radius * sp * Math.sin(theta), target.y + radius * cp, target.z + radius * sp * Math.cos(theta)); camera.lookAt(target); }
  function pan(dx, dy) { var sc = radius * 0.0011; var r = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0); var u = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1); target.addScaledVector(r, -dx * sc); target.addScaledVector(u, dy * sc); if (target.length() > LAND_R * 1.4) target.setLength(LAND_R * 1.4); }
  function two() { var a = []; pointers.forEach(function (p) { a.push(p); }); return a; }
  cv.addEventListener('pointerdown', function (e) { try { cv.setPointerCapture(e.pointerId); } catch (err) {} pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey }); if (pointers.size === 1) mode = ((e.button === 2) || (e.button === 1) || e.shiftKey || e.ctrlKey) ? 'pan' : 'rotate'; else if (pointers.size === 2) { mode = 'pinch'; var p = two(); lastPinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); lastMid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; } });
  cv.addEventListener('pointermove', function (e) { if (!pointers.has(e.pointerId)) return; var p = pointers.get(e.pointerId); var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; if (pointers.size === 1) { if (mode === 'rotate') { theta -= dx * 0.005; phi = Math.max(0.18, Math.min(1.45, phi - dy * 0.005)); } else if (mode === 'pan') pan(dx, dy); } else if (pointers.size === 2) { var a = two(); var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); var m = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; if (lastPinchDist > 0) { radius *= lastPinchDist / d; clampR(); } pan(m.x - lastMid.x, m.y - lastMid.y); lastPinchDist = d; lastMid = m; } });
  function end(e) { if (pointers.has(e.pointerId)) pointers.delete(e.pointerId); if (pointers.size < 2) lastPinchDist = 0; if (pointers.size === 1) { var rem = pointers.values().next().value; mode = (rem.button === 2 || rem.shift) ? 'pan' : 'rotate'; } if (pointers.size === 0) mode = null; }
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); radius *= 1 + Math.sign(e.deltaY) * 0.08; clampR(); }, { passive: false });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  return { update: update, reset: function (r) { target.set(0, 0, 0); theta = 0.7; phi = 1.05; radius = r || viewRadius(); clampR(); } };
}

/* ───────────────────────── world build ───────────────────────── */
function radiusFor(n) { return Math.max(10, Math.min(42, 10 + Math.sqrt(Math.max(0, n)) * 0.62)); }
function sampleList(list) { if (list.length <= CAP) return list; var out = [], step = list.length / CAP; for (var i = 0; i < CAP; i++) out.push(list[Math.floor(i * step)]); return out; }
function clearWorld() { if (world) { scene.remove(world); if (world.userData.disposables) world.userData.disposables.forEach(function (x) { if (x && x.dispose) x.dispose(); }); } world = new THREE.Group(); world.userData.disposables = []; currentWater = null; scene.add(world); }
function buildTerrain() {
  var S = LAND_R * 1.5, seg = Math.min(160, Math.max(90, Math.round(LAND_R * 4)));
  var lg = new THREE.PlaneGeometry(S * 2, S * 2, seg, seg); lg.rotateX(-Math.PI / 2);
  var lp = lg.attributes.position, lc = new Float32Array(lp.count * 3);
  for (var i = 0; i < lp.count; i++) { var x = lp.getX(i), z = lp.getZ(i), h = heightAt(x, z); lp.setY(i, h); var r = Math.hypot(x, z), th = Math.atan2(z, x), t = Math.min(1, r / coastR(th)); if (h < -0.1) { lc[i * 3] = 0.30; lc[i * 3 + 1] = 0.26; lc[i * 3 + 2] = 0.16; } else if (t > 0.78) { lc[i * 3] = 0.62; lc[i * 3 + 1] = 0.52; lc[i * 3 + 2] = 0.30; } else if (h > 1.25) { lc[i * 3] = 0.40; lc[i * 3 + 1] = 0.42; lc[i * 3 + 2] = 0.38; } else { var g = 0.30 + 0.30 * (1 - t); lc[i * 3] = 0.14 + 0.06 * t; lc[i * 3 + 1] = g; lc[i * 3 + 2] = 0.12; } }
  lg.setAttribute('color', new THREE.BufferAttribute(lc, 3)); lg.computeVertexNormals();
  world.add(new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })));
  var wg = new THREE.CircleGeometry(Math.max(60, LAND_R * 3), 64).rotateX(-Math.PI / 2);
  var water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x244a60, transparent: true, opacity: 0.82, roughness: 0.12, metalness: 0.4 }));
  water.position.y = -0.2; world.add(water); currentWater = water; world.userData.disposables.push(lg, wg);
  var dry = [], step = LAND_R > 30 ? 1.2 : 1.0;
  for (var gx = -S; gx <= S; gx += step) for (var gz = -S; gz <= S; gz += step) { var hh = heightAt(gx, gz); if (hh > 0.28) dry.push({ x: gx, y: hh, z: gz }); }
  dry.sort(function (a, b) { return Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z); }); // centre-first
  return dry;
}
function buildTrees(samples, dry) {
  if (!samples.length || !dry.length) return;
  var minDist = samples.length > 1800 ? 1.05 : samples.length > 900 ? 1.25 : samples.length > 300 ? 1.50 : 1.80;
  var cell = Math.max(1.0, minDist), grid = {};
  function key(x, z) { return Math.floor(x / cell) + ',' + Math.floor(z / cell); }
  function tooClose(x, z) { var cx = Math.floor(x / cell), cz = Math.floor(z / cell), md2 = minDist * minDist; for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) { var arr = grid[(cx + dx) + ',' + (cz + dz)]; if (!arr) continue; for (var i = 0; i < arr.length; i++) { var a = arr[i].x - x, b = arr[i].z - z; if (a * a + b * b < md2) return true; } } return false; }
  function addG(x, z) { var k = key(x, z); if (!grid[k]) grid[k] = []; grid[k].push({ x: x, z: z }); }
  var placed = [], cursor = 0;
  for (var i = 0; i < samples.length; i++) {
    var q = samples[i], qElo = qEloOf(q), oak = qElo >= 2300, kind = oak ? 'oak' : normSub(q.subject), spot = null;
    for (var tr = 0; tr < 700; tr++) { var idx = (cursor + tr) % dry.length, s = dry[idx], x = s.x + (hash(i + tr, 5) - 0.5) * 0.7, z = s.z + (hash(i + tr, 6) - 0.5) * 0.7, y = heightAt(x, z); if (y < 0.28) continue; if (tooClose(x, z)) continue; spot = { x: x, y: y, z: z }; cursor = (idx + 1) % dry.length; break; }
    if (!spot) { var fs = dry[cursor % dry.length]; spot = { x: fs.x, y: fs.y, z: fs.z }; cursor = (cursor + 1) % dry.length; }
    addG(spot.x, spot.z);
    placed.push({ kind: kind, qElo: qElo, x: spot.x, y: spot.y, z: spot.z, baseScale: (0.75 + Math.min(1, Math.max(0, (qElo - 800) / 2200)) * 0.85) * (oak ? 0.9 : 1) * (0.85 + hash(i, 7) * 0.3), sy: 0.85 + hash(i, 11) * 0.45, sxz: 0.90 + hash(i, 13) * 0.25, leanX: (hash(i, 17) - 0.5) * 0.08, leanZ: (hash(i, 19) - 0.5) * 0.08, rot: hash(i, 3) * 6.283 });
  }
  var byKind = { physics: [], chemistry: [], maths: [], oak: [] };
  placed.forEach(function (t) { byKind[t.kind].push(t); });
  var dummy = new THREE.Object3D();
  for (var k in byKind) { var arr = byKind[k]; if (!arr.length) continue; var mesh = new THREE.InstancedMesh(treeGeos[k], treeMat, arr.length); mesh.frustumCulled = false; for (var j = 0; j < arr.length; j++) { var t = arr[j], sc = Math.max(0.0001, t.baseScale); dummy.position.set(t.x, t.y - 0.06, t.z); dummy.rotation.set(t.leanX, t.rot, t.leanZ); dummy.scale.set(t.sxz * sc, t.sy * sc, t.sxz * sc); dummy.updateMatrix(); mesh.setMatrixAt(j, dummy.matrix); } mesh.instanceMatrix.needsUpdate = true; world.add(mesh); }
}
function rebuildWorld() {
  if (!isOpen || !THREE || !built) return;
  showLoading(true);
  setTimeout(function () {
    try { var data = computeData(); renderStats(data.stats); clearWorld(); LAND_R = radiusFor(data.list.length); var dry = buildTerrain(); buildTrees(sampleList(data.list), dry); if (controls) controls.reset(viewRadius()); if (ui.range) ui.range.textContent = rangeCaption(); showLoading(false); }
    catch (e) { console.warn('[forest-island-full]', e); showLoading(true, 'Forest build failed.'); }
  }, 30);
}

/* ───────────────────────── one obvious button; kill the iframe one ───────────────────────── */
function injectStyleOnce() {
  if (document.getElementById('fi-full-style')) return;
  var s = document.createElement('style'); s.id = 'fi-full-style';
  s.textContent = '#fi-expand{display:none!important}';   // hide the dead iframe button from forest-island.js
  document.head.appendChild(s);
}
function wireOpenTriggers() {
  var host = document.getElementById('forest-island-host');
  if (!host) { var mo = new MutationObserver(function () { if (document.getElementById('forest-island-host')) { mo.disconnect(); wireOpenTriggers(); } }); mo.observe(document.documentElement, { childList: true, subtree: true }); return; }

  // the single 🗺 button
  if (!document.getElementById('fi-full-open-btn')) {
    var right = host.querySelector('.fi-right');
    var btn = el('button', { id: 'fi-full-open-btn', class: 'fi-full-open-btn', type: 'button', title: 'Open interactive Journey Map', html: '🗺' });
    if (right) right.insertBefore(btn, right.firstChild); else host.appendChild(btn);
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openFull(); });
  }

  // clicking / enter on the little island opens the map (capture phase blocks the old iframe handler)
  var cvs = document.getElementById('forest-island-canvas');
  if (cvs && !cvs.__fiFullWired) {
    cvs.__fiFullWired = true;
    cvs.setAttribute('tabindex', '0'); cvs.setAttribute('role', 'button'); cvs.setAttribute('aria-label', 'Open interactive Journey Map'); cvs.title = 'Click to open the interactive Journey Map';
    cvs.addEventListener('click', function (e) { e.stopImmediatePropagation(); e.preventDefault(); openFull(); }, true);
    cvs.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.stopImmediatePropagation(); e.preventDefault(); openFull(); } }, true);
  }

  // if the old iframe button somehow still exists, re-point it too
  var old = document.getElementById('fi-expand');
  if (old && !old.__fiFullWired) { old.__fiFullWired = true; old.addEventListener('click', function (e) { e.stopImmediatePropagation(); e.preventDefault(); openFull(); }, true); }
}

/* ───────────────────────── boot ───────────────────────── */
function boot() {
  if (!document.body) { document.addEventListener('DOMContentLoaded', boot); return; }
  injectStyleOnce();
  wireOpenTriggers();
  startPersistence();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

window.__forestIslandFull = { open: openFull, close: closeFull, rebuild: rebuildWorld };
})();
