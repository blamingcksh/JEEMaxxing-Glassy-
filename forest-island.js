/* ============================================================================
   forest-island.js  ·  "Daily Grove" island  (APP file)
   ----------------------------------------------------------------------------
   DEPENDENCY MAP — two worlds, never cross the streams:
     MAIN APP (index.html):  forest-bg.js · forest-island.js · styles.css
     LAB  (forest-lab.html): forest-lab.html · forest-juice.js  (LAB-ONLY!)
   • forest-juice.js is LAB-ONLY — never add it to index.html.
   • ISOLATED: only HIDES the old momentum nodes via a class (never deletes
     them) → if the 3D build fails, the candlestick graph comes back and a
     toast explains. The app can never be blanked by this file.
   • Tree source = TODAY's live counters (physics/chemistry/maths-count),
     watched by a MutationObserver → grows the instant a + tap or a real
     solve moves a counter; resets at midnight.
   ============================================================================ */
/* ============================================================================
   forest-island.js v3 — daily-reset 3D island with real forest spacing,
   island auto-growth, and saturation boost.
   ----------------------------------------------------------------------------
   v3 changes:
   • Real forest spacing: minimum distance between trees, extra clearance for oaks.
   • Island auto-growth: starts bigger, expands when too many trees are planted.
   • Camera gently zooms out as island grows.
   • Saturated colours: richer grass/beach/water, shader saturation, tone mapping.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__forestIslandInit) return; window.__forestIslandInit = true;

  // ── v3 constants ──────────────────────────────────────────────────────────
  var CAP = 1000, IFRAME = 1000 / 30, LAND_R = 10, MIN_LAND_R = 10, MAX_LAND_R = 24;

  function toast(m) { console.warn('[forest-island]', m); try { var d = document.createElement('div'); d.textContent = '⚠ ' + m; Object.assign(d.style, { position:'fixed', left:'50%', bottom:'14px', transform:'translateX(-50%)', zIndex:'60', background:'rgba(20,16,8,.92)', border:'1px solid rgba(255,178,36,.4)', color:'#ffd9a0', padding:'8px 14px', borderRadius:'10px', font:'12px/1.4 monospace', maxWidth:'88vw', boxShadow:'0 8px 24px rgba(0,0,0,.6)', pointerEvents:'none' }); document.body.appendChild(d); setTimeout(function(){ d.style.transition='opacity .5s'; d.style.opacity='0'; setTimeout(function(){ if (d.parentNode) d.parentNode.removeChild(d); }, 600); }, 6000); } catch (_) {} }
  function el(tag, a) { var n = document.createElement(tag); if (a) for (var k in a) { if (k === 'html') n.innerHTML = a[k]; else if (k === 'class') n.className = a[k]; else n.setAttribute(k, a[k]); } return n; }
  function hash(x, z) { var n = Math.sin(x*127.1 + z*311.7) * 43758.5453; return n - Math.floor(n); }
  function vnoise(x, z) { var xi=Math.floor(x), zi=Math.floor(z), xf=x-xi, zf=z-zi, u=xf*xf*(3-2*xf), v=zf*zf*(3-2*zf), a=hash(xi,zi), b=hash(xi+1,zi), c=hash(xi,zi+1), d=hash(xi+1,zi+1); return a*(1-u)*(1-v)+b*u*(1-v)+c*(1-u)*v+d*u*v; }
  function realTOD() { var d = new Date(); return ((d.getHours() + d.getMinutes()/60) / 24) * 100; }
  function normSub(s) { s = (s||'').toString().toLowerCase().trim(); return (s==='math'||s==='mathematics') ? 'maths' : s; }
  function motionOK() { try { return !document.documentElement.classList.contains('fx-effects-off') && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return true; } }
  function easeOutBack(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3*Math.pow(x-1,3) + c1*Math.pow(x-1,2); }

  /* ── irregular island heightfield ── */
  function coastR(th) { return LAND_R * (1 + 0.22*Math.sin(th*3+1.3) + 0.14*Math.sin(th*5+0.4) + 0.12*(vnoise(Math.cos(th)*2+5, Math.sin(th)*2+5)-0.5)); }
  function iHeight(x, z) {
    var r = Math.hypot(x, z), th = Math.atan2(z, x), cr = coastR(th);
    if (r > cr) return -1.2;                                   // submerged skirt
    var t = r / cr;                                            // 0 centre → 1 coast
    var dome = (1 - t*t) * 1.7;
    var beach = t > 0.80 ? -0.7 * ((t-0.80)/0.20) : 0;         // dip into the surf
    var hills = (vnoise(x*0.5+10, z*0.5+10) - 0.5) * 0.9 * (1 - t);
    return Math.max(-0.5, dome + hills + beach);
  }

  /* ── v3 spacing / expansion / saturation helpers ── */
  function saturateMat(mat, amt) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uSat = { value: amt };
      sh.fragmentShader = 'uniform float uSat;\n' + sh.fragmentShader.replace(
        '#include <color_fragment>',
        "#include <color_fragment>\n float lum=dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));\n diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, uSat);"
      );
    };
  }

  function rebuildTerrain() {
    if (!THREE || !iScene) return;
    if (!iEnv) iEnv = {};

    if (iEnv.landMesh) {
      iScene.remove(iEnv.landMesh);
      if (iEnv.landMesh.geometry) iEnv.landMesh.geometry.dispose();
      if (iEnv.landMesh.material) iEnv.landMesh.material.dispose();
    }

    if (iEnv.waterMesh) {
      iScene.remove(iEnv.waterMesh);
      if (iEnv.waterMesh.geometry) iEnv.waterMesh.geometry.dispose();
      if (iEnv.waterMesh.material) iEnv.waterMesh.material.dispose();
    }

    var S = LAND_R * 1.5;
    var seg = Math.min(140, Math.max(96, Math.round(LAND_R * 9)));

    var lg = new THREE.PlaneGeometry(S * 2, S * 2, seg, seg);
    lg.rotateX(-Math.PI / 2);

    var lp = lg.attributes.position;
    var lc = new Float32Array(lp.count * 3);

    for (var i = 0; i < lp.count; i++) {
      var x = lp.getX(i), z = lp.getZ(i), h = iHeight(x, z);
      lp.setY(i, h);

      var r = Math.hypot(x, z);
      var th = Math.atan2(z, x);
      var t = Math.min(1, r / coastR(th));

      // more saturated terrain palette
      if (h < -0.1) {
        lc[i*3] = 0.36; lc[i*3+1] = 0.28; lc[i*3+2] = 0.16; // wet sand
      } else if (t > 0.78) {
        lc[i*3] = 0.74; lc[i*3+1] = 0.62; lc[i*3+2] = 0.34; // beach
      } else if (h > 1.25) {
        lc[i*3] = 0.42; lc[i*3+1] = 0.46; lc[i*3+2] = 0.40; // rock
      } else {
        var g = 0.44 + 0.34 * (1 - t);                               // grass
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

    iEnv.landMesh = new THREE.Mesh(lg, landMat);
    iScene.add(iEnv.landMesh);

    var waterMat = new THREE.MeshStandardMaterial({
      color: 0x23a7d6,
      transparent: true,
      opacity: 0.86,
      roughness: 0.08,
      metalness: 0.35
    });
    saturateMat(waterMat, 1.20);

    iEnv.waterMesh = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(44, LAND_R * 3.4), 64).rotateX(-Math.PI / 2),
      waterMat
    );
    iEnv.waterMesh.position.y = -0.2;
    iScene.add(iEnv.waterMesh);
    iEnv.water = iEnv.waterMesh; // keep compatibility

    // spaced dry-land candidate field
    var dry = [];
    var step = 1.0;

    for (var gx = -S; gx <= S; gx += step) {
      for (var gz = -S; gz <= S; gz += step) {
        var hh = iHeight(gx, gz);
        if (hh > 0.28) dry.push({ x: gx, y: hh, z: gz, d: Math.hypot(gx, gz) });
      }
    }

    dry.sort(function (a, b) { return a.d - b.d; });
    iEnv.drySpots = dry;
  }

  function landCapacity() {
    // rough capacity estimate for spaced planting
    return Math.floor(Math.PI * Math.pow(LAND_R * 0.78, 2) / 2.3);
  }

  function allPlacedTrees() {
    var out = [];
    for (var k in iState) {
      if (Object.prototype.hasOwnProperty.call(iState, k)) out = out.concat(iState[k]);
    }
    return out;
  }

  function preExpandForCount(n) {
    while (landCapacity() < n && LAND_R < MAX_LAND_R) {
      LAND_R = Math.min(MAX_LAND_R, LAND_R + 2);
      rebuildTerrain();
    }
  }

  function expandIsland() {
    if (!iBuilt || LAND_R >= MAX_LAND_R) return;

    LAND_R = Math.min(MAX_LAND_R, LAND_R + 2);
    rebuildTerrain();

    // re-seat existing trees on the new terrain
    for (var k in iState) {
      var arr = iState[k];
      for (var i = 0; i < arr.length; i++) {
        var t = arr[i];
        t.y = Math.max(0.28, iHeight(t.x, t.z));
        writeIsland(k, t, (t.cur != null ? t.cur : 1));
      }
      if (iMeshes[k]) iMeshes[k].instanceMatrix.needsUpdate = true;
    }

    // gentle camera pull-back as the island grows
    if (iCam) {
      var grow = Math.max(0, LAND_R - MIN_LAND_R);
      var camD = 9.4 + grow * 0.55;
      iCam.position.set(
        Math.sin(iOrbit) * camD,
        6.2 + grow * 0.18,
        Math.cos(iOrbit) * camD
      );
      iCam.lookAt(0, 1.25, 0);
    }
  }

  /* ── read the LIVE daily counters (the single source of truth) ── */
  function readLiveCounts() {
    function g(id) { var e = document.getElementById(id); return e ? (parseInt(e.textContent, 10) || 0) : 0; }
    return { physics: g('physics-count'), chemistry: g('chemistry-count'), maths: g('maths-count') };
  }
  /* ── daily persistence + shared visual counts ─────────────────────────── */
  var LS_DAILY = 'jeemax_forest_daily_v1';
  var bootTime = Date.now();
  var userTouched = false;
  var restoreTries = 0;

  try {
    document.addEventListener('pointerdown', function () { userTouched = true; }, { once: true, capture: true });
    document.addEventListener('keydown', function () { userTouched = true; }, { once: true, capture: true });
  } catch (e) {}

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function getBankSafe() {
    try {
      if (Array.isArray(window.questionBank) && window.questionBank.length) return window.questionBank;
      if (window.AppState && Array.isArray(window.AppState.questionBank) && window.AppState.questionBank.length) {
        return window.AppState.questionBank;
      }
    } catch (e) {}
    return [];
  }

  function loadDailyStore() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_DAILY) || '{}');
      return (o && typeof o === 'object') ? o : {};
    } catch (e) {
      return {};
    }
  }

  function saveDailyStore(o) {
    try {
      localStorage.setItem(LS_DAILY, JSON.stringify(o));
    } catch (e) {}
  }

  function getSavedCounts(date) {
    var st = loadDailyStore();
    var c = st[date] || {};
    return {
      physics: parseInt(c.physics, 10) || 0,
      chemistry: parseInt(c.chemistry, 10) || 0,
      maths: parseInt(c.maths, 10) || 0
    };
  }

  function mergeCounts(a, b) {
    return {
      physics: Math.max(a.physics || 0, b.physics || 0),
      chemistry: Math.max(a.chemistry || 0, b.chemistry || 0),
      maths: Math.max(a.maths || 0, b.maths || 0)
    };
  }

  function readVisualCounts() {
    return mergeCounts(readLiveCounts(), getSavedCounts(todayKey()));
  }

  function persistCounts(counts, force) {
    var total = (counts.physics || 0) + (counts.chemistry || 0) + (counts.maths || 0);
    if (!force && !userTouched && total === 0) return;

    var st = loadDailyStore();
    st[todayKey()] = {
      physics: counts.physics || 0,
      chemistry: counts.chemistry || 0,
      maths: counts.maths || 0,
      updatedAt: Date.now()
    };
    saveDailyStore(st);
  }

  function restoreCountersFromStore() {
    var saved = getSavedCounts(todayKey());
    var ids = {
      physics: 'physics-count',
      chemistry: 'chemistry-count',
      maths: 'maths-count'
    };

    var found = false;
    for (var k in ids) {
      var node = document.getElementById(ids[k]);
      if (!node) continue;
      found = true;

      var cur = parseInt(node.textContent, 10) || 0;
      if (cur < saved[k]) node.textContent = String(saved[k]);
    }
    return found;
  }
  /* real solved-today questions per subject (just for qElo / oak flavour) */
  function todayBySubject() {
    var tk = new Date().toISOString().slice(0, 10), out = { physics:[], chemistry:[], maths:[] };
    var qb = getBankSafe();
    for (var i = 0; i < qb.length; i++) { var q = qb[i]; if (!q || q.status !== 'solved') continue; if (!q.lastReviewedAt || q.lastReviewedAt.slice(0,10) !== tk) continue; var s = normSub(q.subject); if (out[s]) out[s].push(q); }
    return out;
  }

  var THREE = null, iRenderer, iScene, iCam, iEnv = null, itreeMat;
  var iMeshes = {}, iState = { physics:[], chemistry:[], maths:[], oak:[] };
  var plantedBySubj = { physics:0, chemistry:0, maths:0 };
  // occupied and spotCursor are no longer used with distance-based allocator,
  // but keep to avoid errors if referenced.
  var occupied = null, spotCursor = 0;
  var card, host, cvs, countEl, emptyEl;
  var iBuilt = false, iBuilding = false, iVisible = false;
  var iRaf = null, iLast = 0, iLastT = 0, iEl = 0, iOrbit = 0, iLastTOD = 0;
  var dummy = null, counterObs = null;

  var TOD = [ { t:0,top:0x0a0e1c,bot:0x141a2a,sun:0x3a4a6a,sunI:0.15,hemi:0x2a3040 }, { t:22,top:0x2a3a5e,bot:0xe8956a,sun:0xffb27a,sunI:0.70,hemi:0x5a5a6a }, { t:50,top:0x4a7ec0,bot:0xc4dcec,sun:0xfff2e0,sunI:1.15,hemi:0x8aa0b8 }, { t:78,top:0x3a2a52,bot:0xe07a44,sun:0xff8a4a,sunI:0.75,hemi:0x6a5060 }, { t:100,top:0x0a0e1c,bot:0x141a2a,sun:0x3a4a6a,sunI:0.15,hemi:0x2a3040 } ];
  function iApplyTOD(v) { if (!iEnv) return; var a = TOD[0], b = TOD[TOD.length-1]; for (var i=0;i<TOD.length-1;i++) if (v >= TOD[i].t && v <= TOD[i+1].t) { a = TOD[i]; b = TOD[i+1]; break; } var f = (v-a.t)/Math.max(0.0001,b.t-a.t); function L(x,y){ return new THREE.Color(x).lerp(new THREE.Color(y), f); } iEnv.skyTop.copy(L(a.top,b.top)); iEnv.skyBot.copy(L(a.bot,b.bot)); iEnv.sun.color.copy(L(a.sun,b.sun)); iEnv.sun.intensity = a.sunI+(b.sunI-a.sunI)*f; iEnv.sun.position.set((v/100-0.5)*60, 40, 20); iEnv.hemi.color.copy(L(a.hemi,b.hemi)); }

  function loadThree() { var urls = ['https://esm.sh/three@0.160.0', 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', 'https://unpkg.com/three@0.160.0/build/three.module.js']; function t(i){ return new Promise(function (res, rej){ if (i >= urls.length) return rej(new Error('cdn fail')); import(urls[i]).then(res).catch(function(){ t(i+1).then(res, rej); }); }); } return t(0); }
  function prep(g){ return g.index ? g.toNonIndexed() : g; }
  function paint(g,r,gr,b){ g=prep(g); g.deleteAttribute('uv'); var n=g.attributes.position.count, c=new Float32Array(n*3); for(var i=0;i<n;i++){c[i*3]=r;c[i*3+1]=gr;c[i*3+2]=b;} g.setAttribute('color', new THREE.BufferAttribute(c,3)); return g; }
  function paintGrad(g,base,top){ g=prep(g); g.deleteAttribute('uv'); var p=g.attributes.position, n=p.count, c=new Float32Array(n*3), ymin=1e9,ymax=-1e9; for(var i=0;i<n;i++){var y=p.getY(i); if(y<ymin)ymin=y; if(y>ymax)ymax=y;} for(var j=0;j<n;j++){var t=(p.getY(j)-ymin)/Math.max(0.001,ymax-ymin); c[j*3]=base[0]+(top[0]-base[0])*t; c[j*3+1]=base[1]+(top[1]-base[1])*t; c[j*3+2]=base[2]+(top[2]-base[2])*t;} g.setAttribute('color', new THREE.BufferAttribute(c,3)); return g; }
  function mergeGeos(list){ list=list.map(function(g){return g.index?g.toNonIndexed():g;}); var n=0; list.forEach(function(g){n+=g.attributes.position.count;}); var pos=new Float32Array(n*3),nor=new Float32Array(n*3),col=new Float32Array(n*3),o=0; list.forEach(function(g){var c=g.attributes.position.count; pos.set(g.attributes.position.array,o*3); if(g.attributes.normal)nor.set(g.attributes.normal.array,o*3); if(g.attributes.color)col.set(g.attributes.color.array,o*3); o+=c;}); var g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3)); g.setAttribute('color',new THREE.BufferAttribute(col,3)); return g; }
  function spruceGeo(){ var t=paint(new THREE.CylinderGeometry(0.09,0.16,0.9,6).translate(0,0.45,0),0.30,0.20,0.12); var c1=paintGrad(new THREE.ConeGeometry(0.78,1.15,7).translate(0,1.35,0),[0.02,0.46,0.58],[0.10,0.66,0.82]); var c2=paintGrad(new THREE.ConeGeometry(0.60,0.98,7).translate(0,1.98,0),[0.05,0.56,0.72],[0.12,0.76,0.92]); var c3=paintGrad(new THREE.ConeGeometry(0.42,0.82,7).translate(0,2.55,0),[0.10,0.68,0.84],[0.18,0.86,1.0]); return mergeGeos([t,c1,c2,c3]); }
  function roundGeo(){ var t=paint(new THREE.CylinderGeometry(0.11,0.18,1.0,6).translate(0,0.5,0),0.32,0.21,0.12); var b1=paintGrad(new THREE.IcosahedronGeometry(0.82,1).translate(0,1.55,0),[0.05,0.55,0.10],[0.16,0.80,0.18]); var b2=paintGrad(new THREE.IcosahedronGeometry(0.55,1).translate(0.35,2.05,0.1),[0.10,0.68,0.16],[0.24,0.92,0.26]); return mergeGeos([t,b1,b2]); }
  function goldenGeo(){ var t=paint(new THREE.CylinderGeometry(0.10,0.17,0.95,6).translate(0,0.47,0),0.32,0.20,0.11); var d1=paintGrad(new THREE.DodecahedronGeometry(0.78,0).translate(0,1.5,0),[0.85,0.46,0.02],[1.0,0.72,0.06]); var d2=paintGrad(new THREE.DodecahedronGeometry(0.50,0).translate(-0.2,2.1,-0.1),[0.95,0.60,0.04],[1.0,0.84,0.12]); return mergeGeos([t,d1,d2]); }
  function oakGeo(){ var t=paint(new THREE.CylinderGeometry(0.22,0.42,2.4,7).translate(0,1.2,0),0.16,0.11,0.07); var c1=paintGrad(new THREE.IcosahedronGeometry(1.7,1).scale(1.25,0.95,1.25).translate(0,3.1,0),[0.06,0.16,0.05],[0.13,0.30,0.09]); var c2=paintGrad(new THREE.IcosahedronGeometry(1.35,1).scale(1.2,0.9,1.2).translate(0.7,3.9,0.4),[0.08,0.20,0.06],[0.16,0.36,0.12]); var c3=paintGrad(new THREE.IcosahedronGeometry(1.2,1).scale(1.15,0.9,1.15).translate(-0.6,3.8,-0.3),[0.07,0.18,0.06],[0.15,0.34,0.11]); var c4=paintGrad(new THREE.IcosahedronGeometry(1.0,1).scale(1.1,0.85,1.1).translate(0.1,4.5,0.1),[0.10,0.24,0.07],[0.19,0.42,0.14]); return mergeGeos([t,c1,c2,c3,c4]); }

  function sizeCanvas() { if (!iRenderer || !cvs) return; var w = cvs.clientWidth || 300, h = cvs.clientHeight || 260, dpr = Math.min(devicePixelRatio, 2); iRenderer.setSize(w, h, false); iRenderer.setPixelRatio(dpr); iCam.aspect = w/h; iCam.updateProjectionMatrix(); }

  /* ── v3 distance-based allocator ── */
  function allocSpot(minDist) {
    var ds = iEnv && iEnv.drySpots;
    if (!ds || !ds.length) return null;

    minDist = minDist || 1.85;

    var trees = allPlacedTrees();
    var cell = Math.max(1.25, minDist);
    var grid = {};

    function gkey(x, z) {
      return Math.floor(x / cell) + ',' + Math.floor(z / cell);
    }

    for (var i = 0; i < trees.length; i++) {
      var t = trees[i];
      var key = gkey(t.x, t.z);
      if (!grid[key]) grid[key] = [];
      grid[key].push(t);
    }

    function tooClose(x, z) {
      var cx = Math.floor(x / cell);
      var cz = Math.floor(z / cell);
      var md2 = minDist * minDist;

      for (var dx = -1; dx <= 1; dx++) {
        for (var dz = -1; dz <= 1; dz++) {
          var arr = grid[(cx + dx) + ',' + (cz + dz)];
          if (!arr) continue;

          for (var j = 0; j < arr.length; j++) {
            var ddx = arr[j].x - x;
            var ddz = arr[j].z - z;
            if (ddx * ddx + ddz * ddz < md2) return true;
          }
        }
      }

      return false;
    }

    // start near the middle, but let spacing force the forest outward naturally
    var start = (Math.random() * Math.min(64, ds.length)) | 0;

    for (var k = 0; k < ds.length; k++) {
      var idx = (start + k) % ds.length;
      var s = ds[idx];

      var x = s.x + (Math.random() - 0.5) * 0.7;
      var z = s.z + (Math.random() - 0.5) * 0.7;
      var y = iHeight(x, z);

      if (y < 0.28) continue;
      if (tooClose(x, z)) continue;

      return { idx: idx, x: x, y: y, z: z };
    }

    return null;
  }

  function freeSpot(idx) {
    // no-op: spacing is now distance-based, not slot-based
  }

  function buildIsland() {
    iRenderer = new THREE.WebGLRenderer({ canvas:cvs, antialias:true, alpha:true });
    iRenderer.setClearColor(0x000000, 0);
    iRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    iRenderer.toneMappingExposure = 1.16;
    iScene = new THREE.Scene();
    iCam = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
    iCam.position.set(0, 6.2, 9.4);
    iCam.lookAt(0, 1.25, 0);

    var skyMat = new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, uniforms:{ top:{value:new THREE.Color()}, bottom:{value:new THREE.Color()}, off:{value:6}, exp:{value:0.62} }, vertexShader:'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader:'uniform vec3 top,bottom; uniform float off,exp; varying vec3 vW; void main(){ float h=normalize(vW+vec3(0.,off,0.)).y; float t=pow(max(h,0.),exp); gl_FragColor=vec4(mix(bottom,top,t),1.);}' });
    iEnv = { skyTop: skyMat.uniforms.top.value, skyBot: skyMat.uniforms.bottom.value };
    iScene.add(new THREE.Mesh(new THREE.SphereGeometry(180, 24, 12), skyMat));
    iEnv.hemi = new THREE.HemisphereLight(0x8aa0b8, 0x3a3020, 0.7); iScene.add(iEnv.hemi);
    iEnv.sun = new THREE.DirectionalLight(0xfff2e0, 1.1); iEnv.sun.position.set(10,40,20); iScene.add(iEnv.sun);
    iScene.add(new THREE.AmbientLight(0xffffff, 0.12));

    // build terrain using v3 helpers
    rebuildTerrain();

    // Trees
    itreeMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.78,
      metalness: 0.02,
      flatShading: true
    });

    itreeMat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = { value: 0 };
      sh.uniforms.uSat = { value: 1.45 };

      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        "#include <begin_vertex>\n float sw=max(transformed.y-0.7,0.0);\n float ph=instanceMatrix[3][0]*0.6+instanceMatrix[3][2]*0.6;\n transformed.x+=sin(uTime*1.3+ph)*sw*0.03;\n transformed.z+=cos(uTime*1.0+ph)*sw*0.024;"
      );

      sh.fragmentShader = 'uniform float uSat;\n' + sh.fragmentShader.replace(
        '#include <color_fragment>',
        "#include <color_fragment>\n float lum=dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));\n diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, uSat);"
      );

      itreeMat.userData.shader = sh;
    };

    var geos = { physics:spruceGeo(), chemistry:roundGeo(), maths:goldenGeo(), oak:oakGeo() };
    dummy = new THREE.Object3D();
    for (var k in geos) { var m = new THREE.InstancedMesh(geos[k], itreeMat, CAP); m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); iScene.add(m); iMeshes[k] = m; }

        sizeCanvas(); iApplyTOD(realTOD());

    // Pre-expand the island based on current live counts
    var liveNow = readLiveCounts();
    preExpandForCount((liveNow.physics || 0) + (liveNow.chemistry || 0) + (liveNow.maths || 0));

    window.__forestIslandAPI = {
      version: 3,
      THREE: THREE,
      renderer: iRenderer,
      scene: iScene,
      camera: iCam,
      env: iEnv,
      meshes: iMeshes,
      trees: iState,
      drySpots: iEnv.drySpots,
      heightAt: iHeight,
      coastR: coastR,
      motionOK: motionOK,
      readLiveCounts: readLiveCounts,
      total: iTotal,
      initialSync: true,
      SUBJECTS: {
        physics: { color: new THREE.Color(0x4cc9ff) },
        chemistry: { color: new THREE.Color(0x39d98a) },
        maths: { color: new THREE.Color(0xffb224) },
        oak: { color: new THREE.Color(0xd9a066) }
      },
      onFrame: [],
      onPlanted: [],
      topY: function (t) {
        var sc = (t.baseScale || 1) * (t.sy || 1);
        return (t.y || 0) + 2.1 * Math.max(0.2, sc);
      }
    };

    window.__forestIslandAPI.initialSync = true;
    syncToLive();
    window.__forestIslandAPI.initialSync = false;
  }

  function ensureIslandBuilt() { if (iBuilt || iBuilding) return; iBuilding = true; loadThree().then(function (m){ THREE = m; try { iBuilt = true; buildIsland(); if (iVisible) startILoop(); } catch (e) { iBuilt = false; toast('Daily island failed: ' + (e && e.message || e)); restoreMomentum(); } iBuilding = false; }).catch(function (e){ toast('Could not load 3D for the daily island; momentum graph restored.'); restoreMomentum(); iBuilding = false; }); }

  function writeIsland(k, s, g) { if (!iMeshes[k]) return; var sc = Math.max(0.0001, s.baseScale * g); dummy.position.set(s.x, s.y-0.05, s.z); dummy.rotation.set(s.leanX, s.rot, s.leanZ); dummy.scale.set(s.sxz*sc, s.sy*sc, s.sxz*sc); dummy.updateMatrix(); iMeshes[k].setMatrixAt(s.iid, dummy.matrix); }

  function addIsland(q, instant) {
    if (!iBuilt) return;
    var oak = (q.qElo || 1200) >= 2300, k = oak ? 'oak' : q.subject;
    var minD = oak ? 2.7 : 1.85;

    var sp = allocSpot(minD);

    if (!sp) {
      expandIsland();
      sp = allocSpot(minD) || allocSpot(minD * 0.82);
    }

    if (!sp) {
      var fb = (iEnv.drySpots && iEnv.drySpots.length)
        ? iEnv.drySpots[(Math.random() * iEnv.drySpots.length) | 0]
        : { x: 0, y: 0.5, z: 0 };

      sp = {
        idx: -1,
        x: fb.x + (Math.random() - 0.5) * 0.8,
        y: Math.max(0.28, iHeight(fb.x, fb.z)),
        z: fb.z + (Math.random() - 0.5) * 0.8
      };
    }

    var base = (0.95 + Math.min(1, Math.max(0, ((q.qElo||1200)-800)/2200)) * 0.95) * (oak ? 1.0 : 1.0);
    var s = {
      x: sp.x,
      y: sp.y,
      z: sp.z,
      subject: k,
      qElo: q.qElo || 1200,
      oak: oak,
      plantedAt: Date.now(),
      baseScale: base,
      sy: 0.9 + hash(iTotal(), 11) * 0.4,
      sxz: 0.95 + hash(iTotal(), 13) * 0.3,
      leanX: (hash(iTotal(), 17) - 0.5) * 0.08,
      leanZ: (hash(iTotal(), 19) - 0.5) * 0.08,
      rot: hash(iTotal(), 3) * 6.283,
      cur: instant ? 1 : 0,
      animT0: performance.now(),
      iid: iState[k].length
    };
    iState[k].push(s); writeIsland(k, s, s.cur); iMeshes[k].count = iState[k].length; iMeshes[k].instanceMatrix.needsUpdate = true;

    if (window.__forestIslandAPI) {
      var interactive = !instant && !window.__forestIslandAPI.initialSync;
      for (var h = 0; h < window.__forestIslandAPI.onPlanted.length; h++) {
        try { window.__forestIslandAPI.onPlanted[h](s, interactive); } catch (e) {}
      }
    }
  }

  function iTotal() { return plantedBySubj.physics + plantedBySubj.chemistry + plantedBySubj.maths; }
  function setCount(n) { if (countEl) countEl.textContent = n; if (emptyEl) emptyEl.style.display = n > 0 ? 'none' : 'flex'; }

  /* ── sync to live counters, with island expansion if needed ── */
  function syncToLive() {
    if (!iBuilt) return;
    var live = readVisualCounts(), today = todayBySubject();

    var totalWant = (live.physics || 0) + (live.chemistry || 0) + (live.maths || 0);
    while (iBuilt && landCapacity() < totalWant && LAND_R < MAX_LAND_R) {
      expandIsland();
    }

    ['physics', 'chemistry', 'maths'].forEach(function (subj) {
      var want = live[subj] || 0, have = plantedBySubj[subj];
      while (have < want) {
        var q = (today[subj] && today[subj][have]) || { subject:subj, qElo:1200 };
        addIsland(q, false); have++; plantedBySubj[subj] = have;
      }
      if (have > want) {
        var drop = have - want;
        for (var d = 0; d < drop; d++) {
          iState[subj].pop(); // no need to free spot
        }
        plantedBySubj[subj] = want;
        if (iMeshes[subj]) { iMeshes[subj].count = iState[subj].length; iMeshes[subj].instanceMatrix.needsUpdate = true; }
      }
    });
    setCount(iTotal());
  }

  function iframe(t) {
    if (!iBuilt || !iVisible || document.hidden) { iRaf = null; return; }
    iRaf = requestAnimationFrame(iframe);
    if (t - iLast < IFRAME) return; var dt = Math.min(0.05, (t - iLastT)/1000 || 0); iLastT = t; iLast = t; iEl += dt;
    if (motionOK()) iOrbit += dt * 0.12;

    var camD = 9.4 + Math.max(0, LAND_R - MIN_LAND_R) * 0.55;
    iCam.position.set(
      Math.sin(iOrbit) * camD,
      6.2 + Math.max(0, LAND_R - MIN_LAND_R) * 0.18,
      Math.cos(iOrbit) * camD
    );
    iCam.lookAt(0, 1.25, 0);

    if (t - iLastTOD > 30000) { iLastTOD = t; iApplyTOD(realTOD()); }
    if (iEnv.water) iEnv.water.position.y = -0.2 + Math.sin(iEl*0.8)*0.02;
    if (itreeMat.userData.shader) itreeMat.userData.shader.uniforms.uTime.value = iEl;
    var now = performance.now();
    for (var k in iState) { var arr = iState[k], dirty = false; for (var i=0;i<arr.length;i++){ var s = arr[i]; if (s.cur < 1) { var p = (now - s.animT0)/600, g; if (p <= 0) g = 0; else if (p >= 1) { g = 1; s.cur = 1; } else { g = easeOutBack(p); s.cur = g; } writeIsland(k, s, g); dirty = true; } } if (dirty) iMeshes[k].instanceMatrix.needsUpdate = true; }

    if (window.__forestIslandAPI) {
      for (var h = 0; h < window.__forestIslandAPI.onFrame.length; h++) {
        try { window.__forestIslandAPI.onFrame[h](iEl, dt); } catch (e) {}
      }
    }
    iRenderer.render(iScene, iCam);
  }

  function startILoop() { if (iRaf == null) { iLast = 0; iRaf = requestAnimationFrame(iframe); } }

/* ── full-screen Growth Forest Lab overlay ── */
var labOverlay = null, labFrame = null;

function ensureForestLabOverlay() {
  if (labOverlay) return;

  labOverlay = el('div', {
    id: 'forest-lab-overlay',
    class: 'forest-lab-overlay',
    html:
      '<div class="forest-lab-shell">' +
        '<div class="forest-lab-loading">Loading Growth Forest…</div>' +
        '<iframe id="forest-lab-frame" class="forest-lab-frame" title="Growth Forest Lab" allow="fullscreen"></iframe>' +
        '<div class="forest-lab-actions">' +
          '<button type="button" class="forest-lab-btn" id="forest-lab-newtab" title="Open in new tab">⧉</button>' +
          '<button type="button" class="forest-lab-btn" id="forest-lab-close" title="Close">✕</button>' +
        '</div>' +
      '</div>'
  });

  document.body.appendChild(labOverlay);

  labFrame = labOverlay.querySelector('#forest-lab-frame');

  labFrame.addEventListener('load', function () {
  if (labOverlay.classList.contains('open')) labOverlay.classList.add('loaded');

  try {
    labFrame.contentWindow.postMessage({
      type: 'JEEMAX_FOREST_DATA',
      questionBank: window.questionBank || []
    }, '*');
  } catch (e) {}
});

  labOverlay.querySelector('#forest-lab-close').addEventListener('click', closeForestLab);

  labOverlay.querySelector('#forest-lab-newtab').addEventListener('click', function () {
    window.open('./forest-lab.html', '_blank', 'noopener');
  });

  labOverlay.addEventListener('click', function (e) {
    if (e.target === labOverlay) closeForestLab();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && labOverlay && labOverlay.classList.contains('open')) {
      closeForestLab();
    }
  });
}

function openForestLab() {
  ensureForestLabOverlay();

  labOverlay.classList.remove('loaded');
  labOverlay.classList.add('open');
  document.body.classList.add('forest-lab-open');

  if (!labFrame.src || labFrame.src.indexOf('forest-lab.html') === -1) {
    labFrame.src = './forest-lab.html';
  }

  // pause the little island while the big lab is open
  if (iRaf != null) {
    cancelAnimationFrame(iRaf);
    iRaf = null;
  }

  var closeBtn = labOverlay.querySelector('#forest-lab-close');
  if (closeBtn) closeBtn.focus();
}

function closeForestLab() {
  if (!labOverlay || !labOverlay.classList.contains('open')) return;

  labOverlay.classList.remove('open');
  document.body.classList.remove('forest-lab-open');

  setTimeout(function () {
    if (labFrame) labFrame.src = 'about:blank';
    if (labOverlay) labOverlay.classList.remove('loaded');
  }, 320);

  // resume the island if it should still be running
  if (iBuilt && iVisible && iRaf == null) startILoop();

  if (cvs) cvs.focus();
}

  function restoreMomentum() { if (!card || !card.__fiOrig) return; card.classList.remove('island-active'); var nodes = card.querySelectorAll('.fi-orig'); for (var i=0;i<nodes.length;i++) nodes[i].classList.remove('fi-orig'); if (host && host.parentNode) host.parentNode.removeChild(host); card.__fiOrig = null; iBuilt = false; }

  function mount() {
    if (!document.body) { setTimeout(mount, 300); return; }
    card = document.querySelector('#view-dashboard .dash-card-momentum');
    if (!card) { var all = document.querySelectorAll('#view-dashboard .dash-card'); for (var i=0;i<all.length;i++){ var tt = all[i].querySelector('.box-title'); if (tt && /momentum/i.test(tt.textContent)) { card = all[i]; break; } } }
    if (!card) { toast('Momentum card not found; daily island not mounted.'); return; }
    var kids = Array.prototype.slice.call(card.children);
    kids.forEach(function (c){ if (c.id === 'forest-island-host') return; var cl = c.className || ''; if (/bento-handle|bento-handle-v|bento-card-ctrls|bento-scroll/.test(cl)) return; c.classList.add('fi-orig'); });
    card.__fiOrig = true;
    host = el('div', { id:'forest-island-host', html:'<div id="forest-island-head"><div class="fi-titlewrap"><span class="fi-kicker">// TODAY\'S BIOME</span><span class="fi-title">Daily Grove</span></div><div class="fi-right"><div class="fi-count" id="fi-count">0</div><div class="fi-sub">resets at midnight</div></div></div><div style="position:relative;"><canvas id="forest-island-canvas"></canvas><div class="fi-empty" id="fi-empty">No trees yet — solve a question or tap + to plant one 🌱</div></div>' });
    card.appendChild(host); card.classList.add('island-active');
    cvs = document.getElementById('forest-island-canvas');
countEl = document.getElementById('fi-count');
emptyEl = document.getElementById('fi-empty');

try {
  var headRight = host.querySelector('.fi-right');
  if (headRight) {
    var expandBtn = el('button', {
      id: 'fi-expand',
      class: 'fi-expand',
      type: 'button',
      title: 'Open full Growth Forest',
      html: '⛶'
    });
    headRight.insertBefore(expandBtn, headRight.firstChild);
    expandBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openForestLab();
    });
  }

  if (cvs) {
    cvs.title = 'Click to open full Growth Forest';
    cvs.setAttribute('tabindex', '0');
    cvs.setAttribute('role', 'button');
    cvs.setAttribute('aria-label', 'Open full Growth Forest');

    cvs.addEventListener('click', openForestLab);

    cvs.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openForestLab();
      }
    });
  }
} catch (e) {}
    try { new ResizeObserver(function () { sizeCanvas(); }).observe(cvs); } catch (e) {}
    try { new IntersectionObserver(function (es){ iVisible = es[0].isIntersecting && !!document.getElementById('view-dashboard').classList.contains('active'); if (iVisible && iBuilt) startILoop(); }).observe(cvs); } catch (e) {}
    document.addEventListener('visibilitychange', function () { if (!document.hidden && iVisible && iBuilt) startILoop(); });
    // react the instant a counter changes (manual +/- OR a real solve) — no 3s wait
    try {
      var lastCounterSig = JSON.stringify(readLiveCounts());
      var syncPending = false;

      counterObs = new MutationObserver(function () {
        if (syncPending) return;
        syncPending = true;

        requestAnimationFrame(function () {
          syncPending = false;

          var live = readLiveCounts();
          var sig = JSON.stringify(live);
          if (sig === lastCounterSig) return;
          lastCounterSig = sig;

          var saved = getSavedCounts(todayKey());
          var liveTotal = (live.physics || 0) + (live.chemistry || 0) + (live.maths || 0);
          var savedTotal = (saved.physics || 0) + (saved.chemistry || 0) + (saved.maths || 0);

          // If the app resets counters to 0 on load, restore today's saved trees.
          if (!userTouched && liveTotal === 0 && savedTotal > 0) {
            restoreCountersFromStore();
          } else {
            persistCounts(live, false);
          }

          syncToLive();
          if (iVisible && !iBuilt) ensureIslandBuilt();
        });
      });

      counterObs.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } catch (e) {}
    setInterval(function () {                                       // safety net + visibility/date
      var dash = document.getElementById('view-dashboard');
      iVisible = !!(card.offsetParent !== null && dash && dash.classList.contains('active'));
      if (iVisible && !iBuilt) ensureIslandBuilt();
      syncToLive();
      if (iVisible && iBuilt && !iRaf) startILoop();
    }, 3000);

    (function ensureRestored() {
      var found = restoreCountersFromStore();
      if (!found && restoreTries++ < 20) setTimeout(ensureRestored, 250);
    })();

    persistCounts(readVisualCounts(), true);

    syncToLive();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
