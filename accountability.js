/* ============================================================================
accountability.js · THE SPINE  (debt ledger + ELO collateral + proof-of-work
stamps + fate-roll ritual + shard shop + island studio + Elo-growth brain)
Isolated. Reads window.AppState / solved / studySecs / calculateEloMigration /
renderEloMatrix / saveAll. Injects its own CSS + DOM. Writes its own stores.
The growth brain exposes window.__forestGrowth (consumed by forest-island-juice
and forest-island-full for tree size + study-growth). app.js stamps each solve
via window.__forestGrowth.stamp(q, subj, eloResult) (4 tiny edits).
============================================================================ */
(function () {
'use strict';
if (window.__acctInit) return; window.__acctInit = true;

/* ── keys ── */
var K_DAYS='jeemax_acct_days_v1', K_DEBT='jeemax_acct_debt_v1', K_COLL='jeemax_acct_coll_v1',
    K_ROLLS='jeemax_acct_rolls_v1', K_SHARDS='jeemax_acct_shards_v1', K_UNL='jeemax_acct_unlocks_v1',
    K_EQ='jeemax_island_cosmetics_v1', K_CUM='jeemax_growth_cum_v1', K_BUFF='jeemax_buff_elosurge_v1';

/* ── utils ── */
function norm(s){ s=(s||'').toString().toLowerCase().trim(); return (s==='math'||s==='mathematics')?'maths':s; }
function clamp01(v){ return v<0?0:v>1?1:v; }
function dkey(d){ d=d||new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
function get(k,fb){ try{ var o=JSON.parse(localStorage.getItem(k)||'null'); return (o&&typeof o==='object')?o:fb; }catch(e){ return fb; } }
function getN(k,fb){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return (typeof v==='number')?v:fb; }catch(e){ return fb; } }
function set(k,o){ try{ localStorage.setItem(k, JSON.stringify(o)); }catch(e){} }
function setN(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function tot(o){ return (o.physics||0)+(o.chemistry||0)+(o.maths||0); }
function globalMMR(p,c,m){ function cp(v){ return Math.max(1,Number(v)||1); } var P=cp(p),C=cp(c),M=cp(m); var harm=Math.pow((Math.pow(P,-2)+Math.pow(C,-2)+Math.pow(M,-2))/3,-0.5); var mean=(P+C+M)/3; var pen=0.15*(Math.max(0,mean-P)+Math.max(0,mean-C)+Math.max(0,mean-M)); return Math.max(0,Math.round(harm-pen)); }

/* ── stores ── */
var debt = Math.max(0, getN(K_DEBT,0));
var coll = get(K_COLL, null); if (coll && typeof coll.stake !== 'number') coll = null;
var rolls = get(K_ROLLS, {bronze:0,silver:0,gold:0,obsidian:0});
var shards = Math.max(0, getN(K_SHARDS, 5));
var unl = get(K_UNL, null);
if (!unl) unl = ['none','verdant','meadow','leaves','pollen','campfire','cnone','natural','golden'];

/* ── compatibility / merge layer for old fate-roll cosmetics ── */
var ID_MAP = {
  scatter: {
    emberG: 'cinder'
  },
  particles: {
    snow: 'snowp',
    leaves: 'petals'
  },
  creature: {
    none: 'cnone'
  },
  tint: {
    ember: 'ember2',
    frost: 'frost2'
  }
};

function mapCosmeticId(slot, id) {
  if (!id) return id;
  return (ID_MAP[slot] && ID_MAP[slot][id]) ? ID_MAP[slot][id] : id;
}

var rawCos = get(K_EQ, null);
var eq = (rawCos && rawCos.equipped) ? rawCos.equipped : rawCos;

/* import old fate-roll owned items */
if (rawCos && Array.isArray(rawCos.owned)) {
  rawCos.owned.forEach(function (id) {
    if (unl.indexOf(id) < 0) unl.push(id);

    /* also import mapped aliases */
    for (var slot in ID_MAP) {
      var mapped = ID_MAP[slot][id];
      if (mapped && unl.indexOf(mapped) < 0) unl.push(mapped);
    }
  });
}

/* import old fate-roll shards */
if (rawCos && typeof rawCos.shards === 'number') {
  shards = Math.max(shards, rawCos.shards);
}

/* if old fate-roll used per-subject tree auras, collapse into one aura */
if (eq && eq.trees && !eq.aura) {
  eq.aura = mapCosmeticId(
    'aura',
    eq.trees.physics || eq.trees.chemistry || eq.trees.maths || 'none'
  );
}

/* normalize slot IDs */
if (eq) {
  ['aura', 'scatter', 'particles', 'structure', 'creature', 'tint'].forEach(function (k) {
    if (eq[k]) eq[k] = mapCosmeticId(k, eq[k]);
  });
}

/* migrate old fate-roll rolls into accountability rolls */
try {
  var fateRolls = get('jeemax_faterolls_v1', null);
  if (fateRolls && typeof fateRolls === 'object') {
    ['bronze', 'silver', 'gold', 'obsidian'].forEach(function (t) {
      rolls[t] = (rolls[t] || 0) + (+fateRolls[t] || 0);
    });
    set(K_ROLLS, rolls);
    localStorage.removeItem('jeemax_faterolls_v1');
  }
} catch (e) {}

// normalized eq is already handled above; do not overwrite merged ownership/shards
// --------------------------------------------
var cum = get(K_CUM, {physics:0,chemistry:0,maths:0});
var buff = Math.max(0, getN(K_BUFF, 0));

/* ── cosmetics catalog ── */
var RAR=['common','uncommon','rare','epic','legendary'];
var PRICE={common:3,uncommon:6,rare:12,epic:25,legendary:50};
var TIER_W={ bronze:[60,30,10,0,0], silver:[30,40,25,5,0], gold:[10,30,40,18,2], obsidian:[5,15,35,30,15] };
var TIER_SHARD={bronze:1,silver:2,gold:3,obsidian:5};
var CAT=[
 {id:'none',slot:'aura',rar:'common',name:'No Aura',color:null,emoji:'·'},
 {id:'verdant',slot:'aura',rar:'common',name:'Verdant',color:'#39d98a',emoji:'🍃'},
 {id:'cyan',slot:'aura',rar:'uncommon',name:'Aether',color:'#4cc9ff',emoji:'💠'},
 {id:'gold',slot:'aura',rar:'uncommon',name:'Goldcrown',color:'#ffd24a',emoji:'👑'},
 {id:'blossom',slot:'aura',rar:'rare',name:'Blossom',color:'#ff7ab8',emoji:'🌸'},
 {id:'violet',slot:'aura',rar:'rare',name:'Mystic',color:'#a78bfa',emoji:'🔮'},
 {id:'ember',slot:'aura',rar:'epic',name:'Ember',color:'#ff7a1a',emoji:'🔥'},
 {id:'frost',slot:'aura',rar:'epic',name:'Frost',color:'#9fe8ff',emoji:'❄️'},
 {id:'meadow',slot:'scatter',rar:'common',name:'Wildflowers',emoji:'🌼'},
 {id:'leaves',slot:'scatter',rar:'common',name:'Fallen Leaves',emoji:'🍂'},
 {id:'mushroom',slot:'scatter',rar:'uncommon',name:'Glowcaps',emoji:'🍄'},
 {id:'snow',slot:'scatter',rar:'uncommon',name:'Snowdrift',emoji:'🌨️'},
 {id:'crystal',slot:'scatter',rar:'rare',name:'Crystals',emoji:'💎'},
 {id:'cinder',slot:'scatter',rar:'rare',name:'Cinderbed',emoji:'🔥'},
 {id:'pollen',slot:'particles',rar:'common',name:'Pollen',emoji:'✨'},
 {id:'petals',slot:'particles',rar:'uncommon',name:'Petals',emoji:'🌸'},
 {id:'snowp',slot:'particles',rar:'uncommon',name:'Snowfall',emoji:'❄️'},
 {id:'embers',slot:'particles',rar:'rare',name:'Embers',emoji:'🔥'},
 {id:'flies',slot:'particles',rar:'epic',name:'Fireflies',emoji:'🪲'},
 {id:'campfire',slot:'structure',rar:'common',name:'Campfire',emoji:'🔥'},
 {id:'lanterns',slot:'structure',rar:'uncommon',name:'Lanterns',emoji:'🏮'},
 {id:'well',slot:'structure',rar:'rare',name:'Wishing Well',emoji:'⛲'},
 {id:'shrine',slot:'structure',rar:'epic',name:'Shrine',emoji:'⛩️'},
{id:'torii',slot:'structure',rar:'epic',name:'Torii Gate',emoji:'⛩️'},
{id:'koistones',slot:'structure',rar:'uncommon',name:'Koi Stones',emoji:'🪨'},
{id:'arch',slot:'structure',rar:'rare',name:'Moon Arch',emoji:'🌙'},
{id:'fountain',slot:'structure',rar:'rare',name:'Star Fountain',emoji:'⛲'},
{id:'observatory',slot:'structure',rar:'legendary',name:'Observatory',emoji:'🔭'},
{id:'spiritlamps',slot:'structure',rar:'rare',name:'Spirit Lamps',emoji:'🏮'},
 {id:'cnone',slot:'creature',rar:'common',name:'None',emoji:'·'},
 {id:'koi',slot:'creature',rar:'uncommon',name:'Koi',emoji:'🐟'},
 {id:'birds',slot:'creature',rar:'uncommon',name:'Birds',emoji:'🐦'},
 {id:'butterfly',slot:'creature',rar:'rare',name:'Butterflies',emoji:'🦋'},
 {id:'fox',slot:'creature',rar:'epic',name:'Spirit Fox',emoji:'🦊'},
 {id:'natural',slot:'tint',rar:'common',name:'Natural',emoji:'☀️'},
 {id:'golden',slot:'tint',rar:'uncommon',name:'Golden Hour',emoji:'🌅'},
 {id:'moon',slot:'tint',rar:'uncommon',name:'Moonlit',emoji:'🌙'},
 {id:'ember2',slot:'tint',rar:'rare',name:'Emberglow',emoji:'🔥'},
 {id:'frost2',slot:'tint',rar:'rare',name:'Frostlight',emoji:'❄️'}
];
var BIOMES=[
 {id:'meadow',rar:'common',name:'Meadow',emoji:'🌿',set:{aura:'none',scatter:'meadow',particles:'pollen',structure:'campfire',creature:'cnone',tint:'natural'}},
 {id:'dusk',rar:'uncommon',name:'Dusk Hollow',emoji:'🌆',set:{aura:'violet',scatter:'leaves',particles:'flies',structure:'spiritlamps',creature:'fox',tint:'golden'}},
 {id:'frostpeak',rar:'epic',name:'Frostpeak',emoji:'🏔️',set:{aura:'frost',scatter:'snow',particles:'snowp',structure:'fountain',creature:'birds',tint:'frost2'}},
 {id:'emberfall',rar:'epic',name:'Emberfall',emoji:'🌋',set:{aura:'ember',scatter:'cinder',particles:'embers',structure:'campfire',creature:'cnone',tint:'ember2'}},
 {id:'sakura',rar:'legendary',name:'Sakura Dream',emoji:'🌸',set:{aura:'blossom',scatter:'meadow',particles:'petals',structure:'torii',creature:'butterfly',tint:'golden'}},
 {id:'aurora',rar:'legendary',name:'Aurora Reach',emoji:'🌠',set:{aura:'cyan',scatter:'crystal',particles:'flies',structure:'observatory',creature:'fox',tint:'moon'}}
];
var BYID={}; CAT.forEach(function(c){ BYID[c.id]=c; }); BIOMES.forEach(function(b){ BYID[b.id]=b; });
var SLOTS=[['aura','Tree Aura'],['scatter','Ground'],['particles','Sky & FX'],['structure','Structure'],['creature','Life'],['tint','Light']];

var STUDIO_TABS=[
  ['biomes','🌍 Biomes'],
  ['aura','🌳 Aura'],
  ['scatter','🌼 Ground'],
  ['particles','✨ Sky & FX'],
  ['structure','🏕️ Structures'],
  ['creature','🦊 Life'],
  ['tint','☀️ Light']
];

var studioTab='biomes';
var previewRaf = null, previewParts = [], previewPartType = null;
/* ── biome / tint mood system ── */
var TINT_MOODS = {
  natural: {skyTop:'#4a7ec0', skyBot:'#c4dcec', fog:'#0b1020', water:'#23a7d6', sun:'#fff2e0', hemi:'#8aa0b8', exposure:1.10},
  golden:  {skyTop:'#3a2a52', skyBot:'#e8956a', fog:'#20180e', water:'#3a6a7a', sun:'#ffb27a', hemi:'#a58a6a', exposure:1.08},
  moon:    {skyTop:'#0a1024', skyBot:'#2a3a5e', fog:'#0a1024', water:'#1a3a5a', sun:'#9fb4ff', hemi:'#5a6a8a', exposure:1.05},
  ember2:  {skyTop:'#2a0e0e', skyBot:'#ff7a1a', fog:'#1a0e08', water:'#5a2a1a', sun:'#ff8a4a', hemi:'#8a5a3a', exposure:1.06},
  frost2:  {skyTop:'#1a2a44', skyBot:'#9fe8ff', fog:'#101824', water:'#4a7a9a', sun:'#cfe8ff', hemi:'#7a9ab0', exposure:1.08}
};

var BIOME_MOODS = {
  meadow:    TINT_MOODS.natural,
  dusk:      {skyTop:'#3a2a52', skyBot:'#e07a44', fog:'#241826', water:'#3a4a6a', sun:'#ffb27a', hemi:'#8a6a8a', exposure:1.05},
  frostpeak: {skyTop:'#1a2a44', skyBot:'#9fe8ff', fog:'#182430', water:'#5a86a8', sun:'#dff2ff', hemi:'#7aa0c0', exposure:1.08},
  emberfall: {skyTop:'#2a0e0e', skyBot:'#ff7a1a', fog:'#241008', water:'#6a2a1a', sun:'#ff7a3a', hemi:'#8a4a2a', exposure:1.04},
  sakura:    {skyTop:'#3a2030', skyBot:'#ffb0d0', fog:'#2a1820', water:'#7a5a7a', sun:'#ffd0e6', hemi:'#b08aa0', exposure:1.08},
  aurora:    {skyTop:'#06121a', skyBot:'#39d98a', fog:'#081818', water:'#1a5a5a', sun:'#9fffcf', hemi:'#4a8a7a', exposure:1.06}
};

function computeMood(e){
  e = e || eq;
  if (e.biome && BIOME_MOODS[e.biome]) return BIOME_MOODS[e.biome];
  return TINT_MOODS[e.tint] || TINT_MOODS.natural;
}

/* ── studio preview maps ── */
var PREVIEW_SCATTER = {
  meadow:   ['#4cc9ff','#39d98a','#ffb224','#ff7ab8','#fff3b0'],
  leaves:   ['#ff9a3c','#e0532a','#ffd24a'],
  mushroom: ['#ff5e7e','#7af0c0','#ffd24a'],
  snow:     ['#ffffff','#cfe8ff'],
  crystal:  ['#7af0ff','#b388ff','#9fffcf'],
  cinder:   ['#ff7a1a','#ffd24a']
};

var PARTICLE_PREVIEW = {
  pollen:  {beh:'drift', colors:['#ffe9a3','#d9ffd0','#bff7ff']},
  petals:  {beh:'fall',  colors:['#ff7ab8','#ffd0e6','#fff0f8']},
  snowp:   {beh:'fall',  colors:['#ffffff','#cfe8ff','#eaffff']},
  embers:  {beh:'rise',  colors:['#ff7a1a','#ffd24a','#fff3b0']},
  flies:   {beh:'blink', colors:['#fff3b0','#9fffcf','#d9fff0']}
};
if (!unl) { unl=['none','verdant','meadow','leaves','pollen','campfire','cnone','natural','golden']; }
if (!eq) { eq={biome:'meadow',aura:'none',scatter:'meadow',particles:'pollen',structure:'campfire',creature:'cnone',tint:'natural'}; }
function saveUnl(){ set(K_UNL, unl); }

function saveEq(){
  var equipped = Object.assign({}, eq);

  var payload = Object.assign({}, equipped, {
    version: 4,
    owned: unl,
    equipped: equipped,
    mood: computeMood(eq),
    shards: shards,
    pity: 0
  });

  set(K_EQ, payload);

  try{
    window.dispatchEvent(new Event('storage'));
  }catch(e){}
}
// -----------------------------
function owns(id){ return unl.indexOf(id)>=0; }
function catOf(slot){ return CAT.filter(function(c){ return c.slot===slot; }); }

/* ── growth brain ── */
var pendingDiff = [];           // {qElo, difficulty, growSeconds, plantCum, t}
var lastStudy = {physics:0,chemistry:0,maths:0};
var studyArmed = false;
function readStudy(){ var s=window.studySecs; if(!s) return null; return {physics:Math.max(0,Math.floor(+s.physics||0)),chemistry:Math.max(0,Math.floor(+s.chemistry||0)),maths:Math.max(0,Math.floor(+s.maths||0))}; }
function pollStudy(){ var s=readStudy(); if(!s) return; if(!studyArmed){ studyArmed=true; lastStudy=s; return; } var ch=false; ['physics','chemistry','maths'].forEach(function(k){ var d=s[k]-lastStudy[k]; if(d>0){ cum[k]+=d; ch=true; } lastStudy[k]=s[k]; }); if(ch){ set(K_CUM, cum); } }
function sizeFactor(d){ return 0.9 + 0.3*clamp01(d); }            // tough → bigger
function heightFactor(m){ return 0.30 + 0.70*clamp01(m); }          // studied → taller
function maturity(plantCum, growSec, subj){ growSec=growSec>0?growSec:10800; var base=(plantCum!=null)?plantCum:(cum[subj]||0); return clamp01(((cum[subj]||0)-base)/growSec); }
function stamp(q, subj, res){
  if(!res) return;
  var ns=norm(subj); var oldQ=res.oldQElo||1200, oldU=res.oldSubjectElo||1200;
  var d=clamp01((oldQ-oldU+400)/800);
  if(q){ q.difficulty=d; q.difficultyLabel = d<0.34?'easy':d<0.67?'mid':'tough'; q.growSeconds=Math.round((5-4*d)*3600); if(q.plantCumStudy==null) q.plantCumStudy=Math.floor(cum[ns]||0); }
  pendingDiff.push({qElo:oldQ, difficulty:d, growSeconds:q?q.growSeconds:10800, plantCum:q?q.plantCumStudy:0, t:Date.now()});
  if(pendingDiff.length>300) pendingDiff.shift();
  // Elo-surge buff: if active and this was a gain, add +50% on top
  if(buff>0 && (res.deltaSubject||0)>0 && ns){
    var extra=Math.round((res.deltaSubject||0)*0.5);
    try{ var A=window.AppState; if(A&&A.elo){ A.elo[ns]=Math.max(0,(A.elo[ns]||1200)+extra); A.elo.global=globalMMR(A.elo.physics||1200,A.elo.chemistry||1200,A.elo.maths||1200); } }catch(e){}
    buff-=1; setN(K_BUFF, buff);
  }
}
window.__forestGrowth = {
  pendingDiff: pendingDiff, stamp: stamp,
  maturity: maturity, sizeFactor: sizeFactor, heightFactor: heightFactor,
  cum: function(s){ return Math.floor(cum[norm(s)]||0); },
  difficultyOf: function(qElo, subj){ var u=(window.AppState&&window.AppState.elo)?(window.AppState.elo[norm(subj)]||1200):1200; return clamp01(((qElo||1200)-u+400)/800); },
  cosmetics: function(){ return eq; }
};

/* ── debt / collateral / stamps engine ── */
function snapshotToday(){
  var days=get(K_DAYS,{}); var tk=dkey();
  var sv={physics:+(window.solved&&window.solved.physics||0),chemistry:+(window.solved&&window.solved.chemistry||0),maths:+(window.solved&&window.solved.maths||0)};
  var A=window.AppState; var tg=(A&&A.activeTargets)?{physics:+A.activeTargets.physics||0,chemistry:+A.activeTargets.chemistry||0,maths:+A.activeTargets.maths||0}:{physics:0,chemistry:0,maths:0};
  days[tk]={solved:sv,targets:tg,seen:true}; set(K_DAYS, days);
}
var lastSeen = dkey();
function processBoundary(day){
  var days=get(K_DAYS,{}); var rec=days[day]; if(!rec||!rec.seen) return; // app wasn't opened → no judgement (fair)
  var sh=0, su=0; ['physics','chemistry','maths'].forEach(function(k){ sh+=Math.max(0,(rec.targets[k]||0)-(rec.solved[k]||0)); su+=Math.max(0,(rec.solved[k]||0)-(rec.targets[k]||0)); });
  debt=Math.max(0, debt+sh-su); setN(K_DEBT, debt);
  // loop closed? reward a bronze roll even without collateral
  var closed = ['physics','chemistry','maths'].every(function(k){ return (rec.solved[k]||0)>=(rec.targets[k]||0) && (rec.targets[k]||0)>0; });
  if(closed){ rolls.bronze=(rolls.bronze||0)+1; set(K_ROLLS, rolls); }
  // collateral resolution
  if(coll && coll.date===day){
    if(closed){
      var tier=coll.rollTier||'silver'; rolls[tier]=(rolls[tier]||0)+1; set(K_ROLLS, rolls);
      var bonus=Math.round(coll.stake*(coll.mult||1)); var A=window.AppState;
      if(A&&A.elo){ var share={physics:(rec.solved.physics||1),chemistry:(rec.solved.chemistry||1),maths:(rec.solved.maths||1)}; var ts=tot(share)||1; ['physics','chemistry','maths'].forEach(function(k){ A.elo[k]=Math.max(0,(A.elo[k]||1200)+Math.round(bonus*share[k]/ts)); }); A.elo.global=globalMMR(A.elo.physics,A.elo.chemistry,A.elo.maths); }
      try{ if(window.saveAll) window.saveAll(); }catch(e){} try{ if(window.renderEloMatrix) window.renderEloMatrix(); }catch(e){}
      toast('⚖ PLEDGE WON · +'+bonus+' ELO · '+tier.toUpperCase()+' roll banked');
    } else {
      var A2=window.AppState;
      if(A2&&A2.elo){ var e2=window.AppState.elo; var g2=e2.global||1200; var tot2=(e2.physics||1)+(e2.chemistry||1)+(e2.maths||1); ['physics','chemistry','maths'].forEach(function(k){ e2[k]=Math.max(0,(e2[k]||1200)-Math.round(coll.stake*(e2[k]||1)/tot2)); }); e2.global=globalMMR(e2.physics,e2.chemistry,e2.maths); }
      try{ if(window.saveAll) window.saveAll(); }catch(e){} try{ if(window.renderEloMatrix) window.renderEloMatrix(); }catch(e){}
      toast('⚖ PLEDGE LOST · −'+coll.stake+' ELO seized');
    }
    coll=null; set(K_COLL, null);
  }
}
function tickBoundary(){ var tk=dkey(); if(tk===lastSeen) return; var cur=new Date(lastSeen+'T00:00:00'); var end=new Date(tk+'T00:00:00'); var guard=0; while(cur<end && guard++<40){ processBoundary(dkey(cur)); cur.setDate(cur.getDate()+1); } lastSeen=tk; }

function stampState(day){
  var days=get(K_DAYS,{}); var rec=days[day]; var tk=dkey();
  if(day===tk){ var sv={physics:+(window.solved&&window.solved.physics||0),chemistry:+(window.solved&&window.solved.chemistry||0),maths:+(window.solved&&window.solved.maths||0)}; var A=window.AppState; var tg=(A&&A.activeTargets)?A.activeTargets:{}; if(tot(sv)<=0) return 'empty'; return (['physics','chemistry','maths'].every(function(k){ return (sv[k]||0)>=(+tg[k]||0) && (+tg[k]||0)>0; }))?'full':'partial'; }
  if(rec&&rec.seen){ if(tot(rec.solved)<=0) return 'scar'; return (['physics','chemistry','maths'].every(function(k){ return (rec.solved[k]||0)>=(rec.targets[k]||0) && (rec.targets[k]||0)>0; }))?'full':'scar'; }
  return 'void';
}
function firstSeenDate(){ var days=get(K_DAYS,{}); var ks=Object.keys(days).filter(function(k){ return days[k]&&days[k].seen; }); ks.sort(); return ks[0]||null; }

/* ── fate roll draw ── */
function highestRoll(){ var order=['obsidian','gold','silver','bronze']; for(var i=0;i<order.length;i++){ if((rolls[order[i]]||0)>0) return order[i]; } return null; }
function totalRolls(){ return (rolls.bronze||0)+(rolls.silver||0)+(rolls.gold||0)+(rolls.obsidian||0); }
function drawLoot(tier){
  var w=TIER_W[tier]||TIER_W.bronze; var pool=[]; CAT.concat(BIOMES).forEach(function(it){ if(it.id==='none'||it.id==='cnone'||it.id==='meadow'||it.id==='natural') return; var ri=RAR.indexOf(it.rar); if(w[ri]>0 && !owns(it.id)) pool.push({it:it,ww:w[ri]}); });
  var item=null;
  if(pool.length){ var tw=pool.reduce(function(a,p){ return a+p.ww; },0); var r=Math.random()*tw; for(var i=0;i<pool.length;i++){ if((r-=pool[i].ww)<=0){ item=pool[i].it; break; } } if(!item) item=pool[pool.length-1].it; unl.push(item.id); saveUnl(); }
  var got={tier:tier, item:item, shards:TIER_SHARD[tier]||1, bonus:[]};
  shards+=got.shards; setN(K_SHARDS, shards);
  if(debt>0 && Math.random()<0.3){ var am=Math.min(debt, tier==='obsidian'?5:tier==='gold'?3:1); debt=Math.max(0,debt-am); setN(K_DEBT,debt); got.bonus.push('Debt −'+am); }
  if(Math.random()<0.2){ buff+=3; setN(K_BUFF,buff); got.bonus.push('ELO Surge ×3'); }
  return got;
}
function spendHighest(){ var t=highestRoll(); if(!t) return null; rolls[t]-=1; set(K_ROLLS,rolls); return drawLoot(t); }

/* ── DOM: rail ── */
// ---- PATCH: replace injectCSS with premium version ----
function injectCSS(){
  if(document.getElementById('acct-css')) return;

  var s=document.createElement('style');
  s.id='acct-css';
  s.textContent = `
    #acct-rail{
      position:relative;
      display:flex;
      align-items:center;
      gap:10px;
      flex-wrap:wrap;
      margin:0 0 16px;
      padding:12px 14px;
      border-radius:18px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.028)),
        radial-gradient(120% 160% at 0% 0%, rgba(61,220,255,.10), transparent 42%),
        radial-gradient(120% 160% at 100% 0%, rgba(255,178,36,.10), transparent 40%),
        rgba(8,10,16,.42);
      border:1px solid rgba(255,255,255,.12);
      -webkit-backdrop-filter:blur(18px) saturate(1.35);
      backdrop-filter:blur(18px) saturate(1.35);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.09),
        0 18px 44px -22px rgba(0,0,0,.82);
      overflow:hidden;
      z-index:5;
    }

    #acct-rail::before{
      content:'';
      position:absolute;
      inset:0;
      background:linear-gradient(110deg, transparent 24%, rgba(255,255,255,.10) 50%, transparent 76%);
      transform:translateX(-130%);
      animation:acSheen 7.5s ease-in-out infinite;
      pointer-events:none;
    }

    .ac-chip{
      position:relative;
      display:inline-flex;
      align-items:center;
      gap:7px;
      padding:8px 12px;
      border-radius:999px;
      font:700 12px/1 "Chakra Petch", sans-serif;
      letter-spacing:.2px;
      border:1px solid rgba(255,255,255,.14);
      background:
        linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
      color:#dbe4f2;
      white-space:nowrap;
      cursor:pointer;
      transition:
        transform .16s ease,
        border-color .16s ease,
        box-shadow .16s ease,
        background .16s ease,
        filter .16s ease;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        0 10px 22px -16px rgba(0,0,0,.8);
    }

    .ac-chip:hover{
      transform:translateY(-2px);
      border-color:rgba(255,255,255,.26);
      filter:saturate(1.15);
    }

    .ac-chip b{
      font:800 13px/1 "Space Grotesk", monospace;
      color:#fff;
      text-shadow:0 0 14px rgba(255,255,255,.18);
    }

    .ac-debt{
      border-color:rgba(248,113,113,.42);
      color:#fecaca;
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(248,113,113,.18), transparent 46%),
        rgba(70,16,16,.24);
    }

    .ac-debt.zero{
      border-color:rgba(74,222,128,.42);
      color:#bbf7d0;
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(74,222,128,.18), transparent 46%),
        rgba(10,42,24,.22);
    }

    .ac-coll{
      border-color:rgba(251,191,36,.52);
      color:#fde68a;
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(251,191,36,.20), transparent 46%),
        rgba(58,38,4,.22);
      box-shadow:
        0 0 22px -8px rgba(251,191,36,.55),
        inset 0 1px 0 rgba(255,255,255,.08);
    }

    .ac-roll{
      border-color:rgba(167,139,250,.48);
      color:#ddd6fe;
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(167,139,250,.20), transparent 46%),
        rgba(35,24,64,.24);
    }

    .ac-roll.hot{
      animation:acPulse 1.5s ease-in-out infinite;
    }

    .ac-shard{
      border-color:rgba(61,220,255,.46);
      color:#a5ecff;
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(61,220,255,.18), transparent 46%),
        rgba(6,34,44,.24);
    }

    .ac-stamp{
      border-color:rgba(255,178,36,.42);
      color:#ffe2b0;
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(255,178,36,.16), transparent 46%),
        rgba(52,32,4,.22);
    }

    .ac-buff{
      border-color:rgba(74,222,128,.5);
      color:#86efac;
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(74,222,128,.18), transparent 46%),
        rgba(8,38,18,.22);
    }

    @keyframes acSheen{
      0%, 64%, 100%{ transform:translateX(-130%); opacity:0; }
      72%{ opacity:.8; }
      86%{ transform:translateX(130%); opacity:0; }
    }

    @keyframes acPulse{
      0%,100%{ box-shadow:0 0 0 0 rgba(167,139,250,0), inset 0 1px 0 rgba(255,255,255,.08); }
      50%{ box-shadow:0 0 22px 1px rgba(167,139,250,.55), inset 0 1px 0 rgba(255,255,255,.08); }
    }

    .ac-overlay{
      position:fixed;
      inset:0;
      z-index:100002;
      display:none;
      align-items:center;
      justify-content:center;
      background:
        radial-gradient(120% 120% at 50% 20%, rgba(255,255,255,.05), transparent 32%),
        rgba(4,5,8,.88);
      -webkit-backdrop-filter:blur(12px) saturate(1.2);
      backdrop-filter:blur(12px) saturate(1.2);
      opacity:0;
      transition:opacity .22s ease;
    }

    .ac-overlay.open{
      display:flex;
      opacity:1;
    }

    .ac-box{
      position:relative;
      width:min(590px,94vw);
      max-height:88vh;
      overflow:auto;
      border-radius:24px;
      padding:24px;
      background:
        linear-gradient(180deg, rgba(21,24,35,.98), rgba(9,11,17,.99));
      border:1px solid rgba(255,255,255,.14);
      box-shadow:
        0 42px 110px -34px rgba(0,0,0,.95),
        inset 0 1px 0 rgba(255,255,255,.08);
      animation:acPopIn .24s cubic-bezier(.2,.8,.2,1);
    }

    .ac-box.wide{
      width:min(880px,96vw);
    }

    .ac-box::before{
      content:'';
      position:absolute;
      left:20px;
      right:20px;
      top:0;
      height:2px;
      border-radius:999px;
      background:linear-gradient(90deg, transparent, rgba(61,220,255,.8), rgba(255,178,36,.8), transparent);
      opacity:.85;
      pointer-events:none;
    }

    .ac-box::-webkit-scrollbar{ width:10px; }
    .ac-box::-webkit-scrollbar-track{ background:transparent; }
    .ac-box::-webkit-scrollbar-thumb{
      background:rgba(255,255,255,.14);
      border-radius:999px;
      border:2px solid transparent;
      background-clip:padding-box;
    }

    @keyframes acPopIn{
      from{ transform:translateY(14px) scale(.985); opacity:0; }
      to{ transform:translateY(0) scale(1); opacity:1; }
    }

    .ac-head{
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:14px;
      margin-bottom:8px;
    }

    .ac-title{
      font:800 19px/1.2 "Chakra Petch", sans-serif;
      letter-spacing:.2px;
      background:linear-gradient(90deg,#ffffff, #a5ecff 52%, #ffd9a0 100%);
      -webkit-background-clip:text;
      background-clip:text;
      color:transparent;
      filter:drop-shadow(0 0 16px rgba(165,236,255,.14));
    }

    .ac-sub{
      font-size:12.5px;
      color:#9aa3b5;
      line-height:1.65;
      margin-bottom:16px;
    }

    .ac-x{
      width:32px;
      height:32px;
      border-radius:10px;
      border:1px solid rgba(255,255,255,.15);
      background:rgba(255,255,255,.06);
      color:#cbd5e1;
      cursor:pointer;
      font-size:15px;
      transition:all .16s ease;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.07);
    }

    .ac-x:hover{
      color:#fca5a5;
      border-color:rgba(248,113,113,.45);
      transform:translateY(-1px);
    }

    .ac-grid35{
      display:grid;
      grid-template-columns:repeat(7,1fr);
      gap:8px;
    }

    .ac-st{
      position:relative;
      aspect-ratio:1;
      border-radius:13px;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:3px;
      border:1px solid rgba(255,255,255,.12);
      background:
        linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
      font:800 13px/1 "Space Grotesk", monospace;
      color:#fff;
      transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease, opacity .16s ease;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
    }

    .ac-st:hover{
      transform:translateY(-2px) scale(1.03);
      border-color:rgba(255,255,255,.24);
    }

    .ac-st .d{
      font:700 8.5px/1 "Space Grotesk", monospace;
      color:#5b6478;
    }

    .ac-st.full{
      border-color:rgba(74,222,128,.55);
      background:
        radial-gradient(120% 120% at 50% 0%, rgba(74,222,128,.22), transparent 52%),
        rgba(9,34,18,.32);
      box-shadow:
        0 0 22px -8px rgba(74,222,128,.7),
        inset 0 1px 0 rgba(255,255,255,.08);
      color:#d1fae5;
    }

    .ac-st.partial{
      opacity:.88;
      color:#cbd5e1;
    }

    .ac-st.scar{
      border-style:dashed;
      border-color:rgba(248,113,113,.58);
      background:
        radial-gradient(120% 120% at 50% 0%, rgba(248,113,113,.20), transparent 54%),
        rgba(54,13,13,.28);
      color:#f87171;
      box-shadow:0 0 20px -10px rgba(248,113,113,.65);
    }

    .ac-st.void{
      opacity:.24;
      filter:saturate(.4);
    }

    .ac-st.empty{
      opacity:.42;
    }

    .ac-field{
      font:800 10px/1 "Chakra Petch", sans-serif;
      letter-spacing:1.6px;
      text-transform:uppercase;
      color:#8b93a7;
      margin:18px 0 9px;
    }

    .ac-row{
      display:flex;
      gap:9px;
      flex-wrap:wrap;
    }

    .ac-opt{
      position:relative;
      flex:1 1 88px;
      min-width:78px;
      padding:12px 8px 10px;
      border-radius:16px;
      border:1px solid rgba(255,255,255,.12);
      background:
        linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.025));
      text-align:center;
      cursor:pointer;
      transition:
        transform .16s ease,
        border-color .16s ease,
        box-shadow .16s ease,
        background .16s ease,
        filter .16s ease;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
      overflow:hidden;
    }

    .ac-opt::before{
      content:'';
      position:absolute;
      inset:0;
      background:radial-gradient(120% 100% at 50% 0%, var(--rc, rgba(61,220,255,.22)), transparent 58%);
      opacity:0;
      transition:opacity .18s ease;
      pointer-events:none;
    }

    .ac-opt:hover{
      transform:translateY(-3px);
      border-color:var(--rc, rgba(255,255,255,.28));
      box-shadow:0 16px 30px -18px var(--rc, rgba(61,220,255,.55));
    }

    .ac-opt:hover::before{
      opacity:.18;
    }

    .ac-opt.eq{
      border-color:var(--rc, #3ddcff);
      box-shadow:
        0 0 26px -8px var(--rc, #3ddcff),
        inset 0 1px 0 rgba(255,255,255,.09);
      background:
        linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.04));
    }

    .ac-opt.eq::before{
      opacity:.22;
    }

    .ac-opt.locked{
      opacity:.56;
      filter:saturate(.65);
    }

    .ac-opt .e{
      font-size:22px;
      filter:drop-shadow(0 6px 14px rgba(0,0,0,.35));
    }

    .ac-opt .n{
      font:700 10.5px/1.25 "Chakra Petch", sans-serif;
      color:#fff;
      margin-top:5px;
    }

    .ac-opt .r{
      font:800 8px/1 "Chakra Petch", sans-serif;
      letter-spacing:.8px;
      text-transform:uppercase;
      margin-top:3px;
      opacity:.92;
    }

    .ac-opt .buy{
      font:800 9.5px/1 "Space Grotesk", monospace;
      color:#a5ecff;
      margin-top:5px;
    }

    .ac-range{
      width:100%;
      -webkit-appearance:none;
      appearance:none;
      height:8px;
      border-radius:999px;
      background:
        linear-gradient(90deg, rgba(251,191,36,.85), rgba(255,122,26,.85));
      outline:none;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);
    }

    .ac-range::-webkit-slider-thumb{
      -webkit-appearance:none;
      width:20px;
      height:20px;
      border-radius:50%;
      background:radial-gradient(circle at 35% 30%, #fff7dd, #fbbf24 58%, #b45309 100%);
      box-shadow:
        0 0 0 4px rgba(251,191,36,.22),
        0 0 18px rgba(251,191,36,.55);
      cursor:pointer;
      border:none;
    }

    .ac-range::-moz-range-thumb{
      width:20px;
      height:20px;
      border-radius:50%;
      background:radial-gradient(circle at 35% 30%, #fff7dd, #fbbf24 58%, #b45309 100%);
      box-shadow:
        0 0 0 4px rgba(251,191,36,.22),
        0 0 18px rgba(251,191,36,.55);
      cursor:pointer;
      border:none;
    }

    .ac-proj{
      display:grid;
      grid-template-columns:1fr 1fr 1fr;
      gap:9px;
      margin-top:14px;
    }

    .ac-proj > div{
      padding:12px 10px;
      border-radius:16px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.025));
      border:1px solid rgba(255,255,255,.10);
      text-align:center;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
    }

    .ac-proj .k{
      font:800 9px/1 "Chakra Petch", sans-serif;
      letter-spacing:1.2px;
      text-transform:uppercase;
      color:#8b93a7;
    }

    .ac-proj .v{
      font:800 18px/1.2 "Space Grotesk", monospace;
      color:#fff;
      margin-top:6px;
    }

    .ac-proj .v.win{
      color:#4ade80;
      text-shadow:0 0 18px rgba(74,222,128,.28);
    }

    .ac-proj .v.lose{
      color:#f87171;
      text-shadow:0 0 18px rgba(248,113,113,.28);
    }

    .ac-btn{
      width:100%;
      margin-top:16px;
      padding:14px;
      border:none;
      border-radius:15px;
      cursor:pointer;
      font:800 14px/1 "Chakra Petch", sans-serif;
      letter-spacing:.3px;
      color:#171207;
      background:linear-gradient(100deg,#ffb224,#ff7a1a);
      box-shadow:
        0 14px 34px -14px rgba(255,122,26,.75),
        inset 0 1px 0 rgba(255,255,255,.22);
      transition:transform .16s ease, filter .16s ease, box-shadow .16s ease;
    }

    .ac-btn:hover{
      transform:translateY(-2px);
      filter:brightness(1.06);
      box-shadow:
        0 18px 40px -16px rgba(255,122,26,.85),
        inset 0 1px 0 rgba(255,255,255,.22);
    }

    .ac-btn:disabled{
      opacity:.38;
      cursor:not-allowed;
      transform:none;
      filter:none;
      box-shadow:none;
    }

    .ac-btn.ghost{
      background:
        linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.04));
      color:#e2e8f0;
      border:1px solid rgba(255,255,255,.15);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.07);
    }

    .ac-btn.ghost:hover{
      border-color:rgba(61,220,255,.45);
      box-shadow:0 0 24px -10px rgba(61,220,255,.5);
    }

    .ac-ritual{
      perspective:1200px;
      width:250px;
      height:340px;
      margin:10px auto;
    }

    .ac-card{
      position:relative;
      width:100%;
      height:100%;
      transform-style:preserve-3d;
      transition:transform .78s cubic-bezier(.2,.8,.2,1);
      filter:drop-shadow(0 28px 42px rgba(0,0,0,.55));
    }

    .ac-card.flip{
      transform:rotateY(180deg);
    }

    .ac-card.shake{
      animation:acShake .5s ease-in-out infinite;
    }

    @keyframes acShake{
      0%,100%{ transform:rotateZ(0); }
      25%{ transform:rotateZ(-1.8deg) rotateY(5deg); }
      75%{ transform:rotateZ(1.8deg) rotateY(-5deg); }
    }

    .ac-face{
      position:absolute;
      inset:0;
      border-radius:24px;
      backface-visibility:hidden;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:9px;
      padding:22px;
      text-align:center;
      border:1px solid rgba(255,255,255,.16);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.10),
        0 24px 60px -24px rgba(0,0,0,.88);
      overflow:hidden;
    }

    .ac-face::before{
      content:'';
      position:absolute;
      inset:-40%;
      background:
        radial-gradient(circle at 50% 35%, rgba(255,255,255,.16), transparent 34%),
        radial-gradient(circle at 20% 80%, rgba(61,220,255,.12), transparent 28%),
        radial-gradient(circle at 80% 75%, rgba(255,178,36,.12), transparent 28%);
      opacity:.55;
      pointer-events:none;
    }

    .ac-back{
      background:
        radial-gradient(circle at 50% 32%, var(--tc, rgba(255,210,74,.42)), transparent 42%),
        linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)),
        rgba(8,9,13,.96);
    }

    .ac-back .sig{
      font-size:64px;
      animation:acSpin 6s linear infinite;
      filter:drop-shadow(0 0 22px rgba(255,255,255,.35));
    }

    .ac-back .tn{
      font:800 14px/1 "Chakra Petch", sans-serif;
      letter-spacing:1.4px;
      color:#fff;
      text-transform:uppercase;
    }

    @keyframes acSpin{
      to{ transform:rotate(360deg); }
    }

    .ac-front{
      transform:rotateY(180deg);
      background:
        radial-gradient(circle at 50% 28%, var(--rc, rgba(255,255,255,.20)), transparent 40%),
        linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.03)),
        rgba(8,9,13,.97);
    }

    .ac-front .rar{
      font:800 11px/1 "Chakra Petch", sans-serif;
      letter-spacing:3.4px;
    }

    .ac-front .em{
      font-size:70px;
      animation:acPop .55s cubic-bezier(.2,1.4,.4,1);
      filter:drop-shadow(0 10px 24px rgba(0,0,0,.45));
    }

    .ac-front .nm{
      font:800 20px/1.2 "Chakra Petch", sans-serif;
      color:#fff;
    }

    .ac-front .sl{
      font:700 10px/1 "Chakra Petch", sans-serif;
      letter-spacing:1.3px;
      color:#9aa3b5;
      text-transform:uppercase;
    }

    .ac-front .sh{
      font:700 13px/1 "Space Grotesk", monospace;
      color:#ffd9a0;
      margin-top:5px;
    }

    @keyframes acPop{
      0%{ transform:scale(.25); opacity:0; }
      100%{ transform:scale(1); opacity:1; }
    }

    .ac-bonus{
      margin-top:7px;
      font:700 11px/1.45 "Chakra Petch", sans-serif;
      color:#86efac;
    }

    #acct-toast{
      position:fixed;
      left:50%;
      bottom:22px;
      transform:translateX(-50%);
      z-index:100004;
      padding:12px 18px;
      border-radius:14px;
      background:
        linear-gradient(180deg, rgba(28,22,10,.96), rgba(16,12,6,.98));
      border:1px solid rgba(255,178,36,.42);
      color:#ffd9a0;
      font:700 12px/1.45 "Chakra Petch", sans-serif;
      box-shadow:
        0 16px 40px rgba(0,0,0,.62),
        0 0 28px -12px rgba(255,178,36,.55);
      pointer-events:none;
      transition:opacity .45s ease, transform .45s ease;
    }

    body.debt-smoulder #forest-island-canvas,
    body.debt-smoulder #forest-bg-canvas,
    body.debt-smoulder #fi-full-canvas{
      filter:saturate(.62) brightness(.94) contrast(1.02);
      transition:filter .8s ease;
    }

    body.debt-critical #forest-island-canvas,
    body.debt-critical #forest-bg-canvas,
    body.debt-critical #fi-full-canvas{
      filter:saturate(.34) brightness(.88) contrast(1.04);
      transition:filter .8s ease;
    }

    body.debt-default #forest-island-canvas,
    body.debt-default #forest-bg-canvas,
    body.debt-default #fi-full-canvas{
      filter:saturate(.16) brightness(.8) sepia(.32) contrast(1.05);
      transition:filter .8s ease;
    }

    body.debt-critical #view-dashboard{
      box-shadow:inset 0 0 120px -24px rgba(220,38,38,.28);
    }

    body.debt-default #view-dashboard{
      box-shadow:inset 0 0 140px -20px rgba(180,20,20,.42);
    }

    body.debt-smoulder::after,
    body.debt-critical::after,
    body.debt-default::after{
      content:'';
      position:fixed;
      inset:0;
      pointer-events:none;
      z-index:9990;
      transition:opacity .8s ease;
    }

    body.debt-smoulder::after{
      background:radial-gradient(120% 90% at 50% 18%, transparent 52%, rgba(255,122,26,.10) 100%);
      opacity:1;
    }

    body.debt-critical::after{
      background:radial-gradient(120% 90% at 50% 18%, transparent 44%, rgba(255,60,60,.16) 100%);
      animation:acctDanger 3.4s ease-in-out infinite;
    }

    body.debt-default::after{
      background:
        radial-gradient(120% 90% at 50% 18%, transparent 38%, rgba(120,10,10,.22) 100%),
        linear-gradient(180deg, rgba(0,0,0,.06), rgba(0,0,0,.14));
      opacity:1;
    }

    body.debt-critical::before,
    body.debt-default::before{
      content:'';
      position:fixed;
      inset:0;
      pointer-events:none;
      z-index:9991;
      background:repeating-linear-gradient(
        180deg,
        transparent 0 3px,
        rgba(255,255,255,.018) 3px 4px
      );
      mix-blend-mode:overlay;
      opacity:.22;
    }

    @keyframes acctDanger{
      0%,100%{ opacity:.72; }
      50%{ opacity:1; }
    }

    @media (max-width:760px){
      #acct-rail{
        gap:8px;
        padding:10px 12px;
      }

      .ac-chip{
        padding:7px 10px;
        font-size:11px;
      }

      .ac-box{
        padding:18px;
        border-radius:20px;
      }

      .ac-grid35{
        gap:6px;
      }

      .ac-proj{
        grid-template-columns:1fr;
      }
    }

    @media (prefers-reduced-motion: reduce){
      #acct-rail::before,
      .ac-roll.hot,
      .ac-card.shake,
      .ac-back .sig,
      .ac-front .em,
      body.debt-critical::after{
        animation:none !important;
      }

      .ac-chip,
      .ac-opt,
      .ac-btn,
      .ac-x,
      .ac-st{
        transition:none !important;
      }
    }
  `;

  document.head.appendChild(s);
}
// --------------------------------------------
var toastT=null;
function toast(m){ var d=document.getElementById('acct-toast'); if(!d){ d=document.createElement('div'); d.id='acct-toast'; document.body.appendChild(d); } d.textContent=m; d.style.opacity='1'; if(toastT) clearTimeout(toastT); toastT=setTimeout(function(){ d.style.opacity='0'; }, 4200); }

var rail=null, stampModal=null, pledgeModal=null, ritualModal=null, studioModal=null;
function buildRail(){ if(rail) return; var dash=document.getElementById('view-dashboard'); if(!dash) return; rail=document.createElement('div'); rail.id='acct-rail'; var grid=dash.querySelector('.dash-grid'); if(grid) dash.insertBefore(rail, grid); else dash.insertBefore(rail, dash.firstChild);
  rail.addEventListener('click', function(e){ var c=e.target.closest('[data-act]'); if(!c) return; var a=c.getAttribute('data-act'); if(a==='debt') openStamps(); else if(a==='coll') openPledge(); else if(a==='roll') openRitual(); else if(a==='shard') openStudio(); else if(a==='stamp') openStamps(); else if(a==='studio') openStudio(); });
}
function renderRail(){ buildRail(); if(!rail) return;
  var dtier = debt<=0?'zero':debt<10?'smoulder':debt<20?'critical':'default';
  document.body.classList.remove('debt-smoulder','debt-critical','debt-default','debt-clean'); if(dtier!=='zero') document.body.classList.add('debt-'+dtier);
  var tr=totalRolls();
  rail.innerHTML =
    '<span class="ac-chip ac-debt '+dtier+'" data-act="debt">🔥 Debt <b>'+debt+'</b></span>'+
    (coll?'<span class="ac-chip ac-coll" data-act="coll">⚖ <b>'+coll.stake+'</b> at risk</span>':'<span class="ac-chip" data-act="coll" style="border-color:rgba(251,191,36,.3);color:#fde68a">⚖ Pledge</span>')+
    '<span class="ac-chip ac-roll'+(tr>0?' hot':'')+'" data-act="roll">🎲 <b>'+tr+'</b></span>'+
    '<span class="ac-chip ac-shard" data-act="shard">🪙 <b>'+shards+'</b></span>'+
    (buff>0?'<span class="ac-chip ac-buff">⚡ Surge <b>×'+buff+'</b></span>':'')+
    '<span class="ac-chip ac-stamp" data-act="stamp">🎖 Stamps</span>'+
    '<span class="ac-chip" data-act="studio" style="border-color:rgba(61,220,255,.3);color:#a5ecff">🎨 Studio</span>';
}

/* ── stamps modal ── */
function openStamps(){ if(!stampModal){ stampModal=mkOverlay(); var b=mkBox(stampModal); b.innerHTML='<div class="ac-head"><div><div class="ac-title">🎖 Proof-of-Work Passport</div></div><button class="ac-x">✕</button></div><div class="ac-sub">Every day you opened the tracker and finished = a green stamp. Opened but fell short = a red scar you <b>cannot delete</b>. Days you never opened = a gap (no judgement). 35-day window.</div><div class="ac-grid35" id="ac-stampgrid"></div>'; wireClose(stampModal); }
  var g=stampModal.querySelector('#ac-stampgrid'); g.innerHTML=''; var fs=firstSeenDate();
  for(var i=34;i>=0;i--){ var dd=new Date(); dd.setDate(dd.getDate()-i); var dk=dkey(dd); var st=stampState(dk); var cell=document.createElement('div'); cell.className='ac-st '+st; var showVoid = (st==='void') && fs && dk>=fs && dk<dkey(); cell.title = dk+(st==='full'?' · closed':st==='scar'?' · fell short':st==='partial'?' · in progress':showVoid?' · missed (gap)':' · no data'); cell.innerHTML='<span class="n">'+(st==='scar'?'✕':st==='full'?'✓':st==='partial'?'…':st==='empty'?'·':'')+'</span><span class="d">'+dd.getDate()+'</span>'; if(st==='void'&&!showVoid) cell.style.opacity='.12'; g.appendChild(cell); }
  stampModal.classList.add('open');
}

/* ── pledge modal ── */
function openPledge(){ if(!pledgeModal){ pledgeModal=mkOverlay(); var b=mkBox(pledgeModal); b.innerHTML='<div class="ac-head"><div><div class="ac-title">⚖ Pledge ELO as Collateral</div></div><button class="ac-x">✕</button></div><div class="ac-sub">Stake real Elo on <b>closing today\'s loop</b>. Close it → keep the stake + win a bonus + bank a Fate Roll. Miss it → the stake is seized. Bigger stake = bigger multiplier & rarer roll. One pledge per day.</div><div class="ac-field">Stake — <span id="ac-stakeval" style="color:#fbbf24">0</span> ELO</div><input class="ac-range" id="ac-range" type="range" min="50" max="50" value="50"><div class="ac-proj"><div><div class="k">% of build</div><div class="v" id="ac-pct">—</div></div><div><div class="k">Multiplier</div><div class="v" id="ac-mult">—</div></div><div><div class="k">Win roll</div><div class="v" id="ac-tier">—</div></div></div><div class="ac-proj" style="grid-template-columns:1fr 1fr"><div><div class="k">Win bonus</div><div class="v win" id="ac-bonus">—</div></div><div><div class="k">Loss</div><div class="v lose" id="ac-lose">—</div></div></div><button class="ac-btn" id="ac-lock">Lock the pledge</button>'; wireClose(pledgeModal);
    var rng=pledgeModal.querySelector('#ac-range'); rng.addEventListener('input', projPledge);
    pledgeModal.querySelector('#ac-lock').addEventListener('click', lockPledge);
  }
  var A=window.AppState; var g=(A&&A.elo&&A.elo.global)||1200; var max=Math.max(0,Math.floor(0.4*g)); var rng=pledgeModal.querySelector('#ac-range'); var lock=pledgeModal.querySelector('#ac-lock');
  if(max<50){ rng.disabled=true; lock.disabled=true; rng.min=50; rng.max=50; rng.value=50; } else { rng.disabled=false; lock.disabled=!!coll; rng.min=50; rng.max=max; rng.value=coll?Math.min(coll.stake,max):Math.min(Math.round(g*0.1),max); }
  projPledge(); pledgeModal.classList.add('open');
}
function projPledge(){ var m=pledgeModal; var stake=+m.querySelector('#ac-range').value||0; var A=window.AppState; var g=(A&&A.elo&&A.elo.global)||1200; var pct=g>0?(stake/g)*100:0; var t = pct<5?{mult:0.5,tier:'bronze'}:pct<15?{mult:0.9,tier:'silver'}:pct<30?{mult:1.3,tier:'gold'}:{mult:1.8,tier:'obsidian'};
  m.querySelector('#ac-stakeval').textContent=stake; m.querySelector('#ac-pct').textContent=pct.toFixed(1)+'%'; m.querySelector('#ac-mult').textContent='×'+t.mult; m.querySelector('#ac-tier').textContent=t.tier.toUpperCase(); m.querySelector('#ac-bonus').textContent='+'+Math.round(stake*t.mult); m.querySelector('#ac-lose').textContent='−'+stake;
}
function lockPledge(){ var stake=+pledgeModal.querySelector('#ac-range').value||0; var A=window.AppState; var g=(A&&A.elo&&A.elo.global)||1200; var pct=g>0?(stake/g)*100:0; if(stake<50||stake>Math.floor(0.4*g)) return; var t = pct<5?{mult:0.5,tier:'bronze'}:pct<15?{mult:0.9,tier:'silver'}:pct<30?{mult:1.3,tier:'gold'}:{mult:1.8,tier:'obsidian'}; coll={date:dkey(),stake:stake,mult:t.mult,rollTier:t.tier}; set(K_COLL,coll); pledgeModal.classList.remove('open'); toast('⚖ Pledged '+stake+' ELO at ×'+t.mult+' — close the loop to win it'); renderRail();
}

/* ── ritual modal ── */
function openRitual(){ if(!ritualModal){ ritualModal=mkOverlay(); var b=mkBox(ritualModal); b.innerHTML='<div class="ac-head"><div><div class="ac-title">🎲 Fate Roll</div></div><button class="ac-x">✕</button></div><div class="ac-sub" id="ac-ritsub"></div><div class="ac-ritual"><div class="ac-card" id="ac-ritcard"><div class="ac-face ac-back" id="ac-ritback"><div class="sig">✦</div><div class="tn" id="ac-rittier">—</div></div><div class="ac-face ac-front" id="ac-ritfront"></div></div></div><div class="ac-row" id="ac-ritact" style="justify-content:center"></div>'; wireClose(ritualModal);
    ritualModal.querySelector('#ac-ritcard').addEventListener('click', function(){ if(ritualModal.dataset.armed==='1') return; flipRitual(); });
  }
  var t=highestRoll(); var sub=ritualModal.querySelector('#ac-ritsub'); var card=ritualModal.querySelector('#ac-ritcard'); var act=ritualModal.querySelector('#ac-ritact');
  card.classList.remove('flip','shake'); ritualModal.querySelector('#ac-ritfront').innerHTML=''; ritualModal.dataset.armed='0';
  if(!t){ sub.textContent='No Fate Rolls yet. Close your daily loop (banks a bronze) or pledge collateral (banks silver→obsidian on a win) to earn them.'; act.innerHTML='<button class="ac-btn ghost" id="ac-ritstudio">Open the Studio / Shop</button>'; act.querySelector('#ac-ritstudio').onclick=function(){ ritualModal.classList.remove('open'); openStudio(); }; ritualModal.classList.add('open'); return; }
  var tc={bronze:'#cd7f32',silver:'#cfd6e6',gold:'#ffd24a',obsidian:'#b388ff'}[t];
  sub.innerHTML='Spending your <b style="color:'+tc+'">'+t.toUpperCase()+'</b> roll. Tap the card — or let fate decide…';
  var back=ritualModal.querySelector('#ac-ritback'); back.style.setProperty('--tc', hexA(tc,.45)); back.style.boxShadow='0 0 50px -8px '+hexA(tc,.7)+', inset 0 0 0 2px '+tc; ritualModal.querySelector('#ac-rittier').textContent=t+' fate';
  act.innerHTML='<button class="ac-btn" id="ac-flip" style="max-width:240px">Flip the Fate</button>'; act.querySelector('#ac-flip').onclick=function(){ if(ritualModal.dataset.armed==='1') return; flipRitual(); };
  ritualModal.classList.add('open');
  setTimeout(function(){ if(ritualModal.dataset.armed==='0'&&ritualModal.classList.contains('open')) card.classList.add('shake'); },350);
  setTimeout(function(){ if(ritualModal.dataset.armed==='0'&&ritualModal.classList.contains('open')) flipRitual(); },1300);
}
function flipRitual(){ if(ritualModal.dataset.armed==='1') return; ritualModal.dataset.armed='1'; var got=spendHighest(); var card=ritualModal.querySelector('#ac-ritcard'); card.classList.remove('shake'); card.classList.add('flip'); if(!got){ ritualModal.classList.remove('open'); return; }
  setTimeout(function(){ revealRitual(got); },720); renderRail();
}
function revealRitual(got){ var front=ritualModal.querySelector('#ac-ritfront'); var it=got.item; var rar=it?it.rar:'common'; var rc=it?(RAR_COL(rar)||'#9aa3b5'):'#9aa3b5'; front.style.setProperty('--rc', hexA(rc,.35)); front.style.boxShadow='0 0 60px -6px '+hexA(rc,.7)+', inset 0 0 0 2px '+rc;
  if(it){ front.innerHTML='<div class="rar" style="color:'+rc+'">'+rar.toUpperCase()+'</div><div class="em">'+(it.emoji||'✦')+'</div><div class="nm">'+it.name+'</div><div class="sl">'+slotLabel(it.slot||it.set?'cosmetic':'')+(it.set?' · BIOME':'')+'</div><div class="sh">+'+got.shards+' shards</div>'+(got.bonus.length?'<div class="ac-bonus">'+got.bonus.join(' · ')+'</div>':''); }
  else { front.innerHTML='<div class="rar" style="color:#9aa3b5">SHARDS</div><div class="em">🪙</div><div class="nm">+'+got.shards+' Shards</div><div class="sl">the fates withheld a relic</div>'+(got.bonus.length?'<div class="ac-bonus">'+got.bonus.join(' · ')+'</div>':''); }
  var act=ritualModal.querySelector('#ac-ritact');
  act.innerHTML=(it?'<button class="ac-btn" id="ac-equip" style="max-width:160px">Equip</button>':'')+'<button class="ac-btn ghost" id="ac-studio2" style="max-width:150px">Studio</button>'+(totalRolls()>0?'<button class="ac-btn ghost" id="ac-again" style="max-width:130px">Roll Again</button>':'');
  if(it) act.querySelector('#ac-equip').onclick=function(){ equipItem(it); ritualModal.classList.remove('open'); };
  act.querySelector('#ac-studio2').onclick=function(){ ritualModal.classList.remove('open'); openStudio(); };
  var ag=act.querySelector('#ac-again'); if(ag) ag.onclick=function(){ openRitual(); };
}
function RAR_COL(r){ return {common:'#9aa3b5',uncommon:'#39d98a',rare:'#4cc9ff',epic:'#a78bfa',legendary:'#ffb224'}[r]||'#9aa3b5'; }
function slotLabel(s){ return {aura:'Tree Aura',scatter:'Ground',particles:'Sky & FX',structure:'Structure',creature:'Life',tint:'Light',cosmetic:'Cosmetic'}[s]||s; }

/* ── studio modal ── */
function isOwnedBiome(bi){
  return bi.rar==='common' || owns(bi.id);
}

function studioStateLabel(owned, isEq, rar){
  if(isEq) return 'Equipped';
  if(owned) return 'Equip';
  return 'Buy · 🪙 ' + (PRICE[rar] || 0);
}

function openStudio(){
  if(!studioModal){
    studioModal = mkOverlay();
    var b = mkBox(studioModal);
    b.classList.add('wide','ac-studio-box');

    b.innerHTML = `
      <div class="ac-head">
        <div>
          <div class="ac-title">🎨 Island Studio</div>
          <div class="ac-sub">
            Preview on the left. Equip, buy, and switch cosmetics on the right. Changes apply instantly.
          </div>
        </div>
        <button class="ac-x" type="button" aria-label="Close studio">✕</button>
      </div>

      <div class="ac-studio-shell">
        <div class="ac-studio-left">
          <div class="ac-studio-preview">
            <canvas id="ac-studio-preview" width="840" height="520"></canvas>
          </div>

          <div class="ac-studio-quick">
            <button class="ac-studio-btn primary" id="ac-studio-roll" type="button">🎲 Spend Fate Roll</button>
            <button class="ac-studio-btn" id="ac-studio-reset" type="button">♻ Reset Loadout</button>
            <button class="ac-studio-btn ghost" id="ac-studio-done" type="button">✓ Done</button>
          </div>
        </div>

        <div class="ac-studio-right">
          <div class="ac-studio-wallet">
            <span class="ac-studio-pill">🪙 Shards <b id="ac-studio-shards">0</b></span>
            <span class="ac-studio-pill">🎲 Rolls <b id="ac-studio-rolls">0</b></span>
          </div>

          <div class="ac-studio-tabs" id="ac-studio-tabs" role="tablist" aria-label="Cosmetic categories"></div>
          <div class="ac-studio-grid" id="ac-studio-grid"></div>
        </div>
      </div>
    `;

    wireClose(studioModal);

    b.querySelector('#ac-studio-roll').onclick = function(){
      studioModal.classList.remove('open');
      openRitual();
    };

    b.querySelector('#ac-studio-reset').onclick = function(){
      eq = {
        biome:'meadow',
        aura:'none',
        scatter:'meadow',
        particles:'pollen',
        structure:'campfire',
        creature:'cnone',
        tint:'natural'
      };
      saveEq();
      renderStudio();
      renderRail();
      toast('Studio reset to Meadow');
    };

    b.querySelector('#ac-studio-done').onclick = function(){
      studioModal.classList.remove('open');
    };
  }

  studioTab = 'biomes';
  renderStudio();
  studioModal.classList.add('open');
  startStudioPreview();
}

function renderStudio(){
  if(!studioModal) return;

  var shardsEl = studioModal.querySelector('#ac-studio-shards');
  var rollsEl = studioModal.querySelector('#ac-studio-rolls');

  if(shardsEl) shardsEl.textContent = shards;
  if(rollsEl) rollsEl.textContent = totalRolls();

  var tabs = studioModal.querySelector('#ac-studio-tabs');
  if(tabs){
    tabs.innerHTML = '';

    STUDIO_TABS.forEach(function(t){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ac-studio-tab' + (studioTab === t[0] ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', studioTab === t[0] ? 'true' : 'false');
      btn.textContent = t[1];

      btn.onclick = function(){
        studioTab = t[0];
        renderStudio();
      };

      tabs.appendChild(btn);
    });
  }

  var grid = studioModal.querySelector('#ac-studio-grid');
  if(!grid) return;

  grid.innerHTML = '';

  if(studioTab === 'biomes'){
    renderBiomeGrid(grid);
  }else{
    renderSlotGrid(grid, studioTab);
  }

  drawStudioPreview(0);
}

function renderBiomeGrid(grid){
  BIOMES.forEach(function(bi){
    var owned = isOwnedBiome(bi);
    var isEq = eq.biome === bi.id;
    var price = PRICE[bi.rar] || 0;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'ac-studio-item' +
      (isEq ? ' equipped' : '') +
      (owned ? '' : ' locked') +
      ((!owned && shards < price) ? ' cant' : '');

    btn.style.setProperty('--rc', RAR_COL(bi.rar));
    btn.setAttribute('aria-pressed', isEq ? 'true' : 'false');
    btn.setAttribute('aria-label', bi.name + ', ' + bi.rar + ' biome, ' + studioStateLabel(owned, isEq, bi.rar));

    btn.innerHTML =
      '<span class="ac-studio-emoji" aria-hidden="true">' + (bi.emoji || '🌍') + '</span>' +
      '<span class="ac-studio-name">' + bi.name + '</span>' +
      '<span class="ac-studio-rar" style="color:' + RAR_COL(bi.rar) + '">' + bi.rar + '</span>' +
      '<span class="ac-studio-state">' + studioStateLabel(owned, isEq, bi.rar) + '</span>';

    btn.onclick = function(){
      if(!owned){
        if(shards >= price){
          shards -= price;
          setN(K_SHARDS, shards);
          unl.push(bi.id);
          saveUnl();
          applyBiome(bi);
          renderStudio();
          renderRail();
          toast('Bought ' + bi.name);
        }else{
          toast('Not enough shards');
        }
        return;
      }

      applyBiome(bi);
      renderStudio();
      renderRail();
      toast('Applied ' + bi.name);
    };

    grid.appendChild(btn);
  });
}

function renderSlotGrid(grid, slot){
  var items = catOf(slot);

  if(!items.length){
    grid.innerHTML = '<div class="ac-studio-empty">No items in this slot yet.</div>';
    return;
  }

  items.forEach(function(it){
    var owned = owns(it.id);
    var isEq = eq[slot] === it.id;
    var price = PRICE[it.rar] || 0;
    var accent = it.color || RAR_COL(it.rar);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'ac-studio-item' +
      (isEq ? ' equipped' : '') +
      (owned ? '' : ' locked') +
      ((!owned && shards < price) ? ' cant' : '');

    btn.style.setProperty('--rc', accent);
    btn.setAttribute('aria-pressed', isEq ? 'true' : 'false');
    btn.setAttribute('aria-label', it.name + ', ' + it.rar + ', ' + studioStateLabel(owned, isEq, it.rar));

    btn.innerHTML =
      '<span class="ac-studio-emoji" aria-hidden="true">' + (it.emoji || '✦') + '</span>' +
      '<span class="ac-studio-name">' + it.name + '</span>' +
      '<span class="ac-studio-rar" style="color:' + accent + '">' + it.rar + '</span>' +
      '<span class="ac-studio-state">' + studioStateLabel(owned, isEq, it.rar) + '</span>';

    btn.onclick = function(){
      if(!owned){
        if(shards >= price){
          shards -= price;
          setN(K_SHARDS, shards);
          unl.push(it.id);
          saveUnl();

          eq[slot] = it.id;
          eq.biome = 'custom';
          saveEq();

          renderStudio();
          renderRail();
          toast('Bought ' + it.name);
        }else{
          toast('Not enough shards');
        }
        return;
      }

      eq[slot] = it.id;
      eq.biome = 'custom';
      saveEq();

      renderStudio();
      renderRail();
      toast('Equipped ' + it.name);
    };

    grid.appendChild(btn);
  });
}

function drawStudioPreview(el){
  var cv = document.getElementById('ac-studio-preview');
  if(!cv) return;

  var g = cv.getContext('2d');
  var W = cv.width;
  var H = cv.height;
  var mood = computeMood(eq);

  // sky
  var sky = g.createLinearGradient(0,0,0,H);
  sky.addColorStop(0, mood.skyTop);
  sky.addColorStop(1, mood.skyBot);
  g.fillStyle = sky;
  g.fillRect(0,0,W,H);

  // sun / moon
  g.save();
  g.globalAlpha = .92;
  g.fillStyle = mood.sun;
  g.shadowColor = mood.sun;
  g.shadowBlur = 36;
  g.beginPath();
  g.arc(W*0.82, H*0.20, 18, 0, 6.283);
  g.fill();
  g.restore();

  // water
  g.save();
  g.globalAlpha = .9;
  g.fillStyle = mood.water;
  g.fillRect(0, H*0.74, W, H*0.26);
  g.restore();

  // island base
  g.save();
  g.fillStyle = 'rgba(8,18,12,.9)';
  g.beginPath();
  g.ellipse(W/2, H*0.82, W*0.36, H*0.13, 0, 0, 6.283);
  g.fill();
  g.restore();

  // aura + trees
  var aura = BYID[eq.aura];
  var ac = aura && aura.color;

  function tree(x,s){
    if(ac){
      var rg = g.createRadialGradient(x, H*0.60, 2, x, H*0.60, 36*s);
      rg.addColorStop(0, ac);
      rg.addColorStop(1, 'rgba(0,0,0,0)');

      g.save();
      g.globalAlpha = .28;
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, H*0.60, 36*s, 0, 6.283);
      g.fill();
      g.restore();
    }

    g.save();

    // trunk
    g.fillStyle = 'rgba(20,14,10,.92)';
    g.fillRect(x - 2*s, H*0.64, 4*s, H*0.12);

    // canopy
    g.fillStyle = 'rgba(35,60,35,.96)';
    g.beginPath();
    g.moveTo(x - 17*s, H*0.66);
    g.lineTo(x, H*0.38);
    g.lineTo(x + 17*s, H*0.66);
    g.closePath();
    g.fill();

    g.beginPath();
    g.moveTo(x - 13*s, H*0.55);
    g.lineTo(x, H*0.32);
    g.lineTo(x + 13*s, H*0.55);
    g.closePath();
    g.fill();

    g.restore();
  }

  tree(W*0.34, 1.05);
  tree(W*0.50, 1.35);
  tree(W*0.66, 0.95);

  // scatter
  var cols = PREVIEW_SCATTER[eq.scatter] || PREVIEW_SCATTER.meadow;

  for(var i=0;i<46;i++){
    var px = W/2 + Math.cos(i*1.7) * W*0.26 * ((i%7)/7 + 0.25);
    var py = H*0.80 + Math.sin(i*2.3) * H*0.055;

    g.save();
    g.globalAlpha = .75;
    g.fillStyle = cols[i % cols.length];
    g.beginPath();
    g.arc(px, py, 1.8 + (i%3), 0, 6.283);
    g.fill();
    g.restore();
  }

  // structure
  var st = BYID[eq.structure];
  if(st && st.emoji && st.emoji !== '·'){
    g.save();
    g.font = '34px serif';
    g.textAlign = 'center';
    g.shadowColor = 'rgba(0,0,0,.45)';
    g.shadowBlur = 10;
    g.fillText(st.emoji, W/2, H*0.72);
    g.restore();
  }

  // creature
  var cmap = {
    koi: {y:H*0.87, e:'🐟'},
    birds: {y:H*0.16, e:'🐦'},
    butterfly: {y:H*0.58, e:'🦋'},
    fox: {y:H*0.74, e:'🦊'}
  };

  var cr = eq.creature;
  if(cr && cmap[cr]){
    var cx = (el*36 + 60) % (W + 120) - 60;
    var cy = cmap[cr].y + Math.sin(el*2)*6;

    g.save();
    g.font = '24px serif';
    g.fillText(cmap[cr].e, cx, cy);

    if(cr === 'koi'){
      g.fillText(cmap[cr].e, W - cx, cy + 10);
    }

    g.restore();
  }

  // particles
  var pp = PARTICLE_PREVIEW[eq.particles] || PARTICLE_PREVIEW.pollen;

  if(previewPartType !== eq.particles){
    previewPartType = eq.particles;
    previewParts = [];

    for(var p=0;p<30;p++){
      previewParts.push({
        x: Math.random()*W,
        y: Math.random()*H*0.72,
        ph: Math.random()*6.28,
        sp: 0.25 + Math.random()*0.8,
        c: pp.colors[p % pp.colors.length]
      });
    }
  }

  g.save();
  for(var q=0;q<previewParts.length;q++){
    var pt = previewParts[q];
    var x = pt.x;
    var y = pt.y;

    if(pp.beh === 'fall'){
      y = (pt.y + el*18*pt.sp) % (H*0.72);
      x = pt.x + Math.sin(el + pt.ph)*10;
      g.globalAlpha = .75;
    } else if(pp.beh === 'rise'){
      y = H*0.72 - ((pt.y + el*22*pt.sp) % (H*0.72));
      x = pt.x + Math.sin(el*1.2 + pt.ph)*8;
      g.globalAlpha = .8;
    } else if(pp.beh === 'blink'){
      x = pt.x + Math.sin(el*0.8 + pt.ph)*12;
      y = pt.y + Math.sin(el*1.1 + pt.ph)*8;
      g.globalAlpha = 0.25 + 0.75 * Math.max(0, Math.sin(el*1.5 + pt.ph*3));
    } else {
      x = pt.x + Math.sin(el*0.7 + pt.ph)*14;
      y = pt.y + Math.sin(el*0.9 + pt.ph)*10;
      g.globalAlpha = .7;
    }

    g.fillStyle = pt.c;
    g.beginPath();
    g.arc(x, y, 2, 0, 6.283);
    g.fill();
  }
  g.restore();

  // labels
  g.save();
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.font = '700 12px sans-serif';
  g.fillText(
    ((eq.biome || 'custom') + ' · ' + (BYID[eq.tint] ? BYID[eq.tint].name : eq.tint)).toUpperCase(),
    14,
    22
  );

  g.font = '600 10px sans-serif';
  g.fillStyle = 'rgba(255,255,255,.68)';
  g.fillText(
    'Aura: ' + (BYID[eq.aura] ? BYID[eq.aura].name : 'None') +
    '   Ground: ' + (BYID[eq.scatter] ? BYID[eq.scatter].name : '—'),
    14,
    H - 16
  );
  g.restore();
}

function startStudioPreview(){
  if(previewRaf) return;

  var t0 = performance.now();

  function loop(t){
    if(!studioModal || !studioModal.classList.contains('open')){
      previewRaf = null;
      return;
    }

    drawStudioPreview((t - t0) / 1000);
    previewRaf = requestAnimationFrame(loop);
  }

  previewRaf = requestAnimationFrame(loop);
}
/* ── overlay helpers ── */
function mkOverlay(){ var o=document.createElement('div'); o.className='ac-overlay'; document.body.appendChild(o); o.addEventListener('click', function(e){ if(e.target===o) o.classList.remove('open'); }); return o; }
function mkBox(o){ var b=document.createElement('div'); b.className='ac-box'; o.appendChild(b); return b; }
function wireClose(o){ o.querySelector('.ac-x').addEventListener('click', function(){ o.classList.remove('open'); }); }
function hexA(hex,a){ var c=hex.replace('#',''); if(c.length===3) c=c[0]+c[0]+c[1]+c[1]+c[2]+c[2]; var r=parseInt(c.substr(0,2),16),g=parseInt(c.substr(2,2),16),b=parseInt(c.substr(4,2),16); return 'rgba('+r+','+g+','+b+','+a+')'; }

function injectItemFX(){
  if(document.getElementById('acct-item-fx')) return;

  var s=document.createElement('style');
  s.id='acct-item-fx';
  s.textContent = `
    #acct-rail{
      position:relative;
      overflow:hidden;
      border-radius:18px;
      border:1px solid rgba(255,255,255,.14);
      background:
        linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)),
        radial-gradient(120% 160% at 0% 0%, rgba(61,220,255,.10), transparent 42%),
        radial-gradient(120% 160% at 100% 0%, rgba(255,178,36,.10), transparent 40%),
        rgba(8,10,16,.42);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.09),
        0 18px 44px -22px rgba(0,0,0,.82);
    }

    #acct-rail::before{
      content:'';
      position:absolute;
      inset:0;
      background:linear-gradient(115deg, transparent 24%, rgba(255,255,255,.10) 50%, transparent 76%);
      transform:translateX(-130%);
      animation:acctRailSheen 8s ease-in-out infinite;
      pointer-events:none;
    }

    .ac-chip{
      position:relative;
      overflow:hidden;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.16);
      background:
        linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.03));
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        0 10px 22px -16px rgba(0,0,0,.8);
      transition:
        transform .16s ease,
        border-color .16s ease,
        box-shadow .16s ease,
        filter .16s ease;
    }

    .ac-chip::after{
      content:'';
      position:absolute;
      inset:-40%;
      background:linear-gradient(115deg, transparent 30%, rgba(255,255,255,.18) 50%, transparent 70%);
      transform:translateX(-140%);
      transition:transform .55s ease;
      pointer-events:none;
    }

    .ac-chip:hover{
      transform:translateY(-2px) scale(1.02);
      border-color:rgba(255,255,255,.28);
      filter:saturate(1.15);
    }

    .ac-chip:hover::after{
      transform:translateX(140%);
    }

    .ac-chip b{
      text-shadow:0 0 14px rgba(255,255,255,.18);
    }

    .ac-debt.zero{
      border-color:rgba(74,222,128,.48);
      color:#bbf7d0;
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(74,222,128,.18), transparent 46%),
        rgba(10,42,24,.22);
    }

    .ac-coll{
      border-color:rgba(251,191,36,.56);
      color:#fde68a;
      box-shadow:
        0 0 22px -8px rgba(251,191,36,.55),
        inset 0 1px 0 rgba(255,255,255,.08);
    }

    .ac-roll.hot{
      animation:acctPulseSoft 1.5s ease-in-out infinite;
    }

    .ac-shard{
      border-color:rgba(61,220,255,.5);
      color:#a5ecff;
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(61,220,255,.18), transparent 46%),
        rgba(6,34,44,.24);
    }

    .ac-stamp{
      border-color:rgba(255,178,36,.46);
      color:#ffe2b0;
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(255,178,36,.16), transparent 46%),
        rgba(52,32,4,.22);
    }

    .ac-buff{
      border-color:rgba(74,222,128,.55);
      color:#86efac;
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(74,222,128,.18), transparent 46%),
        rgba(8,38,18,.22);
    }

    .ac-box{
      border-radius:24px;
      border:1px solid rgba(255,255,255,.14);
      box-shadow:
        0 42px 110px -34px rgba(0,0,0,.95),
        inset 0 1px 0 rgba(255,255,255,.08);
    }

    .ac-box::before{
      content:'';
      position:absolute;
      left:20px;
      right:20px;
      top:0;
      height:2px;
      border-radius:999px;
      background:linear-gradient(90deg, transparent, rgba(61,220,255,.8), rgba(255,178,36,.8), transparent);
      opacity:.85;
      pointer-events:none;
    }

    .ac-title{
      background:linear-gradient(90deg,#ffffff, #a5ecff 52%, #ffd9a0 100%);
      -webkit-background-clip:text;
      background-clip:text;
      color:transparent;
      filter:drop-shadow(0 0 16px rgba(165,236,255,.14));
    }

    .ac-opt{
      position:relative;
      overflow:hidden;
      border-radius:16px;
      border:1px solid rgba(255,255,255,.12);
      background:
        linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.025));
      box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
      transition:
        transform .16s ease,
        border-color .16s ease,
        box-shadow .16s ease,
        background .16s ease,
        filter .16s ease;
    }

    .ac-opt::before{
      content:'';
      position:absolute;
      inset:0;
      background:radial-gradient(120% 100% at 50% 0%, var(--rc, #3ddcff), transparent 58%);
      opacity:0;
      transition:opacity .18s ease;
      pointer-events:none;
    }

    .ac-opt::after{
      content:'';
      position:absolute;
      inset:-45%;
      background:linear-gradient(115deg, transparent 32%, rgba(255,255,255,.14) 50%, transparent 68%);
      transform:translateX(-145%);
      transition:transform .5s ease;
      pointer-events:none;
    }

    .ac-opt:hover{
      transform:translateY(-3px) scale(1.02);
      border-color:var(--rc, rgba(255,255,255,.28));
      box-shadow:0 16px 30px -18px var(--rc, rgba(61,220,255,.55));
    }

    .ac-opt:hover::before{
      opacity:.18;
    }

    .ac-opt:hover::after{
      transform:translateX(145%);
    }

    .ac-opt.eq{
      border-color:var(--rc, #3ddcff);
      box-shadow:
        0 0 26px -8px var(--rc, #3ddcff),
        inset 0 1px 0 rgba(255,255,255,.09);
      background:
        linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.04));
    }

    .ac-opt.eq::before{
      opacity:.24;
    }

    .ac-opt.locked{
      opacity:.62;
      filter:grayscale(.35) saturate(.7);
    }

    .ac-opt .e{
      position:relative;
      z-index:1;
      filter:drop-shadow(0 6px 14px rgba(0,0,0,.35));
      transition:transform .18s ease, filter .18s ease;
    }

    .ac-opt:hover .e{
      transform:scale(1.14) rotate(-3deg);
      filter:drop-shadow(0 0 16px rgba(255,255,255,.22));
    }

    .ac-opt.eq .e{
      animation:acctItemFloat 3.4s ease-in-out infinite;
    }

    .ac-opt .n,
    .ac-opt .r,
    .ac-opt .buy{
      position:relative;
      z-index:1;
    }

    .ac-opt .n{
      font-weight:800;
      letter-spacing:.2px;
    }

    .ac-opt .r{
      opacity:.95;
    }

    .ac-opt .buy{
      font-weight:800;
    }

    .ac-st{
      position:relative;
      border-radius:13px;
      border:1px solid rgba(255,255,255,.12);
      background:
        linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
      box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
      transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease, opacity .16s ease;
    }

    .ac-st:hover{
      transform:translateY(-2px) scale(1.03);
      border-color:rgba(255,255,255,.24);
    }

    .ac-st.full{
      border-color:rgba(74,222,128,.55);
      background:
        radial-gradient(120% 120% at 50% 0%, rgba(74,222,128,.22), transparent 52%),
        rgba(9,34,18,.32);
      box-shadow:
        0 0 22px -8px rgba(74,222,128,.7),
        inset 0 1px 0 rgba(255,255,255,.08);
      color:#d1fae5;
    }

    .ac-st.partial{
      opacity:.88;
      color:#cbd5e1;
    }

    .ac-st.scar{
      border-style:dashed;
      border-color:rgba(248,113,113,.58);
      background:
        radial-gradient(120% 120% at 50% 0%, rgba(248,113,113,.20), transparent 54%),
        rgba(54,13,13,.28);
      color:#f87171;
      box-shadow:0 0 20px -10px rgba(248,113,113,.65);
      animation:acctScar 2.8s ease-in-out infinite;
    }

    .ac-st.void{
      opacity:.24;
      filter:saturate(.4);
    }

    .ac-st.empty{
      opacity:.42;
    }

    .ac-btn{
      position:relative;
      overflow:hidden;
      box-shadow:
        0 14px 34px -14px rgba(255,122,26,.75),
        inset 0 1px 0 rgba(255,255,255,.22);
      transition:transform .16s ease, filter .16s ease, box-shadow .16s ease;
    }

    .ac-btn::after{
      content:'';
      position:absolute;
      inset:-40%;
      background:linear-gradient(115deg, transparent 30%, rgba(255,255,255,.22) 50%, transparent 70%);
      transform:translateX(-140%);
      transition:transform .5s ease;
      pointer-events:none;
    }

    .ac-btn:hover{
      transform:translateY(-2px);
      filter:brightness(1.06);
    }

    .ac-btn:hover::after{
      transform:translateX(140%);
    }

    .ac-ritual .ac-card{
      filter:drop-shadow(0 28px 42px rgba(0,0,0,.55));
    }

    .ac-face{
      border:1px solid rgba(255,255,255,.16);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.10),
        0 24px 60px -24px rgba(0,0,0,.88);
    }

    .ac-back .sig{
      filter:drop-shadow(0 0 22px rgba(255,255,255,.35));
    }

    .ac-front .em{
      filter:drop-shadow(0 10px 24px rgba(0,0,0,.45));
    }

    #acct-toast{
      border-radius:14px;
      border:1px solid rgba(255,178,36,.42);
      box-shadow:
        0 16px 40px rgba(0,0,0,.62),
        0 0 28px -12px rgba(255,178,36,.55);
    }

    @keyframes acctRailSheen{
      0%, 64%, 100%{ transform:translateX(-130%); opacity:0; }
      72%{ opacity:.8; }
      86%{ transform:translateX(130%); opacity:0; }
    }

    @keyframes acctPulseSoft{
      0%,100%{ box-shadow:0 0 0 0 rgba(167,139,250,0), inset 0 1px 0 rgba(255,255,255,.08); }
      50%{ box-shadow:0 0 22px 1px rgba(167,139,250,.55), inset 0 1px 0 rgba(255,255,255,.08); }
    }

    @keyframes acctItemFloat{
      0%,100%{ transform:translateY(0) scale(1); }
      50%{ transform:translateY(-2px) scale(1.05); }
    }

    @keyframes acctScar{
      0%,100%{ box-shadow:0 0 20px -10px rgba(248,113,113,.65); }
      50%{ box-shadow:0 0 26px -8px rgba(248,113,113,.85); }
    }

    @media (prefers-reduced-motion: reduce){
      #acct-rail::before,
      .ac-chip::after,
      .ac-opt::after,
      .ac-btn::after,
      .ac-opt.eq .e,
      .ac-st.scar,
      .ac-roll.hot{
        animation:none !important;
        transition:none !important;
      }
    }
  `;

  document.head.appendChild(s);
}

/* ── studio layout css ── */
function injectStudioLayoutCSS(){
  if(document.getElementById('acct-studio-layout-css')) return;

  var s=document.createElement('style');
  s.id='acct-studio-layout-css';
  s.textContent = `
    .ac-box.wide{
      width:min(1160px,96vw);
      max-height:92vh;
      padding:20px;
    }

    .ac-studio-shell{
      display:grid;
      grid-template-columns:minmax(320px,44%) minmax(320px,1fr);
      gap:16px;
      align-items:start;
    }

    .ac-studio-left{
      position:sticky;
      top:0;
    }

    .ac-studio-preview{
      border:1px solid rgba(255,255,255,.12);
      border-radius:18px;
      overflow:hidden;
      background:#0b0d13;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.06),
        0 18px 40px -24px rgba(0,0,0,.8);
    }

    .ac-studio-preview canvas{
      width:100%;
      height:auto;
      display:block;
    }

    .ac-studio-quick{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:8px;
      margin-top:10px;
    }

    .ac-studio-quick #ac-studio-done{
      grid-column:1/-1;
    }

    .ac-studio-btn{
      width:100%;
      padding:12px 14px;
      border-radius:14px;
      border:1px solid rgba(255,255,255,.14);
      background:
        linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.04));
      color:#e2e8f0;
      font:800 12px/1 "Chakra Petch", sans-serif;
      letter-spacing:.3px;
      cursor:pointer;
      transition:
        transform .15s ease,
        border-color .15s ease,
        box-shadow .15s ease,
        filter .15s ease;
    }

    .ac-studio-btn:hover{
      transform:translateY(-1px);
      border-color:rgba(61,220,255,.45);
      box-shadow:0 0 22px -10px rgba(61,220,255,.5);
      filter:brightness(1.05);
    }

    .ac-studio-btn.primary{
      background:linear-gradient(100deg,#ffb224,#ff7a1a);
      color:#171207;
      border:none;
      box-shadow:0 14px 30px -14px rgba(255,122,26,.7);
    }

    .ac-studio-btn.ghost{
      background:rgba(255,255,255,.05);
    }

    .ac-studio-right{
      max-height:68vh;
      overflow:auto;
      padding-right:6px;
    }

    .ac-studio-wallet{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
      margin-bottom:10px;
    }

    .ac-studio-pill{
      display:inline-flex;
      align-items:center;
      gap:7px;
      padding:8px 12px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.05);
      font:700 12px/1 "Chakra Petch", sans-serif;
      color:#cbd5e1;
    }

    .ac-studio-pill b{
      font:800 13px/1 "Space Grotesk", monospace;
      color:#fff;
    }

    .ac-studio-tabs{
      display:flex;
      gap:6px;
      flex-wrap:wrap;
      margin:8px 0 12px;
    }

    .ac-studio-tab{
      padding:9px 12px;
      border-radius:12px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.04);
      color:#9aa3b5;
      font:800 11px/1 "Chakra Petch", sans-serif;
      letter-spacing:.3px;
      cursor:pointer;
      transition:
        transform .14s ease,
        border-color .14s ease,
        background .14s ease,
        color .14s ease,
        box-shadow .14s ease;
    }

    .ac-studio-tab:hover{
      transform:translateY(-1px);
      color:#e2e8f0;
      border-color:rgba(255,255,255,.24);
    }

    .ac-studio-tab.active{
      color:#fff;
      border-color:rgba(61,220,255,.55);
      background:rgba(61,220,255,.12);
      box-shadow:0 0 20px -8px rgba(61,220,255,.55);
    }

    .ac-studio-grid{
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(108px,1fr));
      gap:10px;
    }

    .ac-studio-item{
      position:relative;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:flex-start;
      gap:4px;
      min-height:118px;
      padding:12px 8px 10px;
      border-radius:16px;
      border:1px solid rgba(255,255,255,.12);
      background:
        linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.025));
      color:#fff;
      cursor:pointer;
      text-align:center;
      transition:
        transform .15s ease,
        border-color .15s ease,
        box-shadow .15s ease,
        background .15s ease,
        filter .15s ease;
    }

    .ac-studio-item:hover{
      transform:translateY(-2px);
      border-color:var(--rc,#3ddcff);
      box-shadow:0 16px 30px -18px var(--rc,#3ddcff);
    }

    .ac-studio-item.equipped{
      border-color:var(--rc,#3ddcff);
      box-shadow:
        0 0 26px -8px var(--rc,#3ddcff),
        inset 0 1px 0 rgba(255,255,255,.08);
      background:
        linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.04));
    }

    .ac-studio-item.locked{
      opacity:.68;
      filter:saturate(.75);
    }

    .ac-studio-emoji{
      font-size:26px;
      line-height:1;
      filter:drop-shadow(0 6px 14px rgba(0,0,0,.35));
    }

    .ac-studio-name{
      font:700 11px/1.25 "Chakra Petch", sans-serif;
      color:#fff;
    }

    .ac-studio-rar{
      font:800 8px/1 "Chakra Petch", sans-serif;
      letter-spacing:.8px;
      text-transform:uppercase;
      opacity:.95;
    }

    .ac-studio-state{
      margin-top:auto;
      padding:6px 8px;
      border-radius:999px;
      font:800 9px/1 "Space Grotesk", monospace;
      background:rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.12);
      color:#e2e8f0;
    }

    .ac-studio-item.equipped .ac-studio-state{
      background:rgba(74,222,128,.14);
      border-color:rgba(74,222,128,.4);
      color:#86efac;
    }

    .ac-studio-item.locked .ac-studio-state{
      background:rgba(255,178,36,.12);
      border-color:rgba(255,178,36,.35);
      color:#ffd9a0;
    }

    .ac-studio-item.locked.cant .ac-studio-state{
      background:rgba(248,113,113,.12);
      border-color:rgba(248,113,113,.35);
      color:#fca5a5;
    }

    .ac-studio-empty{
      grid-column:1/-1;
      padding:18px;
      border:1px dashed rgba(255,255,255,.14);
      border-radius:16px;
      color:#9aa3b5;
      text-align:center;
      font:600 12px/1.5 "Chakra Petch", sans-serif;
    }

    .ac-studio-btn:focus-visible,
    .ac-studio-tab:focus-visible,
    .ac-studio-item:focus-visible{
      outline:2px solid #7dd3fc;
      outline-offset:2px;
    }

    @media (max-width:920px){
      .ac-studio-shell{
        grid-template-columns:1fr;
      }

      .ac-studio-left{
        position:relative;
      }

      .ac-studio-right{
        max-height:none;
        overflow:visible;
      }
    }

    @media (prefers-reduced-motion: reduce){
      .ac-studio-btn,
      .ac-studio-tab,
      .ac-studio-item{
        transition:none !important;
      }
    }
  `;

  document.head.appendChild(s);
}

/* ── boot ── */
function boot(){ if(!document.body){ requestAnimationFrame(boot); return; } injectCSS(); injectItemFX(); injectStudioLayoutCSS(); buildRail(); renderRail();saveUnl(); saveEq();
  setInterval(function(){ pollStudy(); tickBoundary(); snapshotToday(); renderRail(); }, 2000);
  document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ [stampModal,pledgeModal,ritualModal,studioModal].forEach(function(m){ if(m) m.classList.remove('open'); }); } });
  snapshotToday();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();