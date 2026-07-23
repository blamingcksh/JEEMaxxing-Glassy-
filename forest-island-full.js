/* forest-island-full.js — full-screen Growth Island explorer + premium juice.
   Per-day filters (Today/Yesterday/Week/Month/Year/All) + manual '+' trees +
   difficulty→size + study→height growth, AND coastline-guarded juice so grass /
   flowers / rocks never spawn over the water. Isolated + guarded.
   FIXED: better preview matching, richer colors, proper lighting, particles.
   AURA FIX: soft billboard halo + subtle ground ring, lower opacity,
   smoother breathing, night boost.
   MOOD FIX: full mood payload support (sky, fog, water, sun, hemi, exposure),
   particles & creatures now fully wired. */
(function () {
'use strict';
if (window.__forestIslandFullInit) return; window.__forestIslandFullInit = true;

/* ---------- helpers ---------- */
function el(tag,a){ var n=document.createElement(tag); if(a)for(var k in a){ if(k==='html')n.innerHTML=a[k]; else if(k==='class')n.className=a[k]; else n.setAttribute(k,a[k]); } return n; }
function todayISO(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
function hash(x,z){ var n=Math.sin(x*127.1+z*311.7)*43758.5453; return n-Math.floor(n); }
function clamp01(v){ return v<0?0:v>1?1:v; }
function rand(a,b){ return a+Math.random()*(b-a); }
function vnoise(x,z){ var xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi,u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf),a=hash(xi,zi),b=hash(xi+1,zi),c=hash(xi,zi+1),d=hash(xi+1,zi+1); return a*(1-u)*(1-v)+b*u*(1-v)+c*(1-u)*v+d*u*v; }
function coastR(th){ return LAND_R*(1+0.22*Math.sin(th*3+1.3)+0.14*Math.sin(th*5+0.4)+0.12*(vnoise(Math.cos(th)*2+5,Math.sin(th)*2+5)-0.5)); }
function heightAt(x,z){ var r=Math.hypot(x,z),th=Math.atan2(z,x),cr=coastR(th); if(r>cr) return -1.2; var t=r/cr; var dome=(1-t*t)*1.7; var beach=t>0.80?-0.7*((t-0.80)/0.20):0; var hills=(vnoise(x*0.5+10,z*0.5+10)-0.5)*0.9*(1-t); return Math.max(-0.5,dome+hills+beach); }
function realTOD(){ var d=new Date(); return ((d.getHours()+d.getMinutes()/60)/24)*100; }
function normSub(s){ s=(s||'').toString().toLowerCase().trim(); if(s==='math'||s==='mathematics')return 'maths'; return (s==='physics'||s==='chemistry'||s==='maths')?s:'physics'; }
function qEloOf(q){ return (typeof q.qElo==='number'&&q.qElo>0)?q.qElo:1200; }
function getTimeMs(q){ var s=q.lastReviewedAt||q.solvedAt||q.createdAt||q.date||q.ts; if(!s)return null; var t=new Date(s).getTime(); return isNaN(t)?null:t; }
function getBank(){ try{ if(Array.isArray(window.questionBank)&&window.questionBank.length)return window.questionBank; if(window.AppState&&Array.isArray(window.AppState.questionBank)&&window.AppState.questionBank.length)return window.AppState.questionBank; }catch(e){} return []; }
function FG(){ return window.__forestGrowth||null; }
function loadDaily(){ try{ var o=JSON.parse(localStorage.getItem(K_DAYS)||'{}'); return (o&&typeof o==='object')?o:{}; }catch(e){ return {}; } }
function dailyCounts(dk){ var st=loadDaily(); var sv=st[dk]||{}; var out={physics:+sv.physics||0,chemistry:+sv.chemistry||0,maths:+sv.maths||0}; if(dk===todayISO()){ function g(id){ var e=document.getElementById(id); return e?(parseInt(e.textContent,10)||0):0; } out.physics=Math.max(out.physics,g('physics-count'),+(window.solved&&window.solved.physics||0)); out.chemistry=Math.max(out.chemistry,g('chemistry-count'),+(window.solved&&window.solved.chemistry||0)); out.maths=Math.max(out.maths,g('maths-count'),+(window.solved&&window.solved.maths||0)); } return out; }
function allDailyDates(){ var st=loadDaily(); var d={}; Object.keys(st).forEach(function(k){ d[k]=1; }); d[todayISO()]=1; return Object.keys(d); }

function eqCfg(){
  try{
    var o=JSON.parse(localStorage.getItem(K_EQ)||'null');
    // support new payload with 'equipped' and 'mood'
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
      tint:'natural',
      mood:null
    };
  }
}

function fullSig(){ var c=dailyCounts(todayISO()); var st=''; try{ st=localStorage.getItem(K_DAYS)||''; }catch(e){} return st+'|'+c.physics+','+c.chemistry+','+c.maths+'|'+getBank().length+'|'+(localStorage.getItem(K_EQ)||''); }

/* the scatter guard (same rule as the live island) */
function isLand(x,z,wY){ var r=Math.hypot(x,z); if(r>coastR(Math.atan2(z,x))-1.3) return false; var h=heightAt(x,z); return h>wY+0.30; }

/* ---------- tex / geo helpers for juice ---------- */
function glowTex(T){ var c=document.createElement('canvas'); c.width=c.height=64; var g=c.getContext('2d'); var r=g.createRadialGradient(32,32,0,32,32,32); r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(.35,'rgba(255,255,255,.75)'); r.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=r; g.fillRect(0,0,64,64); var t=new T.CanvasTexture(c); try{t.colorSpace=T.SRGBColorSpace;}catch(e){} return t; }
function flowerTex(T){ var c=document.createElement('canvas'); c.width=c.height=64; var g=c.getContext('2d'); g.clearRect(0,0,64,64); g.translate(32,32); for(var i=0;i<5;i++){ g.rotate(Math.PI*2/5); g.beginPath(); g.ellipse(0,-15,7,13,0,0,Math.PI*2); g.fillStyle='#ffd0e6'; g.fill(); g.beginPath(); g.ellipse(0,-15,4,9,0,0,Math.PI*2); g.fillStyle='#ff7ab8'; g.fill(); } g.beginPath(); g.arc(0,0,6,0,Math.PI*2); g.fillStyle='#ffd24a'; g.fill(); var t=new T.CanvasTexture(c); try{t.colorSpace=T.SRGBColorSpace;}catch(e){} return t; }
function grassTex(T){ var c=document.createElement('canvas'); c.width=32; c.height=64; var g=c.getContext('2d'); g.clearRect(0,0,32,64); function blade(x,lean,col){ g.beginPath(); g.moveTo(x-3,64); g.quadraticCurveTo(x+lean,30,x+lean*1.4,2); g.quadraticCurveTo(x+3+lean,30,x+3,64); g.closePath(); g.fillStyle=col; g.fill(); } blade(8,-4,'#2f7d2a'); blade(16,3,'#3fa83a'); blade(24,-2,'#56c24a'); var t=new T.CanvasTexture(c); try{t.colorSpace=T.SRGBColorSpace;}catch(e){} return t; }

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

function merge(T,list){
  list = list.map(function(g){ return g.index ? g.toNonIndexed() : g; });
  var n = 0;
  list.forEach(function(g){ n += g.attributes.position.count; });
  var pos = new Float32Array(n * 3);
  var nor = new Float32Array(n * 3);
  var uv  = new Float32Array(n * 2);
  var col = new Float32Array(n * 3);
  var o = 0, ou = 0;
  var hasUV = false, hasCol = false;
  list.forEach(function(g){
    var c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) { uv.set(g.attributes.uv.array, ou * 2); hasUV = true; }
    if (g.attributes.color) { col.set(g.attributes.color.array, o * 3); hasCol = true; }
    o += c;
    ou += c;
  });
  var g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(nor, 3));
  if (hasUV) g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  if (hasCol) g.setAttribute('color', new T.BufferAttribute(col, 3));
  return g;
}

function crossGeo(T,w,h,yo){ var p1=new T.PlaneGeometry(w,h); p1.translate(0,yo+h/2,0); var p2=new T.PlaneGeometry(w,h); p2.rotateY(Math.PI/2); p2.translate(0,yo+h/2,0); return merge(T,[p1,p2]); }

function saturateMat(mat, amt){
  mat.onBeforeCompile = function(sh){
    sh.uniforms.uSat = { value: amt };
    sh.fragmentShader = 'uniform float uSat;\n' + sh.fragmentShader.replace(
      '#include <color_fragment>',
      "#include <color_fragment>\n float lum=dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));\n diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, uSat);"
    );
  };
}

function windify(mat){ mat.onBeforeCompile=function(sh){ sh.uniforms.uTime={value:0}; sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace('#include <begin_vertex>',"#include <begin_vertex>\n float wy=max(transformed.y,0.0);\n float wph=instanceMatrix[3][0]*0.5+instanceMatrix[3][2]*0.5;\n transformed.x+=sin(uTime*1.4+wph)*wy*0.22;\n transformed.z+=cos(uTime*1.1+wph*1.3)*wy*0.16;"); mat.userData.shader=sh; }; }
function jitter(T,g,amt){ var p=g.attributes.position.array, n=g.attributes.normal?g.attributes.normal.array:null, nn=p.length/3; for(var i=0;i<nn;i++){ var nx=n?n[i*3]:0,ny=n?n[i*3+1]:1,nz=n?n[i*3+2]:0; var h=hash(p[i*3]+9.1,p[i*3+2]+3.3); var dd=(h-0.5)*2*amt; p[i*3]+=nx*dd; p[i*3+1]+=ny*dd; p[i*3+2]+=nz*dd; } g.attributes.position.needsUpdate=true; return g; }

/* ---------- globals ---------- */
var K_EQ='jeemax_island_cosmetics_v1', K_DAYS='jeemax_forest_daily_v1';
var THREE=null,threePromise=null,overlay=null,canvas=null,renderer=null,scene=null,camera=null,controls=null,world=null,skyEnv=null,treeMat=null,treeGeos=null,currentWater=null;
var sunLight=null,hemiLight=null,lastFullTOD=0,juiceParticles=null,juiceCreatures=null,juiceMood=null;
var built=false,isOpen=false,raf=null,elT=0,lastT=0,LAND_R=14,CAP=3500;
var state={period:'all',endDate:todayISO()}; var ui={}; var rebuildTimer=null,fullPoll=null,lastSig='';
var _lastDry=[],_lastPlaced=[];
var juiceWind=[], juicePulse=[];

var TINTW={natural:0x23a7d6,golden:0x3a6a7a,moon:0x1a3a5a,ember2:0x5a2a1a,frost2:0x4a7a9a};
var TINTF={natural:0x0b1020,golden:0x20180e,moon:0x0a1024,ember2:0x1a0e08,frost2:0x101824};

var TOD=[{t:0,top:0x0a0e1c,bot:0x141a2a,sun:0x3a4a6a,sunI:.15,hemi:0x2a3040,fog:0x0e1220},{t:22,top:0x2a3a5e,bot:0xe8956a,sun:0xffb27a,sunI:.7,hemi:0x5a5a6a,fog:0x3a3040},{t:50,top:0x4a7ec0,bot:0xc4dcec,sun:0xfff2e0,sunI:1.15,hemi:0x8aa0b8,fog:0x9ab4c8},{t:78,top:0x3a2a52,bot:0xe07a44,sun:0xff8a4a,sunI:.75,hemi:0x6a5060,fog:0x4a3444},{t:100,top:0x0a0e1c,bot:0x141a2a,sun:0x3a4a6a,sunI:.15,hemi:0x2a3040,fog:0x0e1220}];

/* ---------- premium juice for the full scene (coastline-guarded) ---------- */
function buildAccountabilityCosmeticsFull(T, dry, placed){
  juiceWind.length=0;
  juicePulse.length=0;
  juiceParticles=null;
  juiceCreatures=null;
  juiceMood = null;  // reset mood

  var c=eqCfg();
  var WY=-0.2;
  var sprite=glowTex(T);
  var fTex=flowerTex(T);
  var disp=world.userData.disposables;

  function reg(o){
    if(o.geometry) disp.push(o.geometry);
    if(o.material) disp.push(o.material);
  }

  /* ── apply mood if present ── */
  if(c.mood){
    var m = c.mood;
    juiceMood = {
      skyTop: new T.Color(m.skyTop),
      skyBot: new T.Color(m.skyBot),
      fog: new T.Color(m.fog),
      water: new T.Color(m.water),
      sun: new T.Color(m.sun),
      hemi: new T.Color(m.hemi),
      exposure: (+m.exposure) || 1.10
    };

    // immediate application
    try{
      if(skyEnv){
        skyEnv.top.copy(juiceMood.skyTop);
        skyEnv.bottom.copy(juiceMood.skyBot);
      }
      if(scene.fog) scene.fog.color.copy(juiceMood.fog);
      if(currentWater && currentWater.material) currentWater.material.color.copy(juiceMood.water);
      if(sunLight) sunLight.color.copy(juiceMood.sun);
      if(hemiLight) hemiLight.color.copy(juiceMood.hemi);
      if(renderer) renderer.toneMappingExposure = juiceMood.exposure;
    }catch(e){}
  }
  else{
    // fallback to tint
    try{
      var tint=c.tint||'natural';
      if(currentWater && currentWater.material) currentWater.material.color.setHex(TINTW[tint]||TINTW.natural);
      if(scene.fog) scene.fog.color.setHex(TINTF[tint]||TINTF.natural);
    }catch(e){}
  }

  /* subtle flowers only for meadow scatter */
  try{
    if(c.scatter==='meadow' && dry.length){
      var FN=Math.min(90,dry.length), fg=crossGeo(T,.42,.42,0);
      var fm=new T.MeshStandardMaterial({map:fTex,alphaTest:.5,side:T.DoubleSide,roughness:.7});
      windify(fm); juiceWind.push(fm);

      var fIM=new T.InstancedMesh(fg,fm,FN);
      fIM.frustumCulled=false;
      var fn=0;

      for(var fi=0; fi<dry.length && fn<FN; fi++){
        var fs=dry[fi];
        if(!isLand(fs.x,fs.z,WY)) continue;

        var fsc=rand(.7,1.2), fd=new T.Object3D();
        fd.position.set(fs.x+rand(-.25,.25),fs.y,fs.z+rand(-.25,.25));
        fd.rotation.set(0,rand(0,6.28),0);
        fd.scale.set(fsc,fsc,fsc);
        fd.updateMatrix();
        fIM.setMatrixAt(fn++,fd.matrix);
      }

      fIM.count=fn;
      fIM.instanceMatrix.needsUpdate=true;
      world.add(fIM);
      reg(fIM);
    }
  }catch(e){}

  /* ground scatter */
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
    var SN=Math.min(sc.n, Math.max(40, dry.length*2));
    var sp=new Float32Array(SN*3), scol=new Float32Array(SN*3), scn=0;

    for(var si=0; si<dry.length*4 && scn<SN; si++){
      var ss=dry[si%dry.length];
      var sx=ss.x+rand(-.55,.55), sz=ss.z+rand(-.55,.55);
      if(!isLand(sx,sz,WY)) continue;

      var sy=heightAt(sx,sz)+0.07;
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
      world.add(spts);
      reg(spts);

      juicePulse.push({scatter:sm,base:sc.glow?0.82:0.58});
    }
  }catch(e){}

  /* air particles */
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
    var pp=new Float32Array(PN*3), pc=new Float32Array(PN*3), pb=[];

    for(var pi=0; pi<PN; pi++){
      var px=rand(-LAND_R*0.9,LAND_R*0.9);
      var pz=rand(-LAND_R*0.9,LAND_R*0.9);
      var py=rand(0.4,5.0);

      pb.push({x:px,y:py,z:pz,ph:rand(0,6.28),sp:rand(0.3,0.9)});

      var pcol=new T.Color(pa.col[(Math.random()*pa.col.length)|0]);
      pp[pi*3]=px;
      pp[pi*3+1]=py;
      pp[pi*3+2]=pz;

      pc[pi*3]=pcol.r;
      pc[pi*3+1]=pcol.g;
      pc[pi*3+2]=pcol.b;
    }

    var pg=new T.BufferGeometry();
    pg.setAttribute('position', new T.BufferAttribute(pp,3));
    pg.setAttribute('color', new T.BufferAttribute(pc,3));

    var pm=new T.PointsMaterial({
      size:(pa.beh==='blink'?0.17:0.14),
      map:sprite,
      transparent:true,
      opacity:0.82,
      depthWrite:false,
      blending:T.AdditiveBlending,
      vertexColors:true,
      sizeAttenuation:true
    });

    var ppts=new T.Points(pg,pm);
    ppts.frustumCulled=false;
    world.add(ppts);
    reg(ppts);

    juiceParticles={geo:pg,mat:pm,beh:pa.beh,bases:pb};
  }catch(e){}

  /* creatures */
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
        opacity:0.92,
        depthWrite:false,
        blending:T.AdditiveBlending,
        vertexColors:true,
        sizeAttenuation:true
      });

      var cpts=new T.Points(cg,cm);
      cpts.frustumCulled=false;
      world.add(cpts);
      reg(cpts);

      juiceCreatures={geo:cg,mat:cm,beh:cr.beh,n:CN};
    }
  }catch(e){}

  /* soft tree aura */
  try{
    var AURACOL={
      verdant:'#39d98a',
      cyan:'#4cc9ff',
      gold:'#ffd24a',
      blossom:'#ff7ab8',
      violet:'#a78bfa',
      ember:'#ff7a1a',
      frost:'#9fe8ff'
    };
    var ac=AURACOL[c.aura];

    if(ac && placed.length){
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

      var sIM=new T.InstancedMesh(canopyG,canopyM,placed.length);
      sIM.frustumCulled=false;
      sIM.renderOrder=3;

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

      var gIM=new T.InstancedMesh(gndG,gndM,placed.length);
      gIM.frustumCulled=false;
      gIM.renderOrder=2;

      var dd=new T.Object3D();

      for(var ai=0; ai<placed.length; ai++){
        var t=placed[ai];
        var sc=t.baseScale||1;
        var pulse=1+0.03*Math.sin(ai*1.7);

        dd.position.set(t.x,t.y+sc*1.35,t.z);
        dd.rotation.set(0,(t.rot||0)+ai*0.13,0);

        var rs=sc*2.15*pulse;
        dd.scale.set(rs,rs*1.18,rs);
        dd.updateMatrix();
        sIM.setMatrixAt(ai,dd.matrix);

        dd.position.set(t.x,t.y+0.06,t.z);
        dd.rotation.set(0,(t.rot||0)*0.5,0);

        var grs=sc*1.95*pulse;
        dd.scale.set(grs,1,grs);
        dd.updateMatrix();
        gIM.setMatrixAt(ai,dd.matrix);
      }

      sIM.instanceMatrix.needsUpdate=true;
      gIM.instanceMatrix.needsUpdate=true;

      world.add(sIM);
      world.add(gIM);

      reg(sIM);
      reg(gIM);

      juicePulse.push({shell:canopyM,ground:gndM});
    }
  }catch(e){}

  /* structures (unchanged from original, but kept) */
  try{
    function clearing(){
      for(var i=0;i<dry.length;i++){
        var s=dry[i];
        var d=Math.hypot(s.x,s.z);
        if(d<1.4 || d>LAND_R*0.55 || !isLand(s.x,s.z,WY)) continue;

        var ok=true;
        for(var j=0;j<placed.length;j++){
          var dx=placed[j].x-s.x, dz=placed[j].z-s.z;
          if(dx*dx+dz*dz < 2.6*2.6){ ok=false; break; }
        }

        if(ok) return s;
      }
      return null;
    }

    function addStruct(builder,count,spread){
      for(var n=0;n<count;n++){
        var s=clearing();
        if(!s) continue;

        var g=builder(T);
        g.position.set(s.x+rand(-spread,spread),heightAt(s.x,s.z),s.z+rand(-spread,spread));
        g.rotation.y=rand(0,6.28);

        world.add(g);
        g.traverse(reg);

        if(g.userData && g.userData.light) juicePulse.push(g.userData);
      }
    }

    function camp(T){
      var g=new T.Group();

      var sm=new T.MeshStandardMaterial({color:0x6b6f78,roughness:1,flatShading:true});
      for(var i=0;i<9;i++){
        var a=i/9*6.283;
        var s=new T.Mesh(new T.IcosahedronGeometry(rand(.14,.24),0),sm);
        s.position.set(Math.cos(a)*rand(.5,.66),rand(.04,.12),Math.sin(a)*rand(.5,.66));
        s.rotation.set(rand(0,3),rand(0,3),rand(0,3));
        g.add(s);
      }

      var lm=new T.MeshStandardMaterial({color:0x5a3a22,roughness:1,flatShading:true});
      for(var k=0;k<3;k++){
        var lg=new T.CylinderGeometry(.05,.07,.8,6);
        lg.rotateZ(Math.PI/2);
        var l=new T.Mesh(lg,lm);
        l.rotation.y=k*1.05;
        l.position.y=.08+k*.02;
        g.add(l);
      }

      var f1=new T.Mesh(new T.ConeGeometry(.2,.7,7),new T.MeshBasicMaterial({color:0xff7a1a,transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false}));
      f1.position.y=.42;
      g.add(f1);

      var f2=new T.Mesh(new T.ConeGeometry(.12,.5,7),new T.MeshBasicMaterial({color:0xffd24a,transparent:true,opacity:.95,blending:T.AdditiveBlending,depthWrite:false}));
      f2.position.y=.5;
      g.add(f2);

      var gl=new T.Mesh(new T.CircleGeometry(.9,16),new T.MeshBasicMaterial({map:sprite,color:0xff8a3c,transparent:true,opacity:.5,blending:T.AdditiveBlending,depthWrite:false}));
      gl.rotation.x=-Math.PI/2;
      gl.position.y=.05;
      g.add(gl);

      var L=new T.PointLight(0xff8a3c,0,18,2);
      L.position.y=.8;
      g.add(L);

      g.userData={flame:f1,flame2:f2,light:L};
      return g;
    }

    function lantern(T){
      var g=new T.Group();

      var post=new T.Mesh(new T.CylinderGeometry(.03,.045,.95,6),new T.MeshStandardMaterial({color:0x2a1c12,roughness:1,flatShading:true}));
      post.position.y=.47;
      g.add(post);

      var body=new T.Mesh(new T.OctahedronGeometry(.12,0),new T.MeshBasicMaterial({color:0xffd24a,transparent:true,opacity:.92,blending:T.AdditiveBlending,depthWrite:false}));
      body.position.y=.95;
      g.add(body);

      var gl=new T.Mesh(new T.CircleGeometry(.4,12),new T.MeshBasicMaterial({map:sprite,color:0xffb24a,transparent:true,opacity:.4,blending:T.AdditiveBlending,depthWrite:false}));
      gl.rotation.x=-Math.PI/2;
      gl.position.y=.04;
      g.add(gl);

      var L=new T.PointLight(0xffb24a,0,9,2);
      L.position.y=.95;
      g.add(L);

      g.userData={light:L,body:body};
      return g;
    }

    function well(T){
      var g=new T.Group();

      var base=new T.Mesh(new T.CylinderGeometry(.42,.48,.4,12),new T.MeshStandardMaterial({color:0x7a7f88,roughness:1,flatShading:true}));
      base.position.y=.2;
      g.add(base);

      var w=new T.Mesh(new T.CircleGeometry(.34,16),new T.MeshStandardMaterial({color:0x2a6a8a,roughness:.1,metalness:.4}));
      w.rotation.x=-Math.PI/2;
      w.position.y=.38;
      g.add(w);

      var pm=new T.MeshStandardMaterial({color:0x3a2616,roughness:1,flatShading:true});
      for(var s=-1;s<=1;s+=2){
        var p=new T.Mesh(new T.CylinderGeometry(.035,.04,.9,6),pm);
        p.position.set(s*.4,.7,0);
        g.add(p);
      }

      var roof=new T.Mesh(new T.ConeGeometry(.62,.34,4),new T.MeshStandardMaterial({color:0x6a3a26,roughness:1,flatShading:true}));
      roof.rotation.y=Math.PI/4;
      roof.position.y=1.3;
      g.add(roof);

      return g;
    }

    function shrine(T){
      var g=new T.Group();

      var st=new T.MeshStandardMaterial({color:0xc0c4cc,roughness:1,flatShading:true});
      var step1=new T.Mesh(new T.BoxGeometry(1.1,.12,.7),st);
      step1.position.y=.06;
      g.add(step1);

      var step2=new T.Mesh(new T.BoxGeometry(.9,.12,.55),st);
      step2.position.y=.18;
      g.add(step2);

      var pm=new T.MeshStandardMaterial({color:0xb03030,roughness:1,flatShading:true});
      for(var s=-1;s<=1;s+=2){
        var p=new T.Mesh(new T.CylinderGeometry(.06,.07,1.1,8),pm);
        p.position.set(s*.42,.78,0);
        g.add(p);
      }

      var top=new T.Mesh(new T.BoxGeometry(1.15,.1,.16),pm);
      top.position.y=1.34;
      g.add(top);

      var orb=new T.Mesh(new T.IcosahedronGeometry(.12,1),new T.MeshBasicMaterial({color:0x9fffcf,transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false}));
      orb.position.y=.85;
      g.add(orb);

      var gl=new T.Mesh(new T.CircleGeometry(.7,16),new T.MeshBasicMaterial({map:sprite,color:0x9fffcf,transparent:true,opacity:.35,blending:T.AdditiveBlending,depthWrite:false}));
      gl.rotation.x=-Math.PI/2;
      gl.position.y=.05;
      g.add(gl);

      var L=new T.PointLight(0x9fffcf,0,9,2);
      L.position.y=.9;
      g.add(L);

      g.userData={light:L,orb:orb};
      return g;
    }

    /* structures ultra: robust placement + more variety + better aesthetics */
try{
  var STRUCT_META={
    campfire:{n:1,rad:2.6},
    lanterns:{n:4,rad:1.8},
    well:{n:1,rad:2.4},
    shrine:{n:1,rad:2.6},
    torii:{n:1,rad:2.8},
    koistones:{n:3,rad:1.6},
    arch:{n:1,rad:2.6},
    fountain:{n:1,rad:2.6},
    observatory:{n:1,rad:3.0},
    spiritlamps:{n:3,rad:1.8}
  };

  var smeta=STRUCT_META[c.structure]||STRUCT_META.campfire;
  smeta.band=[
    Math.max(1.4, LAND_R*0.10),
    Math.max(6, Math.min(LAND_R*0.55, 18))
  ];

  function slopeOK(x,z,max){
    var hx=heightAt(x+0.45,z)-heightAt(x-0.45,z);
    var hz=heightAt(x,z+0.45)-heightAt(x,z-0.45);
    return Math.hypot(hx,hz)<=max;
  }

  function structClear(x,z,rad,out){
    for(var i=0;i<placed.length;i++){
      var dx=placed[i].x-x, dz=placed[i].z-z;
      if(dx*dx+dz*dz < rad*rad) return false;
    }
    for(var j=0;j<out.length;j++){
      var ox=out[j].x-x, oz=out[j].z-z;
      if(ox*ox+oz*oz < 2.2*2.2) return false;
    }
    return true;
  }

  function findStructSpots(){
    var out=[];

    for(var pass=0; pass<3 && out.length<smeta.n; pass++){
      var radMul=pass===0?1:pass===1?0.82:0.64;
      var maxSlope=pass===0?0.65:pass===1?0.95:1.45;
      var treeRad=smeta.rad*radMul;

      for(var a=0; a<6.283 && out.length<smeta.n; a+=0.37){
        for(var r=smeta.band[0]; r<=smeta.band[1] && out.length<smeta.n; r+=0.75){
          var ang=a+out.length*0.65;
          var x=Math.cos(ang)*r, z=Math.sin(ang)*r;

          if(!isLand(x,z,WY)) continue;

          var y=heightAt(x,z);
          if(y<WY+0.35) continue;
          if(!slopeOK(x,z,maxSlope)) continue;
          if(!structClear(x,z,treeRad,out)) continue;

          out.push({x:x,y:y,z:z,rot:ang+Math.PI/2});
        }
      }
    }

    if(out.length<smeta.n && dry.length){
      var cand=dry.filter(function(s){
        var d=Math.hypot(s.x,s.z);
        return d>=smeta.band[0]*0.65 && d<=smeta.band[1]*1.25 && isLand(s.x,s.z,WY);
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
      var y=heightAt(x,z);
      if(y<WY+0.25) y=0.45;

      out.push({x:x,y:y,z:z,rot:ang});
    }

    return out;
  }

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

  var sspots=findStructSpots();

  for(var si=0; si<sspots.length; si++){
    var sg=buildStructureUltra(c.structure);
    if(!sg) continue;

    sg.position.set(sspots[si].x, heightAt(sspots[si].x,sspots[si].z), sspots[si].z);
    sg.rotation.y=sspots[si].rot||rand(0,6.28);

    world.add(sg);
    sg.traverse(reg);

    if(sg.userData && (
      sg.userData.light ||
      sg.userData.flame ||
      sg.userData.flame2 ||
      sg.userData.body ||
      sg.userData.orb ||
      sg.userData.spin ||
      sg.userData.bob
    )){
      juicePulse.push(sg.userData);
    }
  }
}catch(e){}
  }catch(e){}
}

/* ---------- mount button ---------- */
function tryMount(){ var host=document.getElementById('forest-island-host'); if(!host)return false; if(document.getElementById('fi-full-open-btn'))return true; var cvs=document.getElementById('forest-island-canvas'); var wrap=cvs?cvs.parentElement:null; var right=host.querySelector('.fi-right'); var btn=el('button',{id:'fi-full-open-btn',class:'fi-full-open-btn',type:'button',title:'Open full Growth Island',html:'⛶'}); if(wrap)wrap.appendChild(btn); else if(right)right.insertBefore(btn,right.firstChild); else host.appendChild(btn); btn.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); openFull(); }); if(cvs&&!cvs.__fiFullClick){ cvs.__fiFullClick=true; cvs.addEventListener('click',function(e){ e.stopImmediatePropagation(); e.preventDefault(); openFull(); },true); } return true; }
function watchMount(){ if(tryMount())return; var mo=new MutationObserver(function(){ if(tryMount())mo.disconnect(); }); mo.observe(document.documentElement,{childList:true,subtree:true}); }
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchMount); else watchMount();

/* ---------- overlay ---------- */
function ensureOverlay(){ if(overlay)return; overlay=el('div',{id:'fi-full-overlay',class:'fi-full-overlay',html:'<div class="fi-full-shell"><canvas id="fi-full-canvas"></canvas><div class="fi-full-top"><div class="fi-full-brand"><span class="fi-full-kicker">// GROWTH ISLAND</span><span class="fi-full-title">Full Biome</span></div><div class="fi-full-controls"><label class="fi-full-date"><span>Date</span><input id="fi-full-date" type="date"></label><div class="fi-full-periods" id="fi-full-periods"><button data-period="today">Today</button><button data-period="yesterday">Yesterday</button><button data-period="week">Week</button><button data-period="month">Month</button><button data-period="year">Year</button><button data-period="all" class="active">All</button></div></div><div class="fi-full-top-actions"><button id="fi-full-reset" class="fi-full-icon-btn" type="button" title="Reset view">⟳</button><button id="fi-full-close" class="fi-full-icon-btn" type="button" title="Close">✕</button></div></div><button id="fi-full-side-toggle" class="fi-full-side-toggle" type="button" title="Toggle stats">📊</button><aside class="fi-full-side" id="fi-full-side"><div class="fi-full-side-inner"><div class="fi-full-stat-hero"><div class="fi-full-stat-value" id="fi-stat-total">0</div><div class="fi-full-stat-label">Trees Standing</div></div><div class="fi-full-stat-grid"><div><b id="fi-stat-delta">+0</b><span>vs Prev</span></div><div><b id="fi-stat-oaks">0</b><span>Ancient Oaks</span></div><div><b id="fi-stat-tall">—</b><span>Tallest qElo</span></div><div><b id="fi-stat-avg">—</b><span>Avg qElo</span></div></div><div class="fi-full-subject" data-subject="physics"><span>Physics</span><div class="fi-full-bar"><i id="fi-bar-physics"></i></div><b id="fi-count-physics">0</b></div><div class="fi-full-subject" data-subject="chemistry"><span>Chemistry</span><div class="fi-full-bar"><i id="fi-bar-chemistry"></i></div><b id="fi-count-chemistry">0</b></div><div class="fi-full-subject" data-subject="maths"><span>Maths</span><div class="fi-full-bar"><i id="fi-bar-maths"></i></div><b id="fi-count-maths">0</b></div><div class="fi-full-hint">Drag: orbit · Wheel / pinch: zoom · Right-drag: pan · nothing spawns on the water</div></div></aside><div class="fi-full-loading" id="fi-full-loading">Growing forest…</div></div>'});
  document.body.appendChild(overlay); canvas=document.getElementById('fi-full-canvas'); ui.loading=document.getElementById('fi-full-loading'); ui.date=document.getElementById('fi-full-date'); ui.periods=document.getElementById('fi-full-periods'); ui.side=document.getElementById('fi-full-side'); ui.total=document.getElementById('fi-stat-total'); ui.delta=document.getElementById('fi-stat-delta'); ui.oaks=document.getElementById('fi-stat-oaks'); ui.tall=document.getElementById('fi-stat-tall'); ui.avg=document.getElementById('fi-stat-avg'); ui.countPhysics=document.getElementById('fi-count-physics'); ui.countChemistry=document.getElementById('fi-count-chemistry'); ui.countMaths=document.getElementById('fi-count-maths'); ui.barPhysics=document.getElementById('fi-bar-physics'); ui.barChemistry=document.getElementById('fi-bar-chemistry'); ui.barMaths=document.getElementById('fi-bar-maths');
  ui.date.value=state.endDate; ui.date.max=todayISO();
  ui.date.addEventListener('change',function(){ state.endDate=this.value||todayISO(); scheduleRebuild(); });
  ui.periods.addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b)return; state.period=b.getAttribute('data-period')||'all'; syncPeriodUI(); scheduleRebuild(); });
  document.getElementById('fi-full-close').addEventListener('click',closeFull);
  document.getElementById('fi-full-reset').addEventListener('click',function(){ if(controls)controls.reset(viewRadius()); });
  document.getElementById('fi-full-side-toggle').addEventListener('click',function(){ ui.side.classList.toggle('open'); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&isOpen)closeFull(); });
}
function syncPeriodUI(){ if(!ui.periods)return; var bs=ui.periods.querySelectorAll('button'); for(var i=0;i<bs.length;i++)bs[i].classList.toggle('active',bs[i].getAttribute('data-period')===state.period); }
function showLoading(on,msg){ if(!ui.loading)return; ui.loading.textContent=msg||'Growing forest…'; ui.loading.classList.toggle('visible',!!on); }
function openFull(){ ensureOverlay(); overlay.classList.add('open'); document.body.classList.add('fi-full-open'); isOpen=true; ui.date.value=state.endDate; ui.date.max=todayISO(); syncPeriodUI(); showLoading(true); lastSig=fullSig(); if(!fullPoll)fullPoll=setInterval(function(){ if(!isOpen)return; var s=fullSig(); if(s!==lastSig){ lastSig=s; scheduleRebuild(); } },1500); ensureThree().then(function(){ if(!built)initScene(); resize(); startLoop(); rebuildWorld(); }).catch(function(){ showLoading(true,'Could not load 3D engine.'); }); }
function closeFull(){ if(!overlay)return; isOpen=false; overlay.classList.remove('open'); document.body.classList.remove('fi-full-open'); if(ui.side)ui.side.classList.remove('open'); if(fullPoll){ clearInterval(fullPoll); fullPoll=null; } stopLoop(); }
function scheduleRebuild(){ if(rebuildTimer)clearTimeout(rebuildTimer); rebuildTimer=setTimeout(rebuildWorld,120); }
function ensureThree(){ if(THREE)return Promise.resolve(THREE); if(threePromise)return threePromise; threePromise=new Promise(function(resolve,reject){ function useExisting(){ try{ if(window.__forestIslandAPI&&window.__forestIslandAPI.THREE){ THREE=window.__forestIslandAPI.THREE; buildTreeAssets(); resolve(THREE); return true; } }catch(e){} return false; } if(useExisting())return; var waited=0; var iv=setInterval(function(){ waited+=120; if(useExisting()){ clearInterval(iv); return; } if(waited>=1500){ clearInterval(iv); loadCDN().then(resolve,reject); } },120); }); return threePromise; }
function loadCDN(){ var urls=['https://esm.sh/three@0.160.0','https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js','https://unpkg.com/three@0.160.0/build/three.module.js']; function tryOne(i){ return new Promise(function(res,rej){ if(i>=urls.length)return rej(new Error('CDN fail')); import(urls[i]).then(function(m){ THREE=m; buildTreeAssets(); res(m); }).catch(function(){ tryOne(i+1).then(res,rej); }); }); } return tryOne(0); }

/* ---------- tree geometry ---------- */
function prep(g){ return g.index?g.toNonIndexed():g; }
function paint(g,r,gr,b){ g=prep(g); g.deleteAttribute('uv'); var n=g.attributes.position.count,c=new Float32Array(n*3); for(var i=0;i<n;i++){ c[i*3]=r; c[i*3+1]=gr; c[i*3+2]=b; } g.setAttribute('color',new THREE.BufferAttribute(c,3)); return g; }
function paintGrad(g,base,top){ g=prep(g); g.deleteAttribute('uv'); var p=g.attributes.position,n=p.count,c=new Float32Array(n*3),ymin=1e9,ymax=-1e9; for(var i=0;i<n;i++){ var y=p.getY(i); if(y<ymin)ymin=y; if(y>ymax)ymax=y; } for(var j=0;j<n;j++){ var t=(p.getY(j)-ymin)/Math.max(0.001,ymax-ymin); c[j*3]=base[0]+(top[0]-base[0])*t; c[j*3+1]=base[1]+(top[1]-base[1])*t; c[j*3+2]=base[2]+(top[2]-base[2])*t; } g.setAttribute('color',new THREE.BufferAttribute(c,3)); return g; }
function mergeGeos(list){ return merge(THREE,list); }
function spruceGeo(){ var t=paint(new THREE.CylinderGeometry(0.09,0.16,0.9,6).translate(0,0.45,0),0.30,0.20,0.12); var c1=paintGrad(new THREE.ConeGeometry(0.78,1.15,7).translate(0,1.35,0),[0.02,0.46,0.58],[0.10,0.66,0.82]); var c2=paintGrad(new THREE.ConeGeometry(0.60,0.98,7).translate(0,1.98,0),[0.05,0.56,0.72],[0.15,0.76,0.92]); var c3=paintGrad(new THREE.ConeGeometry(0.42,0.82,7).translate(0,2.55,0),[0.10,0.68,0.84],[0.22,0.80,0.92]); return mergeGeos([t,c1,c2,c3]); }
function roundGeo(){ var t=paint(new THREE.CylinderGeometry(0.11,0.18,1.0,6).translate(0,0.5,0),0.32,0.21,0.12); var b1=paintGrad(new THREE.IcosahedronGeometry(0.82,1).translate(0,1.55,0),[0.05,0.55,0.10],[0.16,0.80,0.18]); var b2=paintGrad(new THREE.IcosahedronGeometry(0.55,1).translate(0.35,2.05,0.1),[0.10,0.68,0.16],[0.24,0.92,0.26]); return mergeGeos([t,b1,b2]); }
function goldenGeo(){ var t=paint(new THREE.CylinderGeometry(0.10,0.17,0.95,6).translate(0,0.47,0),0.32,0.20,0.11); var d1=paintGrad(new THREE.DodecahedronGeometry(0.78,0).translate(0,1.5,0),[0.85,0.46,0.02],[1.0,0.72,0.06]); var d2=paintGrad(new THREE.DodecahedronGeometry(0.50,0).translate(-0.2,2.1,-0.1),[0.95,0.60,0.04],[1.0,0.84,0.12]); return mergeGeos([t,d1,d2]); }
function oakGeo(){ var t=paint(new THREE.CylinderGeometry(0.22,0.42,2.4,7).translate(0,1.2,0),0.16,0.11,0.07); var c1=paintGrad(new THREE.IcosahedronGeometry(1.7,1).scale(1.25,0.95,1.25).translate(0,3.1,0),[0.06,0.16,0.05],[0.13,0.30,0.09]); var c2=paintGrad(new THREE.IcosahedronGeometry(1.35,1).scale(1.2,0.9,1.2).translate(0.7,3.9,0.4),[0.08,0.20,0.06],[0.16,0.36,0.12]); var c3=paintGrad(new THREE.IcosahedronGeometry(1.2,1).scale(1.15,0.9,1.15).translate(-0.6,3.8,-0.3),[0.07,0.18,0.06],[0.15,0.34,0.11]); var c4=paintGrad(new THREE.IcosahedronGeometry(1.0,1).scale(1.1,0.85,1.1).translate(0.1,4.5,0.1),[0.10,0.24,0.07],[0.19,0.42,0.14]); return mergeGeos([t,c1,c2,c3,c4]); }

function buildTreeAssets(){
  if(treeGeos)return;
  treeGeos={physics:spruceGeo(),chemistry:roundGeo(),maths:goldenGeo(),oak:oakGeo()};
  treeMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.02,
    flatShading: true
  });
  treeMat.onBeforeCompile = function(sh){
    sh.uniforms.uTime = { value: 0 };
    sh.uniforms.uSat = { value: 1.45 };
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      "#include <begin_vertex>\nfloat sw=max(transformed.y-0.7,0.0);\nfloat ph=instanceMatrix[3][0]*0.6+instanceMatrix[3][2]*0.6;\ntransformed.x+=sin(uTime*1.3+ph)*sw*0.03;\ntransformed.z+=cos(uTime*1.0+ph)*sw*0.024;"
    );
    sh.fragmentShader = 'uniform float uSat;\n' + sh.fragmentShader.replace(
      '#include <color_fragment>',
      "#include <color_fragment>\n float lum=dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));\n diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, uSat);"
    );
    treeMat.userData.shader = sh;
  };
}

/* ---------- scene ---------- */
function makeSky(){ var skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color()},bottom:{value:new THREE.Color()},off:{value:18},exp:{value:0.62}},vertexShader:'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 top;uniform vec3 bottom;uniform float off;uniform float exp;varying vec3 vW;void main(){float h=normalize(vW+vec3(0.0,off,0.0)).y;float t=pow(max(h,0.0),exp);gl_FragColor=vec4(mix(bottom,top,t),1.0;}'}); return {mesh:new THREE.Mesh(new THREE.SphereGeometry(600,32,16),skyMat),top:skyMat.uniforms.top.value,bottom:skyMat.uniforms.bottom.value}; }

function applyTOD(v){
  if(!skyEnv || !scene || !scene.fog) return;
  var a = TOD[0], b = TOD[TOD.length - 1];
  for(var i = 0; i < TOD.length - 1; i++){
    if(v >= TOD[i].t && v <= TOD[i+1].t){
      a = TOD[i];
      b = TOD[i+1];
      break;
    }
  }
  var f = (v - a.t) / Math.max(0.0001, b.t - a.t);
  function L(x, y){
    return new THREE.Color(x).lerp(new THREE.Color(y), f);
  }
  skyEnv.top.copy(L(a.top, b.top));
  skyEnv.bottom.copy(L(a.bot, b.bot));
  scene.fog.color.copy(L(a.fog, b.fog));
  if(sunLight){
    sunLight.color.copy(L(a.sun, b.sun));
    sunLight.intensity = a.sunI + (b.sunI - a.sunI) * f;
    sunLight.position.set((v / 100 - 0.5) * 60, 40, 20);
  }
  if(hemiLight){
    hemiLight.color.copy(L(a.hemi, b.hemi));
  }
}

function initScene(){
  renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.10;
  renderer.setClearColor(0x000000,0);
  try{ renderer.outputColorSpace=THREE.SRGBColorSpace; }catch(e){}
  scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x0b1020,0.0040);
  camera=new THREE.PerspectiveCamera(50,1,0.1,1400);

  hemiLight = new THREE.HemisphereLight(0x8aa0b8, 0x3a3020, 0.70);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xfff2e0, 1.10);
  sunLight.position.set(10, 40, 20);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  try{
    var rim = new THREE.DirectionalLight(0x66ccff, 0.22);
    rim.position.set(-18, 16, -20);
    scene.add(rim);
    var fill = new THREE.DirectionalLight(0xffe6c4, 0.14);
    fill.position.set(14, 8, -12);
    scene.add(fill);
  }catch(e){}

  skyEnv=makeSky();
  scene.add(skyEnv.mesh);
  applyTOD(realTOD());
  controls=makeControls(canvas);
  window.addEventListener('resize',resize);
  try{ new ResizeObserver(resize).observe(canvas); }catch(e){}
  built=true;
}

function resize(){ if(!renderer||!camera||!canvas)return; var w=canvas.clientWidth||window.innerWidth,h=canvas.clientHeight||window.innerHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
function startLoop(){ if(raf==null){ lastT=performance.now(); raf=requestAnimationFrame(frame); } }
function stopLoop(){ if(raf!=null){ cancelAnimationFrame(raf); raf=null; } }
function frame(t){
  if(!isOpen||!built){ raf=null; return; }
  raf=requestAnimationFrame(frame);
  var dt=Math.min(0.05,(t-lastT)/1000||0); lastT=t; elT+=dt;
  if(controls) controls.update();

  // Only apply time-of-day if no mood is active, otherwise mood overrides colors
  if(!juiceMood && elT - lastFullTOD > 30){
    lastFullTOD = elT;
    applyTOD(realTOD());
  }

  // Animate tree sway
  if(treeMat&&treeMat.userData.shader)treeMat.userData.shader.uniforms.uTime.value=elT;
  if(currentWater)currentWater.position.y=-0.2+Math.sin(elT*0.8)*0.02;
  for(var i=0;i<juiceWind.length;i++){ if(juiceWind[i].userData.shader)juiceWind[i].userData.shader.uniforms.uTime.value=elT; }

  /* pulse juicePulse items (scatter, aura, lights, flames) */
  for(var j=0;j<juicePulse.length;j++){ var u=juicePulse[j];
    if(u.scatter){
      u.scatter.opacity=(u.base||0.6)+0.14*Math.sin(elT*2.2);
    }
    if(u.shell){
      var nf=nightNow();
      var nb=0.75+0.55*nf;
      u.shell.opacity=(0.13+0.05*Math.sin(elT*1.4))*nb;
      u.ground.opacity=(0.12+0.05*Math.sin(elT*1.8+1.0))*nb;
    }
    if(u.light){ var fl=.7+.45*Math.abs(Math.sin(elT*12+j)); u.light.intensity=(.6+nightNow()*1.6)*fl; }
    if(u.flame){ u.flame.scale.set(.8+.2*Math.sin(elT*11),.9+.35*Math.abs(Math.sin(elT*8)),.8+.2*Math.cos(elT*10)); u.flame.rotation.y=elT*.7; }
    if(u.flame2){ u.flame2.scale.set(.7+.2*Math.sin(elT*13),.8+.3*Math.abs(Math.sin(elT*9)),.7+.2*Math.cos(elT*12)); }
    if(u.body){ u.body.material.opacity=.7+.25*Math.abs(Math.sin(elT*3+j)); }
    if(u.orb){ u.orb.scale.setScalar(1+.12*Math.sin(elT*2+j)); }
  }

  /* particles update */
  if(juiceParticles){
    var pa = juiceParticles.geo.attributes.position.array;
    var beh = juiceParticles.beh;

    for(var pi = 0; pi < juiceParticles.bases.length; pi++){
      var b = juiceParticles.bases[pi];

      if(beh==='rise'){
        pa[pi*3] = b.x + Math.sin(elT * b.sp + b.ph) * 0.5;
        pa[pi*3+1] = 0.4 + ((b.y + elT * b.sp * 1.4) % 5.5);
        pa[pi*3+2] = b.z + Math.cos(elT * b.sp + b.ph) * 0.5;
      }
      else if(beh==='fall'){
        pa[pi*3] = b.x + Math.sin(elT * b.sp + b.ph) * 0.7;
        pa[pi*3+1] = 5.8 - ((b.y + elT * b.sp * 1.1) % 5.5);
        pa[pi*3+2] = b.z + Math.cos(elT * b.sp * 0.8 + b.ph) * 0.7;
      }
      else if(beh==='blink'){
        pa[pi*3] = b.x + Math.sin(elT * b.sp + b.ph) * 0.5;
        pa[pi*3+1] = b.y + Math.sin(elT * b.sp * 1.3 + b.ph) * 0.4;
        pa[pi*3+2] = b.z + Math.cos(elT * b.sp * 0.9 + b.ph) * 0.5;
        juiceParticles.mat.opacity = 0.35 + 0.55 * Math.max(0, Math.sin(elT * 1.5 + b.ph * 3));
      }
      else{
        pa[pi*3] = b.x + Math.sin(elT * b.sp + b.ph) * 0.7;
        pa[pi*3+1] = b.y + Math.sin(elT * b.sp * 0.7 + b.ph) * 0.5;
        pa[pi*3+2] = b.z + Math.cos(elT * b.sp * 0.8 + b.ph) * 0.7;
      }
    }
    juiceParticles.geo.attributes.position.needsUpdate = true;
  }

  /* creatures update */
  if(juiceCreatures){
    var carr = juiceCreatures.geo.attributes.position.array;

    for(var ci = 0; ci < juiceCreatures.n; ci++){
      var ca = elT * (juiceCreatures.beh==='bird' ? 0.5 : 0.8) + ci * 2.1;

      if(juiceCreatures.beh==='koi'){
        var kr = 3.2 + (ci % 3) * 1.1;
        carr[ci*3] = Math.cos(ca) * kr;
        carr[ci*3+1] = -0.04;
        carr[ci*3+2] = Math.sin(ca) * kr;
      }
      else if(juiceCreatures.beh==='bird'){
        var br = 6.5 + (ci % 4) * 1.4;
        carr[ci*3] = Math.cos(ca * 0.7) * br;
        carr[ci*3+1] = 4.6 + Math.sin(ca * 1.3 + ci) * 1.1;
        carr[ci*3+2] = Math.sin(ca * 0.7) * br;
      }
      else if(juiceCreatures.beh==='fox'){
        var fr = 2.2 + Math.sin(elT * 0.3 + ci) * 1.2;
        var fx = Math.cos(ca * 0.4 + ci) * fr;
        var fz = Math.sin(ca * 0.4 + ci) * fr;

        carr[ci*3] = fx;
        carr[ci*3+1] = Math.max(0.25, heightAt(fx, fz) + 0.28);
        carr[ci*3+2] = fz;
      }
      else{
        var bx = Math.cos(ca) * (2.0 + ci * 0.35) + Math.sin(elT * 2 + ci) * 0.4;
        var bz = Math.sin(ca) * (2.0 + ci * 0.35) + Math.cos(elT * 1.7 + ci) * 0.4;

        carr[ci*3] = bx;
        carr[ci*3+1] = 0.75 + Math.sin(elT * 3 + ci) * 0.35;
        carr[ci*3+2] = bz;
      }
    }

    juiceCreatures.geo.attributes.position.needsUpdate = true;

    if(juiceCreatures.beh==='fly'){
      juiceCreatures.mat.opacity = 0.72 + 0.22 * Math.sin(elT * 3);
    }
  }

  /* --- MOOD LERP (if active) --- */
  if(juiceMood){
    var mk = Math.min(1, dt * 2.0);
    if(skyEnv){
      skyEnv.top.lerp(juiceMood.skyTop, mk);
      skyEnv.bottom.lerp(juiceMood.skyBot, mk);
    }
    if(scene.fog){
      scene.fog.color.lerp(juiceMood.fog, mk);
    }
    if(currentWater && currentWater.material){
      currentWater.material.color.lerp(juiceMood.water, mk);
    }
    if(sunLight){
      sunLight.color.lerp(juiceMood.sun, mk);
    }
    if(hemiLight){
      hemiLight.color.lerp(juiceMood.hemi, mk);
    }
    if(renderer && renderer.toneMappingExposure !== undefined){
      renderer.toneMappingExposure += (juiceMood.exposure - renderer.toneMappingExposure) * mk;
    }
  }

  renderer.render(scene,camera);
}
function nightNow(){ var d=new Date(); var t=(d.getHours()+d.getMinutes()/60)/24; return clamp01(Math.abs(t-0.5)*2); }

/* ---------- controls ---------- */
function viewRadius(){ return Math.max(10.5, LAND_R * 1.22); }
function makeControls(cv){
  var target=new THREE.Vector3(0,0,0),theta=0.7,phi=0.98,radius=viewRadius(),minR=4;
  var pointers=new Map(),mode=null,lastPinchDist=0,lastMid={x:0,y:0};
  function clampR(){ radius=Math.max(minR,Math.min(Math.max(140,LAND_R*5),radius)); }
  function update(){ var sp=Math.sin(phi),cp=Math.cos(phi); camera.position.set(target.x+radius*sp*Math.sin(theta),target.y+radius*cp,target.z+radius*sp*Math.cos(theta)); camera.lookAt(target); }
  function pan(dx,dy){ var sc=radius*0.0011; var r=new THREE.Vector3().setFromMatrixColumn(camera.matrix,0),u=new THREE.Vector3().setFromMatrixColumn(camera.matrix,1); target.addScaledVector(r,-dx*sc); target.addScaledVector(u,dy*sc); if(target.length()>LAND_R*1.4)target.setLength(LAND_R*1.4); }
  function two(){ var a=[]; pointers.forEach(function(p){ a.push(p); }); return a; }
  function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
  function mid(a,b){ return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}; }
  cv.addEventListener('pointerdown',function(e){ try{ cv.setPointerCapture(e.pointerId); }catch(err){} pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,button:e.button,shift:e.shiftKey}); if(pointers.size===1)mode=((e.button===2)||(e.button===1)||e.shiftKey||e.ctrlKey)?'pan':'rotate'; else if(pointers.size===2){ mode='pinch'; var p=two(); lastPinchDist=dist(p[0],p[1]); lastMid=mid(p[0],p[1]); } });
  cv.addEventListener('pointermove',function(e){ if(!pointers.has(e.pointerId))return; var p=pointers.get(e.pointerId),dx=e.clientX-p.x,dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY; if(pointers.size===1){ if(mode==='rotate'){ theta-=dx*0.005; phi=Math.max(0.18,Math.min(1.45,phi-dy*0.005)); } else if(mode==='pan')pan(dx,dy); } else if(pointers.size===2){ var arr=two(),d=dist(arr[0],arr[1]),m=mid(arr[0],arr[1]); if(lastPinchDist>0){ radius*=lastPinchDist/d; clampR(); } pan(m.x-lastMid.x,m.y-lastMid.y); lastPinchDist=d; lastMid=m; } });
  function endP(e){ if(pointers.has(e.pointerId))pointers.delete(e.pointerId); if(pointers.size<2)lastPinchDist=0; if(pointers.size===1){ var rem=pointers.values().next().value; mode=(rem.button===2||rem.shift)?'pan':'rotate'; } if(pointers.size===0)mode=null; }
  cv.addEventListener('pointerup',endP); cv.addEventListener('pointercancel',endP);
  cv.addEventListener('wheel',function(e){ e.preventDefault(); radius*=1+Math.sign(e.deltaY)*0.08; clampR(); },{passive:false});
  cv.addEventListener('contextmenu',function(e){ e.preventDefault(); });
  return {update:update,reset:function(r){ target.set(0,0,0); theta=0.7; phi=0.98; radius=r||viewRadius(); clampR(); }}; }

/* ---------- data ---------- */
function getRange(period,anchor){ var end=anchor?new Date(anchor+'T23:59:59'):new Date(); if(isNaN(end.getTime()))end=new Date(); end.setHours(23,59,59,999); var start,prevStart=null,prevEnd=null; if(period==='today'){ start=new Date(anchor+'T00:00:00'); } else if(period==='yesterday'){ var yd=new Date(new Date(anchor+'T00:00:00').getTime()-86400000); var y=jd(yd); start=new Date(y+'T00:00:00'); end=new Date(y+'T23:59:59.999'); } else if(period==='all'){ start=new Date(0); } else { var days=period==='week'?7:period==='month'?30:365; start=new Date(end.getTime()); start.setDate(start.getDate()-(days-1)); start.setHours(0,0,0,0); prevEnd=new Date(start.getTime()-1); prevStart=new Date(prevEnd.getTime()); prevStart.setDate(prevStart.getDate()-(days-1)); prevStart.setHours(0,0,0,0); prevEnd.setHours(23,59,59,999); } return {start:start,end:end,prevStart:prevStart,prevEnd:prevEnd}; }
function jd(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
function computeData(){
  var bank=getBank(),range=getRange(state.period,state.endDate),today=todayISO();
  var list=[],prevCount=0,bySubject={physics:0,chemistry:0,maths:0},oaks=0,eloSum=0,maxElo=0,solvedByDate={};
  function addStats(subj,elo){ if(bySubject[subj]!=null)bySubject[subj]++; eloSum+=elo; if(elo>maxElo)maxElo=elo; if(elo>=2300)oaks++; }
  for(var i=0;i<bank.length;i++){ var q=bank[i]; if(!q||q.status!=='solved')continue; var t=getTimeMs(q),subj=normSub(q.subject),elo=qEloOf(q); if(t!=null){ var dk=jd(new Date(t)); if(!solvedByDate[dk])solvedByDate[dk]={physics:0,chemistry:0,maths:0}; solvedByDate[dk][subj]++; } var inCur=(state.period==='all')?(t==null?true:t<=range.end.getTime()):(t!=null&&t>=range.start.getTime()&&t<=range.end.getTime()); if(inCur){ list.push(q); addStats(subj,elo); } else if(range.prevStart&&t!=null&&t>=range.prevStart.getTime()&&t<=range.prevEnd.getTime())prevCount++; }
  var dates=allDailyDates(),fg=FG(),cumNow=fg?fg.cum('physics'):0;
  for(var di=0;di<dates.length;di++){ var dk=dates[di]; var ms=new Date(dk+'T12:00:00').getTime(); if(isNaN(ms))continue; if(ms<range.start.getTime()||ms>range.end.getTime())continue; var counts=dailyCounts(dk),solved=solvedByDate[dk]||{physics:0,chemistry:0,maths:0},isToday=dk===todayISO(); ['physics','chemistry','maths'].forEach(function(subj){ var extra=Math.max(0,(counts[subj]||0)-(solved[subj]||0)); for(var n=0;n<extra;n++){ var e2=1000+Math.floor(hash(dk.length+n*7+3,subj.length*3+n*11+1)*800); list.push({subject:subj,qElo:e2,lastReviewedAt:dk+'T12:00:00',status:'solved',synthetic:true,difficulty:0.5,growSeconds:10800,plantCumStudy:isToday?cumNow:(cumNow-10800)}); addStats(subj,e2); } }); }
  if(range.prevStart){ var pdates=allDailyDates(); for(var pi=0;pi<pdates.length;pi++){ var pdk=pdates[pi]; var pms=new Date(pdk+'T12:00:00').getTime(); if(isNaN(pms)||pms<range.prevStart.getTime()||pms>range.prevEnd.getTime())continue; var pc=dailyCounts(pdk),ps=solvedByDate[pdk]||{physics:0,chemistry:0,maths:0}; prevCount+=Math.max(0,(pc.physics||0)-(ps.physics||0))+Math.max(0,(pc.chemistry||0)-(ps.chemistry||0))+Math.max(0,(pc.maths||0)-(ps.maths||0)); } }
  list.sort(function(a,b){ return (getTimeMs(a)||0)-(getTimeMs(b)||0); });
  var delta=range.prevStart?(list.length-prevCount):0;
  return {list:list,stats:{count:list.length,delta:delta,bySubject:bySubject,oaks:oaks,maxElo:maxElo,avgElo:list.length?Math.round(eloSum/list.length):0}};
}
function renderStats(s){ if(!ui.total)return; ui.total.textContent=s.count; ui.delta.textContent=(s.delta>=0?'+':'')+s.delta; ui.oaks.textContent=s.oaks; ui.tall.textContent=s.maxElo?Math.round(s.maxElo):'—'; ui.avg.textContent=s.avgElo?s.avgElo:'—'; ui.countPhysics.textContent=s.bySubject.physics; ui.countChemistry.textContent=s.bySubject.chemistry; ui.countMaths.textContent=s.bySubject.maths; var mx=Math.max(1,s.bySubject.physics,s.bySubject.chemistry,s.bySubject.maths); ui.barPhysics.style.width=Math.round(s.bySubject.physics/mx*100)+'%'; ui.barChemistry.style.width=Math.round(s.bySubject.chemistry/mx*100)+'%'; ui.barMaths.style.width=Math.round(s.bySubject.maths/mx*100)+'%'; }
function radiusFor(c){ return Math.max(10,Math.min(42,10+Math.sqrt(Math.max(0,c))*0.62)); }
function sampleList(list){ if(list.length<=CAP)return list; var out=[],step=list.length/CAP; for(var i=0;i<CAP;i++)out.push(list[Math.floor(i*step)]); return out; }
function clearWorld(){
  juiceParticles=null;
  juiceCreatures=null;
  juiceMood=null;
  juiceWind.length=0;
  juicePulse.length=0;

  if(world){
    scene.remove(world);
    if(world.userData.disposables)world.userData.disposables.forEach(function(x){
      if(x && x.dispose)x.dispose();
    });
  }

  world=new THREE.Group(); world.userData.disposables=[]; currentWater=null; scene.add(world);
}

function buildTerrain(){
  var S=LAND_R*1.5,seg=Math.min(160,Math.max(90,Math.round(LAND_R*4)));
  var lg=new THREE.PlaneGeometry(S*2,S*2,seg,seg);
  lg.rotateX(-Math.PI/2);
  var lp=lg.attributes.position,lc=new Float32Array(lp.count*3);
  for(var i=0;i<lp.count;i++){
    var x=lp.getX(i),z=lp.getZ(i),h=heightAt(x,z);
    lp.setY(i,h);
    var r=Math.hypot(x,z),th=Math.atan2(z,x),t=Math.min(1,r/coastR(th));
    if(h < -0.1){
      lc[i*3] = 0.36;
      lc[i*3+1] = 0.28;
      lc[i*3+2] = 0.16;
    }else if(t > 0.78){
      lc[i*3] = 0.74;
      lc[i*3+1] = 0.62;
      lc[i*3+2] = 0.34;
    }else if(h > 1.25){
      lc[i*3] = 0.42;
      lc[i*3+1] = 0.46;
      lc[i*3+2] = 0.40;
    }else{
      var g = 0.44 + 0.34 * (1 - t);
      lc[i*3] = 0.08 + 0.08 * t;
      lc[i*3+1] = g;
      lc[i*3+2] = 0.10;
    }
  }
  lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  lg.computeVertexNormals();
  var landMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true
  });
  saturateMat(landMat, 1.30);
  world.add(new THREE.Mesh(lg, landMat));

  var wg = new THREE.CircleGeometry(Math.max(60, LAND_R * 3), 64).rotateX(-Math.PI / 2);
  var tint = eqCfg().tint;
  var waterMat = new THREE.MeshStandardMaterial({
    color: TINTW[tint] || 0x23a7d6,
    transparent: true,
    opacity: 0.86,
    roughness: 0.08,
    metalness: 0.35
  });
  saturateMat(waterMat, 1.20);
  var water = new THREE.Mesh(wg, waterMat);
  water.position.y = -0.2;
  world.add(water);
  currentWater = water;
  world.userData.disposables.push(lg, landMat, wg, waterMat);

  try{ if(scene.fog)scene.fog.color.setHex(TINTF[tint]||0x0b1020); }catch(e){}
  var dry=[], step=LAND_R>30?1.2:1.0;
  for(var gx=-S;gx<=S;gx+=step)for(var gz=-S;gz<=S;gz+=step){ var hh=heightAt(gx,gz); if(hh>0.28)dry.push({x:gx,y:hh,z:gz}); }
  dry.sort(function(a,b){ return Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z); });
  return dry;
}
function buildTrees(samples,drySpots){ if(!samples.length||!drySpots.length)return []; var minDist=samples.length>1800?1.05:samples.length>900?1.25:samples.length>300?1.50:1.80; var cell=Math.max(1.0,minDist),grid={}; function key(x,z){ return Math.floor(x/cell)+','+Math.floor(z/cell); } function tooClose(x,z){ var cx=Math.floor(x/cell),cz=Math.floor(z/cell),md2=minDist*minDist; for(var dx=-1;dx<=1;dx++)for(var dz=-1;dz<=1;dz++){ var arr=grid[(cx+dx)+','+(cz+dz)]; if(!arr)continue; for(var i=0;i<arr.length;i++){ var a=arr[i].x-x,b=arr[i].z-z; if(a*a+b*b<md2)return true; } } return false; } function addG(x,z){ var k=key(x,z); if(!grid[k])grid[k]=[]; grid[k].push({x:x,z:z}); } var placed=[],cursor=0,fg=FG();
  for(var i=0;i<samples.length;i++){ var q=samples[i],qElo=qEloOf(q),oak=qElo>=2300,kind=oak?'oak':normSub(q.subject),spot=null; for(var tries=0;tries<700;tries++){ var idx=(cursor+tries)%drySpots.length,s=drySpots[idx],x=s.x+(hash(i+tries,5)-0.5)*0.7,z=s.z+(hash(i+tries,6)-0.5)*0.7,y=heightAt(x,z); if(y<0.28)continue; if(tooClose(x,z))continue; spot={x:x,y:y,z:z}; cursor=(idx+1)%drySpots.length; break; } if(!spot){ var fs=drySpots[cursor%drySpots.length]; spot={x:fs.x,y:fs.y,z:fs.z}; cursor=(cursor+1)%drySpots.length; } addG(spot.x,spot.z); var diff=(q.difficulty!=null)?q.difficulty:(fg?fg.difficultyOf(qElo,kind):0.5); var growSec=q.growSeconds||10800; var plantCum=(q.plantCumStudy!=null)?q.plantCumStudy:((fg?fg.cum(kind):0)-growSec); var mat=fg?fg.maturity(plantCum,growSec,kind):1; var sizeF=fg?fg.sizeFactor(diff):1; var heightF=fg?fg.heightFactor(mat):1; var base=(0.75+Math.min(1,Math.max(0,(qElo-800)/2200))*0.85)*(oak?0.9:1)*(0.85+hash(i,7)*0.3)*sizeF*heightF; placed.push({kind:kind,oak:oak,qElo:qElo,x:spot.x,y:spot.y,z:spot.z,baseScale:base,sy:0.85+hash(i,11)*0.45,sxz:0.90+hash(i,13)*0.25,leanX:(hash(i,17)-0.5)*0.08,leanZ:(hash(i,19)-0.5)*0.08,rot:hash(i,3)*6.283}); }
  var byKind={physics:[],chemistry:[],maths:[],oak:[]}; placed.forEach(function(t){ byKind[t.kind].push(t); }); var dummy=new THREE.Object3D();
  for(var k in byKind){ var arr=byKind[k]; if(!arr.length)continue; var mesh=new THREE.InstancedMesh(treeGeos[k],treeMat,arr.length); mesh.frustumCulled=false; for(var j=0;j<arr.length;j++){ var t=arr[j],sc=Math.max(0.0001,t.baseScale); dummy.position.set(t.x,t.y-0.06,t.z); dummy.rotation.set(t.leanX,t.rot,t.leanZ); dummy.scale.set(t.sxz*sc,t.sy*sc,t.sxz*sc); dummy.updateMatrix(); mesh.setMatrixAt(j,dummy.matrix); } mesh.instanceMatrix.needsUpdate=true; world.add(mesh); }
  return placed;
}
function buildSceneFromList(list){ clearWorld(); LAND_R=radiusFor(list.length); var dry=buildTerrain(); _lastPlaced=buildTrees(sampleList(list),dry); _lastDry=dry; if(controls)controls.reset(viewRadius()); }
function rebuildWorld(){ if(!isOpen||!THREE||!built)return; showLoading(true); setTimeout(function(){ try{ var data=computeData(); renderStats(data.stats); buildSceneFromList(data.list); try{ buildAccountabilityCosmeticsFull(THREE,_lastDry,_lastPlaced); }catch(e){ console.warn('[full-cosmetics]',e); } showLoading(false); }catch(e){ console.warn('[forest-island-full]',e); showLoading(true,'Forest build failed.'); } },30); }

/* === BLACK-TREE FIX (safer lights) === */
(function () {
  if (window.__blackfixWrapped) return; window.__blackfixWrapped = true;
  function fixBlack() {
    try {
      if (!scene || !world || !THREE) return;
      var report = { ctxLost: null, worldKids: world.children.length, matVC: null, matCol: null, geoColor: null, lights: 0, fixed: 0 };
      try { var gl = renderer && renderer.getContext && renderer.getContext(); report.ctxLost = !!(gl && gl.isContextLost && gl.isContextLost()); } catch (e) {}
      try { report.matVC = treeMat ? !!treeMat.vertexColors : null; report.matCol = treeMat && treeMat.color ? treeMat.color.getHexString() : null; } catch (e) {}
      try { report.geoColor = !!(treeGeos && treeGeos.physics && treeGeos.physics.attributes && treeGeos.physics.attributes.color); } catch (e) {}
      try { report.lights = scene.children.filter(function (c) { return c && c.isLight; }).length; } catch (e) {}

      if (!scene.userData.__bflit) {
        var hasLight = scene.children.some(function (c) { return c && c.isLight; });
        if (!hasLight) {
          scene.add(new THREE.AmbientLight(0xffffff, 0.22));
          scene.add(new THREE.HemisphereLight(0xcfe0f0, 0x554433, 0.30));
        }
        scene.userData.__bflit = true;
      }

      world.traverse(function (o) {
        if (!o || !o.isInstancedMesh || !o.geometry) return;
        var g = o.geometry, n = g.attributes.position ? g.attributes.position.count : 0; if (!n) return;
        var ca = g.attributes.color, bad = !ca;
        if (ca) { var a = ca.array; if (!(a[0] > 0 || a[1] > 0 || a[2] > 0) || a[0] !== a[0]) bad = true; }
        if (bad) {
          var c = new Float32Array(n * 3);
          for (var i = 0; i < n; i++) {
            var y = g.attributes.position.getY ? g.attributes.position.getY(i) : 0;
            var t = Math.max(0, Math.min(1, (y + 0.5) / 3.0));
            c[i * 3] = 0.16 + 0.10 * t; c[i * 3 + 1] = 0.45 + 0.25 * t; c[i * 3 + 2] = 0.18 + 0.10 * t;
          }
          g.setAttribute('color', new THREE.BufferAttribute(c, 3)); report.fixed++;
        }
        if (!g.attributes.normal) { g.computeVertexNormals(); report.fixed++; }
        if (o.material) {
          if (o.material.vertexColors && o.material.color) { try { o.material.color.setRGB(1, 1, 1); } catch (e) {} }
          o.material.needsUpdate = true;
          o.frustumCulled = false;
        }
      });
      console.log('[blackfix]', JSON.stringify(report));
    } catch (e) { console.warn('[blackfix] error', e); }
  }
  var _rb = rebuildWorld;
  rebuildWorld = function () { var r = _rb(); setTimeout(fixBlack, 90); setTimeout(fixBlack, 350); return r; };
})();

window.addEventListener('storage', function(e){
  if(!isOpen) return;
  if(!e.key || e.key===K_EQ){
    scheduleRebuild();
  }
});

window.__forestIslandFull={open:openFull,close:closeFull,rebuild:rebuildWorld};
})();