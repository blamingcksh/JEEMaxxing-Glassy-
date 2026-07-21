/* ============================================================================
   forest-island.js — replaces the dashboard "Momentum Tracker" card with a
   small orbiting 3D island that RESETS DAILY and grows one tree per question
   you solve today. ISOLATED + SAFE: it only ever HIDES the original momentum
   content via a class (never deletes nodes), so if the 3D island fails to
   build the candlestick graph is restored automatically and a toast explains.
   The render loop runs ONLY while the dashboard card is on screen and the tab
   is visible, and freezes orbit under reduced-motion / FX-off.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__forestIslandInit) return; window.__forestIslandInit = true;
  var CAP = 400, IFRAME = 1000 / 30;

  function toast(m) { console.warn('[forest-island]', m); try { var d = document.createElement('div'); d.textContent = '⚠ ' + m; Object.assign(d.style, { position:'fixed', left:'50%', bottom:'14px', transform:'translateX(-50%)', zIndex:'60', background:'rgba(20,16,8,.92)', border:'1px solid rgba(255,178,36,.4)', color:'#ffd9a0', padding:'8px 14px', borderRadius:'10px', font:'12px/1.4 monospace', maxWidth:'88vw', boxShadow:'0 8px 24px rgba(0,0,0,.6)', pointerEvents:'none' }); document.body.appendChild(d); setTimeout(function(){ d.style.transition='opacity .5s'; d.style.opacity='0'; setTimeout(function(){ if (d.parentNode) d.parentNode.removeChild(d); }, 600); }, 6000); } catch (_) {} }
  function el(tag, a) { var n = document.createElement(tag); if (a) for (var k in a) { if (k === 'html') n.innerHTML = a[k]; else if (k === 'class') n.className = a[k]; else n.setAttribute(k, a[k]); } return n; }
  function hash(x, z) { var n = Math.sin(x*127.1 + z*311.7) * 43758.5453; return n - Math.floor(n); }
  function vnoise(x, z) { var xi=Math.floor(x), zi=Math.floor(z), xf=x-xi, zf=z-zi, u=xf*xf*(3-2*xf), v=zf*zf*(3-2*zf), a=hash(xi,zi), b=hash(xi+1,zi), c=hash(xi,zi+1), d=hash(xi+1,zi+1); return a*(1-u)*(1-v)+b*u*(1-v)+c*(1-u)*v+d*u*v; }
  function iHeight(x, z) { var r = Math.hypot(x, z); return Math.max(-0.05, (1 - r/12) * 0.7 + (vnoise(x*0.4+10, z*0.4+10) - 0.5) * 0.5); }
  function realTOD() { var d = new Date(); return ((d.getHours() + d.getMinutes()/60) / 24) * 100; }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function normSub(s) { s = (s||'').toString().toLowerCase().trim(); return (s==='math'||s==='mathematics') ? 'maths' : s; }
  function todaySolved() { var qb = window.questionBank || [], tk = todayStr(), out = []; for (var i=0;i<qb.length;i++){ var q = qb[i]; if (!q || q.status !== 'solved') continue; if (!q.lastReviewedAt || q.lastReviewedAt.slice(0,10) !== tk) continue; var s = normSub(q.subject); if (s!=='physics'&&s!=='chemistry'&&s!=='maths') continue; out.push({ subject:s, qElo:(typeof q.qElo==='number'&&q.qElo>0)?q.qElo:1200 }); } return out; }
  function motionOK() { try { return !document.documentElement.classList.contains('fx-effects-off') && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return true; } }
  function easeOutBack(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3*Math.pow(x-1,3) + c1*Math.pow(x-1,2); }

  var THREE = null, iRenderer, iScene, iCam, iEnv = null, itreeMat;
  var iMeshes = {}, iState = { physics:[], chemistry:[], maths:[], oak:[] };
  var iPlanted = [], iTotal = 0, iDate = todayStr();
  var card, host, cvs, countEl, emptyEl;
  var iBuilt = false, iBuilding = false, iVisible = false;
  var iRaf = null, iLast = 0, iLastT = 0, iEl = 0, iOrbit = 0, iLastTOD = 0;
  var dummy = null;

  var TOD = [ { t:0,top:0x0a0e1c,bot:0x141a2a,sun:0x3a4a6a,sunI:0.15,hemi:0x2a3040,fog:0x0e1220 }, { t:22,top:0x2a3a5e,bot:0xe8956a,sun:0xffb27a,sunI:0.70,hemi:0x5a5a6a,fog:0x3a3040 }, { t:50,top:0x4a7ec0,bot:0xc4dcec,sun:0xfff2e0,sunI:1.15,hemi:0x8aa0b8,fog:0x9ab4c8 }, { t:78,top:0x3a2a52,bot:0xe07a44,sun:0xff8a4a,sunI:0.75,hemi:0x6a5060,fog:0x4a3444 }, { t:100,top:0x0a0e1c,bot:0x141a2a,sun:0x3a4a6a,sunI:0.15,hemi:0x2a3040,fog:0x0e1220 } ];
  function iApplyTOD(v) { if (!iEnv) return; var a = TOD[0], b = TOD[TOD.length-1]; for (var i=0;i<TOD.length-1;i++) if (v >= TOD[i].t && v <= TOD[i+1].t) { a = TOD[i]; b = TOD[i+1]; break; } var f = (v-a.t)/Math.max(0.0001,b.t-a.t); function L(x,y){ return new THREE.Color(x).lerp(new THREE.Color(y), f); } iEnv.skyTop.copy(L(a.top,b.top)); iEnv.skyBot.copy(L(a.bot,b.bot)); iEnv.sun.color.copy(L(a.sun,b.sun)); iEnv.sun.intensity = a.sunI+(b.sunI-a.sunI)*f; iEnv.sun.position.set((v/100-0.5)*60, 40, 20); iEnv.hemi.color.copy(L(a.hemi,b.hemi)); iEnv.fog.color.copy(L(a.fog,b.fog)); }

  function loadThree() { var urls = ['https://esm.sh/three@0.160.0', 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', 'https://unpkg.com/three@0.160.0/build/three.module.js']; function t(i){ return new Promise(function (res, rej){ if (i >= urls.length) return rej(new Error('cdn fail')); import(urls[i]).then(res).catch(function(){ t(i+1).then(res, rej); }); }); } return t(0); }
  function prep(g){ return g.index ? g.toNonIndexed() : g; }
  function paint(g,r,gr,b){ g=prep(g); g.deleteAttribute('uv'); var n=g.attributes.position.count, c=new Float32Array(n*3); for(var i=0;i<n;i++){c[i*3]=r;c[i*3+1]=gr;c[i*3+2]=b;} g.setAttribute('color', new THREE.BufferAttribute(c,3)); return g; }
  function paintGrad(g,base,top){ g=prep(g); g.deleteAttribute('uv'); var p=g.attributes.position, n=p.count, c=new Float32Array(n*3), ymin=1e9,ymax=-1e9; for(var i=0;i<n;i++){var y=p.getY(i); if(y<ymin)ymin=y; if(y>ymax)ymax=y;} for(var j=0;j<n;j++){var t=(p.getY(j)-ymin)/Math.max(0.001,ymax-ymin); c[j*3]=base[0]+(top[0]-base[0])*t; c[j*3+1]=base[1]+(top[1]-base[1])*t; c[j*3+2]=base[2]+(top[2]-base[2])*t;} g.setAttribute('color', new THREE.BufferAttribute(c,3)); return g; }
  function mergeGeos(list){ list=list.map(function(g){return g.index?g.toNonIndexed():g;}); var n=0; list.forEach(function(g){n+=g.attributes.position.count;}); var pos=new Float32Array(n*3),nor=new Float32Array(n*3),col=new Float32Array(n*3),o=0; list.forEach(function(g){var c=g.attributes.position.count; pos.set(g.attributes.position.array,o*3); if(g.attributes.normal)nor.set(g.attributes.normal.array,o*3); if(g.attributes.color)col.set(g.attributes.color.array,o*3); o+=c;}); var g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3)); g.setAttribute('color',new THREE.BufferAttribute(col,3)); return g; }
  function spruceGeo(){ var t=paint(new THREE.CylinderGeometry(0.09,0.16,0.9,6).translate(0,0.45,0),0.30,0.20,0.12); var c1=paintGrad(new THREE.ConeGeometry(0.78,1.15,7).translate(0,1.35,0),[0.02,0.46,0.58],[0.10,0.66,0.82]); var c2=paintGrad(new THREE.ConeGeometry(0.60,0.98,7).translate(0,1.98,0),[0.05,0.56,0.72],[0.12,0.76,0.92]); var c3=paintGrad(new THREE.ConeGeometry(0.42,0.82,7).translate(0,2.55,0),[0.10,0.68,0.84],[0.18,0.86,1.0]); return mergeGeos([t,c1,c2,c3]); }
  function roundGeo(){ var t=paint(new THREE.CylinderGeometry(0.11,0.18,1.0,6).translate(0,0.5,0),0.32,0.21,0.12); var b1=paintGrad(new THREE.IcosahedronGeometry(0.82,1).translate(0,1.55,0),[0.05,0.55,0.10],[0.16,0.80,0.18]); var b2=paintGrad(new THREE.IcosahedronGeometry(0.55,1).translate(0.35,2.05,0.1),[0.10,0.68,0.16],[0.24,0.92,0.26]); return mergeGeos([t,b1,b2]); }
  function goldenGeo(){ var t=paint(new THREE.CylinderGeometry(0.10,0.17,0.95,6).translate(0,0.47,0),0.32,0.20,0.11); var d1=paintGrad(new THREE.DodecahedronGeometry(0.78,0).translate(0,1.5,0),[0.85,0.46,0.02],[1.0,0.72,0.06]); var d2=paintGrad(new THREE.DodecahedronGeometry(0.50,0).translate(-0.2,2.1,-0.1),[0.95,0.60,0.04],[1.0,0.84,0.12]); return mergeGeos([t,d1,d2]); }
  function oakGeo(){ var t=paint(new THREE.CylinderGeometry(0.22,0.42,2.4,7).translate(0,1.2,0),0.16,0.11,0.07); var c1=paintGrad(new THREE.IcosahedronGeometry(1.7,1).scale(1.25,0.95,1.25).translate(0,3.1,0),[0.06,0.16,0.05],[0.13,0.30,0.09]); var c2=paintGrad(new THREE.IcosahedronGeometry(1.35,1).scale(1.2,0.9,1.2).translate(0.7,3.9,0.4),[0.08,0.20,0.06],[0.16,0.36,0.12]); var c3=paintGrad(new THREE.IcosahedronGeometry(1.2,1).scale(1.15,0.9,1.15).translate(-0.6,3.8,-0.3),[0.07,0.18,0.06],[0.15,0.34,0.11]); var c4=paintGrad(new THREE.IcosahedronGeometry(1.0,1).scale(1.1,0.85,1.1).translate(0.1,4.5,0.1),[0.10,0.24,0.07],[0.19,0.42,0.14]); return mergeGeos([t,c1,c2,c3,c4]); }

  function sizeCanvas() { if (!iRenderer || !cvs) return; var w = cvs.clientWidth || 300, h = cvs.clientHeight || 220, dpr = Math.min(devicePixelRatio, 2); iRenderer.setSize(w, h, false); iRenderer.setPixelRatio(dpr); iCam.aspect = w/h; iCam.updateProjectionMatrix(); }

  function buildIsland() {
    iRenderer = new THREE.WebGLRenderer({ canvas:cvs, antialias:true, alpha:true });
    iRenderer.setClearColor(0x000000, 0);
    iScene = new THREE.Scene(); iEnv = { fog:new THREE.FogExp2(0x9ab4c8, 0.02) }; iScene.fog = iEnv.fog;
    iCam = new THREE.PerspectiveCamera(50, 1, 0.1, 400); iCam.position.set(0, 15, 24); iCam.lookAt(0, 1, 0);
    var skyMat = new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, uniforms:{ top:{value:new THREE.Color()}, bottom:{value:new THREE.Color()}, off:{value:6}, exp:{value:0.62} }, vertexShader:'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader:'uniform vec3 top,bottom; uniform float off,exp; varying vec3 vW; void main(){ float h=normalize(vW+vec3(0.,off,0.)).y; float t=pow(max(h,0.),exp); gl_FragColor=vec4(mix(bottom,top,t),1.);}' });
    iEnv.skyTop = skyMat.uniforms.top.value; iEnv.skyBot = skyMat.uniforms.bottom.value;
    iScene.add(new THREE.Mesh(new THREE.SphereGeometry(180, 24, 12), skyMat));
    iEnv.hemi = new THREE.HemisphereLight(0x8aa0b8, 0x3a3020, 0.7); iScene.add(iEnv.hemi);
    iEnv.sun = new THREE.DirectionalLight(0xfff2e0, 1.1); iEnv.sun.position.set(10,40,20); iScene.add(iEnv.sun);
    iScene.add(new THREE.AmbientLight(0xffffff, 0.12));
    // island land disc
    var lg = new THREE.CircleGeometry(12, 64); lg.rotateX(-Math.PI/2); var lp = lg.attributes.position, lc = new Float32Array(lp.count*3);
    for (var i=0;i<lp.count;i++){ var x=lp.getX(i), z=lp.getZ(i), h=iHeight(x,z); lp.setY(i,h); var r=Math.hypot(x,z), edge=Math.min(1, Math.max(0,(r-9)/3)); lc[i*3]=0.16+0.10*edge; lc[i*3+1]=0.55-0.25*edge; lc[i*3+2]=0.12+0.10*edge; }
    lg.setAttribute('color', new THREE.BufferAttribute(lc,3)); lg.computeVertexNormals();
    iScene.add(new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, flatShading:true })));
    var water = new THREE.Mesh(new THREE.CircleGeometry(20, 48).rotateX(-Math.PI/2), new THREE.MeshStandardMaterial({ color:0x244a60, transparent:true, opacity:0.82, roughness:0.12, metalness:0.4 }));
    water.position.y = -0.35; iScene.add(water); iEnv.water = water;
    itreeMat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.82, metalness:0, flatShading:true });
    itreeMat.onBeforeCompile = function (sh){ sh.uniforms.uTime={value:0}; sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace('#include <begin_vertex>', "#include <begin_vertex>\n float sw=max(transformed.y-0.7,0.0);\n float ph=instanceMatrix[3][0]*0.6+instanceMatrix[3][2]*0.6;\n transformed.x+=sin(uTime*1.3+ph)*sw*0.03;\n transformed.z+=cos(uTime*1.0+ph)*sw*0.024;"); itreeMat.userData.shader=sh; };
    var geos = { physics:spruceGeo(), chemistry:roundGeo(), maths:goldenGeo(), oak:oakGeo() };
    dummy = new THREE.Object3D();
    for (var k in geos) { var m = new THREE.InstancedMesh(geos[k], itreeMat, CAP); m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); iScene.add(m); iMeshes[k] = m; }
    sizeCanvas(); iApplyTOD(realTOD());
    // replay anything already counted today (instant, no grow)
    iPlanted.forEach(function (q){ addIsland(q, true); });
  }
  function ensureIslandBuilt() { if (iBuilt || iBuilding) return; iBuilding = true; loadThree().then(function (m){ THREE = m; try { buildIsland(); iBuilt = true; if (iVisible) startILoop(); } catch (e) { toast('Daily island failed: ' + (e && e.message || e)); restoreMomentum(); } iBuilding = false; }).catch(function (e){ toast('Could not load 3D for the daily island; momentum graph restored.'); restoreMomentum(); iBuilding = false; }); }

  function writeIsland(k, s, g) { if (!iMeshes[k]) return; var sc = Math.max(0.0001, s.baseScale * g); dummy.position.set(s.x, s.y-0.05, s.z); dummy.rotation.set(s.leanX, s.rot, s.leanZ); dummy.scale.set(s.sxz*sc, s.sy*sc, s.sxz*sc); dummy.updateMatrix(); iMeshes[k].setMatrixAt(s.iid, dummy.matrix); }
  function addIsland(q, instant) {
    if (!iBuilt) return;
    var oak = q.qElo >= 2300, k = oak ? 'oak' : q.subject;
    var ang = iTotal * 2.399963, r = Math.min(10.5, 1.05 * Math.sqrt(iTotal + 0.6));
    var x = Math.cos(ang) * r, z = Math.sin(ang) * r, y = Math.max(0, iHeight(x, z));
    var base = (0.8 + Math.min(1, Math.max(0, (q.qElo-800)/2200)) * 0.8);
    var s = { x:x, y:y, z:z, baseScale:base, sy:0.85+hash(iTotal,11)*0.4, sxz:0.9+hash(iTotal,13)*0.3, leanX:(hash(iTotal,17)-0.5)*0.08, leanZ:(hash(iTotal,19)-0.5)*0.08, rot:hash(iTotal,3)*6.283, cur:instant?1:0, animT0:performance.now(), iid:iState[k].length };
    iState[k].push(s); writeIsland(k, s, s.cur); iMeshes[k].count = iState[k].length; iMeshes[k].instanceMatrix.needsUpdate = true; iTotal++;
  }
  function resetMeshes() { for (var k in iState) { iState[k] = []; if (iMeshes[k]) { iMeshes[k].count = 0; iMeshes[k].instanceMatrix.needsUpdate = true; } } iTotal = 0; }
  function resetIsland() { iPlanted = []; if (iBuilt) resetMeshes(); setCount(0); }
  function setCount(n) { if (countEl) countEl.textContent = n; if (emptyEl) emptyEl.style.display = n > 0 ? 'none' : 'flex'; }

  function iframe(t) {
    if (!iBuilt || !iVisible || document.hidden) { iRaf = null; return; }
    iRaf = requestAnimationFrame(iframe);
    if (t - iLast < IFRAME) return; var dt = Math.min(0.05, (t - iLastT)/1000 || 0); iLastT = t; iLast = t; iEl += dt;
    if (motionOK()) iOrbit += dt * 0.12;
    iCam.position.set(Math.sin(iOrbit)*24, 15, Math.cos(iOrbit)*24); iCam.lookAt(0, 1, 0);
    if (t - iLastTOD > 30000) { iLastTOD = t; iApplyTOD(realTOD()); }
    if (iEnv.water) iEnv.water.position.y = -0.35 + Math.sin(iEl*0.8)*0.02;
    if (itreeMat.userData.shader) itreeMat.userData.shader.uniforms.uTime.value = iEl;
    var now = performance.now();
    for (var k in iState) { var arr = iState[k], dirty = false; for (var i=0;i<arr.length;i++){ var s = arr[i]; if (s.cur < 1) { var p = (now - s.animT0)/600, g; if (p <= 0) g = 0; else if (p >= 1) { g = 1; s.cur = 1; } else { g = easeOutBack(p); s.cur = g; } writeIsland(k, s, g); dirty = true; } } if (dirty) iMeshes[k].instanceMatrix.needsUpdate = true; }
    iRenderer.render(iScene, iCam);
  }
  function startILoop() { if (iRaf == null) { iLast = 0; iRaf = requestAnimationFrame(iframe); } }

  function ipoll() {
    if (!card) return;
    var dash = document.getElementById('view-dashboard');
    iVisible = !!(card.offsetParent !== null && dash && dash.classList.contains('active'));
    var tk = todayStr(); if (tk !== iDate) { iDate = tk; resetIsland(); }
    var today = todaySolved();
    if (today.length < iPlanted.length) resetIsland();
    if (iVisible && !iBuilt) ensureIslandBuilt();
    while (iPlanted.length < today.length) { var q = today[iPlanted.length]; iPlanted.push(q); addIsland(q, false); }
    setCount(today.length);
    if (iVisible && iBuilt && !iRaf) startILoop();
  }

  function restoreMomentum() { if (!card || !card.__fiOrig) return; card.classList.remove('island-active'); var nodes = card.querySelectorAll('.fi-orig'); for (var i=0;i<nodes.length;i++) nodes[i].classList.remove('fi-orig'); if (host && host.parentNode) host.parentNode.removeChild(host); card.__fiOrig = null; iBuilt = false; }

  function mount() {
    if (!document.body) { setTimeout(mount, 300); return; }
    card = document.querySelector('#view-dashboard .dash-card-momentum');
    if (!card) { var all = document.querySelectorAll('#view-dashboard .dash-card'); for (var i=0;i<all.length;i++){ var tt = all[i].querySelector('.box-title'); if (tt && /momentum/i.test(tt.textContent)) { card = all[i]; break; } } }
    if (!card) { toast('Momentum card not found; daily island not mounted.'); return; }
    // tag original content (NOT bento chrome) so we can hide it without deleting anything
    var kids = Array.prototype.slice.call(card.children);
    kids.forEach(function (c){ if (c.id === 'forest-island-host') return; var cl = c.className || ''; if (/bento-handle|bento-handle-v|bento-card-ctrls|bento-scroll/.test(cl)) return; c.classList.add('fi-orig'); });
    card.__fiOrig = true;
    host = el('div', { id:'forest-island-host', html:'<div id="forest-island-head"><div class="fi-titlewrap"><span class="fi-kicker">// TODAY\'S BIOME</span><span class="fi-title">Daily Grove</span></div><div class="fi-right"><div class="fi-count" id="fi-count">0</div><div class="fi-sub">resets at midnight</div></div></div><div style="position:relative;"><canvas id="forest-island-canvas"></canvas><div class="fi-empty" id="fi-empty">No trees yet — solve a question to plant one 🌱</div></div>' });
    card.appendChild(host); card.classList.add('island-active');
    cvs = document.getElementById('forest-island-canvas'); countEl = document.getElementById('fi-count'); emptyEl = document.getElementById('fi-empty');
    try { new ResizeObserver(function () { sizeCanvas(); }).observe(cvs); } catch (e) {}
    try { new IntersectionObserver(function (es){ iVisible = es[0].isIntersecting && !!document.getElementById('view-dashboard').classList.contains('active'); if (iVisible && iBuilt) startILoop(); }).observe(cvs); } catch (e) {}
    document.addEventListener('visibilitychange', function () { if (!document.hidden && iVisible && iBuilt) startILoop(); });
    setInterval(ipoll, 3000); ipoll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();