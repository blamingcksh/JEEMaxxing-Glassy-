/* debt-ledger.js — accountability backbone: persistent Debt Ledger + daily snapshot bus.
   Self-contained IIFE: injects its own CSS + DOM, reads window.solved / window.AppState,
   owns the shared daily-snapshot store (window.__debt) that collateral.js + stamps.js read.
   Consequence: as debt climbs the dashboard tints AND the forests desaturate (pure CSS).
   NO edits to app.js / styles.css / forest files. Add ONE <script src="debt-ledger.js" defer>. */
(function () {
'use strict';
if (window.__debtLedgerInit) return; window.__debtLedgerInit = true;

var K_DEBT = 'jeemax_debt_v1', K_SNAP = 'jeemax_daily_snap_v1';
var SUBJ = ['physics', 'chemistry', 'maths'];

function dkey(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function load(k, fb) { try { var o = JSON.parse(localStorage.getItem(k) || 'null'); return (o && typeof o === 'object') ? o : fb; } catch (e) { return fb; } }
function save(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }

var debt = 0, hist = [], snap = { _lastDate: null }, subs = [];
function loadState() {
  var d = load(K_DEBT, { debt: 0, history: [] });
  debt = Math.max(0, +d.debt || 0); hist = Array.isArray(d.history) ? d.history.slice(-400) : [];
  snap = load(K_SNAP, { _lastDate: null });
}
function saveDebt() { save(K_DEBT, { debt: debt, history: hist }); }
function saveSnap() { save(K_SNAP, snap); }

function live() {
  var s = window.solved || {}, tgt = (window.AppState && window.AppState.activeTargets) || {};
  var out = {}, sumT = 0;
  SUBJ.forEach(function (k) { var sv = Math.max(0, +s[k] || 0), tg = Math.max(0, +tgt[k] || 0); out[k] = { solved: sv, target: tg }; sumT += tg; });
  out._ready = sumT > 0; return out;
}
function totals(o) { var sh = 0, su = 0; SUBJ.forEach(function (k) { var x = o[k] || { solved: 0, target: 0 }; sh += Math.max(0, x.target - x.solved); su += Math.max(0, x.solved - x.target); }); return { shortfall: sh, surplus: su }; }
function solvedMap(o) { var m = {}; SUBJ.forEach(function (k) { m[k] = (o[k] || {}).solved || 0; }); return m; }
function targetMap(o) { var m = {}; SUBJ.forEach(function (k) { m[k] = (o[k] || {}).target || 0; }); return m; }

function settle(dk, ys, miss) {
  var t = miss ? { shortfall: SUBJ.reduce(function (a, k) { return a + ((ys[k] || {}).target || 0); }, 0), surplus: 0 } : totals(ys);
  var before = debt;
  debt = Math.max(0, debt + t.shortfall - t.surplus);
  hist.push({ date: dk, shortfall: t.shortfall, surplus: t.surplus, net: t.shortfall - t.surplus, debtBefore: before, debtAfter: debt, miss: !!miss, solved: miss ? { physics: 0, chemistry: 0, maths: 0 } : solvedMap(ys), target: targetMap(ys) });
  if (hist.length > 400) hist = hist.slice(-400);
  saveDebt();
  subs.forEach(function (fn) { try { fn({ date: dk, ys: ys, totals: t, miss: !!miss, debtBefore: before, debtAfter: debt }); } catch (e) {} });
}

function ensureDay() {
  var today = dkey(), prev = snap._lastDate;
  if (prev && prev !== today) {
    var d = new Date(prev + 'T00:00:00'), ref = snap[prev];
    for (;;) { var dk = dkey(d); if (dk === today) break; if (snap[dk]) settle(dk, snap[dk], false); else settle(dk, ref || {}, true); ref = snap[dk] || ref; d.setDate(d.getDate() + 1); }
    Object.keys(snap).forEach(function (k) { if (k !== '_lastDate' && k !== prev && k !== today) delete snap[k]; });
  }
  snap._lastDate = today; if (!snap[today]) snap[today] = live(); saveSnap();
}

function tick() {
  var today = dkey();
  if (snap._lastDate !== today) ensureDay();
  var l = live(); if (l._ready) { snap[today] = l; saveSnap(); }
  render();
}
function tier() { return debt <= 0 ? 'clean' : debt < 10 ? 'smoulder' : debt < 20 ? 'critical' : 'default'; }

/* ---------------- CSS + DOM ---------------- */
function injectCSS() {
  if (document.getElementById('debt-ledger-css')) return;
  var st = document.createElement('style'); st.id = 'debt-ledger-css';
  st.textContent = [
    '.dl-rail{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 6px;padding:10px 14px;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.09);font-family:var(--font-display,"Chakra Petch",sans-serif);}',
    '.dl-chip{display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.3px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.25);color:var(--text-secondary,#9aa3b5);white-space:nowrap;}',
    '.dl-chip b{font-family:var(--font-num,"Space Grotesk",monospace);font-size:13px;color:#fff;}',
    '.dl-chip.debt{border-color:rgba(248,113,113,.4);color:#fca5a5;background:rgba(248,113,113,.10);}',
    '.dl-chip.debt.zero{border-color:rgba(34,197,94,.35);color:#86efac;background:rgba(34,197,94,.08);}',
    '.dl-chip.collat{border-color:rgba(251,191,36,.45);color:#fde68a;background:rgba(251,191,36,.10);box-shadow:0 0 14px -4px rgba(251,191,36,.5);}',
    '.dl-chip.pledge{cursor:pointer;border-color:rgba(61,220,255,.4);color:#a5ecff;background:rgba(61,220,255,.10);}',
    '.dl-chip.pledge:hover{border-color:rgba(61,220,255,.75);box-shadow:0 0 14px -3px rgba(61,220,255,.6);}',
    '.dl-run{margin-left:auto;font-size:11px;color:var(--text-muted,#5b6478);letter-spacing:.3px;}',
    '.dl-run .up{color:#4ade80;} .dl-run .down{color:#f87171;}',
    '.dl-stamps{cursor:pointer;border-color:rgba(167,139,250,.4);color:#ddd6fe;background:rgba(167,139,250,.10);}',
    '.dl-stamps:hover{border-color:rgba(167,139,250,.7);box-shadow:0 0 14px -4px rgba(167,139,250,.6);}',
    '#dl-float{position:fixed;top:calc(var(--topbar-h,72px) + 10px);left:50%;transform:translateX(-50%);z-index:940;display:none;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;font-family:var(--font-num,"Space Grotesk",monospace);font-size:12px;font-weight:700;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border:1px solid rgba(248,113,113,.4);background:rgba(20,8,8,.72);color:#fca5a5;box-shadow:0 10px 30px -12px rgba(0,0,0,.8);pointer-events:none;}',
    '#dl-float.show{display:inline-flex;}',
    '#dl-float.collat{border-color:rgba(251,191,36,.5);color:#fde68a;background:rgba(20,16,6,.72);}',
    'body.debt-smoulder #view-dashboard{box-shadow:inset 0 0 90px -30px rgba(245,158,11,.35);}',
    'body.debt-critical #view-dashboard{box-shadow:inset 0 0 110px -24px rgba(239,68,68,.4);}',
    'body.debt-critical .dl-chip.debt{animation:dlPulse 1.4s ease-in-out infinite;}',
    'body.debt-default #view-dashboard{animation:dlVig 2.4s ease-in-out infinite;}',
    'body.debt-critical #forest-island-canvas,body.debt-critical #forest-bg-canvas{filter:saturate(.5) brightness(.92);transition:filter .8s ease;}',
    'body.debt-default #forest-island-canvas,body.debt-default #forest-bg-canvas{filter:saturate(.22) brightness(.82) sepia(.25);transition:filter .8s ease;}',
    '@keyframes dlPulse{0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,0);}50%{box-shadow:0 0 14px 1px rgba(248,113,113,.55);}}',
    '@keyframes dlVig{0%,100%{box-shadow:inset 0 0 130px -18px rgba(220,38,38,.45);}50%{box-shadow:inset 0 0 150px -10px rgba(220,38,38,.62);}}',
    '#dl-stamp-modal{position:fixed;inset:0;z-index:100002;display:none;align-items:center;justify-content:center;background:rgba(6,7,10,.9);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}',
    '#dl-stamp-modal.open{display:flex;}',
    '#dl-stamp-box{width:min(720px,92vw);max-height:84vh;overflow:auto;border-radius:20px;padding:22px;background:linear-gradient(180deg,rgba(20,22,32,.96),rgba(11,13,20,.98));border:1px solid rgba(167,139,250,.3);box-shadow:0 30px 70px -24px rgba(0,0,0,.9);}',
    '#dl-stamp-box h3{font-family:var(--font-display,"Chakra Petch",sans-serif);font-size:18px;margin:0 0 4px;color:#fff;}',
    '#dl-stamp-box .dl-sub{font-size:12px;color:var(--text-secondary,#9aa3b5);margin-bottom:16px;}',
    '#dl-stamp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:10px;}',
    '.dl-stamp{aspect-ratio:1;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-family:var(--font-num,"Space Grotesk",monospace);border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);}',
    '.dl-stamp.miss{border-style:dashed;border-color:rgba(248,113,113,.4);background:rgba(248,113,113,.05);}',
    '.dl-stamp .dl-s-n{font-size:17px;font-weight:800;color:#fff;} .dl-stamp.miss .dl-s-n{color:#f87171;}',
    '.dl-stamp .dl-s-d{font-size:8px;letter-spacing:.4px;color:var(--text-muted,#5b6478);}',
    '.dl-stamp .dl-s-hex{width:26px;height:26px;border-radius:6px;box-shadow:0 0 10px -2px currentColor;}'
  ].join('\n');
  document.head.appendChild(st);
}

var rail = null, floatEl = null, modal = null;
function buildDOM() {
  injectCSS();
  var dash = document.getElementById('view-dashboard');
  if (dash && !document.getElementById('dl-rail')) {
    rail = document.createElement('div'); rail.id = 'dl-rail'; rail.className = 'dl-rail';
    var grid = dash.querySelector('.dash-grid'); if (grid) dash.insertBefore(rail, grid); else dash.appendChild(rail);
  } else rail = document.getElementById('dl-rail');
  if (!document.getElementById('dl-float')) { floatEl = document.createElement('div'); floatEl.id = 'dl-float'; document.body.appendChild(floatEl); }
  else floatEl = document.getElementById('dl-float');
}
function render() {
  buildDOM();
  var t = tier();
  document.body.classList.remove('debt-clean', 'debt-smoulder', 'debt-critical', 'debt-default');
  document.body.classList.add('debt-' + t);
  var l = live(), run = totals(l);
  var collat = window.__collateral && window.__collateral.active ? window.__collateral.active : null;
  if (rail) {
    var debtCls = 'dl-chip debt' + (debt <= 0 ? ' zero' : '');
    var repay = debt > 0 ? (' · +' + run.surplus + ' today wipes ' + Math.min(debt, run.surplus)) : '';
    var collatHtml = collat ? '<span class="dl-chip collat">⚖ <b>' + collat.stake + '</b> ELO pledged</span>' : '';
    var pledgeHtml = collat ? '' : '<span class="dl-chip pledge" id="dl-pledge">⚖ Pledge ELO</span>';
    var stampsN = (window.__stamps && window.__stamps.count) ? window.__stamps.count() : 0;
    rail.innerHTML =
      '<span class="' + debtCls + '">🔥 Debt <b>' + debt + '</b></span>' + collatHtml + pledgeHtml +
      '<span class="dl-chip dl-stamps" id="dl-open-stamps">🎖 Stamps <b>' + stampsN + '</b></span>' +
      '<span class="dl-run">today ' + (run.surplus > 0 ? '<span class="up">+' + run.surplus + ' surplus</span>' : run.shortfall > 0 ? '<span class="down">−' + run.shortfall + ' deficit</span>' : '<span class="up">on track</span>') + repay + '</span>';
    var os = document.getElementById('dl-open-stamps'); if (os) os.onclick = openStamps;
    var pb = document.getElementById('dl-pledge'); if (pb && window.__collateral && window.__collateral.openPledge) pb.onclick = window.__collateral.openPledge;
  }
  if (floatEl) {
    var sd = debt > 0, sc = !!collat;
    if (sd || sc) { floatEl.className = 'show' + (sc ? ' collat' : ''); floatEl.textContent = (sc ? '⚖ ' + collat.stake + ' at risk' : '') + (sd && sc ? ' · ' : '') + (sd ? '🔥 ' + debt + ' debt' : ''); }
    else floatEl.className = '';
  }
}

function openStamps() {
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'dl-stamp-modal';
    modal.innerHTML = '<div id="dl-stamp-box"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;"><div><h3>Proof-of-Work Stamps</h3><div class="dl-sub">Every closed day mints a stamp. Missed days leave a scar you can never delete.</div></div><button id="dl-stamp-close" class="dl-chip" style="cursor:pointer;">✕</button></div><div id="dl-stamp-grid"></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#dl-stamp-close').onclick = closeStamps;
    modal.addEventListener('click', function (e) { if (e.target === modal) closeStamps(); });
  }
  modal.classList.add('open');
  if (window.__stamps && window.__stamps.fillGrid) window.__stamps.fillGrid(modal.querySelector('#dl-stamp-grid'));
}
function closeStamps() { if (modal) modal.classList.remove('open'); }

/* ---------------- public bus ---------------- */
window.__debt = {
  getDebt: function () { return debt; }, tier: tier,
  getHistory: function () { return hist.slice(); },
  getSnap: function (d) { return snap[d] || null; },
  subscribe: function (fn) { subs.push(fn); },
  liveTotals: function () { return totals(live()); },
  openStamps: openStamps, refresh: render
};

/* ---------------- boot ---------------- */
function boot() {
  loadState(); ensureDay(); render();
  setInterval(tick, 3000);
  try {
    var mo = new MutationObserver(function () { setTimeout(tick, 60); });
    SUBJ.forEach(function (k) { var e = document.getElementById(k + '-count'); if (e) mo.observe(e, { childList: true, subtree: true, characterData: true }); });
  } catch (e) {}
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();