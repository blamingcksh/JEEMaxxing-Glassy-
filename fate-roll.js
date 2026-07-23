/* ============================================================================
fate-roll.js  ·  FATE ROLL RITUAL + COSMETICS ENGINE + ISLAND STUDIO
Isolated payoff layer. Reads rolls from 'jeemax_faterolls_v1' (written by
accountability.js), spends them in a ceremonial flip, awards cosmetics + shards,
and lets you equip / buy / tune a full island loadout in a live 3D Studio.
Applies the loadout to the live Daily Grove via window.__forestIslandAPI
(keeps the real-clock sky; biome mood shows via water + life + auras).
NO edits to any other file. Everything guarded; missing deps degrade gracefully.
============================================================================ */
(function () {
'use strict';
if (window.__fateRollInit) return; window.__fateRollInit = true;

/* ───────────────────────── storage ───────────────────────── */
const K_CFG = 'jeemax_island_cosmetics_v1';
const K_ROLLS = 'jeemax_faterolls_v1';
const get = (k, fb) => { try { const o = JSON.parse(localStorage.getItem(k) || 'null'); return (o && typeof o === 'object') ? o : fb; } catch (e) { return fb; } };
const set = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} };
const poke = () => { try { window.dispatchEvent(new Event('storage')); } catch (e) {} }; // nudge sibling modules' badges

/* ───────────────────────── catalog (data-driven) ───────────────────────── */
const RAR = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RAR_W = [50, 30, 14, 5, 1];                 // base draw weights
const RAR_COL = { common: '#9aa3b5', uncommon: '#39d98a', rare: '#4cc9ff', epic: '#a78bfa', legendary: '#ffb224' };
const RAR_PRICE = { common: 3, uncommon: 6, rare: 12, epic: 25, legendary: 50 };
const TIERS = {
  bronze:   { name: 'Bronze',   col: '#cd7f32', glow: 'rgba(205,127,50,.65)',  shards: 1, chance: .40, lift: [1.5, 1.0, 0.5, 0.0, 0.0] },
  silver:   { name: 'Silver',   col: '#cfd6e6', glow: 'rgba(207,214,230,.7)',  shards: 2, chance: .60, lift: [1.0, 1.3, 0.9, 0.3, 0.0] },
  gold:     { name: 'Gold',     col: '#ffd24a', glow: 'rgba(255,210,74,.78)',  shards: 3, chance: .85, lift: [0.6, 1.0, 1.3, 0.9, 0.2] },
  obsidian: { name: 'Obsidian', col: '#b388ff', glow: 'rgba(179,136,255,.85)', shards: 5, chance: 1.0, lift: [0.2, 0.6, 1.0, 1.4, 1.2] }
};
const TIER_ORDER = ['obsidian', 'gold', 'silver', 'bronze'];

// item tables. type ∈ trees|scatter|particles|structure|creature|biome
const AURAS = [
  { id: 'none',    name: 'No Aura',  emoji: '·',  rarity: 'common',    color: null },
  { id: 'gold',    name: 'Goldcrown', emoji: '👑', rarity: 'uncommon',  color: '#ffd24a' },
  { id: 'cyan',    name: 'Aether',    emoji: '💠', rarity: 'uncommon',  color: '#4cc9ff' },
  { id: 'verdant', name: 'Verdant',   emoji: '🍃', rarity: 'common',    color: '#39d98a' },
  { id: 'blossom', name: 'Blossom',   emoji: '🌸', rarity: 'rare',      color: '#ff7ab8' },
  { id: 'violet',  name: 'Mystic',    emoji: '🔮', rarity: 'rare',      color: '#a78bfa' },
  { id: 'ember',   name: 'Ember',     emoji: '🔥', rarity: 'epic',      color: '#ff7a1a' },
  { id: 'frost',   name: 'Frost',     emoji: '❄️', rarity: 'epic',      color: '#9fe8ff' }
];
const SCATTER = [
  { id: 'meadow',   name: 'Wildflowers', emoji: '🌼', rarity: 'common',    colors: ['#4cc9ff', '#39d98a', '#ffb224', '#ff7ab8', '#fff3b0'], size: .16, n: 220, glow: false },
  { id: 'mushroom', name: 'Glowcaps',    emoji: '🍄', rarity: 'uncommon',  colors: ['#ff5e7e', '#7af0c0', '#ffd24a'], size: .22, n: 90, glow: true },
  { id: 'crystal',  name: 'Crystals',    emoji: '💎', rarity: 'rare',      colors: ['#7af0ff', '#b388ff', '#9fffcf'], size: .28, n: 70, glow: true },
  { id: 'snow',     name: 'Snowdrift',   emoji: '🌨️', rarity: 'uncommon',  colors: ['#ffffff', '#cfe8ff'], size: .22, n: 160, glow: false },
  { id: 'emberG',   name: 'Cinderbed',   emoji: '🔥', rarity: 'rare',      colors: ['#ff7a1a', '#ffd24a'], size: .18, n: 120, glow: true },
  { id: 'leaves',   name: 'Fallen Leaves', emoji: '🍂', rarity: 'common',  colors: ['#ff9a3c', '#e0532a', '#ffd24a'], size: .20, n: 140, glow: false }
];
const PARTICLES = [
  { id: 'pollen',  name: 'Pollen',     emoji: '✨', rarity: 'common',    colors: ['#fff3b0', '#9fffcf'], beh: 'drift', n: 40, size: .12 },
  { id: 'petals',  name: 'Petals',     emoji: '🌸', rarity: 'uncommon',  colors: ['#ff7ab8', '#ffd0e6', '#ffffff'], beh: 'fall', n: 60, size: .16 },
  { id: 'snow',    name: 'Snowfall',   emoji: '❄️', rarity: 'uncommon',  colors: ['#ffffff', '#cfe8ff'], beh: 'fall', n: 70, size: .14 },
  { id: 'embers',  name: 'Embers',     emoji: '🔥', rarity: 'rare',      colors: ['#ff7a1a', '#ffd24a'], beh: 'rise', n: 50, size: .14 },
  { id: 'leaves',  name: 'Drifting Leaves', emoji: '🍂', rarity: 'rare', colors: ['#ff9a3c', '#e0532a'], beh: 'fall', n: 45, size: .18 },
  { id: 'flies',   name: 'Fireflies',  emoji: '🪲', rarity: 'epic',      colors: ['#fff3b0', '#9fffcf'], beh: 'blink', n: 36, size: .16 }
];
const STRUCTS = [
  { id: 'campfire', name: 'Campfire',  emoji: '', rarity: 'common',    kind: 'fire',  count: 1 },
  { id: 'lanterns', name: 'Lanterns',  emoji: '🏮', rarity: 'uncommon',  kind: 'lantern', count: 4 },
  { id: 'koistones', name: 'Koi Stones', emoji: '🪨', rarity: 'uncommon', kind: 'stones', count: 3 },
  { id: 'well',     name: 'Wishing Well', emoji: '⛲', rarity: 'rare',    kind: 'well',  count: 1 },
  { id: 'torii',    name: 'Torii Gate', emoji: '⛩️', rarity: 'epic',     kind: 'torii', count: 1 },
  { id: 'shrine',   name: 'Shrine',    emoji: '🛕', rarity: 'epic',      kind: 'shrine', count: 1 }
];
const CREATURES = [
  { id: 'none',     name: 'None',       emoji: '·',  rarity: 'common',   kind: null },
  { id: 'koi',      name: 'Koi',        emoji: '🐟', rarity: 'uncommon', kind: 'koi',  n: 5 },
  { id: 'birds',    name: 'Birds',      emoji: '🐦', rarity: 'uncommon', kind: 'bird', n: 4 },
  { id: 'butterfly', name: 'Butterflies', emoji: '🦋', rarity: 'rare',   kind: 'fly',  n: 8 },
  { id: 'fox',      name: 'Spirit Fox', emoji: '🦊', rarity: 'epic',     kind: 'fox',  n: 3 }
];
const TINTS = [
  { id: 'natural', name: 'Natural',     emoji: '☀️', rarity: 'common', mult: [1, 1, 1], warm: 0 },
  { id: 'golden',  name: 'Golden Hour', emoji: '🌅', rarity: 'uncommon', mult: [1.05, .98, .88], warm: .3 },
  { id: 'moon',    name: 'Moonlit',     emoji: '🌙', rarity: 'uncommon', mult: [.92, .96, 1.06], warm: -.2 },
  { id: 'ember',   name: 'Emberglow',   emoji: '🔥', rarity: 'rare', mult: [1.08, .94, .82], warm: .4 },
  { id: 'frost',   name: 'Frostlight',  emoji: '❄️', rarity: 'rare', mult: [.94, 1.0, 1.08], warm: -.3 }
];
const BIOMES = [
  { id: 'dusk',     name: 'Dusk Hollow', emoji: '🌆', rarity: 'uncommon', sky: ['#3a2a52', '#e07a44'], fog: '#5a3a4a', water: '#3a4a6a', bundle: { trees: { physics: 'violet', chemistry: 'gold', maths: 'ember' }, scatter: 'leaves', particles: 'flies', structure: 'lanterns', creature: 'fox', tint: 'golden' } },
  { id: 'frost',    name: 'Frostpeak',   emoji: '🏔️', rarity: 'epic',     sky: ['#1a2a44', '#9fe8ff'], fog: '#aac4d8', water: '#5a86a8', bundle: { trees: { physics: 'frost', chemistry: 'cyan', maths: 'frost' }, scatter: 'snow', particles: 'snow', structure: 'well', creature: 'birds', tint: 'frost' } },
  { id: 'volcanic', name: 'Emberfall',   emoji: '🌋', rarity: 'epic',     sky: ['#2a0e0e', '#ff7a1a'], fog: '#5a2a1a', water: '#6a2a1a', bundle: { trees: { physics: 'ember', chemistry: 'gold', maths: 'ember' }, scatter: 'emberG', particles: 'embers', structure: 'campfire', creature: 'none', tint: 'ember' } },
  { id: 'twilight', name: 'Twilight Glade', emoji: '🌌', rarity: 'epic',  sky: ['#1a1030', '#7a4ab0'], fog: '#3a2a5a', water: '#3a3a6a', bundle: { trees: { physics: 'violet', chemistry: 'blossom', maths: 'violet' }, scatter: 'crystal', particles: 'flies', structure: 'shrine', creature: 'butterfly', tint: 'moon' } },
  { id: 'sakura',   name: 'Sakura Dream', emoji: '🌸', rarity: 'legendary', sky: ['#3a2030', '#ffb0d0'], fog: '#caa0b8', water: '#7a5a7a', bundle: { trees: { physics: 'blossom', chemistry: 'blossom', maths: 'gold' }, scatter: 'meadow', particles: 'petals', structure: 'torii', creature: 'butterfly', tint: 'golden' } },
  { id: 'aurora',   name: 'Aurora Reach', emoji: '🌠', rarity: 'legendary', sky: ['#06121a', '#39d98a'], fog: '#1a4a4a', water: '#1a5a5a', bundle: { trees: { physics: 'cyan', chemistry: 'verdant', maths: 'frost' }, scatter: 'crystal', particles: 'flies', structure: 'shrine', creature: 'fox', tint: 'moon' } }
];

const TABLES = { trees: AURAS, scatter: SCATTER, particles: PARTICLES, structure: STRUCTS, creature: CREATURES, tint: TINTS, biome: BIOMES };
const BY_ID = {};
Object.values(TABLES).forEach(arr => arr.forEach(it => { BY_ID[it.id] = it; }));
const TYPE_OF = {};
Object.keys(TABLES).forEach(t => TABLES[t].forEach(it => { TYPE_OF[it.id] = t; }));

const DEFAULT_EQ = { biome: 'meadow', trees: { physics: 'cyan', chemistry: 'verdant', maths: 'gold' }, scatter: 'meadow', particles: 'pollen', structure: 'campfire', creature: 'none', tint: 'natural' };
const STARTER_OWNED = ['none', 'gold', 'cyan', 'verdant', 'meadow', 'pollen', 'campfire', 'lanterns', 'butterfly', 'natural', 'golden'];

function loadCfg() {
  const c = get(K_CFG, null);
  if (!c) return { owned: STARTER_OWNED.slice(), equipped: JSON.parse(JSON.stringify(DEFAULT_EQ)), shards: 5, pity: 0 };
  c.owned = Array.isArray(c.owned) ? c.owned : STARTER_OWNED.slice();
  c.equipped = Object.assign({ biome: 'meadow', trees: { physics: 'cyan', chemistry: 'verdant', maths: 'gold' }, scatter: 'meadow', particles: 'pollen', structure: 'campfire', creature: 'none', tint: 'natural' }, c.equipped || {});
  c.equipped.trees = Object.assign({ physics: 'cyan', chemistry: 'verdant', maths: 'gold' }, c.equipped.trees || {});
  c.shards = +c.shards || 0; c.pity = +c.pity || 0;
  return c;
}
let CFG = loadCfg();

// ---- PATCH: saveCfg now stores wrapped format ----
const saveCfg = () => {
  const flat = Object.assign({}, CFG.equipped, {
    version: 2,
    owned: CFG.owned,
    equipped: CFG.equipped,
    shards: CFG.shards,
    pity: CFG.pity
  });
  set(K_CFG, flat);
};
// ------------------------------------------------

const owns = id => CFG.owned.indexOf(id) >= 0;
const loadRolls = () => { const r = get(K_ROLLS, {}); return { bronze: +r.bronze || 0, silver: +r.silver || 0, gold: +r.gold || 0, obsidian: +r.obsidian || 0 }; };
const saveRolls = r => { set(K_ROLLS, r); poke(); };
const totalRolls = () => { const r = loadRolls(); return r.bronze + r.silver + r.gold + r.obsidian; };

/* ───────────────────────── loot draw (pity + unowned weighting) ───────────────────────── */
function drawCosmetic(tierKey) {
  const T = TIERS[tierKey];
  const forceRare = CFG.pity >= 5;
  const eff = RAR_W.map((w, i) => w * T.lift[i] * (forceRare && i < 2 ? 0 : 1));
  // candidate pool = unowned items with eff weight > 0 (across all slot tables except biome? include biome too)
  const pool = [];
  Object.keys(TABLES).forEach(t => TABLES[t].forEach(it => { if (it.id === 'none' || it.id === 'meadow' || it.id === 'natural') return; const ri = RAR.indexOf(it.rarity); if (eff[ri] > 0 && !owns(it.id)) pool.push({ it, w: eff[ri], ri }); }));
  let picked = null;
  if (Math.random() < T.chance && pool.length) {
    const tot = pool.reduce((a, p) => a + p.w, 0);
    let r = Math.random() * tot;
    for (const p of pool) { if ((r -= p.w) <= 0) { picked = p.it; break; } }
    if (!picked) picked = pool[pool.length - 1].it;
  }
  let bonus = 0;
  if (picked) {
    CFG.owned.push(picked.id);
    const ri = RAR.indexOf(picked.rarity);
    CFG.pity = ri >= 2 ? 0 : CFG.pity + 1;
  } else {
    bonus = forceRare ? 4 : 2;          // no cosmetic → consolation shards
    CFG.pity += 1;
  }
  saveCfg();
  return { cosmetic: picked, bonus };
}
function spendRoll(tierKey) {
  const r = loadRolls();
  if (!r[tierKey]) return null;
  r[tierKey] -= 1; saveRolls(r);
  const shards = TIERS[tierKey].shards;
  const draw = drawCosmetic(tierKey);
  CFG.shards += shards + draw.bonus; saveCfg();
  return { tier: tierKey, shards, draw };
}
function buyItem(id) {
  if (owns(id)) return false;
  const it = BY_ID[id]; if (!it) return false;
  const price = RAR_PRICE[it.rarity];
  if (CFG.shards < price) return false;
  CFG.shards -= price; CFG.owned.push(id); saveCfg(); return true;
}

/* ───────────────────────── equipped helpers ───────────────────────── */
function applyBiome(b) {
  CFG.equipped.biome = b.id;
  CFG.equipped.trees = JSON.parse(JSON.stringify(b.bundle.trees));
  CFG.equipped.scatter = b.bundle.scatter;
  CFG.equipped.particles = b.bundle.particles;
  CFG.equipped.structure = b.bundle.structure;
  CFG.equipped.creature = b.bundle.creature;
  CFG.equipped.tint = b.bundle.tint;
  saveCfg();
}
function equipItem(it) {
  const t = TYPE_OF[it.id];
  if (t === 'biome') { applyBiome(it); }
  else if (t === 'trees') { CFG.equipped.trees = { physics: it.id, chemistry: it.id, maths: it.id }; CFG.equipped.biome = 'custom'; saveCfg(); }
  else { CFG.equipped[t] = it.id; CFG.equipped.biome = 'custom'; saveCfg(); }
}
const eq = (slot) => CFG.equipped[slot];
const tintOf = () => BY_ID[eq('tint')] || TINTS[0];
const biomeMood = () => { const b = BIOMES.find(x => x.id === CFG.equipped.biome); return b ? { fog: b.fog, water: b.water, sky: b.sky } : { fog: null, water: '#23a7d6', sky: null }; };

/* ───────────────────────── audio (gated) ───────────────────────── */
let _actx = null;
function wantSound() { try { return !window.FX || window.FX.wantSound(); } catch (e) { return true; } }
function tone(freq, t0, dur, type, gain) {
  if (!wantSound()) return;
  try {
    _actx = _actx || new (window.AudioContext || window.webkitAudioContext)();
    if (_actx.state === 'suspended') _actx.resume();
    const o = _actx.createOscillator(), g = _actx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(_actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) {}
}
function chime(notes, base) { if (!wantSound()) return; try { _actx = _actx || new (window.AudioContext || window.webkitAudioContext)(); const t = _actx.currentTime + (base || 0); notes.forEach((n, i) => tone(n, t + i * 0.07, 0.5, 'triangle', 0.1)); } catch (e) {} }
const RARITY_CHIME = { common: [523, 659], uncommon: [523, 659, 784], rare: [523, 659, 784, 1046], epic: [392, 523, 659, 784, 1046], legendary: [330, 392, 523, 659, 784, 1046, 1318] };

/* ───────────────────────── cosmetics engine (scene-agnostic) ─────────────────────────
   ctx = { THREE, scene, getHeight(x,z), getSpots()->[{x,y,z}], getTrees()->[{subject,x,y,z,scale}],
           water, envMood(bool), bounds:{x,z,yTop,yBot}, onFrame(fn)|null }            */
function buildLayer(ctx) {
  const T = ctx.THREE, scene = ctx.scene;
  const roots = [], disp = [];
  const add = o => { roots.push(o); scene.add(o); return o; };
  const mood = biomeMood(), tint = tintOf();
  const spots = ctx.getSpots() || [];
  const trees = ctx.getTrees() || [];
  const B = ctx.bounds || { x: 12, z: 12, yTop: 8, yBot: 0 };

  // water hue (safe on live island; nothing clobbers it except terrain rebuild, which re-runs us)
  if (ctx.water && mood.water) { try { ctx.water.material.color.set(mood.water); } catch (e) {} }

  // ── ground scatter ──
  const sc = BY_ID[eq('scatter')];
  if (sc && spots.length) {
    const N = Math.min(sc.n, spots.length);
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const s = spots[(Math.random() * spots.length) | 0];
      pos[i * 3] = s.x + (Math.random() - .5) * .8; pos[i * 3 + 1] = (ctx.getHeight ? ctx.getHeight(pos[i * 3], s.z + (Math.random() - .5) * .8) : s.y) + 0.06; pos[i * 3 + 2] = s.z + (Math.random() - .5) * .8;
      const c = new T.Color(sc.colors[(Math.random() * sc.colors.length) | 0]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); disp.push(g);
    const m = new T.PointsMaterial({ size: sc.size, map: glowTex(T), transparent: true, opacity: sc.glow ? .85 : .6, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true, sizeAttenuation: true }); disp.push(m);
    const pts = add(new T.Points(g, m)); pts.frustumCulled = false;
    if (sc.glow) pts.userData.pulse = m;
  }

  // ── tree auras (additive disc crowning each tree, per-subject color) ──
  const auraGeo = new T.RingGeometry(0.5, 1.1, 16); auraGeo.rotateX(-Math.PI / 2); disp.push(auraGeo);
  ['physics', 'chemistry', 'maths'].forEach(subj => {
    const a = BY_ID[eq('trees')[subj]]; if (!a || !a.color) return;
    const list = trees.filter(t => t.subject === subj); if (!list.length) return;
    const mat = new T.MeshBasicMaterial({ color: a.color, transparent: true, opacity: .5, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }); disp.push(mat);
    const im = new T.InstancedMesh(auraGeo, mat, list.length); im.frustumCulled = false;
    const d = new T.Object3D();
    list.forEach((t, i) => { const r = (t.scale || 1) * 1.1; d.position.set(t.x, (ctx.getHeight ? ctx.getHeight(t.x, t.z) : t.y) + (t.scale || 1) * 2.0, t.z); d.rotation.set(0, 0, 0); d.scale.set(r, 1, r); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    im.instanceMatrix.needsUpdate = true; add(im); im.userData.pulse = mat;
  });

  // ── air particles ──
  const pa = BY_ID[eq('particles')];
  let pState = null;
  if (pa) {
    const N = pa.n, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - .5) * B.x * 2; pos[i * 3 + 1] = Math.random() * B.yTop; pos[i * 3 + 2] = (Math.random() - .5) * B.z * 2;
      const c = new T.Color(pa.colors[(Math.random() * pa.colors.length) | 0]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      vel[i * 3] = (Math.random() - .5) * .4; vel[i * 3 + 1] = pa.beh === 'rise' ? (.4 + Math.random() * .6) : pa.beh === 'fall' ? -(.3 + Math.random() * .5) : (Math.random() - .5) * .3; vel[i * 3 + 2] = (Math.random() - .5) * .4;
      ph[i] = Math.random() * 6.28;
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); disp.push(g);
    const m = new T.PointsMaterial({ size: pa.size, map: glowTex(T), transparent: true, opacity: .9, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true, sizeAttenuation: true }); disp.push(m);
    const pts = add(new T.Points(g, m)); pts.frustumCulled = false;
    pState = { pa, pos, vel, ph, m };
  }

  // ── structure ──
  const st = BY_ID[eq('structure')];
  if (st) {
    const places = pickPlaces(st, spots, ctx);
    places.forEach(p => { const grp = buildStruct(T, st.kind, p); if (grp) { grp.position.set(p.x, p.y, p.z); add(grp); grp.traverse(o => { if (o.geometry) disp.push(o.geometry); if (o.material) disp.push(o.material); }); } });
  }

  // ── creatures ──
  const cr = BY_ID[eq('creature')];
  let cState = null;
  if (cr && cr.kind) {
    const N = cr.n, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const cc = cr.kind === 'koi' ? '#ff7a3c' : cr.kind === 'fox' ? '#ff9a4a' : cr.kind === 'bird' ? '#cfe8ff' : '#ff7ab8';
    for (let i = 0; i < N; i++) { const c = new T.Color(cc); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); disp.push(g);
    const m = new T.PointsMaterial({ size: cr.kind === 'bird' ? .22 : .18, map: glowTex(T), transparent: true, opacity: .95, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true, sizeAttenuation: true }); disp.push(m);
    const pts = add(new T.Points(g, m)); pts.frustumCulled = false;
    cState = { cr, pos, N };
  }

  // ── updater ──
  function update(el, dt) {
    roots.forEach(o => { if (o.userData && o.userData.pulse) o.userData.pulse.opacity = (o.userData.pulse.userData_base || (o.userData.pulse.userData_base = o.userData.pulse.opacity)) * (0.7 + 0.3 * Math.sin(el * 2.2)); });
    if (pState) {
      const { pa, pos, vel, ph, m } = pState;
      for (let i = 0; i < pa.n; i++) {
        pos[i * 3] += (vel[i * 3] + Math.sin(el * .6 + ph[i]) * .25) * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += (vel[i * 3 + 2] + Math.cos(el * .5 + ph[i]) * .25) * dt;
        if (pa.beh === 'blink') { const b = 0.3 + 0.7 * Math.max(0, Math.sin(el * 1.5 + ph[i] * 3)); m.opacity = b; }
        if (pos[i * 3 + 1] < B.yBot) { pos[i * 3 + 1] = B.yTop; pos[i * 3] = (Math.random() - .5) * B.x * 2; pos[i * 3 + 2] = (Math.random() - .5) * B.z * 2; }
        if (pos[i * 3 + 1] > B.yTop) { pos[i * 3 + 1] = B.yBot; }
        if (Math.abs(pos[i * 3]) > B.x) pos[i * 3] *= -0.9;
        if (Math.abs(pos[i * 3 + 2]) > B.z) pos[i * 3 + 2] *= -0.9;
      }
      pState.m.geometry ? (pState.m.geometry.attributes.position.needsUpdate = true) : 0;
    }
    if (cState) {
      const { cr, pos, N } = cState;
      for (let i = 0; i < N; i++) {
        const a = el * (cr.kind === 'bird' ? .5 : .8) + i * 2.1;
        if (cr.kind === 'koi') { const r = 3 + (i % 3); pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = -0.05; pos[i * 3 + 2] = Math.sin(a) * r; }
        else if (cr.kind === 'bird') { const r = 6 + (i % 4) * 2; pos[i * 3] = Math.cos(a * .7) * r; pos[i * 3 + 1] = 5 + Math.sin(a * 1.3 + i) * 1.2; pos[i * 3 + 2] = Math.sin(a * .7) * r; }
        else if (cr.kind === 'fox') { const r = 2 + Math.sin(el * .3 + i) * 1.5; pos[i * 3] = Math.cos(a * .4 + i) * r; pos[i * 3 + 1] = 0.25; pos[i * 3 + 2] = Math.sin(a * .4 + i) * r; }
        else { pos[i * 3] = Math.cos(a) * (2 + i * .4) + Math.sin(el * 2 + i) * .4; pos[i * 3 + 1] = 0.6 + Math.sin(el * 3 + i) * .3; pos[i * 3 + 2] = Math.sin(a) * (2 + i * .4); }
      }
      cState.pos && (cState.cr && (roots.forEach(o => { if (o.material && o.material.size === (cr.kind === 'bird' ? .22 : .18)) o.geometry.attributes.position.needsUpdate = true; })));
    }
  }

  function dispose() { roots.forEach(o => scene.remove(o)); disp.forEach(d => { try { d.dispose(); } catch (e) {} }); }
  return { update, dispose };
}

let _glow = null;
function glowTex(T) {
  if (_glow && _glow._T === T) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new T.CanvasTexture(c); try { t.colorSpace = T.SRGBColorSpace; } catch (e) {}
  _glow = t; _glow._T = T; return t;
}
function pickPlaces(st, spots, ctx) {
  const out = [];
  if (!spots.length) { for (let i = 0; i < st.count; i++) out.push({ x: (i - 1) * 2.4, y: ctx.getHeight ? ctx.getHeight((i - 1) * 2.4, 0) : 0, z: 0 }); return out; }
  const band = spots.filter(s => { const r = Math.hypot(s.x, s.z); return r > 1.6 && r < 7; });
  const src = band.length ? band : spots;
  for (let i = 0; i < st.count; i++) { const s = src[(i * 7 + 3) % src.length]; out.push({ x: s.x, y: s.y, z: s.z }); }
  return out;
}
function buildStruct(T, kind, p) {
  const g = new T.Group();
  const mat = (c, r) => new T.MeshStandardMaterial({ color: c, roughness: r == null ? 1 : r, flatShading: true });
  const basic = (c, op) => new T.MeshBasicMaterial({ color: c, transparent: op != null, opacity: op == null ? 1 : op, blending: op != null ? T.AdditiveBlending : T.NormalBlending, depthWrite: op == null });
  if (kind === 'fire') {
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; const s = new T.Mesh(new T.IcosahedronGeometry(0.16, 0), mat(0x71767f)); s.position.set(Math.cos(a) * .55, .06, Math.sin(a) * .55); s.scale.setScalar(.7 + Math.random() * .5); g.add(s); }
    const fl = new T.Mesh(new T.ConeGeometry(0.18, 0.6, 7), basic(0xffb347, .92)); fl.position.y = .34; g.add(fl);
    const L = new T.PointLight(0xff8a3c, 1.1, 14, 2); L.position.y = .6; g.add(L);
  } else if (kind === 'lantern') {
    const post = new T.Mesh(new T.CylinderGeometry(0.04, 0.05, 0.9, 6), mat(0x3a2a1a)); post.position.y = .45; g.add(post);
    const lamp = new T.Mesh(new T.IcosahedronGeometry(0.13, 0), basic(0xffd24a, .9)); lamp.position.y = .95; g.add(lamp);
    const L = new T.PointLight(0xffb24a, .6, 8, 2); L.position.y = .95; g.add(L);
  } else if (kind === 'stones') {
    for (let i = 0; i < 3; i++) { const s = new T.Mesh(new T.IcosahedronGeometry(0.22 + i * .05, 0), mat(0x8a8f98)); s.position.set((i - 1) * .5, .1, (i % 2) * .3); s.scale.setScalar(.8 + Math.random() * .4); g.add(s); }
  } else if (kind === 'well') {
    const base = new T.Mesh(new T.CylinderGeometry(0.5, 0.55, 0.4, 12), mat(0x6a6f78)); base.position.y = .2; g.add(base);
    const water = new T.Mesh(new T.CircleGeometry(0.42, 12), basic(0x2a6a8a, .8)); water.rotation.x = -Math.PI / 2; water.position.y = .38; g.add(water);
    for (let i = 0; i < 2; i++) { const post = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 0.8, 6), mat(0x4a3320)); post.position.set(i ? .4 : -.4, .7, 0); g.add(post); }
    const roof = new T.Mesh(new T.ConeGeometry(0.6, 0.3, 4), mat(0x7a3a2a)); roof.position.y = 1.15; roof.rotation.y = Math.PI / 4; g.add(roof);
  } else if (kind === 'torii') {
    const col = mat(0xc0392b);
    const l = new T.Mesh(new T.CylinderGeometry(0.1, 0.12, 2.2, 8), col); l.position.set(-0.8, 1.1, 0); g.add(l);
    const r = new T.Mesh(new T.CylinderGeometry(0.1, 0.12, 2.2, 8), col); r.position.set(0.8, 1.1, 0); g.add(r);
    const top = new T.Mesh(new T.BoxGeometry(2.2, 0.16, 0.3), col); top.position.y = 2.2; g.add(top);
    const beam = new T.Mesh(new T.BoxGeometry(1.8, 0.1, 0.18), col); beam.position.y = 1.8; g.add(beam);
  } else if (kind === 'shrine') {
    const base = new T.Mesh(new T.BoxGeometry(0.8, 0.5, 0.6), mat(0xb0b6c0)); base.position.y = .25; g.add(base);
    const body = new T.Mesh(new T.BoxGeometry(0.5, 0.6, 0.4), mat(0xd0d6e0)); body.position.y = .8; g.add(body);
    const roof = new T.Mesh(new T.ConeGeometry(0.6, 0.5, 4), mat(0x2a6a5a)); roof.position.y = 1.35; roof.rotation.y = Math.PI / 4; g.add(roof);
    const glow = new T.Mesh(new T.IcosahedronGeometry(0.12, 0), basic(0x9fffcf, .9)); glow.position.y = .8; g.add(glow);
    const L = new T.PointLight(0x9fffcf, .5, 8, 2); L.position.y = .8; g.add(L);
  }
  return g;
}

/* ───────────────────────── apply to LIVE island ───────────────────────── */
let liveLayer = null, onFrameReg = false, lastTreeSig = -1;
function islandCtx(api) {
  const T = api.THREE;
  return {
    THREE: T, scene: api.scene,
    getHeight: api.heightAt,
    getSpots: () => api.drySpots || [],
    getTrees: () => { const out = []; for (const k in api.trees) (api.trees[k] || []).forEach(t => out.push({ subject: k, x: t.x, y: t.y, z: t.z, scale: (t.baseScale || 1) * (t.sy || 1) })); return out; },
    water: api.env && api.env.water,
    envMood: false,
    bounds: { x: 11, z: 11, yTop: 7, yBot: 0 }
  };
}
function applyToIsland() {
  const api = window.__forestIslandAPI; if (!api || !api.THREE) return;
  if (liveLayer) { try { liveLayer.dispose(); } catch (e) {} liveLayer = null; }
  try { liveLayer = buildLayer(islandCtx(api)); } catch (e) { console.warn('[fate-roll] live layer failed', e); }
  if (!onFrameReg) {
    onFrameReg = true;
    api.onFrame.push((el, dt) => {
      // rebuild if island grew / terrain changed
      const sig = api.total ? api.total() : 0;
      if (sig !== lastTreeSig) { lastTreeSig = sig; applyToIsland(); return; }
      if (liveLayer) try { liveLayer.update(el, dt); } catch (e) {}
    });
  }
  lastTreeSig = api.total ? api.total() : 0;
}

/* ───────────────────────── HUD (🎲 + 🎨) over the island canvas ───────────────────────── */
function injectHUD() {
  const cvs = document.getElementById('forest-island-canvas'); if (!cvs) return false;
  const wrap = cvs.parentElement; if (!wrap || wrap.querySelector('#fr-hud')) return true;
  if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
  const hud = document.createElement('div'); hud.id = 'fr-hud';
  hud.innerHTML =
    '<button id="fr-roll-btn" class="fr-hud-btn" title="Fate Roll"><span class="fr-ico">🎲</span><span id="fr-roll-n" class="fr-badge">0</span></button>' +
    '<button id="fr-studio-btn" class="fr-hud-btn" title="Island Studio"><span class="fr-ico">🎨</span></button>';
  wrap.appendChild(hud);
  hud.querySelector('#fr-roll-btn').addEventListener('click', e => { e.stopPropagation(); openRitual(); });
  hud.querySelector('#fr-studio-btn').addEventListener('click', e => { e.stopPropagation(); openStudio(); });
  refreshHUD();
  return true;
}
function refreshHUD() {
  const n = document.getElementById('fr-roll-n'); if (n) n.textContent = totalRolls();
  const b = document.getElementById('fr-roll-btn'); if (b) b.classList.toggle('fr-empty', totalRolls() <= 0);
}

/* ───────────────────────── 2D reveal burst ───────────────────────── */
function burst(color) {
  let cv = document.getElementById('fr-burst');
  if (!cv) { cv = document.createElement('canvas'); cv.id = 'fr-burst'; Object.assign(cv.style, { position: 'fixed', inset: '0', zIndex: '100009', pointerEvents: 'none' }); document.body.appendChild(cv); }
  cv.width = innerWidth; cv.height = innerHeight;
  const g = cv.getContext('2d'); const cx = innerWidth / 2, cy = innerHeight / 2;
  const P = []; for (let i = 0; i < 90; i++) { const a = Math.random() * 6.28, s = 2 + Math.random() * 7; P.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 1, r: 1 + Math.random() * 3 }); }
  let raf; const step = () => {
    g.clearRect(0, 0, cv.width, cv.height); let alive = false;
    for (const p of P) { p.vy += .12; p.x += p.vx; p.y += p.vy; p.life -= .016; if (p.life <= 0) continue; alive = true; g.globalAlpha = Math.max(0, p.life); g.fillStyle = color; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.28); g.fill(); }
    g.globalAlpha = 1; if (alive) raf = requestAnimationFrame(step); else g.clearRect(0, 0, cv.width, cv.height);
  };
  cancelAnimationFrame(raf); raf = requestAnimationFrame(step);
}

/* ───────────────────────── FATE ROLL RITUAL ───────────────────────── */
let ritualEl = null;
function ensureRitual() {
  if (ritualEl) return ritualEl;
  ritualEl = document.createElement('div'); ritualEl.id = 'fr-ritual'; ritualEl.className = 'fr-overlay';
  ritualEl.innerHTML =
    '<div class="fr-stage">' +
      '<div class="fr-tiers" id="fr-tiers"></div>' +
      '<div class="fr-cardwrap"><div class="fr-card" id="fr-card"><div class="fr-face fr-back" id="fr-back"></div><div class="fr-face fr-front" id="fr-front"></div></div></div>' +
      '<div class="fr-prompt" id="fr-prompt">Channeling the fates…</div>' +
      '<div class="fr-actions" id="fr-actions"></div>' +
      '<button class="fr-close" id="fr-close">✕</button>' +
    '</div>';
  document.body.appendChild(ritualEl);
  ritualEl.querySelector('#fr-close').onclick = closeRitual;
  ritualEl.addEventListener('click', e => { if (e.target === ritualEl) closeRitual(); });
  ritualEl.querySelector('#fr-card').addEventListener('click', () => { if (ritualEl.dataset.armed === '1') flip(); });
  return ritualEl;
}
let ritualState = null;
function openRitual() {
  ensureRitual(); refreshHUD();
  const r = loadRolls();
  const tiers = TIER_ORDER.filter(t => r[t] > 0);
  const tierBox = ritualEl.querySelector('#fr-tiers');
  if (!tiers.length) {
    tierBox.innerHTML = '<div class="fr-no-rolls">No fate rolls yet.<br><span>Pledge collateral or hit milestones to earn them — then return here.</span></div>';
    ritualEl.querySelector('#fr-prompt').textContent = '';
    ritualEl.querySelector('#fr-actions').innerHTML = '<button class="fr-btn fr-ghost" id="fr-go-studio">Open the Studio</button>';
    ritualEl.querySelector('#fr-go-studio').onclick = () => { closeRitual(); openStudio(); };
    ritualEl.querySelector('#fr-card').style.visibility = 'hidden';
    ritualEl.classList.add('open'); return;
  }
  ritualEl.querySelector('#fr-card').style.visibility = 'visible';
  let sel = tiers[0];
  const renderTiers = () => { tierBox.innerHTML = tiers.map(t => '<button class="fr-tier' + (t === sel ? ' on' : '') + '" data-t="' + t + '" style="--tc:' + TIERS[t].col + '"><span class="fr-tdot"></span>' + TIERS[t].name + ' <b>' + r[t] + '</b></button>').join(''); tierBox.querySelectorAll('.fr-tier').forEach(b => b.onclick = () => { sel = b.dataset.t; renderTiers(); armCard(); }); };
  renderTiers();
  ritualState = { get sel() { return sel; }, result: null, flipped: false };
  armCard();
  ritualEl.classList.add('open');
}
function armCard() {
  const sel = ritualState.sel; const T = TIERS[sel];
  const back = ritualEl.querySelector('#fr-back');
  back.style.background = 'radial-gradient(circle at 50% 35%, ' + T.glow + ', rgba(8,9,13,.95) 70%)';
  back.style.boxShadow = '0 0 50px -8px ' + T.glow + ', inset 0 0 0 2px ' + T.col;
  back.innerHTML = '<div class="fr-sigil">✦</div><div class="fr-tiername">' + T.name + ' Fate</div>';
  const card = ritualEl.querySelector('#fr-card'); card.classList.remove('flipped', 'shake');
  ritualEl.querySelector('#fr-front').innerHTML = '';
  ritualEl.dataset.armed = '0'; ritualState.flipped = false; ritualState.result = null;
  ritualEl.querySelector('#fr-prompt').textContent = 'Tap the card — or let it channel…';
  ritualEl.querySelector('#fr-actions').innerHTML = '<button class="fr-btn" id="fr-flip" style="--tc:' + T.col + '">Flip the Fate</button>';
  ritualEl.querySelector('#fr-flip').onclick = flip;
  // anticipation: shake then auto-flip
  setTimeout(() => { if (!ritualState.flipped && ritualEl.classList.contains('open')) card.classList.add('shake'); }, 350);
  setTimeout(() => { if (!ritualState.flipped && ritualEl.classList.contains('open')) flip(); }, 1300);
}
function flip() {
  if (!ritualState || ritualState.flipped) return;
  ritualState.flipped = true; ritualEl.dataset.armed = '1';
  const sel = ritualState.sel;
  const res = spendRoll(sel);
  if (!res) { closeRitual(); return; }
  ritualState.result = res;
  const card = ritualEl.querySelector('#fr-card'); card.classList.remove('shake'); card.classList.add('flipped');
  chime([392, 523], 0);
  setTimeout(() => reveal(res), 720);
  refreshHUD();
}
function reveal(res) {
  const it = res.draw.cosmetic;
  const rar = it ? it.rarity : 'common';
  const col = it ? RAR_COL[rar] : '#9aa3b5';
  burst(col); chime(RARITY_CHIME[rar] || [523, 659], 0);
  const front = ritualEl.querySelector('#fr-front');
  if (it) {
    const t = TYPE_OF[it.id];
    front.style.background = 'radial-gradient(circle at 50% 30%, ' + hexA(col, .35) + ', rgba(8,9,13,.97) 72%)';
    front.style.boxShadow = '0 0 60px -6px ' + hexA(col, .7) + ', inset 0 0 0 2px ' + col;
    front.innerHTML =
      '<div class="fr-rarity" style="color:' + col + '">' + rar.toUpperCase() + '</div>' +
      '<div class="fr-emoji">' + (it.emoji || '✦') + '</div>' +
      '<div class="fr-name">' + it.name + '</div>' +
      '<div class="fr-type">' + slotLabel(t) + '</div>' +
      '<div class="fr-shards">+' + res.shards + ' shards' + (res.draw.bonus ? ' (+' + res.draw.bonus + ' pity)' : '') + '</div>';
  } else {
    front.style.background = 'radial-gradient(circle at 50% 30%, rgba(154,163,181,.25), rgba(8,9,13,.97) 72%)';
    front.style.boxShadow = 'inset 0 0 0 2px #9aa3b5';
    front.innerHTML =
      '<div class="fr-rarity" style="color:#9aa3b5">SHARDS</div>' +
      '<div class="fr-emoji">🪙</div>' +
      '<div class="fr-name">+' + (res.shards + res.draw.bonus) + ' Shards</div>' +
      '<div class="fr-type">The fates withheld a relic — but the dust is currency.</div>' +
      '<div class="fr-shards">Spend them in the Studio shop</div>';
  }
  ritualEl.querySelector('#fr-prompt').textContent = it ? 'A new relic joins your collection.' : 'Dust gathered. Spend it wisely.';
  const acts = ritualEl.querySelector('#fr-actions');
  acts.innerHTML =
    (it ? '<button class="fr-btn" id="fr-equip" style="--tc:' + col + '">Equip Now</button>' : '') +
    '<button class="fr-btn fr-ghost" id="fr-studio2">Open Studio</button>' +
    '<button class="fr-btn fr-ghost" id="fr-again">Roll Again</button>';
  if (it) acts.querySelector('#fr-equip').onclick = () => { equipItem(it); applyToIsland(); refreshHUD(); flashEquip(it); closeRitual(); };
  acts.querySelector('#fr-studio2').onclick = () => { closeRitual(); openStudio(); };
  acts.querySelector('#fr-again').onclick = () => { if (totalRolls() > 0) openRitual(); else { closeRitual(); } };
}
function flashEquip(it) { toast('Equipped: ' + it.name + ' ' + (it.emoji || '')); }
function closeRitual() { if (ritualEl) ritualEl.classList.remove('open'); }

function slotLabel(t) { return { trees: 'Tree Aura', scatter: 'Ground', particles: 'Sky & FX', structure: 'Structure', creature: 'Life', biome: 'Biome', tint: 'Light' }[t] || t; }
function hexA(hex, a) { const c = new (window.__forestIslandAPI ? window.__forestIslandAPI.THREE.Color : function (x) { this.r = parseInt(x.slice(1, 3), 16) / 255; this.g = parseInt(x.slice(3, 5), 16) / 255; this.b = parseInt(x.slice(5, 7), 16) / 255; })(hex); return 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',' + a + ')'; }

/* ───────────────────────── ISLAND STUDIO (live 3D loadout editor) ───────────────────────── */
let studioEl = null, studio = null;
function ensureStudio() {
  if (studioEl) return studioEl;
  studioEl = document.createElement('div'); studioEl.id = 'fr-studio'; studioEl.className = 'fr-overlay';
  studioEl.innerHTML =
    '<div class="st-shell">' +
      '<div class="st-preview"><canvas id="st-canvas"></canvas><div id="st-fallback" class="st-fallback"></div><div class="st-preview-tag">LIVE PREVIEW · drag to orbit</div></div>' +
      '<div class="st-panel">' +
        '<div class="st-head"><div><div class="st-kicker">// ISLAND STUDIO</div><div class="st-title">Design your biome</div></div><button class="fr-close" id="st-close">✕</button></div>' +
        '<div class="st-wallet"><div class="st-pill">🪙 <b id="st-shards">0</b> shards</div><div class="st-pill">🎲 <b id="st-rolls">0</b> rolls <button id="st-rollhere" class="st-mini">Roll</button></div></div>' +
        '<div class="st-tabs" id="st-tabs"></div>' +
        '<div class="st-grid" id="st-grid"></div>' +
        '<div class="st-foot"><button class="fr-btn" id="st-apply">Apply to Island</button><button class="fr-btn fr-ghost" id="st-reset">Reset</button></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(studioEl);
  studioEl.querySelector('#st-close').onclick = closeStudio;
  studioEl.querySelector('#st-apply').onclick = () => { applyToIsland(); toast('Loadout applied to your island ✦'); };
  studioEl.querySelector('#st-reset').onclick = () => { CFG.equipped = JSON.parse(JSON.stringify(DEFAULT_EQ)); CFG.equipped.biome = 'meadow'; saveCfg(); renderStudioGrid(); rebuildPreview(); };
  studioEl.querySelector('#st-rollhere').onclick = () => { closeStudio(); openRitual(); };
  buildTabs();
  return studioEl;
}
const TABS = [['biome', '🌍 Biome'], ['trees', '🌳 Auras'], ['scatter', '🌼 Ground'], ['particles', '✨ Sky & FX'], ['structure', '⛩️ Build'], ['creature', '🦊 Life'], ['tint', '☀️ Light']];
let studioTab = 'biome';
function buildTabs() {
  const box = studioEl.querySelector('#st-tabs');
  box.innerHTML = TABS.map(t => '<button class="st-tab' + (t[0] === studioTab ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>').join('');
  box.querySelectorAll('.st-tab').forEach(b => b.onclick = () => { studioTab = b.dataset.t; buildTabs(); renderStudioGrid(); });
}
function renderStudioGrid() {
  studioEl.querySelector('#st-shards').textContent = CFG.shards;
  studioEl.querySelector('#st-rolls').textContent = totalRolls();
  const grid = studioEl.querySelector('#st-grid'); grid.innerHTML = '';
  if (studioTab === 'biome') {
    grid.appendChild(biomeCard('meadow', 'Meadow', '🌿', 'common', true));
    BIOMES.forEach(b => grid.appendChild(biomeCard(b.id, b.name, b.emoji, b.rarity, owns(b.id))));
    return;
  }
  const items = TABLES[studioTab];
  items.forEach(it => {
    const owned = owns(it.id);
    const isEq = equippedHas(studioTab, it.id);
    const card = document.createElement('button');
    card.className = 'st-item' + (isEq ? ' eq' : '') + (owned ? '' : ' locked');
    card.style.setProperty('--rc', RAR_COL[it.rarity]);
    const price = RAR_PRICE[it.rarity];
    card.innerHTML =
      '<div class="st-i-emoji">' + (it.emoji || '✦') + '</div>' +
      '<div class="st-i-name">' + it.name + '</div>' +
      '<div class="st-i-rar" style="color:' + RAR_COL[it.rarity] + '">' + it.rarity + '</div>' +
      (owned ? '<div class="st-i-state">' + (isEq ? 'equipped' : 'owned') + '</div>' : '<div class="st-i-buy">🪙 ' + price + '</div>');
    card.onclick = () => {
      if (!owned) { if (buyItem(it.id)) { toast('Bought ' + it.name); renderStudioGrid(); rebuildPreview(); } else toast('Not enough shards'); return; }
      if (studioTab === 'trees') { CFG.equipped.trees = { physics: it.id, chemistry: it.id, maths: it.id }; CFG.equipped.biome = 'custom'; }
      else { CFG.equipped[studioTab] = it.id; CFG.equipped.biome = 'custom'; }
      saveCfg(); renderStudioGrid(); rebuildPreview();
    };
    grid.appendChild(card);
  });
}
function equippedHas(slot, id) { if (slot === 'trees') return CFG.equipped.trees.physics === id && CFG.equipped.trees.chemistry === id && CFG.equipped.trees.maths === id; return CFG.equipped[slot] === id; }
function biomeCard(id, name, emoji, rar, owned) {
  const isEq = CFG.equipped.biome === id;
  const card = document.createElement('button');
  card.className = 'st-item st-biome' + (isEq ? ' eq' : '') + (owned ? '' : ' locked');
  card.style.setProperty('--rc', RAR_COL[rar]);
  const price = RAR_PRICE[rar];
  card.innerHTML =
    '<div class="st-i-emoji">' + emoji + '</div>' +
    '<div class="st-i-name">' + name + '</div>' +
    '<div class="st-i-rar" style="color:' + RAR_COL[rar] + '">' + (id === 'meadow' ? 'starter' : rar) + '</div>' +
    (id === 'meadow' ? '<div class="st-i-state">base</div>' : owned ? '<div class="st-i-state">' + (isEq ? 'equipped' : 'owned') + '</div>' : '<div class="st-i-buy">🪙 ' + price + '</div>');
  card.onclick = () => {
    if (id !== 'meadow' && !owned) { if (buyItem(id)) { toast('Bought ' + name); const b = BIOMES.find(x => x.id === id); applyBiome(b); renderStudioGrid(); rebuildPreview(); } else toast('Not enough shards'); return; }
    if (id === 'meadow') { CFG.equipped = JSON.parse(JSON.stringify(DEFAULT_EQ)); CFG.equipped.biome = 'meadow'; }
    else applyBiome(BIOMES.find(x => x.id === id));
    saveCfg(); renderStudioGrid(); rebuildPreview();
  };
  return card;
}

/* ── studio preview renderer (own WebGL context; graceful CSS fallback) ── */
function openStudio() {
  ensureStudio(); studioEl.classList.add('open');
  renderStudioGrid();
  if (!studio) initPreview();
  else { sizePreview(); rebuildPreview(); startPreviewLoop(); }
}
function closeStudio() { if (studioEl) studioEl.classList.remove('open'); stopPreviewLoop(); }
function initPreview() {
  const api = window.__forestIslandAPI;
  const T = api && api.THREE;
  const cv = document.getElementById('st-canvas'); const fb = document.getElementById('st-fallback');
  if (!T) { showFallback(); return; }
  try {
    const renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera(50, 1, 0.1, 400);
    scene.add(new T.HemisphereLight(0x9ab4c8, 0x3a3020, 0.8));
    const sun = new T.DirectionalLight(0xfff2e0, 1.1); sun.position.set(8, 14, 6); scene.add(sun);
    // ground
    const gg = new T.CircleGeometry(9, 48); gg.rotateX(-Math.PI / 2);
    const gpos = gg.attributes.position, gcol = new Float32Array(gpos.count * 3);
    for (let i = 0; i < gpos.count; i++) { const x = gpos.getX(i), z = gpos.getZ(i); const r = Math.hypot(x, z) / 9; const g = 0.32 + 0.3 * (1 - r); gcol[i * 3] = 0.1 + 0.06 * r; gcol[i * 3 + 1] = g; gcol[i * 3 + 2] = 0.12; }
    gg.setAttribute('color', new T.BufferAttribute(gcol, 3)); gg.computeVertexNormals();
    const ground = new T.Mesh(gg, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })); scene.add(ground);
    const water = new T.Mesh(new T.RingGeometry(9, 16, 48).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x23a7d6, transparent: true, opacity: .8, roughness: .1, metalness: .3 })); water.position.y = -0.2; scene.add(water);
    // preview trees (3, simple geo, tinted)
    const treeList = [];
    const tgeo = makePreviewTreeGeo(T);
    const tmat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .8, flatShading: true });
    const positions = [{ x: 0, z: 0, s: 'physics' }, { x: -3, z: 2, s: 'chemistry' }, { x: 3, z: 1.5, s: 'maths' }];
    const im = new T.InstancedMesh(tgeo, tmat, 3); im.frustumCulled = false;
    const d = new T.Object3D();
    positions.forEach((p, i) => { d.position.set(p.x, 0, p.z); d.rotation.set(0, i, 0); d.scale.setScalar(1); d.updateMatrix(); im.setMatrixAt(i, d.matrix); treeList.push({ subject: p.s, x: p.x, y: 0, z: p.z, scale: 1 }); });
    im.instanceMatrix.needsUpdate = true; scene.add(im);
    // spots for scatter
    const spots = []; for (let i = 0; i < 240; i++) { const a = Math.random() * 6.28, r = 1 + Math.random() * 7.5; spots.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r }); }
    const getHeight = (x, z) => 0;
    studio = { T, renderer, scene, cam, sun, water, im, tmat, treeList, spots, getHeight, theta: 0.6, phi: 1.0, radius: 13, layer: null, raf: null, el: 0, lt: 0 };
    // orbit controls (pointer)
    let drag = null;
    cv.style.touchAction = 'none'; cv.style.cursor = 'grab';
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; studio.theta -= (e.clientX - drag.x) * 0.01; studio.phi = Math.max(0.3, Math.min(1.45, studio.phi - (e.clientY - drag.y) * 0.01)); drag = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('pointerup', () => drag = null);
    cv.addEventListener('wheel', e => { e.preventDefault(); studio.radius = Math.max(7, Math.min(22, studio.radius + e.deltaY * 0.01)); }, { passive: false });
    sizePreview(); rebuildPreview(); startPreviewLoop();
    cv.style.display = 'block'; fb.style.display = 'none';
  } catch (e) { console.warn('[fate-roll] preview failed', e); showFallback(); }
}
function makePreviewTreeGeo(T) {
  const trunk = new T.CylinderGeometry(0.12, 0.18, 1.0, 6); trunk.translate(0, 0.5, 0);
  const c1 = new T.ConeGeometry(0.8, 1.2, 7); c1.translate(0, 1.4, 0);
  const c2 = new T.ConeGeometry(0.6, 1.0, 7); c2.translate(0, 2.0, 0);
  const list = [trunk, c1, c2].map(g => g.index ? g.toNonIndexed() : g);
  // white-ish base so tint multiplies visibly
  const n = list.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  list.forEach((g, gi) => { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3); const base = gi === 0 ? [0.4, 0.3, 0.2] : [0.85, 0.9, 0.85]; for (let i = 0; i < c; i++) { col[(o + i) * 3] = base[0]; col[(o + i) * 3 + 1] = base[1]; col[(o + i) * 3 + 2] = base[2]; } o += c; });
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); return g;
}
function rebuildPreview() {
  if (!studio) return;
  const T = studio.T;
  if (studio.layer) { try { studio.layer.dispose(); } catch (e) {} studio.layer = null; }
  // tint preview trees via instanceColor
  const tint = tintOf();
  const cols = { physics: new T.Color(tint.mult[0], tint.mult[1], tint.mult[2]), chemistry: new T.Color(tint.mult[0], tint.mult[1], tint.mult[2]), maths: new T.Color(tint.mult[0], tint.mult[1], tint.mult[2]) };
  // per-subject aura color also tints the canopy a touch in preview
  ['physics', 'chemistry', 'maths'].forEach((s, i) => { const a = BY_ID[CFG.equipped.trees[s]]; const c = cols[s].clone(); if (a && a.color) c.lerp(new T.Color(a.color), 0.35); studio.im.setColorAt(i, c); });
  if (studio.im.instanceColor) studio.im.instanceColor.needsUpdate = true;
  // biome sky on fallback + preview container
  const mood = biomeMood();
  const sky = (BIOMES.find(b => b.id === CFG.equipped.biome) || {}).sky || ['#1a2030', '#3a4a6a'];
  studioEl.querySelector('.st-preview').style.background = 'linear-gradient(180deg,' + sky[0] + ',' + sky[1] + ')';
  try { studio.layer = buildLayer({ THREE: T, scene: studio.scene, getHeight: studio.getHeight, getSpots: () => studio.spots, getTrees: () => studio.treeList, water: studio.water, envMood: true, bounds: { x: 8, z: 8, yTop: 6, yBot: 0 } }); } catch (e) { console.warn(e); }
}
function sizePreview() { if (!studio) return; const cv = document.getElementById('st-canvas'); const w = cv.clientWidth || 400, h = cv.clientHeight || 400; studio.renderer.setSize(w, h, false); studio.cam.aspect = w / h; studio.cam.updateProjectionMatrix(); }
function startPreviewLoop() {
  if (!studio || studio.raf) return;
  studio.lt = performance.now();
  const loop = t => {
    studio.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - studio.lt) / 1000 || 0); studio.lt = t; studio.el += dt;
    const sp = Math.sin(studio.phi), cp = Math.cos(studio.phi);
    studio.cam.position.set(Math.sin(studio.theta) * studio.radius * sp, studio.radius * cp, Math.cos(studio.theta) * studio.radius * sp);
    studio.cam.lookAt(0, 1, 0);
    if (studio.layer) try { studio.layer.update(studio.el, dt); } catch (e) {}
    studio.renderer.render(studio.scene, studio.cam);
  };
  studio.raf = requestAnimationFrame(loop);
}
function stopPreviewLoop() { if (studio && studio.raf) { cancelAnimationFrame(studio.raf); studio.raf = null; } }
function showFallback() {
  const cv = document.getElementById('st-canvas'); const fb = document.getElementById('st-fallback');
  if (cv) cv.style.display = 'none';
  if (fb) { fb.style.display = 'flex'; const sky = (BIOMES.find(b => b.id === CFG.equipped.biome) || {}).sky || ['#1a2030', '#3a4a6a']; fb.style.background = 'linear-gradient(180deg,' + sky[0] + ',' + sky[1] + ')'; fb.innerHTML = '<div class="st-fb-emoji">' + ((BY_ID[eq('scatter')] || {}).emoji || '🌿') + ((BY_ID[eq('particles')] || {}).emoji || '') + ((BY_ID[eq('structure')] || {}).emoji || '') + '</div><div class="st-fb-txt">3D preview unavailable here — your loadout still applies to the island.</div>'; }
}

/* ───────────────────────── toast ───────────────────────── */
let _tt = null;
function toast(m) {
  let d = document.getElementById('fr-toast');
  if (!d) { d = document.createElement('div'); d.id = 'fr-toast'; Object.assign(d.style, { position: 'fixed', left: '50%', bottom: '20px', transform: 'translateX(-50%)', zIndex: '100020', padding: '10px 18px', borderRadius: '12px', background: 'rgba(20,16,8,.94)', border: '1px solid rgba(255,178,36,.4)', color: '#ffd9a0', font: '12px/1.4 monospace', boxShadow: '0 8px 24px rgba(0,0,0,.6)', pointerEvents: 'none', transition: 'opacity .4s' }); document.body.appendChild(d); }
  d.textContent = m; d.style.opacity = '1'; if (_tt) clearTimeout(_tt); _tt = setTimeout(() => d.style.opacity = '0', 2600);
}

/* ───────────────────────── CSS ───────────────────────── */
function injectCSS() {
  if (document.getElementById('fr-css')) return;
  const s = document.createElement('style'); s.id = 'fr-css';
  s.textContent = `
#fr-hud{position:absolute;left:10px;bottom:10px;z-index:6;display:flex;gap:8px;}
.fr-hud-btn{position:relative;width:38px;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(8,9,13,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#e8eefc;font-size:17px;cursor:pointer;display:grid;place-items:center;box-shadow:0 6px 18px -8px rgba(0,0,0,.75);transition:transform .15s,border-color .15s,box-shadow .15s,opacity .15s;}
.fr-hud-btn:hover{transform:translateY(-2px);border-color:rgba(61,220,255,.6);box-shadow:0 0 16px rgba(61,220,255,.4);}
.fr-hud-btn.fr-empty{opacity:.45;}
.fr-hud-btn.fr-empty:hover{transform:none;box-shadow:0 6px 18px -8px rgba(0,0,0,.75);border-color:rgba(255,255,255,.18);}
.fr-badge{position:absolute;top:-6px;right:-6px;min-width:17px;height:17px;padding:0 4px;border-radius:99px;background:linear-gradient(135deg,#ffb224,#ff7a1a);color:#1a1206;font:800 10px/17px 'Space Grotesk',monospace;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.5);}
.fr-empty .fr-badge{background:#3a3f4b;color:#9aa3b5;}
.fr-overlay{position:fixed;inset:0;z-index:100010;display:none;align-items:center;justify-content:center;background:rgba(5,6,10,.86);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);opacity:0;transition:opacity .3s;}
.fr-overlay.open{display:flex;opacity:1;}
.fr-stage{position:relative;display:flex;flex-direction:column;align-items:center;gap:18px;padding:24px;}
.fr-close{position:absolute;top:18px;right:18px;width:38px;height:38px;border-radius:11px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,16,.7);color:#cbd5e1;font-size:17px;cursor:pointer;display:grid;place-items:center;transition:all .15s;}
.fr-close:hover{color:#fca5a5;border-color:rgba(248,113,113,.5);}
.fr-tiers{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;}
.fr-tier{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:99px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#cbd5e1;font:700 12px 'Chakra Petch',sans-serif;cursor:pointer;transition:all .15s;}
.fr-tier b{font-family:'Space Grotesk',monospace;color:#fff;}
.fr-tier .fr-tdot{width:9px;height:9px;border-radius:50%;background:var(--tc);box-shadow:0 0 8px var(--tc);}
.fr-tier.on{border-color:var(--tc);color:#fff;box-shadow:0 0 18px -4px var(--tc);background:rgba(255,255,255,.08);}
.fr-no-rolls{color:#cbd5e1;text-align:center;font:600 14px 'Chakra Petch',sans-serif;line-height:1.6;}
.fr-no-rolls span{color:#9aa3b5;font-size:12px;}
.fr-cardwrap{perspective:1100px;width:240px;height:330px;}
.fr-card{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .72s cubic-bezier(.2,.8,.2,1);}
.fr-card.flipped{transform:rotateY(180deg);}
.fr-card.shake{animation:frShake .5s ease-in-out infinite;}
@keyframes frShake{0%,100%{transform:rotateZ(0) rotateY(0);}25%{transform:rotateZ(-1.5deg) rotateY(4deg);}75%{transform:rotateZ(1.5deg) rotateY(-4deg);}}
.fr-face{position:absolute;inset:0;border-radius:22px;backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px;text-align:center;border:1px solid rgba(255,255,255,.12);}
.fr-back{background:radial-gradient(circle at 50% 35%,rgba(255,210,74,.4),rgba(8,9,13,.95) 70%);}
.fr-sigil{font-size:64px;filter:drop-shadow(0 0 18px rgba(255,255,255,.5));animation:frSpin 6s linear infinite;}
@keyframes frSpin{to{transform:rotate(360deg);}}
.fr-tiername{font:800 15px 'Chakra Petch',sans-serif;letter-spacing:1px;color:#fff;text-transform:uppercase;}
.fr-front{transform:rotateY(180deg);background:radial-gradient(circle at 50% 30%,rgba(255,255,255,.18),rgba(8,9,13,.97) 72%);}
.fr-rarity{font:800 11px 'Chakra Petch',sans-serif;letter-spacing:3px;}
.fr-emoji{font-size:72px;filter:drop-shadow(0 6px 16px rgba(0,0,0,.5));animation:frPop .5s cubic-bezier(.2,1.4,.4,1);}
@keyframes frPop{0%{transform:scale(.3);opacity:0;}100%{transform:scale(1);opacity:1;}}
.fr-name{font:800 20px 'Chakra Petch',sans-serif;color:#fff;}
.fr-type{font-size:11px;letter-spacing:1px;color:#9aa3b5;text-transform:uppercase;}
.fr-shards{margin-top:4px;font:700 13px 'Space Grotesk',monospace;color:#ffd9a0;}
.fr-prompt{min-height:18px;font:600 13px 'Chakra Petch',sans-serif;color:#cbd5e1;text-align:center;}
.fr-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}
.fr-btn{padding:11px 20px;border-radius:12px;border:none;cursor:pointer;font:800 13px 'Chakra Petch',sans-serif;letter-spacing:.4px;color:#1a1206;background:linear-gradient(100deg,var(--tc,#ffb224),#ff7a1a);box-shadow:0 6px 18px -8px rgba(255,122,26,.6);transition:filter .15s,transform .15s;}
.fr-btn:hover{filter:brightness(1.08);transform:translateY(-1px);}
.fr-btn.fr-ghost{background:rgba(255,255,255,.06);color:#e2e8f0;border:1px solid rgba(255,255,255,.14);box-shadow:none;}
.fr-btn.fr-ghost:hover{border-color:rgba(61,220,255,.5);}
/* studio */
#fr-studio{z-index:100011;}
.st-shell{display:flex;width:min(1080px,96vw);height:min(680px,92vh);border-radius:22px;overflow:hidden;border:1px solid rgba(255,255,255,.12);box-shadow:0 40px 90px -30px rgba(0,0,0,.9);background:rgba(10,12,18,.96);}
.st-preview{position:relative;flex:1 1 55%;min-width:0;background:linear-gradient(180deg,#1a2030,#3a4a6a);}
.st-preview canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}
.st-fallback{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:20px;}
.st-fb-emoji{font-size:54px;}
.st-fb-txt{color:#cbd5e1;font:600 13px 'Chakra Petch',sans-serif;max-width:240px;}
.st-preview-tag{position:absolute;left:12px;bottom:12px;font:700 10px 'Chakra Petch',sans-serif;letter-spacing:1px;color:rgba(255,255,255,.7);background:rgba(0,0,0,.35);padding:5px 10px;border-radius:8px;}
.st-panel{flex:1 1 45%;min-width:280px;display:flex;flex-direction:column;padding:18px;gap:12px;background:linear-gradient(180deg,rgba(18,20,30,.98),rgba(10,12,18,.98));}
.st-head{display:flex;justify-content:space-between;align-items:flex-start;position:relative;}
.st-head .fr-close{position:static;}
.st-kicker{font:700 9.5px 'Chakra Petch',sans-serif;letter-spacing:2.4px;color:#3ddcff;}
.st-title{font:800 18px 'Chakra Petch',sans-serif;color:#fff;}
.st-wallet{display:flex;gap:8px;flex-wrap:wrap;}
.st-pill{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:99px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font:700 12px 'Chakra Petch',sans-serif;color:#cbd5e1;}
.st-pill b{font-family:'Space Grotesk',monospace;color:#fff;}
.st-mini{margin-left:4px;padding:3px 9px;border-radius:8px;border:1px solid rgba(255,178,36,.4);background:rgba(255,178,36,.12);color:#ffd9a0;font:700 10px 'Chakra Petch',sans-serif;cursor:pointer;}
.st-tabs{display:flex;gap:6px;flex-wrap:wrap;}
.st-tab{padding:7px 11px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#9aa3b5;font:700 11px 'Chakra Petch',sans-serif;cursor:pointer;transition:all .15s;}
.st-tab.on{color:#fff;border-color:rgba(61,220,255,.5);background:rgba(61,220,255,.12);}
.st-grid{flex:1 1 auto;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:9px;align-content:start;padding-right:4px;}
.st-item{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:11px 6px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);cursor:pointer;transition:all .15s;text-align:center;}
.st-item:hover{transform:translateY(-2px);border-color:var(--rc);}
.st-item.eq{border-color:var(--rc);box-shadow:0 0 16px -4px var(--rc);background:rgba(255,255,255,.07);}
.st-item.locked{opacity:.62;}
.st-i-emoji{font-size:26px;}
.st-i-name{font:700 11px 'Chakra Petch',sans-serif;color:#fff;line-height:1.2;}
.st-i-rar{font:800 8.5px 'Chakra Petch',sans-serif;letter-spacing:1px;text-transform:uppercase;}
.st-i-state{font:700 9px 'Space Grotesk',monospace;color:#9aa3b5;}
.st-item.eq .st-i-state{color:var(--rc);}
.st-i-buy{font:800 10px 'Space Grotesk',monospace;color:#ffd9a0;}
.st-foot{display:flex;gap:10px;}
.st-foot .fr-btn{flex:1;}
@media(max-width:760px){.st-shell{flex-direction:column;height:94vh;}.st-preview{flex:0 0 38%;}.st-panel{flex:1 1 auto;}}
`;
  document.head.appendChild(s);
}

/* ───────────────────────── boot ───────────────────────── */
function boot() {
  if (!document.body) { requestAnimationFrame(boot); return; }
  injectCSS();
  let tries = 0;
  (function wait() {
    if (injectHUD()) {
      // apply saved loadout once the island API is ready
      (function applyWait() { if (window.__forestIslandAPI && window.__forestIslandAPI.THREE) applyToIsland(); else if (tries++ < 80) setTimeout(applyWait, 250); })();
    } else if (tries++ < 80) setTimeout(wait, 250);
  })();
  // keep HUD count fresh
  setInterval(refreshHUD, 1500);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeRitual(); closeStudio(); } });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

window.__fateRoll = { openRitual, openStudio, applyToIsland, refreshHUD, cfg: () => CFG };
})();