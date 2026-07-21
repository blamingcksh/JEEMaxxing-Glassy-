/* ============================================================================
forest-island-full.js · Full-screen embedded Growth Island explorer (APP file)
Replaces the broken forest-lab.html iframe approach.

Features:
• Full-screen island view opened from the Daily Grove card
• Orbit / zoom / pan camera controls
• Date filter
• Week / Month / Year / All-time progress filters
• Stats side panel
• Reads window.questionBank directly from the live app
============================================================================ */
(function () {
'use strict';

if (window.__forestIslandFullInit) return;
window.__forestIslandFullInit = true;

var THREE = null;
var threePromise = null;

var overlay = null;
var canvas = null;
var renderer = null;
var scene = null;
var camera = null;
var controls = null;

var world = null;
var skyEnv = null;
var treeMat = null;
var treeGeos = null;
var currentWater = null;

var built = false;
var isOpen = false;
var raf = null;
var elT = 0;
var lastT = 0;

var LAND_R = 14;
var CAP = 3500;

var state = {
  period: 'all',
  endDate: todayISO()
};

var ui = {};
var rebuildTimer = null;
var lastFullSig = '';
var fullPoll = null;

var TOD = [
  { t: 0,   top: 0x0a0e1c, bot: 0x141a2a, sun: 0x3a4a6a, sunI: 0.15, hemi: 0x2a3040, fog: 0x0e1220 },
  { t: 22,  top: 0x2a3a5e, bot: 0xe8956a, sun: 0xffb27a, sunI: 0.70, hemi: 0x5a5a6a, fog: 0x3a3040 },
  { t: 50,  top: 0x4a7ec0, bot: 0xc4dcec, sun: 0xfff2e0, sunI: 1.15, hemi: 0x8aa0b8, fog: 0x9ab4c8 },
  { t: 78,  top: 0x3a2a52, bot: 0xe07a44, sun: 0xff8a4a, sunI: 0.75, hemi: 0x6a5060, fog: 0x4a3444 },
  { t: 100, top: 0x0a0e1c, bot: 0x141a2a, sun: 0x3a4a6a, sunI: 0.15, hemi: 0x2a3040, fog: 0x0e1220 }
];

/* ── helpers ── */
function el(tag, a) {
  var n = document.createElement(tag);
  if (a) {
    for (var k in a) {
      if (k === 'html') n.innerHTML = a[k];
      else if (k === 'class') n.className = a[k];
      else n.setAttribute(k, a[k]);
    }
  }
  return n;
}

function todayISO() {
  var d = new Date();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}

function hash(x, z) {
  var n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function vnoise(x, z) {
  var xi = Math.floor(x), zi = Math.floor(z);
  var xf = x - xi, zf = z - zi;
  var u = xf * xf * (3 - 2 * xf);
  var v = zf * zf * (3 - 2 * zf);
  var a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function coastR(th) {
  return LAND_R * (
    1 +
    0.22 * Math.sin(th * 3 + 1.3) +
    0.14 * Math.sin(th * 5 + 0.4) +
    0.12 * (vnoise(Math.cos(th) * 2 + 5, Math.sin(th) * 2 + 5) - 0.5)
  );
}

function heightAt(x, z) {
  var r = Math.hypot(x, z);
  var th = Math.atan2(z, x);
  var cr = coastR(th);

  if (r > cr) return -1.2;

  var t = r / cr;
  var dome = (1 - t * t) * 1.7;
  var beach = t > 0.80 ? -0.7 * ((t - 0.80) / 0.20) : 0;
  var hills = (vnoise(x * 0.5 + 10, z * 0.5 + 10) - 0.5) * 0.9 * (1 - t);

  return Math.max(-0.5, dome + hills + beach);
}

function realTOD() {
  var d = new Date();
  return ((d.getHours() + d.getMinutes() / 60) / 24) * 100;
}

function normSub(s) {
  s = (s || '').toString().toLowerCase().trim();
  if (s === 'math' || s === 'mathematics') return 'maths';
  return (s === 'physics' || s === 'chemistry' || s === 'maths') ? s : 'physics';
}

function qEloOf(q) {
  return (typeof q.qElo === 'number' && q.qElo > 0) ? q.qElo : 1200;
}

function getTimeMs(q) {
  var s = q.lastReviewedAt || q.solvedAt || q.createdAt || q.date || q.ts;
  if (!s) return null;
  var t = new Date(s).getTime();
  return isNaN(t) ? null : t;
}

function getBank() {
  try {
    if (Array.isArray(window.questionBank) && window.questionBank.length) return window.questionBank;
    if (window.AppState && Array.isArray(window.AppState.questionBank) && window.AppState.questionBank.length) {
      return window.AppState.questionBank;
    }
  } catch (e) {}
  return [];
}

var LS_DAILY = 'jeemax_forest_daily_v1';

function loadDailyStore() {
  try {
    var o = JSON.parse(localStorage.getItem(LS_DAILY) || '{}');
    return (o && typeof o === 'object') ? o : {};
  } catch (e) {
    return {};
  }
}

function getSavedCounts(dateStr) {
  var st = loadDailyStore();
  var c = st[dateStr] || {};
  return {
    physics: parseInt(c.physics, 10) || 0,
    chemistry: parseInt(c.chemistry, 10) || 0,
    maths: parseInt(c.maths, 10) || 0
  };
}

function readLiveCounts() {
  function g(id) {
    var e = document.getElementById(id);
    return e ? (parseInt(e.textContent, 10) || 0) : 0;
  }

  var live = {
    physics: g('physics-count'),
    chemistry: g('chemistry-count'),
    maths: g('maths-count')
  };

  try {
    if (window.solved) {
      live.physics = Math.max(live.physics, parseInt(window.solved.physics, 10) || 0);
      live.chemistry = Math.max(live.chemistry, parseInt(window.solved.chemistry, 10) || 0);
      live.maths = Math.max(live.maths, parseInt(window.solved.maths, 10) || 0);
    }
  } catch (e) {}

  return live;
}

function getDailyCounts(dateStr) {
  var saved = getSavedCounts(dateStr);

  if (dateStr === todayISO()) {
    var live = readLiveCounts();
    return {
      physics: Math.max(live.physics, saved.physics),
      chemistry: Math.max(live.chemistry, saved.chemistry),
      maths: Math.max(live.maths, saved.maths)
    };
  }

  return saved;
}

function dateKeyFromMs(ms) {
  var d = new Date(ms);
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}

function syntheticElo(dateStr, subj, i) {
  var h = hash(dateStr.length + i * 7 + 3, subj.length * 3 + i * 11 + 1);
  return 1000 + Math.floor(h * 800);
}

function makeSynthetic(dateStr, subj, i) {
  return {
    subject: subj,
    qElo: syntheticElo(dateStr, subj, i),
    lastReviewedAt: dateStr + 'T12:00:00',
    status: 'solved',
    synthetic: true
  };
}

function allDailyDates() {
  var st = loadDailyStore();
  var dates = {};

  Object.keys(st).forEach(function (d) {
    dates[d] = true;
  });

  dates[todayISO()] = true;
  return Object.keys(dates);
}

function countSyntheticInRange(solvedByDate, start, end) {
  var n = 0;
  var dates = allDailyDates();

  for (var i = 0; i < dates.length; i++) {
    var dateStr = dates[i];
    var ms = new Date(dateStr + 'T12:00:00').getTime();
    if (isNaN(ms) || ms < start.getTime() || ms > end.getTime()) continue;

    var counts = getDailyCounts(dateStr);
    var solved = solvedByDate[dateStr] || { physics: 0, chemistry: 0, maths: 0 };

    n += Math.max(0, (counts.physics || 0) - (solved.physics || 0));
    n += Math.max(0, (counts.chemistry || 0) - (solved.chemistry || 0));
    n += Math.max(0, (counts.maths || 0) - (solved.maths || 0));
  }

  return n;
}

function solvedBankCount() {
  var b = getBank();
  var n = 0;
  for (var i = 0; i < b.length; i++) {
    if (b[i] && b[i].status === 'solved') n++;
  }
  return n;
}

function fullSig() {
  var c = readLiveCounts();
  return c.physics + ',' + c.chemistry + ',' + c.maths +
    '|' + getBank().length +
    '|' + solvedBankCount();
}

/* ── mount the expand button onto the Daily Grove card ── */
function tryMount() {
  var host = document.getElementById('forest-island-host');
  if (!host) return false;
  if (document.getElementById('fi-full-open-btn')) return true;

  var right = host.querySelector('.fi-right');

  var btn = el('button', {
    id: 'fi-full-open-btn',
    class: 'fi-full-open-btn',
    type: 'button',
    title: 'Open full Growth Island',
    html: '⛶'
  });

  if (right) right.insertBefore(btn, right.firstChild);
  else host.appendChild(btn);

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    openFull();
  });

  var cvs = document.getElementById('forest-island-canvas');
  if (cvs) {
    cvs.addEventListener('dblclick', function (e) {
      e.preventDefault();
      openFull();
    });
  }

  return true;
}

function watchMount() {
  if (tryMount()) return;

  var mo = new MutationObserver(function () {
    if (tryMount()) mo.disconnect();
  });

  mo.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watchMount);
} else {
  watchMount();
}

/* ── overlay UI ── */
function ensureOverlay() {
  if (overlay) return;

  overlay = el('div', {
    id: 'fi-full-overlay',
    class: 'fi-full-overlay',
    html:
      '<div class="fi-full-shell">' +
        '<canvas id="fi-full-canvas"></canvas>' +

        '<div class="fi-full-top">' +
          '<div class="fi-full-brand">' +
            '<span class="fi-full-kicker">// GROWTH ISLAND</span>' +
            '<span class="fi-full-title">Full Biome</span>' +
          '</div>' +

          '<div class="fi-full-controls">' +
            '<label class="fi-full-date">' +
              '<span>Date</span>' +
              '<input id="fi-full-date" type="date">' +
            '</label>' +

            '<div class="fi-full-periods" id="fi-full-periods">' +
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

        '<aside class="fi-full-side" id="fi-full-side">' +
          '<div class="fi-full-side-inner">' +
            '<div class="fi-full-stat-hero">' +
              '<div class="fi-full-stat-value" id="fi-stat-total">0</div>' +
              '<div class="fi-full-stat-label">Trees Standing</div>' +
            '</div>' +

            '<div class="fi-full-stat-grid">' +
              '<div><b id="fi-stat-delta">+0</b><span>This Period</span></div>' +
              '<div><b id="fi-stat-oaks">0</b><span>Ancient Oaks</span></div>' +
              '<div><b id="fi-stat-tall">—</b><span>Tallest qElo</span></div>' +
              '<div><b id="fi-stat-avg">—</b><span>Avg qElo</span></div>' +
            '</div>' +

            '<div class="fi-full-subject" data-subject="physics">' +
              '<span>Physics</span>' +
              '<div class="fi-full-bar"><i id="fi-bar-physics"></i></div>' +
              '<b id="fi-count-physics">0</b>' +
            '</div>' +

            '<div class="fi-full-subject" data-subject="chemistry">' +
              '<span>Chemistry</span>' +
              '<div class="fi-full-bar"><i id="fi-bar-chemistry"></i></div>' +
              '<b id="fi-count-chemistry">0</b>' +
            '</div>' +

            '<div class="fi-full-subject" data-subject="maths">' +
              '<span>Maths</span>' +
              '<div class="fi-full-bar"><i id="fi-bar-maths"></i></div>' +
              '<b id="fi-count-maths">0</b>' +
            '</div>' +

            '<div class="fi-full-hint">' +
              'Drag: orbit · Wheel: zoom · Right-drag / two-finger drag: pan' +
            '</div>' +
          '</div>' +
        '</aside>' +

        '<div class="fi-full-loading" id="fi-full-loading">Growing forest…</div>' +
      '</div>'
  });

  document.body.appendChild(overlay);

  canvas = document.getElementById('fi-full-canvas');

  ui.loading = document.getElementById('fi-full-loading');
  ui.date = document.getElementById('fi-full-date');
  ui.periods = document.getElementById('fi-full-periods');
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

  ui.date.value = state.endDate;
  ui.date.max = todayISO();

  ui.date.addEventListener('change', function () {
    state.endDate = this.value || todayISO();
    scheduleRebuild();
  });

  ui.periods.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;

    state.period = btn.getAttribute('data-period') || 'all';
    syncPeriodUI();
    scheduleRebuild();
  });

  document.getElementById('fi-full-close').addEventListener('click', closeFull);

  document.getElementById('fi-full-reset').addEventListener('click', function () {
    if (controls) controls.reset(viewRadius());
  });

  document.getElementById('fi-full-side-toggle').addEventListener('click', function () {
    ui.side.classList.toggle('open');
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) closeFull();
  });
}

function syncPeriodUI() {
  if (!ui.periods) return;

  var buttons = ui.periods.querySelectorAll('button');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-period') === state.period);
  }
}

function showLoading(on, msg) {
  if (!ui.loading) return;

  if (msg) ui.loading.textContent = msg;
  else ui.loading.textContent = 'Growing forest…';

  ui.loading.classList.toggle('visible', !!on);
}

function openFull() {
  ensureOverlay();

  overlay.classList.add('open');
  document.body.classList.add('fi-full-open');

  isOpen = true;

  ui.date.value = state.endDate;
  ui.date.max = todayISO();
  syncPeriodUI();

  showLoading(true);

  ensureThree()
    .then(function () {
      if (!built) initScene();
      resize();
      startLoop();
      rebuildWorld();
    })
    .catch(function () {
      showLoading(true, 'Could not load 3D engine.');
    });
}

function closeFull() {
  if (!overlay) return;

  isOpen = false;

  overlay.classList.remove('open');
  document.body.classList.remove('fi-full-open');

  if (ui.side) ui.side.classList.remove('open');

  stopLoop();
}

function scheduleRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuildWorld, 120);
}

/* ── three loading ── */
function ensureThree() {
  if (THREE) return Promise.resolve(THREE);
  if (threePromise) return threePromise;

  var urls = [
    'https://esm.sh/three@0.160.0',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
    'https://unpkg.com/three@0.160.0/build/three.module.js'
  ];

  function tryOne(i) {
    return new Promise(function (res, rej) {
      if (i >= urls.length) return rej(new Error('CDN fail'));

      import(urls[i])
        .then(function (m) {
          THREE = m;
          buildTreeAssets();
          res(m);
        })
        .catch(function () {
          tryOne(i + 1).then(res, rej);
        });
    });
  }

  threePromise = tryOne(0);
  return threePromise;
}

/* ── tree geometry assets ── */
function prep(g) {
  return g.index ? g.toNonIndexed() : g;
}

function paint(g, r, gr, b) {
  g = prep(g);
  g.deleteAttribute('uv');

  var n = g.attributes.position.count;
  var c = new Float32Array(n * 3);

  for (var i = 0; i < n; i++) {
    c[i * 3] = r;
    c[i * 3 + 1] = gr;
    c[i * 3 + 2] = b;
  }

  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function paintGrad(g, base, top) {
  g = prep(g);
  g.deleteAttribute('uv');

  var p = g.attributes.position;
  var n = p.count;
  var c = new Float32Array(n * 3);

  var ymin = 1e9, ymax = -1e9;

  for (var i = 0; i < n; i++) {
    var y = p.getY(i);
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }

  for (var j = 0; j < n; j++) {
    var t = (p.getY(j) - ymin) / Math.max(0.001, ymax - ymin);
    c[j * 3] = base[0] + (top[0] - base[0]) * t;
    c[j * 3 + 1] = base[1] + (top[1] - base[1]) * t;
    c[j * 3 + 2] = base[2] + (top[2] - base[2]) * t;
  }

  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function mergeGeos(list) {
  list = list.map(function (g) {
    return g.index ? g.toNonIndexed() : g;
  });

  var n = 0;
  list.forEach(function (g) {
    n += g.attributes.position.count;
  });

  var pos = new Float32Array(n * 3);
  var nor = new Float32Array(n * 3);
  var col = new Float32Array(n * 3);
  var o = 0;

  list.forEach(function (g) {
    var c = g.attributes.position.count;

    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);

    o += c;
  });

  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));

  return g;
}

function spruceGeo() {
  var t = paint(new THREE.CylinderGeometry(0.09, 0.16, 0.9, 6).translate(0, 0.45, 0), 0.30, 0.20, 0.12);
  var c1 = paintGrad(new THREE.ConeGeometry(0.78, 1.15, 7).translate(0, 1.35, 0), [0.02, 0.46, 0.58], [0.10, 0.66, 0.82]);
  var c2 = paintGrad(new THREE.ConeGeometry(0.60, 0.98, 7).translate(0, 1.98, 0), [0.05, 0.56, 0.72], [0.15, 0.76, 0.92]);
  var c3 = paintGrad(new THREE.ConeGeometry(0.42, 0.82, 7).translate(0, 2.55, 0), [0.10, 0.68, 0.84], [0.22, 0.80, 0.92]);
  return mergeGeos([t, c1, c2, c3]);
}

function roundGeo() {
  var t = paint(new THREE.CylinderGeometry(0.11, 0.18, 1.0, 6).translate(0, 0.5, 0), 0.32, 0.21, 0.12);
  var b1 = paintGrad(new THREE.IcosahedronGeometry(0.82, 1).translate(0, 1.55, 0), [0.05, 0.55, 0.10], [0.16, 0.80, 0.18]);
  var b2 = paintGrad(new THREE.IcosahedronGeometry(0.55, 1).translate(0.35, 2.05, 0.1), [0.10, 0.68, 0.16], [0.24, 0.92, 0.26]);
  return mergeGeos([t, b1, b2]);
}

function goldenGeo() {
  var t = paint(new THREE.CylinderGeometry(0.10, 0.17, 0.95, 6).translate(0, 0.47, 0), 0.32, 0.20, 0.11);
  var d1 = paintGrad(new THREE.DodecahedronGeometry(0.78, 0).translate(0, 1.5, 0), [0.85, 0.46, 0.02], [1.0, 0.72, 0.06]);
  var d2 = paintGrad(new THREE.DodecahedronGeometry(0.50, 0).translate(-0.2, 2.1, -0.1), [0.95, 0.60, 0.04], [1.0, 0.84, 0.12]);
  return mergeGeos([t, d1, d2]);
}

function oakGeo() {
  var t = paint(new THREE.CylinderGeometry(0.22, 0.42, 2.4, 7).translate(0, 1.2, 0), 0.16, 0.11, 0.07);
  var c1 = paintGrad(new THREE.IcosahedronGeometry(1.7, 1).scale(1.25, 0.95, 1.25).translate(0, 3.1, 0), [0.06, 0.16, 0.05], [0.13, 0.30, 0.09]);
  var c2 = paintGrad(new THREE.IcosahedronGeometry(1.35, 1).scale(1.2, 0.9, 1.2).translate(0.7, 3.9, 0.4), [0.08, 0.20, 0.06], [0.16, 0.36, 0.12]);
  var c3 = paintGrad(new THREE.IcosahedronGeometry(1.2, 1).scale(1.15, 0.9, 1.15).translate(-0.6, 3.8, -0.3), [0.07, 0.18, 0.06], [0.15, 0.34, 0.11]);
  var c4 = paintGrad(new THREE.IcosahedronGeometry(1.0, 1).scale(1.1, 0.85, 1.1).translate(0.1, 4.5, 0.1), [0.10, 0.24, 0.07], [0.19, 0.42, 0.14]);
  return mergeGeos([t, c1, c2, c3, c4]);
}

function buildTreeAssets() {
  if (treeGeos) return;

  treeGeos = {
    physics: spruceGeo(),
    chemistry: roundGeo(),
    maths: goldenGeo(),
    oak: oakGeo()
  };

  treeMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
    flatShading: true
  });

  treeMat.onBeforeCompile = function (sh) {
    sh.uniforms.uTime = { value: 0 };

    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      "#include <begin_vertex>\n" +
      "float sw = max(transformed.y - 0.7, 0.0);\n" +
      "float ph = instanceMatrix[3][0] * 0.6 + instanceMatrix[3][2] * 0.6;\n" +
      "transformed.x += sin(uTime * 1.3 + ph) * sw * 0.03;\n" +
      "transformed.z += cos(uTime * 1.0 + ph) * sw * 0.024;"
    );

    treeMat.userData.shader = sh;
  };
}

/* ── scene ── */
function makeSky() {
  var skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color() },
      bottom: { value: new THREE.Color() },
      off: { value: 18 },
      exp: { value: 0.62 }
    },
    vertexShader:
      'varying vec3 vW;' +
      'void main(){' +
      '  vec4 w = modelMatrix * vec4(position, 1.0);' +
      '  vW = w.xyz;' +
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);' +
      '}',
    fragmentShader:
      'uniform vec3 top;' +
      'uniform vec3 bottom;' +
      'uniform float off;' +
      'uniform float exp;' +
      'varying vec3 vW;' +
      'void main(){' +
      '  float h = normalize(vW + vec3(0.0, off, 0.0)).y;' +
      '  float t = pow(max(h, 0.0), exp);' +
      '  gl_FragColor = vec4(mix(bottom, top, t), 1.0);' +
      '}'
  });

  var mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat);

  return {
    mesh: mesh,
    top: skyMat.uniforms.top.value,
    bottom: skyMat.uniforms.bottom.value
  };
}

function applyTOD(v) {
  if (!skyEnv || !scene || !scene.fog) return;

  var a = TOD[0], b = TOD[TOD.length - 1];

  for (var i = 0; i < TOD.length - 1; i++) {
    if (v >= TOD[i].t && v <= TOD[i + 1].t) {
      a = TOD[i];
      b = TOD[i + 1];
      break;
    }
  }

  var f = (v - a.t) / Math.max(0.0001, b.t - a.t);

  function L(x, y) {
    return new THREE.Color(x).lerp(new THREE.Color(y), f);
  }

  skyEnv.top.copy(L(a.top, b.top));
  skyEnv.bottom.copy(L(a.bot, b.bot));
  scene.fog.color.copy(L(a.fog, b.fog));
}

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0e1220, 0.0045);

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1400);

  var hemi = new THREE.HemisphereLight(0x8aa0b8, 0x3a3020, 0.88);
  scene.add(hemi);

  var sun = new THREE.DirectionalLight(0xfff2e0, 1.2);
  sun.position.set(30, 80, 40);
  scene.add(sun);

  scene.add(new THREE.AmbientLight(0xffffff, 0.16));

  skyEnv = makeSky();
  scene.add(skyEnv.mesh);

  applyTOD(realTOD());

  controls = makeControls(canvas);

  window.addEventListener('resize', resize);

  try {
    new ResizeObserver(resize).observe(canvas);
  } catch (e) {}

  built = true;
}

function resize() {
  if (!renderer || !camera || !canvas) return;

  var w = canvas.clientWidth || window.innerWidth;
  var h = canvas.clientHeight || window.innerHeight;

  renderer.setSize(w, h, false);

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function startLoop() {
  if (raf == null) {
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

function stopLoop() {
  if (raf != null) {
    cancelAnimationFrame(raf);
    raf = null;
  }
}

function frame(t) {
  if (!isOpen || !built) {
    raf = null;
    return;
  }

  raf = requestAnimationFrame(frame);

  var dt = Math.min(0.05, (t - lastT) / 1000 || 0);
  lastT = t;
  elT += dt;

  if (controls) controls.update();

  if (treeMat && treeMat.userData.shader) {
    treeMat.userData.shader.uniforms.uTime.value = elT;
  }

  if (currentWater) {
    currentWater.position.y = -0.2 + Math.sin(elT * 0.8) * 0.02;
  }

  renderer.render(scene, camera);
}

/* ── camera controls ── */
function viewRadius() {
  return Math.max(16, LAND_R * 1.55);
}

function makeControls(cv) {
  var target = new THREE.Vector3(0, 0, 0);

  var theta = 0.7;
  var phi = 1.05;
  var radius = viewRadius();

  var minR = 5;
  var pointers = new Map();
  var mode = null;

  var lastPinchDist = 0;
  var lastMid = { x: 0, y: 0 };

  function clampRadius() {
    var maxR = Math.max(140, LAND_R * 5);
    radius = Math.max(minR, Math.min(maxR, radius));
  }

  function updateCamera() {
    var sp = Math.sin(phi);
    var cp = Math.cos(phi);

    camera.position.set(
      target.x + radius * sp * Math.sin(theta),
      target.y + radius * cp,
      target.z + radius * sp * Math.cos(theta)
    );

    camera.lookAt(target);
  }

  function pan(dx, dy) {
    var scale = radius * 0.0011;

    var right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    var up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);

    target.addScaledVector(right, -dx * scale);
    target.addScaledVector(up, dy * scale);

    var maxT = LAND_R * 1.4;
    if (target.length() > maxT) target.setLength(maxT);
  }

  function twoPointers() {
    var a = [];
    pointers.forEach(function (p) {
      a.push(p);
    });
    return a;
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  cv.addEventListener('pointerdown', function (e) {
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}

    pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      shift: e.shiftKey
    });

    if (pointers.size === 1) {
      mode = ((e.button === 2) || (e.button === 1) || e.shiftKey || e.ctrlKey) ? 'pan' : 'rotate';
    } else if (pointers.size === 2) {
      mode = 'pinch';

      var p = twoPointers();
      lastPinchDist = dist(p[0], p[1]);
      lastMid = mid(p[0], p[1]);
    }
  });

  cv.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;

    var p = pointers.get(e.pointerId);

    var dx = e.clientX - p.x;
    var dy = e.clientY - p.y;

    p.x = e.clientX;
    p.y = e.clientY;

    if (pointers.size === 1) {
      if (mode === 'rotate') {
        theta -= dx * 0.005;
        phi -= dy * 0.005;
        phi = Math.max(0.18, Math.min(1.45, phi));
      } else if (mode === 'pan') {
        pan(dx, dy);
      }
    } else if (pointers.size === 2) {
      var arr = twoPointers();

      var d = dist(arr[0], arr[1]);
      var m = mid(arr[0], arr[1]);

      if (lastPinchDist > 0) {
        radius *= lastPinchDist / d;
        clampRadius();
      }

      pan(m.x - lastMid.x, m.y - lastMid.y);

      lastPinchDist = d;
      lastMid = m;
    }
  });

  function endPointer(e) {
    if (pointers.has(e.pointerId)) pointers.delete(e.pointerId);

    if (pointers.size < 2) lastPinchDist = 0;

    if (pointers.size === 1) {
      var rem = pointers.values().next().value;
      mode = (rem.button === 2 || rem.shift) ? 'pan' : 'rotate';
    }

    if (pointers.size === 0) mode = null;
  }

  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);

  cv.addEventListener('wheel', function (e) {
    e.preventDefault();

    radius *= 1 + Math.sign(e.deltaY) * 0.08;
    clampRadius();
  }, { passive: false });

  cv.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  return {
    update: updateCamera,
    reset: function (r) {
      target.set(0, 0, 0);
      theta = 0.7;
      phi = 1.05;
      radius = r || viewRadius();
      clampRadius();
    }
  };
}

/* ── data / stats ── */
function getRange(period, dateStr) {
  var end = dateStr ? new Date(dateStr + 'T23:59:59') : new Date();
  if (isNaN(end.getTime())) end = new Date();

  end.setHours(23, 59, 59, 999);

  var start, prevStart = null, prevEnd = null;

  if (period === 'all') {
    start = new Date(0);
  } else {
    var days = period === 'week' ? 7 : period === 'month' ? 30 : 365;

    start = new Date(end.getTime());
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    prevEnd = new Date(start.getTime() - 1);
    prevStart = new Date(prevEnd.getTime());
    prevStart.setDate(prevStart.getDate() - (days - 1));
    prevStart.setHours(0, 0, 0, 0);
    prevEnd.setHours(23, 59, 59, 999);
  }

  return {
    start: start,
    end: end,
    prevStart: prevStart,
    prevEnd: prevEnd
  };
}

function computeData() {
  var bank = getBank();
  var range = getRange(state.period, state.endDate);

  var list = [];
  var prevCount = 0;

  var bySubject = { physics: 0, chemistry: 0, maths: 0 };
  var oaks = 0;
  var eloSum = 0;
  var maxElo = 0;

  var todayKey = todayISO();
  var solvedToday = { physics: 0, chemistry: 0, maths: 0 };

  function addStats(q) {
    var subj = normSub(q.subject);
    if (bySubject[subj] != null) bySubject[subj]++;

    var elo = qEloOf(q);
    eloSum += elo;
    if (elo > maxElo) maxElo = elo;
    if (elo >= 2300) oaks++;
  }

  for (var i = 0; i < bank.length; i++) {
    var q = bank[i];
    if (!q || q.status !== 'solved') continue;

    var t = getTimeMs(q);
    var subj = normSub(q.subject);

    if (t != null) {
      var dk = dateKeyFromMs(t);
      if (dk === todayKey) solvedToday[subj]++;
    }

    var inCurrent;
    if (state.period === 'all') {
      inCurrent = (t == null) ? true : (t <= range.end.getTime());
    } else {
      inCurrent = (t != null && t >= range.start.getTime() && t <= range.end.getTime());
    }

    if (inCurrent) {
      list.push(q);
      addStats(q);
    } else if (range.prevStart && t != null) {
      if (t >= range.prevStart.getTime() && t <= range.prevEnd.getTime()) {
        prevCount++;
      }
    }
  }

  var live = readLiveCounts();
  var todayMs = new Date(todayKey + 'T12:00:00').getTime();

  var includeToday =
    (state.endDate === todayKey) &&
    (todayMs >= range.start.getTime() && todayMs <= range.end.getTime());

  if (includeToday) {
    ['physics', 'chemistry', 'maths'].forEach(function (subj) {
      var extra = Math.max(0, (live[subj] || 0) - (solvedToday[subj] || 0));

      for (var n = 0; n < extra; n++) {
        var sq = makeSynthetic(subj, n);
        list.push(sq);
        addStats(sq);
      }
    });
  }

  list.sort(function (a, b) {
    return (getTimeMs(a) || 0) - (getTimeMs(b) || 0);
  });

  var delta = range.prevStart ? (list.length - prevCount) : 0;

  return {
    list: list,
    stats: {
      count: list.length,
      delta: delta,
      bySubject: bySubject,
      oaks: oaks,
      maxElo: maxElo,
      avgElo: list.length ? Math.round(eloSum / list.length) : 0
    }
  };
}

function renderStats(stats) {
  if (!ui.total) return;

  ui.total.textContent = stats.count;
  ui.delta.textContent = (stats.delta >= 0 ? '+' : '') + stats.delta;
  ui.oaks.textContent = stats.oaks;
  ui.tall.textContent = stats.maxElo ? Math.round(stats.maxElo) : '—';
  ui.avg.textContent = stats.avgElo ? stats.avgElo : '—';

  ui.countPhysics.textContent = stats.bySubject.physics;
  ui.countChemistry.textContent = stats.bySubject.chemistry;
  ui.countMaths.textContent = stats.bySubject.maths;

  var maxSub = Math.max(1, stats.bySubject.physics, stats.bySubject.chemistry, stats.bySubject.maths);

  ui.barPhysics.style.width = Math.round(stats.bySubject.physics / maxSub * 100) + '%';
  ui.barChemistry.style.width = Math.round(stats.bySubject.chemistry / maxSub * 100) + '%';
  ui.barMaths.style.width = Math.round(stats.bySubject.maths / maxSub * 100) + '%';
}

/* ── world building ── */
function radiusFor(count) {
  var r = 10 + Math.sqrt(Math.max(0, count)) * 0.62;
  return Math.max(10, Math.min(42, r));
}

function sampleList(list) {
  if (list.length <= CAP) return list;

  var out = [];
  var step = list.length / CAP;

  for (var i = 0; i < CAP; i++) {
    out.push(list[Math.floor(i * step)]);
  }

  return out;
}

function clearWorld() {
  if (world) {
    scene.remove(world);

    if (world.userData.disposables) {
      world.userData.disposables.forEach(function (x) {
        if (x && x.dispose) x.dispose();
      });
    }
  }

  world = new THREE.Group();
  world.userData.disposables = [];
  world.userData.water = null;

  currentWater = null;

  scene.add(world);
}

function buildTerrain() {
  var S = LAND_R * 1.5;
  var seg = Math.min(160, Math.max(90, Math.round(LAND_R * 4)));

  var lg = new THREE.PlaneGeometry(S * 2, S * 2, seg, seg);
  lg.rotateX(-Math.PI / 2);

  var lp = lg.attributes.position;
  var lc = new Float32Array(lp.count * 3);

  for (var i = 0; i < lp.count; i++) {
    var x = lp.getX(i);
    var z = lp.getZ(i);
    var h = heightAt(x, z);

    lp.setY(i, h);

    var r = Math.hypot(x, z);
    var th = Math.atan2(z, x);
    var t = Math.min(1, r / coastR(th));

    if (h < -0.1) {
      lc[i * 3] = 0.30; lc[i * 3 + 1] = 0.26; lc[i * 3 + 2] = 0.16;
    } else if (t > 0.78) {
      lc[i * 3] = 0.62; lc[i * 3 + 1] = 0.52; lc[i * 3 + 2] = 0.30;
    } else if (h > 1.25) {
      lc[i * 3] = 0.40; lc[i * 3 + 1] = 0.42; lc[i * 3 + 2] = 0.38;
    } else {
      var g = 0.30 + 0.30 * (1 - t);
      lc[i * 3] = 0.14 + 0.06 * t;
      lc[i * 3 + 1] = g;
      lc[i * 3 + 2] = 0.12;
    }
  }

  lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  lg.computeVertexNormals();

  var landMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true
  });

  var land = new THREE.Mesh(lg, landMat);
  world.add(land);

  var waterGeo = new THREE.CircleGeometry(Math.max(60, LAND_R * 3), 64).rotateX(-Math.PI / 2);
  var waterMat = new THREE.MeshStandardMaterial({
    color: 0x244a60,
    transparent: true,
    opacity: 0.82,
    roughness: 0.12,
    metalness: 0.4
  });

  var water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = -0.2;

  world.add(water);

  world.userData.water = water;
  currentWater = water;

  world.userData.disposables.push(lg, landMat, waterGeo, waterMat);

  // dry land spots
  var dry = [];
  var step = LAND_R > 30 ? 1.2 : 1.0;

  for (var gx = -S; gx <= S; gx += step) {
    for (var gz = -S; gz <= S; gz += step) {
      var hh = heightAt(gx, gz);
      if (hh > 0.28) {
        dry.push({ x: gx, y: hh, z: gz, d: Math.hypot(gx, gz) });
      }
    }
  }

  dry.sort(function (a, b) {
    return a.d - b.d;
  });

  return dry;
}

function buildTrees(samples, drySpots) {
  if (!samples.length || !drySpots.length) return;

  var minDist =
    samples.length > 1800 ? 1.05 :
    samples.length > 900 ? 1.25 :
    samples.length > 300 ? 1.50 :
    1.80;

  var cell = Math.max(1.0, minDist);
  var grid = {};

  function key(x, z) {
    return Math.floor(x / cell) + ',' + Math.floor(z / cell);
  }

  function tooClose(x, z) {
    var cx = Math.floor(x / cell);
    var cz = Math.floor(z / cell);
    var md2 = minDist * minDist;

    for (var dx = -1; dx <= 1; dx++) {
      for (var dz = -1; dz <= 1; dz++) {
        var arr = grid[(cx + dx) + ',' + (cz + dz)];
        if (!arr) continue;

        for (var i = 0; i < arr.length; i++) {
          var ddx = arr[i].x - x;
          var ddz = arr[i].z - z;

          if (ddx * ddx + ddz * ddz < md2) return true;
        }
      }
    }

    return false;
  }

  function addGrid(x, z) {
    var k = key(x, z);
    if (!grid[k]) grid[k] = [];
    grid[k].push({ x: x, z: z });
  }

  var placed = [];
  var cursor = 0;

  for (var i = 0; i < samples.length; i++) {
    var q = samples[i];
    var qElo = qEloOf(q);
    var oak = qElo >= 2300;
    var kind = oak ? 'oak' : normSub(q.subject);

    var spot = null;

    for (var tries = 0; tries < 700; tries++) {
      var idx = (cursor + tries) % drySpots.length;
      var s = drySpots[idx];

      var x = s.x + (hash(i + tries, 5) - 0.5) * 0.7;
      var z = s.z + (hash(i + tries, 6) - 0.5) * 0.7;
      var y = heightAt(x, z);

      if (y < 0.28) continue;
      if (tooClose(x, z)) continue;

      spot = { x: x, y: y, z: z };
      cursor = (idx + 1) % drySpots.length;
      break;
    }

    if (!spot) {
      var fs = drySpots[cursor % drySpots.length];
      spot = { x: fs.x, y: fs.y, z: fs.z };
      cursor = (cursor + 1) % drySpots.length;
    }

    addGrid(spot.x, spot.z);

    placed.push({
      kind: kind,
      oak: oak,
      qElo: qElo,
      x: spot.x,
      y: spot.y,
      z: spot.z,
      baseScale: (0.75 + Math.min(1, Math.max(0, (qElo - 800) / 2200)) * 0.85) * (oak ? 0.9 : 1) * (0.85 + hash(i, 7) * 0.3),
      sy: 0.85 + hash(i, 11) * 0.45,
      sxz: 0.90 + hash(i, 13) * 0.25,
      leanX: (hash(i, 17) - 0.5) * 0.08,
      leanZ: (hash(i, 19) - 0.5) * 0.08,
      rot: hash(i, 3) * 6.283
    });
  }

  var byKind = { physics: [], chemistry: [], maths: [], oak: [] };

  placed.forEach(function (t) {
    byKind[t.kind].push(t);
  });

  var dummy = new THREE.Object3D();

  for (var k in byKind) {
    var arr = byKind[k];
    if (!arr.length) continue;

    var mesh = new THREE.InstancedMesh(treeGeos[k], treeMat, arr.length);
    mesh.frustumCulled = false;

    for (var j = 0; j < arr.length; j++) {
      var t = arr[j];
      var sc = Math.max(0.0001, t.baseScale);

      dummy.position.set(t.x, t.y - 0.06, t.z);
      dummy.rotation.set(t.leanX, t.rot, t.leanZ);
      dummy.scale.set(t.sxz * sc, t.sy * sc, t.sxz * sc);
      dummy.updateMatrix();

      mesh.setMatrixAt(j, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    world.add(mesh);
  }
}

function buildSceneFromList(list) {
  clearWorld();

  LAND_R = radiusFor(list.length);

  var dry = buildTerrain();
  var samples = sampleList(list);

  buildTrees(samples, dry);

  if (controls) controls.reset(viewRadius());
}

function rebuildWorld() {
  if (!isOpen || !THREE || !built) return;

  showLoading(true);

  setTimeout(function () {
    try {
      var data = computeData();

      renderStats(data.stats);
      buildSceneFromList(data.list);

      showLoading(false);
    } catch (e) {
      console.warn('[forest-island-full]', e);
      showLoading(true, 'Forest build failed.');
    }
  }, 30);
}

window.__forestIslandFull = {
  open: openFull,
  close: closeFull,
  rebuild: rebuildWorld
};

})();
