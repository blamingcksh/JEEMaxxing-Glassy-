/* forest-island-juice.js — PREMIUM living layer for the live Daily Grove.
   Upgraded models (real aura glow-shell + ground glow, 3D cross-billboard
   flowers & grass with wind, multi-part structures) and a coastline scatter
   guard (isLand) so nothing ever spawns on the water. Isolated + guarded.
   FIXED aura: soft billboard halo + subtle ground ring, lower opacity,
   smoother breathing, night boost.
   Added scatter and creature support. */
(function () {
'use strict';
if (window.__forestIslandJuiceInit) return; window.__forestIslandJuiceInit = true;

function boot() {
  var api = window.__forestIslandAPI;
  if (!api || !api.THREE || !api.scene || !api.env) { setTimeout(boot, 200); return; }
  try { build(api); console.log('[forest-island-juice] premium ready'); }
  catch (e) { console.warn('[forest-island-juice] skipped:', e && e.message || e); }
}

/* ---------- math / tex helpers ---------- */
function clamp01(v){ return v<0?0:v>1?1:v; }
function rand(a,b){ return a+Math.random()*(b-a); }

function glowTex(T){
  var c=document.createElement('canvas');
  c.width=c.height=128;
  var g=c.getContext('2d');
  var r=g.createRadialGradient(64,64,0,64,64,64);
  r.addColorStop(0,'rgba(255,255,255,1)');
  r.addColorStop(0.22,'rgba(255,255,255,.92)');
  r.addColorStop(0.48,'rgba(255,255,255,.42)');
  r.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=r;
  g.fillRect(0,0,128,128);
  var t=new T.CanvasTexture(c);
  try{t.colorSpace=T.SRGBColorSpace;}catch(e){}
  return t;
}

function flowerTex(T){
  var c=document.createElement('canvas');
  c.width=c.height=128;
  var g=c.getContext('2d');
  g.clearRect(0,0,128,128);
  g.translate(64,64);
  g.shadowColor='rgba(255,180,230,.55)';
  g.shadowBlur=10;
  for(var i=0;i<6;i++){
    g.rotate(Math.PI*2/6);
    g.beginPath();
    g.ellipse(0,-26,12,24,0,0,Math.PI*2);
    g.fillStyle='rgba(255,208,236,.96)';
    g.fill();
    g.beginPath();
    g.ellipse(0,-26,7,16,0,0,Math.PI*2);
    g.fillStyle='rgba(255,122,184,.92)';
    g.fill();
  }
  g.shadowBlur=0;
  g.beginPath();
  g.arc(0,0,11,0,Math.PI*2);
  g.fillStyle='#ffd24a';
  g.fill();
  g.beginPath();
  g.arc(0,0,5,0,Math.PI*2);
  g.fillStyle='#ff9a1a';
  g.fill();
  var t=new T.CanvasTexture(c);
  try{t.colorSpace=T.SRGBColorSpace;}catch(e){}
  return t;
}

function grassTex(T){
  var c=document.createElement('canvas');
  c.width=64;
  c.height=128;
  var g=c.getContext('2d');
  g.clearRect(0,0,64,128);
  function blade(x,lean,w,col,tip){
    g.beginPath();
    g.moveTo(x-w,128);
    g.quadraticCurveTo(x+lean,54,x+lean*1.5,4);
    g.quadraticCurveTo(x+w+lean,54,x+w,128);
    g.closePath();
    var gr=g.createLinearGradient(0,128,0,0);
    gr.addColorStop(0,col);
    gr.addColorStop(1,tip);
    g.fillStyle=gr;
    g.fill();
  }
  blade(12,-8,5,'#256b23','#49c241');
  blade(26,5,6,'#2f8a2c','#69dd57');
  blade(40,-4,5,'#3fa83a','#8bf07a');
  blade(52,7,4,'#2a7a28','#54cf4b');
  var t=new T.CanvasTexture(c);
  try{t.colorSpace=T.SRGBColorSpace;}catch(e){}
  return t;
}

/* ---- NEW: aura texture helpers ---- */
var _auraTex=null,_auraRingTex=null;

function auraTex(T){
  if(_auraTex) return _auraTex;

  var c=document.createElement('canvas');
  c.width=c.height=128;
  var g=c.getContext('2d');

  var r=g.createRadialGradient(64,64,0,64,64,64);
  r.addColorStop(0,'rgba(255,255,255,.95)');
  r.addColorStop(0.28,'rgba(255,255,255,.55)');
  r.addColorStop(0.62,'rgba(255,255,255,.16)');
  r.addColorStop(1,'rgba(255,255,255,0)');

  g.fillStyle=r;
  g.fillRect(0,0,128,128);

  var t=new T.CanvasTexture(c);
  try{t.colorSpace=T.SRGBColorSpace;}catch(e){}
  _auraTex=t;
  return t;
}

function auraRingTex(T){
  if(_auraRingTex) return _auraRingTex;

  var c=document.createElement('canvas');
  c.width=c.height=128;
  var g=c.getContext('2d');
  g.clearRect(0,0,128,128);

  var r=g.createRadialGradient(64,64,0,64,64,64);
  r.addColorStop(0,'rgba(255,255,255,0)');
  r.addColorStop(0.42,'rgba(255,255,255,0)');
  r.addColorStop(0.56,'rgba(255,255,255,.55)');
  r.addColorStop(0.74,'rgba(255,255,255,.18)');
  r.addColorStop(1,'rgba(255,255,255,0)');

  g.fillStyle=r;
  g.fillRect(0,0,128,128);

  var t=new T.CanvasTexture(c);
  try{t.colorSpace=T.SRGBColorSpace;}catch(e){}
  _auraRingTex=t;
  return t;
}
/* ---------------------------------------- */

function merge(T,list){ list=list.map(function(g){return g.index?g.toNonIndexed():g;}); var n=0; list.forEach(function(g){n+=g.attributes.position.count;}); var pos=new Float32Array(n*3),nor=new Float32Array(n*3),uv=new Float32Array(n*2),o=0,ou=0; list.forEach(function(g){var c=g.attributes.position.count; pos.set(g.attributes.position.array,o*3); if(g.attributes.normal) nor.set(g.attributes.normal.array,o*3); if(g.attributes.uv) uv.set(g.attributes.uv.array,ou*2); o+=c; ou+=c;}); var g=new T.BufferGeometry(); g.setAttribute('position',new T.BufferAttribute(pos,3)); g.setAttribute('normal',new T.BufferAttribute(nor,3)); g.setAttribute('uv',new T.BufferAttribute(uv,2)); return g; }
function crossGeo(T,w,h,yo){ var p1=new T.PlaneGeometry(w,h); p1.translate(0,yo+h/2,0); var p2=new T.PlaneGeometry(w,h); p2.rotateY(Math.PI/2); p2.translate(0,yo+h/2,0); return merge(T,[p1,p2]); }
function windify(mat){ mat.onBeforeCompile=function(sh){ sh.uniforms.uTime={value:0}; sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace('#include <begin_vertex>',"#include <begin_vertex>\n float wy=max(transformed.y,0.0);\n float wph=instanceMatrix[3][0]*0.5+instanceMatrix[3][2]*0.5;\n transformed.x+=sin(uTime*1.4+wph)*wy*0.22;\n transformed.z+=cos(uTime*1.1+wph*1.3)*wy*0.16;"); mat.userData.shader=sh; }; }

/* the scatter guard: only true on real land, above the waterline, inside the coast */
function isLand(x,z,hAt,cR,wY){ var r=Math.hypot(x,z); if(r>cR(Math.atan2(z,x))-1.3) return false; var h=hAt(x,z); return h>wY+0.30; }

/* ---------- main build ---------- */
function build(api){
  var T=api.THREE, scene=api.scene, hAt=api.heightAt, cR=api.coastR, WY=-0.2;
  var sprite=glowTex(T), fTex=flowerTex(T), gTex=grassTex(T);
  var _d=new T.Object3D(), warm=new T.Color(0xffb066);
  var windMats=[], structRefs=[];

  try{ if(api.renderer){ api.renderer.toneMapping=T.ACESFilmicToneMapping; api.renderer.toneMappingExposure=1.06; api.renderer.outputColorSpace=T.SRGBColorSpace; } }catch(e){}
  try{ if(!scene.fog) scene.fog=new T.FogExp2(0x0b1020,0.006); }catch(e){}
  try{ var rim=new T.DirectionalLight(0x66ccff,0.22); rim.position.set(-18,16,-20); scene.add(rim); var fill=new T.DirectionalLight(0xffe6c4,0.14); fill.position.set(14,8,-12); scene.add(fill); }catch(e){}

  var root=new T.Group(); scene.add(root);

  function nightFactor(){ var d=new Date(); var t=(d.getHours()+d.getMinutes()/60)/24; return clamp01(Math.abs(t-0.5)*2); }
  function subjectColor(k){ return (api.SUBJECTS&&api.SUBJECTS[k])?api.SUBJECTS[k].color:new T.Color(0xffffff); }
  function streakDays(){ var el=document.getElementById('top-streak'); if(!el) return 0; var m=(el.textContent||'').match(/(\d+)/); return m?(parseInt(m[1],10)||0):0; }

  // cfg helper
  function cfg(){
    try{
      var o=JSON.parse(localStorage.getItem('jeemax_island_cosmetics_v1')||'null');
      var c=(o && o.equipped) ? o.equipped : o;

      c = c || {
        aura:'none',
        scatter:'meadow',
        particles:'pollen',
        structure:'campfire',
        creature:'cnone',
        tint:'natural'
      };

      if(o && o.mood) c.mood = o.mood;

      return c;
    }catch(e){
      return {
        aura:'none',
        scatter:'meadow',
        particles:'pollen',
        structure:'campfire',
        creature:'cnone',
        tint:'natural'
      };
    }
  }

  var AURACOL={verdant:'#39d98a',cyan:'#4cc9ff',gold:'#ffd24a',blossom:'#ff7ab8',violet:'#a78bfa',ember:'#ff7a1a',frost:'#9fe8ff'};
  var TINT={natural:{w:0x23a7d6,fog:0x0b1020},golden:{w:0x3a6a7a,fog:0x20180e},moon:{w:0x1a3a5a,fog:0x0a1024},ember2:{w:0x5a2a1a,fog:0x1a0e08},frost2:{w:0x4a7a9a,fog:0x101824}};

  // all trees helper (placed early so buildCosmetics can use it)
  function allTrees(){
    var out=[];
    for(var k in api.trees){
      if(Object.prototype.hasOwnProperty.call(api.trees,k)) out=out.concat(api.trees[k]);
    }
    return out;
  }

  /* ----- material helpers for ultra structures ----- */
  function stdMat(color){
    return new T.MeshStandardMaterial({color:color,roughness:1,flatShading:true});
  }
  function glowMat(color,op){
    return new T.MeshBasicMaterial({
      color:color,
      transparent:true,
      opacity:op,
      blending:T.AdditiveBlending,
      depthWrite:false
    });
  }
  function basicMat(color,op){
    return new T.MeshBasicMaterial({
      color:color,
      transparent:true,
      opacity:op,
      depthWrite:false
    });
  }
  function glowDisc(color,r,op,y){
    var m=new T.Mesh(
      new T.CircleGeometry(r,24),
      glowMat(color,op)
    );
    m.rotation.x=-Math.PI/2;
    m.position.y=y==null?0.05:y;
    return m;
  }

  /* ----- ultra structure builders ----- */
  function buildCampUltra(){
    var g=new T.Group();
    var stoneM=stdMat(0x6b6f78);
    for(var i=0;i<10;i++){
      var a=i/10*6.283;
      var s=new T.Mesh(new T.IcosahedronGeometry(rand(.12,.22),0),stoneM);
      s.position.set(Math.cos(a)*rand(.52,.68),rand(.03,.10),Math.sin(a)*rand(.52,.68));
      s.rotation.set(rand(0,3),rand(0,3),rand(0,3));
      g.add(s);
    }
    var logM=stdMat(0x5a3a22);
    for(var k=0;k<3;k++){
      var lg=new T.CylinderGeometry(.05,.07,.82,6);
      lg.rotateZ(Math.PI/2);
      var l=new T.Mesh(lg,logM);
      l.rotation.y=k*1.05;
      l.position.y=.08+k*.02;
      g.add(l);
    }
    var f1=new T.Mesh(new T.ConeGeometry(.20,.72,7),glowMat(0xff7a1a,.90));
    f1.position.y=.44;
    g.add(f1);
    var f2=new T.Mesh(new T.ConeGeometry(.12,.50,7),glowMat(0xffd24a,.95));
    f2.position.y=.52;
    g.add(f2);
    g.add(glowDisc(0xff8a3c,.95,.42,.05));
    var L=new T.PointLight(0xff8a3c,0,18,2);
    L.position.y=.85;
    g.add(L);
    g.userData={flame:f1,flame2:f2,light:L};
    return g;
  }

  function buildLanternUltra(color,spirit){
    var g=new T.Group();
    var post=new T.Mesh(
      new T.CylinderGeometry(.035,.05,spirit?0.72:0.95,6),
      stdMat(0x2a1c12)
    );
    post.position.y=spirit?0.36:0.47;
    g.add(post);
    var lamp=new T.Mesh(
      new T.OctahedronGeometry(.13,0),
      glowMat(color,.92)
    );
    lamp.position.y=spirit?0.82:0.95;
    g.add(lamp);
    g.add(glowDisc(color,.45,.30,.04));
    var L=new T.PointLight(color,0,9,2);
    L.position.y=lamp.position.y;
    g.add(L);
    g.userData={light:L,body:lamp};
    if(spirit){
      g.userData.bob=lamp;
      g.userData.bobBase=lamp.position.y;
    }
    return g;
  }

  function buildWellUltra(){
    var g=new T.Group();
    var base=new T.Mesh(new T.CylinderGeometry(.42,.48,.4,12),stdMat(0x7a7f88));
    base.position.y=.2;
    g.add(base);
    var water=new T.Mesh(new T.CircleGeometry(.34,16),basicMat(0x2a6a8a,.82));
    water.rotation.x=-Math.PI/2;
    water.position.y=.38;
    g.add(water);
    var pm=stdMat(0x3a2616);
    for(var s=-1;s<=1;s+=2){
      var p=new T.Mesh(new T.CylinderGeometry(.035,.04,.9,6),pm);
      p.position.set(s*.4,.7,0);
      g.add(p);
    }
    var roof=new T.Mesh(new T.ConeGeometry(.62,.34,4),stdMat(0x6a3a26));
    roof.rotation.y=Math.PI/4;
    roof.position.y=1.3;
    g.add(roof);
    g.add(glowDisc(0x66ccff,.55,.20,.05));
    var L=new T.PointLight(0x66ccff,0,8,2);
    L.position.y=.75;
    g.add(L);
    g.userData={light:L,body:water};
    return g;
  }

  function buildShrineUltra(){
    var g=new T.Group();
    var st=stdMat(0xc0c4cc);
    var step1=new T.Mesh(new T.BoxGeometry(1.1,.12,.7),st);
    step1.position.y=.06;
    g.add(step1);
    var step2=new T.Mesh(new T.BoxGeometry(.9,.12,.55),st);
    step2.position.y=.18;
    g.add(step2);
    var pm=stdMat(0xb03030);
    for(var s=-1;s<=1;s+=2){
      var p=new T.Mesh(new T.CylinderGeometry(.06,.07,1.1,8),pm);
      p.position.set(s*.42,.78,0);
      g.add(p);
    }
    var top=new T.Mesh(new T.BoxGeometry(1.15,.1,.16),pm);
    top.position.y=1.34;
    g.add(top);
    var orb=new T.Mesh(new T.IcosahedronGeometry(.13,1),glowMat(0x9fffcf,.9));
    orb.position.y=.88;
    g.add(orb);
    g.add(glowDisc(0x9fffcf,.70,.24,.05));
    var L=new T.PointLight(0x9fffcf,0,9,2);
    L.position.y=.9;
    g.add(L);
    g.userData={light:L,orb:orb,bob:orb,bobBase:.88};
    return g;
  }

  function buildToriiUltra(){
    var g=new T.Group();
    var red=stdMat(0xb03030);
    for(var s=-1;s<=1;s+=2){
      var p=new T.Mesh(new T.CylinderGeometry(.09,.11,2.2,8),red);
      p.position.set(s*.8,1.1,0);
      g.add(p);
    }
    var top=new T.Mesh(new T.BoxGeometry(2.2,.16,.3),red);
    top.position.y=2.2;
    g.add(top);
    var beam=new T.Mesh(new T.BoxGeometry(1.8,.1,.18),red);
    beam.position.y=1.8;
    g.add(beam);
    var lantern=new T.Mesh(new T.OctahedronGeometry(.10,0),glowMat(0xffb24a,.92));
    lantern.position.y=1.55;
    g.add(lantern);
    g.add(glowDisc(0xff6a4a,.75,.22,.05));
    var L=new T.PointLight(0xffb24a,0,10,2);
    L.position.y=1.55;
    g.add(L);
    g.userData={light:L,body:lantern,bob:lantern,bobBase:1.55};
    return g;
  }

  function buildKoistonesUltra(){
    var g=new T.Group();
    var stoneM=stdMat(0x8a8f98);
    for(var i=0;i<8;i++){
      var a=i/8*6.283;
      var s=new T.Mesh(new T.IcosahedronGeometry(rand(.14,.26),0),stoneM);
      s.position.set(Math.cos(a)*rand(.42,.62),rand(.04,.14),Math.sin(a)*rand(.42,.62));
      s.rotation.set(rand(0,3),rand(0,3),rand(0,3));
      g.add(s);
    }
    var water=new T.Mesh(new T.CircleGeometry(.48,20),basicMat(0x1a5a7a,.78));
    water.rotation.x=-Math.PI/2;
    water.position.y=.16;
    g.add(water);
    var koi=new T.Group();
    for(var k=0;k<3;k++){
      var a=k/3*6.283;
      var m=new T.Mesh(new T.SphereGeometry(.06,6,5),glowMat(0xff7a3c,.9));
      m.position.set(Math.cos(a)*.28,.18,Math.sin(a)*.28);
      koi.add(m);
    }
    g.add(koi);
    g.add(glowDisc(0x4cc9ff,.62,.22,.05));
    var L=new T.PointLight(0xff9a4a,0,7,2);
    L.position.y=.45;
    g.add(L);
    g.userData={light:L,body:water,orb:koi,spin:koi};
    return g;
  }

  function buildArchUltra(){
    var g=new T.Group();
    var stoneM=stdMat(0xc0c4cc);
    for(var s=-1;s<=1;s+=2){
      var p=new T.Mesh(new T.CylinderGeometry(.10,.12,1.45,8),stoneM);
      p.position.set(s*.85,.72,0);
      g.add(p);
    }
    var arc=new T.Mesh(
      new T.TorusGeometry(.95,.10,8,24,Math.PI),
      stdMat(0xd0d6e0)
    );
    arc.position.y=1.45;
    g.add(arc);
    var moon=new T.Mesh(new T.IcosahedronGeometry(.16,1),glowMat(0xe8f6ff,.95));
    moon.position.y=1.45;
    g.add(moon);
    g.add(glowDisc(0xa5ecff,.75,.22,.05));
    var L=new T.PointLight(0xa5ecff,0,10,2);
    L.position.y=1.5;
    g.add(L);
    g.userData={light:L,orb:moon,bob:moon,bobBase:1.45};
    return g;
  }

  function buildFountainUltra(){
    var g=new T.Group();
    var base=new T.Mesh(new T.CylinderGeometry(.62,.70,.32,14),stdMat(0x7a7f88));
    base.position.y=.16;
    g.add(base);
    var pool=new T.Mesh(new T.CircleGeometry(.55,22),basicMat(0x2a6a8a,.82));
    pool.rotation.x=-Math.PI/2;
    pool.position.y=.30;
    g.add(pool);
    var pillar=new T.Mesh(new T.CylinderGeometry(.08,.12,.75,8),stdMat(0x9aa3b5));
    pillar.position.y=.62;
    g.add(pillar);
    var orb=new T.Mesh(new T.IcosahedronGeometry(.12,1),glowMat(0x7af0ff,.9));
    orb.position.y=.95;
    g.add(orb);
    g.add(glowDisc(0x7af0ff,.70,.24,.05));
    var L=new T.PointLight(0x7af0ff,0,10,2);
    L.position.y=.95;
    g.add(L);
    g.userData={light:L,body:pool,orb:orb,bob:orb,bobBase:.95};
    return g;
  }

  function buildObservatoryUltra(){
    var g=new T.Group();
    var base=new T.Mesh(new T.CylinderGeometry(.55,.65,.5,12),stdMat(0x5a6068));
    base.position.y=.25;
    g.add(base);
    var dome=new T.Mesh(
      new T.SphereGeometry(.48,12,8,0,Math.PI*2,0,Math.PI/2),
      stdMat(0x8a93a8)
    );
    dome.position.y=.5;
    g.add(dome);
    var slit=new T.Mesh(new T.BoxGeometry(.12,.5,.06),stdMat(0x20242c));
    slit.position.set(0,.22,.42);
    dome.add(slit);
    var orb=new T.Mesh(new T.IcosahedronGeometry(.10,1),glowMat(0xb388ff,.95));
    orb.position.y=.62;
    g.add(orb);
    g.add(glowDisc(0xb388ff,.70,.22,.05));
    var L=new T.PointLight(0xb388ff,0,10,2);
    L.position.y=.75;
    g.add(L);
    g.userData={light:L,orb:orb,spin:dome,bob:orb,bobBase:.62};
    return g;
  }

  function buildStructureUltra(kind){
    if(kind==='campfire') return buildCampUltra();
    if(kind==='lanterns') return buildLanternUltra(0xffd24a,false);
    if(kind==='well') return buildWellUltra();
    if(kind==='shrine') return buildShrineUltra();
    if(kind==='torii') return buildToriiUltra();
    if(kind==='koistones') return buildKoistonesUltra();
    if(kind==='arch') return buildArchUltra();
    if(kind==='fountain') return buildFountainUltra();
    if(kind==='observatory') return buildObservatoryUltra();
    if(kind==='spiritlamps') return buildLanternUltra(0x9fffcf,true);
    return buildCampUltra();
  }

  /* ----- structure spot finder ----- */
  var SMETA = {
    campfire:    {n:1, rad:2.6, band:[2.5, 5]},
    lanterns:    {n:4, rad:1.8, band:[2, 5]},
    spiritlamps: {n:4, rad:1.8, band:[2, 5]},
    well:        {n:1, rad:2.4, band:[2.5,5]},
    fountain:    {n:1, rad:2.4, band:[2.5,5]},
    koistones:   {n:1, rad:2.4, band:[2.5,5]},
    shrine:      {n:1, rad:2.7, band:[2.5,5.5]},
    torii:       {n:1, rad:2.7, band:[2.5,5.5]},
    arch:        {n:1, rad:2.7, band:[2.5,5.5]},
    observatory: {n:1, rad:2.7, band:[2.5,5.5]}
  };

  function slopeOK(x,z,max){
    var hx=hAt(x+0.45,z)-hAt(x-0.45,z);
    var hz=hAt(x,z+0.45)-hAt(x,z-0.45);
    return Math.hypot(hx,hz)<=max;
  }

  function structClear(x,z,rad,out){
    var trees=allTrees();
    for(var i=0;i<trees.length;i++){
      var dx=trees[i].x-x, dz=trees[i].z-z;
      if(dx*dx+dz*dz < rad*rad) return false;
    }
    for(var j=0;j<out.length;j++){
      var ox=out[j].x-x, oz=out[j].z-z;
      if(ox*ox+oz*oz < 2.2*2.2) return false;
    }
    return true;
  }

  function findStructSpots(smeta){
    var spots=api.drySpots||[];
    var out=[];

    for(var pass=0; pass<3 && out.length<smeta.n; pass++){
      var radMul=pass===0?1:pass===1?0.82:0.64;
      var maxSlope=pass===0?0.65:pass===1?0.95:1.45;
      var treeRad=smeta.rad*radMul;

      for(var a=0; a<6.283 && out.length<smeta.n; a+=0.37){
        for(var r=smeta.band[0]; r<=smeta.band[1] && out.length<smeta.n; r+=0.75){
          var ang=a+out.length*0.65;
          var x=Math.cos(ang)*r, z=Math.sin(ang)*r;

          if(!isLand(x,z,hAt,cR,WY)) continue;

          var y=hAt(x,z);
          if(y<WY+0.35) continue;
          if(!slopeOK(x,z,maxSlope)) continue;
          if(!structClear(x,z,treeRad,out)) continue;

          out.push({x:x,y:y,z:z,rot:ang+Math.PI/2});
        }
      }
    }

    if(out.length<smeta.n && spots.length){
      var cand=spots.filter(function(s){
        var d=Math.hypot(s.x,s.z);
        return d>=smeta.band[0]*0.65 && d<=smeta.band[1]*1.25 && isLand(s.x,s.z,hAt,cR,WY);
      });

      cand.sort(function(a,b){
        return Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z);
      });

      var step=Math.max(1,Math.floor(cand.length/Math.max(1,smeta.n)));

      for(var i=0; i<cand.length && out.length<smeta.n; i+=step){
        out.push({x:cand[i].x,y:cand[i].y,z:cand[i].z,rot:rand(0,6.28)});
      }
    }

    while(out.length<smeta.n){
      var idx=out.length;
      var ang=idx*2.39996;
      var rr=Math.max(smeta.band[0], Math.min(smeta.band[1], 3.1+idx*0.8));
      var x=Math.cos(ang)*rr, z=Math.sin(ang)*rr;
      var y=hAt(x,z);
      if(y<WY+0.25) y=0.45;
      out.push({x:x,y:y,z:z,rot:ang});
    }

    return out;
  }

  /* ----- cosmetics controller ----- */
  var cos={};
  function clearCos(){
    while(root.children.length){
      var ch=root.children[0];
      root.remove(ch);
      ch.traverse(function(o){
        if(o.geometry)o.geometry.dispose();
        if(o.material){
          if(Array.isArray(o.material))o.material.forEach(function(m){m.dispose();});
          else o.material.dispose();
        }
      });
    }
    windMats.length=0;
    structRefs.length=0;
    cos={};
  }

  function buildCosmetics(c){
    clearCos();

    var tn=TINT[c.tint]||TINT.natural;

    function hex(n){
      return '#' + ('000000' + n.toString(16)).slice(-6);
    }

    var mood=c.mood || null;

    /* base water + fog */
    try{
      if(api.env.water) api.env.water.material.color.set(mood ? mood.water : hex(tn.w));
    }catch(e){}

    try{
      if(scene.fog) scene.fog.color.set(mood ? mood.fog : hex(tn.fog));
    }catch(e){}

    /* store mood for frame lerping */
    if(mood){
      cos.mood={
        skyTop:new T.Color(mood.skyTop),
        skyBot:new T.Color(mood.skyBot),
        fog:new T.Color(mood.fog),
        water:new T.Color(mood.water),
        sun:new T.Color(mood.sun),
        hemi:new T.Color(mood.hemi),
        exposure:+mood.exposure || 1.10
      };
    }else{
      cos.mood=null;
    }

    var spots=api.drySpots||[];

    /* ── ground scatter ── */
    var SCATTER={
      meadow:{colors:['#4cc9ff','#39d98a','#ffb224','#ff7ab8','#fff3b0'],n:150,size:.16,glow:false},
      leaves:{colors:['#ff9a3c','#e0532a','#ffd24a'],n:140,size:.18,glow:false},
      mushroom:{colors:['#ff5e7e','#7af0c0','#ffd24a'],n:90,size:.22,glow:true},
      snow:{colors:['#ffffff','#cfe8ff'],n:160,size:.20,glow:false},
      crystal:{colors:['#7af0ff','#b388ff','#9fffcf'],n:70,size:.26,glow:true},
      cinder:{colors:['#ff7a1a','#ffd24a'],n:120,size:.18,glow:true}
    };

    try{
      var sc=SCATTER[c.scatter]||SCATTER.meadow;
      var SN=Math.min(sc.n, Math.max(40, spots.length*2));
      var sp=new Float32Array(SN*3), scol=new Float32Array(SN*3), scn=0;

      for(var si=0; si<spots.length*4 && scn<SN; si++){
        var ss=spots[si%spots.length];
        var sx=ss.x+rand(-.55,.55), sz=ss.z+rand(-.55,.55);

        if(!isLand(sx,sz,hAt,cR,WY)) continue;

        var sy=hAt(sx,sz)+0.07;
        var scc=new T.Color(sc.colors[(Math.random()*sc.colors.length)|0]);

        sp[scn*3]=sx;
        sp[scn*3+1]=sy;
        sp[scn*3+2]=sz;

        scol[scn*3]=scc.r;
        scol[scn*3+1]=scc.g;
        scol[scn*3+2]=scc.b;

        scn++;
      }

      if(scn>0){
        var sg=new T.BufferGeometry();
        sg.setAttribute('position', new T.BufferAttribute(sp,3));
        sg.setAttribute('color', new T.BufferAttribute(scol,3));

        var sm=new T.PointsMaterial({
          size:sc.size,
          map:sprite,
          transparent:true,
          opacity:sc.glow?0.82:0.58,
          depthWrite:false,
          blending:T.AdditiveBlending,
          vertexColors:true,
          sizeAttenuation:true
        });

        var spts=new T.Points(sg,sm);
        spts.frustumCulled=false;
        root.add(spts);

        cos.scatter={mat:sm,base:sc.glow?0.82:0.58};
      }
    }catch(e){}

    /* ── meadow flowers only ── */
    try{
      if(c.scatter==='meadow'){
        var FN=Math.min(80,spots.length), fg=crossGeo(T,.42,.42,0);
        var fm=new T.MeshStandardMaterial({map:fTex,alphaTest:.5,side:T.DoubleSide,roughness:.7});
        windify(fm);
        windMats.push(fm);

        var fIM=new T.InstancedMesh(fg,fm,FN);
        fIM.frustumCulled=false;
        var fn=0;

        for(var i=0;i<spots.length && fn<FN;i++){
          var s=spots[i];
          if(!isLand(s.x,s.z,hAt,cR,WY)) continue;

          var fsc=rand(.7,1.2);
          _d.position.set(s.x+rand(-.3,.3),s.y,s.z+rand(-.3,.3));
          _d.rotation.set(0,rand(0,6.28),0);
          _d.scale.set(fsc,fsc,fsc);
          _d.updateMatrix();

          fIM.setMatrixAt(fn++,_d.matrix);
        }

        fIM.count=fn;
        fIM.instanceMatrix.needsUpdate=true;
        root.add(fIM);
      }
    }catch(e){}

    /* ── sky particles / FX ── */
    var PARTS={
      pollen:{beh:'drift',col:['#ffe9a3','#d9ffd0','#bff7ff'],n:46},
      petals:{beh:'fall',col:['#ff7ab8','#ffd0e6','#fff0f8'],n:64},
      snowp:{beh:'fall',col:['#ffffff','#cfe8ff','#eaffff'],n:74},
      embers:{beh:'rise',col:['#ff7a1a','#ffd24a','#fff3b0'],n:52},
      flies:{beh:'blink',col:['#fff3b0','#9fffcf','#d9fff0'],n:38}
    };

    try{
      var pa=PARTS[c.particles]||PARTS.pollen;
      var PN=pa.n;
      var pp=new Float32Array(PN*3), pc=new Float32Array(PN*3);

      cos.pBase=[];

      for(var pi=0;pi<PN;pi++){
        var x=rand(-8,8), z=rand(-8,8), y=rand(.4,5);

        cos.pBase.push({
          x:x,
          y:y,
          z:z,
          ph:rand(0,6.28),
          sp:rand(.3,.9)
        });

        var col=new T.Color(pa.col[(Math.random()*pa.col.length)|0]);

        pp[pi*3]=x;
        pp[pi*3+1]=y;
        pp[pi*3+2]=z;

        pc[pi*3]=col.r;
        pc[pi*3+1]=col.g;
        pc[pi*3+2]=col.b;
      }

      var pg=new T.BufferGeometry();
      pg.setAttribute('position', new T.BufferAttribute(pp,3));
      pg.setAttribute('color', new T.BufferAttribute(pc,3));

      var pm=new T.PointsMaterial({
        size:.14,
        map:sprite,
        transparent:true,
        opacity:.85,
        depthWrite:false,
        blending:T.AdditiveBlending,
        vertexColors:true,
        sizeAttenuation:true
      });

      var ppts=new T.Points(pg,pm);
      ppts.frustumCulled=false;
      root.add(ppts);

      cos.parts={mat:pm,beh:pa.beh};
    }catch(e){}

    /* ── life / creatures ── */
    var CREATURES={
      cnone:null,
      none:null,
      koi:{n:6,size:.18,color:'#ff7a3c',beh:'koi'},
      birds:{n:5,size:.22,color:'#cfe8ff',beh:'bird'},
      butterfly:{n:9,size:.16,color:'#ff7ab8',beh:'fly'},
      fox:{n:3,size:.20,color:'#ff9a4a',beh:'fox'}
    };

    try{
      var cr=CREATURES[c.creature]||null;

      if(cr){
        var CN=cr.n;
        var cp=new Float32Array(CN*3), cc=new Float32Array(CN*3);
        var ccol=new T.Color(cr.color);

        for(var ci=0; ci<CN; ci++){
          cc[ci*3]=ccol.r;
          cc[ci*3+1]=ccol.g;
          cc[ci*3+2]=ccol.b;
        }

        var cg=new T.BufferGeometry();
        cg.setAttribute('position', new T.BufferAttribute(cp,3));
        cg.setAttribute('color', new T.BufferAttribute(cc,3));

        var cm=new T.PointsMaterial({
          size:cr.size,
          map:sprite,
          transparent:true,
          opacity:.92,
          depthWrite:false,
          blending:T.AdditiveBlending,
          vertexColors:true,
          sizeAttenuation:true
        });

        var cpts=new T.Points(cg,cm);
        cpts.frustumCulled=false;
        root.add(cpts);

        cos.creature={geo:cg,mat:cm,beh:cr.beh,n:CN};
      }
    }catch(e){}

    /* ── soft aura ── */
    try{
      var ac=AURACOL[c.aura];

      if(ac){
        var canopyG=crossGeo(T,1,1,-0.5);

        var canopyM=new T.MeshBasicMaterial({
          map:sprite,
          color:ac,
          transparent:true,
          opacity:.16,
          blending:T.AdditiveBlending,
          depthWrite:false,
          side:T.DoubleSide
        });

        cos.auraShell=new T.InstancedMesh(canopyG,canopyM,800);
        cos.auraShell.frustumCulled=false;
        cos.auraShell.count=0;
        root.add(cos.auraShell);
        cos.auraShellMat=canopyM;

        var gndG=new T.CircleGeometry(1,32);
        gndG.rotateX(-Math.PI/2);

        var gndM=new T.MeshBasicMaterial({
          map:sprite,
          color:ac,
          transparent:true,
          opacity:.14,
          blending:T.AdditiveBlending,
          depthWrite:false,
          side:T.DoubleSide
        });

        cos.auraGround=new T.InstancedMesh(gndG,gndM,800);
        cos.auraGround.frustumCulled=false;
        cos.auraGround.count=0;
        root.add(cos.auraGround);
        cos.auraGroundMat=gndM;
      }
    }catch(e){}

    /* ── structures (ultra) ── */
    try{
      var smeta=SMETA[c.structure]||SMETA.campfire;
      var sspots=findStructSpots(smeta);

      for(var si=0; si<sspots.length; si++){
        var sg=buildStructureUltra(c.structure);
        if(!sg) continue;

        sg.position.set(sspots[si].x, hAt(sspots[si].x,sspots[si].z), sspots[si].z);
        sg.rotation.y=sspots[si].rot||rand(0,6.28);

        root.add(sg);

        if(sg.userData && (
          sg.userData.light ||
          sg.userData.flame ||
          sg.userData.flame2 ||
          sg.userData.body ||
          sg.userData.orb ||
          sg.userData.spin ||
          sg.userData.bob
        )){
          structRefs.push(sg.userData);
        }
      }
    }catch(e){}
  }

  // initial build + storage listener
  buildCosmetics(cfg());
  window.addEventListener('storage',function(e){
    if(!e.key||e.key==='jeemax_island_cosmetics_v1') buildCosmetics(cfg());
  });

  /* ---------- transient fx (burst / wave / halo) ---------- */
  var burst={pool:420,pos:new Float32Array(420*3),col:new Float32Array(420*3),life:new Float32Array(420),max:new Float32Array(420),vx:new Float32Array(420),vy:new Float32Array(420),vz:new Float32Array(420),br:new Float32Array(420),bg:new Float32Array(420),bb:new Float32Array(420),free:0,queue:[]};
  for(var bi=0;bi<burst.pool;bi++) burst.pos[bi*3+1]=-9999;
  var bG=new T.BufferGeometry(); bG.setAttribute('position',new T.BufferAttribute(burst.pos,3)); bG.setAttribute('color',new T.BufferAttribute(burst.col,3));
  var bM=new T.PointsMaterial({size:.5,map:sprite,transparent:true,depthWrite:false,blending:T.AdditiveBlending,vertexColors:true,sizeAttenuation:true});
  var bP=new T.Points(bG,bM); bP.frustumCulled=false; scene.add(bP);
  function enq(x,y,z,r,g,b,n){ for(var k=0;k<n;k++) burst.queue.push([x,y,z,r,g,b]); if(burst.queue.length>2000) burst.queue.splice(0,burst.queue.length-2000); }
  function updBurst(dt){ var take=Math.min(burst.queue.length,28); for(var k=0;k<take;k++){ var p=burst.queue.shift(),i=-1; for(var q=0;q<burst.pool;q++){ var ii=(burst.free+q)%burst.pool; if(burst.life[ii]<=0){burst.free=(ii+1)%burst.pool;i=ii;break;} } if(i<0)break; burst.pos[i*3]=p[0]+rand(-.12,.12); burst.pos[i*3+1]=p[1]+rand(0,.35); burst.pos[i*3+2]=p[2]+rand(-.12,.12); var a=Math.random()*6.283,sp=rand(1.1,2.2); burst.vx[i]=Math.cos(a)*sp; burst.vz[i]=Math.sin(a)*sp; burst.vy[i]=rand(1.4,3); burst.life[i]=rand(.65,1.1); burst.max[i]=burst.life[i]; burst.br[i]=p[3]; burst.bg[i]=p[4]; burst.bb[i]=p[5]; } var any=false; for(var i=0;i<burst.pool;i++){ if(burst.life[i]<=0)continue; any=true; burst.life[i]-=dt; if(burst.life[i]<=0){burst.pos[i*3+1]=-9999;burst.col[i*3]=burst.col[i*3+1]=burst.col[i*3+2]=0;continue;} burst.vy[i]-=1.7*dt; burst.pos[i*3]+=burst.vx[i]*dt; burst.pos[i*3+1]+=burst.vy[i]*dt; burst.pos[i*3+2]+=burst.vz[i]*dt; var f=burst.life[i]/burst.max[i]; burst.col[i*3]=burst.br[i]*f; burst.col[i*3+1]=burst.bg[i]*f; burst.col[i*3+2]=burst.bb[i]*f; } if(any||burst.queue.length){ bG.attributes.position.needsUpdate=true; bG.attributes.color.needsUpdate=true; } }
  var waves=[];
  function shock(x,y,z,color){ try{ var g=new T.RingGeometry(.18,.42,28); g.rotateX(-Math.PI/2); var m=new T.MeshBasicMaterial({color:color,transparent:true,opacity:.75,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}); var mesh=new T.Mesh(g,m); mesh.position.set(x,y+.12,z); scene.add(mesh); waves.push({mesh:mesh,geo:g,mat:m,t0:performance.now()}); }catch(e){} }
  function updWaves(){ var now=performance.now(); for(var i=waves.length-1;i>=0;i--){ var w=waves[i],p=(now-w.t0)/650; if(p>=1){scene.remove(w.mesh);w.geo.dispose();w.mat.dispose();waves.splice(i,1);} else { var s=1+p*5.5; w.mesh.scale.set(s,1,s); w.mat.opacity=.75*(1-p); } } }
  var haloG=new T.CircleGeometry(1,24); haloG.rotateX(-Math.PI/2);
  var haloM=new T.MeshBasicMaterial({color:0xffd98a,transparent:true,opacity:.22,depthWrite:false,blending:T.AdditiveBlending});
  var haloIM=new T.InstancedMesh(haloG,haloM,18); haloIM.frustumCulled=false; haloIM.count=0; scene.add(haloIM);
  var recent=[];
  function updHalo(el){ var now=Date.now(),n=0; for(var i=0;i<recent.length&&n<18;i++){ var t=recent[i]; if(!t||!t.subject||!api.trees[t.subject])continue; if(now-(t.plantedAt||0)>14000)continue; if((t.cur||0)<.2)continue; var pulse=1+.12*Math.sin(el*3+i), r=(t.oak?1.9:1.15)*Math.max(.25,t.cur||0)*pulse; _d.position.set(t.x,(t.y||0)+.09,t.z); _d.rotation.set(0,0,0); _d.scale.set(r,1,r); _d.updateMatrix(); haloIM.setMatrixAt(n++,_d.matrix); } haloIM.count=n; haloIM.instanceMatrix.needsUpdate=true; haloM.opacity=.16+.10*Math.sin(el*2.4); }

  /* ---------- hooks ---------- */
  api.onPlanted.push(function(t,interactive){ if(!interactive)return; recent.push(t); if(recent.length>18)recent.shift(); var c=subjectColor(t.subject||'physics'); enq(t.x,api.topY(t),t.z,c.r,c.g,c.b,t.oak?26:16); shock(t.x,t.y,t.z,c); });

  var lastStreak=-10, streak=0;
  api.onFrame.push(function(el,dt){
    try{
      var night=nightFactor();
      if(cos.mood){
        var m=cos.mood;
        var k=Math.min(1, dt*2.0);

        if(api.env.sun) api.env.sun.color.lerp(m.sun,k);
        if(api.env.hemi) api.env.hemi.color.lerp(m.hemi,k);
        if(api.env.skyTop) api.env.skyTop.lerp(m.skyTop,k);
        if(api.env.skyBot) api.env.skyBot.lerp(m.skyBot,k);
        if(scene.fog) scene.fog.color.lerp(m.fog,k);
        if(api.env.water) api.env.water.material.color.lerp(m.water,k);

        if(api.renderer && api.renderer.toneMappingExposure != null){
          api.renderer.toneMappingExposure += (m.exposure - api.renderer.toneMappingExposure) * k;
        }
      }

      /* wind uTime */
      for(var w=0;w<windMats.length;w++){
        if(windMats[w].userData.shader)
          windMats[w].userData.shader.uniforms.uTime.value=el;
      }

      /* scatter pulse */
      if(cos.scatter){
        cos.scatter.mat.opacity = (cos.scatter.base || 0.6) + 0.14 * Math.sin(el * 2.2);
      }

      /* particles */
      if(cos.parts){
        var pb=cos.parts, arr=null;
        root.traverse(function(o){ if(o.material===pb.mat&&o.geometry) arr=o.geometry.attributes.position.array; });
        if(arr){
          for(var i=0;i<cos.pBase.length;i++){
            var b=cos.pBase[i];
            if(pb.beh==='rise'){
              arr[i*3]=b.x+Math.sin(el*b.sp+b.ph)*.4;
              arr[i*3+1]=b.y+((el*b.sp*1.5)%5);
              arr[i*3+2]=b.z+Math.cos(el*b.sp+b.ph)*.4;
            } else if(pb.beh==='fall'){
              arr[i*3]=b.x+Math.sin(el*b.sp+b.ph)*.6;
              arr[i*3+1]=b.y-((el*b.sp*1.2)%5);
              arr[i*3+2]=b.z+Math.cos(el*b.sp*.8+b.ph)*.6;
            } else if(pb.beh==='blink'){
              arr[i*3]=b.x+Math.sin(el*b.sp+b.ph)*.5;
              arr[i*3+1]=b.y+Math.sin(el*b.sp*1.3+b.ph)*.4;
              arr[i*3+2]=b.z+Math.cos(el*b.sp*.9+b.ph)*.5;
              pb.mat.opacity=.3+.6*Math.max(0,Math.sin(el*1.5+b.ph*3));
            } else {
              arr[i*3]=b.x+Math.sin(el*b.sp+b.ph)*.7;
              arr[i*3+1]=b.y+Math.sin(el*b.sp*.7+b.ph)*.5;
              arr[i*3+2]=b.z+Math.cos(el*b.sp*.8+b.ph)*.7;
            }
          }
          var pg2=null;
          root.traverse(function(o){ if(o.material===pb.mat&&o.geometry) pg2=o.geometry; });
          if(pg2) pg2.attributes.position.needsUpdate=true;
        }
      }

      /* creatures animation */
      if(cos.creature){
        var carr = cos.creature.geo.attributes.position.array;
        for(var ci = 0; ci < cos.creature.n; ci++){
          var ca = el * (cos.creature.beh==='bird' ? 0.5 : 0.8) + ci * 2.1;

          if(cos.creature.beh==='koi'){
            var kr = 3.2 + (ci % 3) * 1.1;
            carr[ci*3] = Math.cos(ca) * kr;
            carr[ci*3+1] = -0.04;
            carr[ci*3+2] = Math.sin(ca) * kr;
          }
          else if(cos.creature.beh==='bird'){
            var br = 6.5 + (ci % 4) * 1.4;
            carr[ci*3] = Math.cos(ca * 0.7) * br;
            carr[ci*3+1] = 4.6 + Math.sin(ca * 1.3 + ci) * 1.1;
            carr[ci*3+2] = Math.sin(ca * 0.7) * br;
          }
          else if(cos.creature.beh==='fox'){
            var fr = 2.2 + Math.sin(el * 0.3 + ci) * 1.2;
            var fx = Math.cos(ca * 0.4 + ci) * fr;
            var fz = Math.sin(ca * 0.4 + ci) * fr;

            carr[ci*3] = fx;
            carr[ci*3+1] = Math.max(0.25, hAt(fx, fz) + 0.28);
            carr[ci*3+2] = fz;
          }
          else{
            var bx = Math.cos(ca) * (2.0 + ci * 0.35) + Math.sin(el * 2 + ci) * 0.4;
            var bz = Math.sin(ca) * (2.0 + ci * 0.35) + Math.cos(el * 1.7 + ci) * 0.4;

            carr[ci*3] = bx;
            carr[ci*3+1] = 0.75 + Math.sin(el * 3 + ci) * 0.35;
            carr[ci*3+2] = bz;
          }
        }
        cos.creature.geo.attributes.position.needsUpdate = true;
        if(cos.creature.beh==='fly'){
          cos.creature.mat.opacity = 0.72 + 0.22*Math.sin(el*3);
        }
      }

      /* ---- AURA ANIMATION ---- */
      if(cos.auraShell){
        var n=0;
        var nf=nightFactor();

        for(var sk in api.trees){
          var sa=api.trees[sk];

          for(var j=0;j<sa.length && n<800;j++){
            var tt=sa[j];
            if((tt.cur||0)<.95) continue;

            var sc=(tt.baseScale||1)*(tt.sy||1);
            var pulse=1 + 0.045*Math.sin(el*1.3 + (tt.rot||0)*3.0);

            _d.position.set(tt.x,(tt.y||0)+sc*1.35,tt.z);
            _d.rotation.set(0,(tt.rot||0)+el*0.12,0);

            var rs=sc*2.15*pulse;
            _d.scale.set(rs,rs*1.18,rs);
            _d.updateMatrix();
            cos.auraShell.setMatrixAt(n,_d.matrix);

            _d.position.set(tt.x,(tt.y||0)+0.06,tt.z);
            _d.rotation.set(0,(tt.rot||0)*0.5,0);

            var grs=sc*1.95*pulse;
            _d.scale.set(grs,1,grs);
            _d.updateMatrix();
            cos.auraGround.setMatrixAt(n,_d.matrix);

            n++;
          }
        }

        cos.auraShell.count=n;
        cos.auraGround.count=n;
        cos.auraShell.instanceMatrix.needsUpdate=true;
        cos.auraGround.instanceMatrix.needsUpdate=true;

        var nightBoost=0.75 + 0.55*nf;
        cos.auraShellMat.opacity=(0.13 + 0.05*Math.sin(el*1.4)) * nightBoost;
        cos.auraGroundMat.opacity=(0.12 + 0.05*Math.sin(el*1.8 + 1.0)) * nightBoost;
      }

      /* structure pulse */
      for(var s=0;s<structRefs.length;s++){
        var u=structRefs[s];
        if(u.light){
          var fl=.7+.45*Math.abs(Math.sin(el*12+s));
          u.light.intensity=(.6+night*1.6)*fl;
        }
        if(u.flame){
          u.flame.scale.set(.8+.2*Math.sin(el*11),.9+.35*Math.abs(Math.sin(el*8)),.8+.2*Math.cos(el*10));
          u.flame.rotation.y=el*.7;
        }
        if(u.flame2){
          u.flame2.scale.set(.7+.2*Math.sin(el*13),.8+.3*Math.abs(Math.sin(el*9)),.7+.2*Math.cos(el*12));
        }
        if(u.body && u.body.material){
          if(!u.body.material.transparent) u.body.material.transparent=true;
          u.body.material.opacity=.7+.25*Math.abs(Math.sin(el*3+s));
        }
        if(u.orb){
          u.orb.scale.setScalar(1+.12*Math.sin(el*2+s));
        }
        if(u.spin){
          u.spin.rotation.y += dt*0.25;
        }
        if(u.bob){
          u.bob.position.y = (u.bobBase||0) + Math.sin(el*2+s)*0.07;
        }
      }

      updBurst(dt); updWaves(); updHalo(el);
      if(el-lastStreak>2){ lastStreak=el; streak=streakDays(); }
      var k=Math.min(1,streak/7)*.35;
      if(k>0&&api.env.sun){
        api.env.sun.color.lerp(warm,Math.min(1,dt*1.5)*k);
        if(api.env.hemi) api.env.hemi.color.lerp(warm,Math.min(1,dt)*k*.6);
      }
    }catch(e){}
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();