/* forest-premium.js — production art-direction pass for ALL three forest scenes.
   Adopts each scene and upgrades: tree geometry (lumpy clustered canopies,
   bent trunks, branch stubs, baked top-light + AO), wind grass, rocks,
   wave/fresnel/specular water, sun disc + clouds + stars, 3-light rig.
   • Daily Grove (island): upgraded via window.__forestIslandAPI — NO edit needed.
   • Wallpaper (bg) + Full explorer: need the 1-line enabler at EOF (below).
   ISOLATED + guarded: every scene is wrapped in try/catch; a failure in one
   never breaks the others or the app. Reuses each scene's own tree material
   (so its wind keeps working) and never disposes shared geometry. */
(function () {
'use strict';
if (window.__forestPremiumInit) return; window.__forestPremiumInit = true;

var anim = { grass: [], water: [], cloud: [], sun: [], star: [] };
var done = { island: false, bg: false, full: false };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function hash2(x, y) { var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function nightNow() { var d = new Date(); var t = (d.getHours() + d.getMinutes() / 60) / 24; return clamp(Math.abs(t - 0.5) * 2, 0, 1); }

function glowTex(THREE) {
  var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d');
  var r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = r; x.fillRect(0, 0, 64, 64); var t = new THREE.CanvasTexture(c); try { t.colorSpace = THREE.SRGBColorSpace; } catch (e) {} return t;
}
function cloudTex(THREE) {
  var c = document.createElement('canvas'); c.width = c.height = 128; var x = c.getContext('2d'); x.clearRect(0, 0, 128, 128);
  for (var i = 0; i < 7; i++) { var cx = 30 + Math.random() * 68, cy = 30 + Math.random() * 68, rr = 18 + Math.random() * 26; var g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  return new THREE.CanvasTexture(c);
}

/* scatter instanced geometry over real terrain */
function scatter(THREE, scene, heightAt, radius, geo, mat, count, kind) {
  var im = new THREE.InstancedMesh(geo, mat, count); im.frustumCulled = false;
  var d = new THREE.Object3D(), placed = 0, att = 0;
  while (placed < count && att < count * 10) {
    att++; var x = (Math.random() * 2 - 1) * radius, z = (Math.random() * 2 - 1) * radius;
    var y = heightAt(x, z); if (y < 0.3) continue;
    d.position.set(x, y - 0.02, z); d.rotation.set(0, Math.random() * 6.283, 0);
    var s = kind === 'rock' ? (0.5 + Math.random() * 1.5) : (0.7 + Math.random() * 0.9);
    d.scale.set(s, s * (kind === 'rock' ? 1 : (0.8 + Math.random() * 0.9)), s);
    d.updateMatrix(); im.setMatrixAt(placed, d.matrix); placed++;
  }
  im.count = placed; im.instanceMatrix.needsUpdate = true; scene.add(im); return im;
}

/* a kit of geometry/material factories bound to ONE THREE (each scene has its own) */
function makeKit(THREE) {
  function nonidx(g) { return g.index ? g.toNonIndexed() : g; }
  function jitter(g, amt, seed) {
    var p = g.attributes.position.array, nr = g.attributes.normal ? g.attributes.normal.array : null, n = p.length / 3;
    for (var i = 0; i < n; i++) { var nx = nr ? nr[i * 3] : 0, ny = nr ? nr[i * 3 + 1] : 1, nz = nr ? nr[i * 3 + 2] : 0; var h = hash2(p[i * 3] + seed, p[i * 3 + 2] + seed * 1.7); var dd = (h - 0.5) * 2 * amt; p[i * 3] += nx * dd; p[i * 3 + 1] += ny * dd; p[i * 3 + 2] += nz * dd; }
    g.attributes.position.needsUpdate = true; return g;
  }
  function shade(g, bot, top) {
    var p = g.attributes.position.array, nr = g.attributes.normal ? g.attributes.normal.array : null, n = p.length / 3;
    var ymin = 1e9, ymax = -1e9; for (var i = 0; i < n; i++) { var y = p[i * 3 + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    var c = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var t = (p[i * 3 + 1] - ymin) / (ymax - ymin + 1e-4);
      var r = lerp(bot[0], top[0], t), gg = lerp(bot[1], top[1], t), b = lerp(bot[2], top[2], t);
      var ny = nr ? nr[i * 3 + 1] : 0; var light = 0.72 + 0.5 * clamp(ny * 0.5 + 0.5, 0, 1); var ao = ny < -0.3 ? 0.7 : 1.0; var m = light * ao;
      c[i * 3] = r * m; c[i * 3 + 1] = gg * m; c[i * 3 + 2] = b * m;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
  }
  function merge(list) {
    var n = 0; list.forEach(function (g) { n += g.attributes.position.count; });
    var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), o = 0;
    list.forEach(function (g) { var c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3); if (g.attributes.color) col.set(g.attributes.color.array, o * 3); o += c; });
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
  }
  function trunk(h, rb, rt, bend, segs) { var g = new THREE.CylinderGeometry(rt, rb, h, segs || 6); g.translate(0, h / 2, 0); g = nonidx(g); var p = g.attributes.position.array, nn = p.length / 3; for (var i = 0; i < nn; i++) p[i * 3] += Math.sin(p[i * 3 + 1] * 1.5) * bend; g.attributes.position.needsUpdate = true; return shade(g, [0.15, 0.09, 0.05], [0.33, 0.21, 0.12]); }
  function branch(len, rad, px, py, pz, rx, rz) { var g = new THREE.ConeGeometry(rad, len, 5); g.translate(0, len / 2, 0); g = nonidx(g); g.rotateX(rx); g.rotateZ(rz); g.translate(px, py, pz); return shade(g, [0.13, 0.08, 0.04], [0.26, 0.17, 0.10]); }
  function blob(r, det, jit, seed) { var g = new THREE.IcosahedronGeometry(r, det); g = nonidx(g); if (jit) jitter(g, jit, seed); return g; }
  function shadeBlob(g, x, y, z, bot, top) { g.translate(x, y, z); return shade(g, bot, top); }
  function conLayer(r, h, y, rad, jit, seed, cols) { var g = new THREE.ConeGeometry(r, h, rad); g = nonidx(g); if (jit) jitter(g, jit, seed); g.translate(0, y, 0); return shade(g, cols[0], cols[1]); }

  function makeGeos(q) {
    var bg = q === 'bg';
    var physics = (function () { var P = [trunk(1.0, 0.16, 0.09, 0.05, 6)]; var L = bg ? 3 : 4; for (var i = 0; i < L; i++) P.push(conLayer(0.88 - i * 0.17, 1.15, 0.95 + i * 0.62, bg ? 7 : 9, 0.07, i * 3.1, [[0.02, 0.30, 0.42], [0.13, 0.64, 0.82]])); if (!bg) P.push(branch(0.5, 0.05, 0.3, 0.9, 0.1, 0, -0.7)); return merge(P); })();
    var chemistry = (function () { var P = [trunk(1.0, 0.18, 0.11, 0.06, 6)]; var B = bg ? [[0, 1.7, 0, 0.95], [0.42, 2.05, 0.2, 0.6]] : [[0, 1.7, 0, 0.95], [0.42, 2.1, 0.2, 0.62], [-0.38, 2.0, -0.22, 0.6]]; B.forEach(function (b, i) { P.push(shadeBlob(blob(b[3], 1, 0.13, i * 2.3), b[0], b[1], b[2], [0.05, 0.40, 0.10], [0.20, 0.74, 0.22])); }); if (!bg) P.push(branch(0.55, 0.05, -0.3, 1.0, 0.2, 0, 0.8)); return merge(P); })();
    var maths = (function () { var P = [trunk(1.0, 0.17, 0.10, 0.05, 6)]; var B = bg ? [[0, 1.65, 0, 0.9], [0.4, 2.0, 0.15, 0.58]] : [[0, 1.65, 0, 0.92], [0.4, 2.05, 0.18, 0.6], [-0.34, 1.95, -0.2, 0.58]]; B.forEach(function (b, i) { P.push(shadeBlob(blob(b[3], 1, 0.12, i * 4.7), b[0], b[1], b[2], [0.72, 0.38, 0.02], [1.0, 0.76, 0.12])); }); return merge(P); })();
    var oak = (function () { var P = [trunk(2.2, 0.42, 0.22, 0.08, 7)]; var B = bg ? [[0, 3.0, 0, 1.7], [1.0, 3.5, 0.5, 1.2], [-0.9, 3.4, -0.4, 1.2]] : [[0, 3.0, 0, 1.7], [1.1, 3.6, 0.6, 1.25], [-1.0, 3.5, -0.5, 1.25], [0.2, 4.2, 0.1, 1.0]]; B.forEach(function (b, i) { P.push(shadeBlob(blob(b[3], 1, 0.16, i * 5.9), b[0], b[1], b[2], [0.05, 0.14, 0.04], [0.15, 0.32, 0.10])); }); P.push(branch(0.9, 0.09, 0.6, 2.2, 0.3, 0, -0.9)); P.push(branch(0.8, 0.08, -0.5, 2.4, -0.2, 0, 0.9)); return merge(P); })();
    return { physics: physics, chemistry: chemistry, maths: maths, oak: oak };
  }
  function grassGeo() { var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.05, 0, 0, 0.05, 0, 0, 0.0, 0.55, 0.0]), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.06, 0.26, 0.05, 0.06, 0.26, 0.05, 0.22, 0.64, 0.14]), 3)); return g; }
  function rockGeo() { var g = new THREE.IcosahedronGeometry(0.5, 1); g = nonidx(g); jitter(g, 0.2, 9.0); return shade(g, [0.26, 0.26, 0.29], [0.52, 0.52, 0.55]); }
  function rockMat() { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }); }
  function grassMat() { var m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, flatShading: true }); m.onBeforeCompile = function (sh) { sh.uniforms.uTime = { value: 0 }; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', "#include <begin_vertex>\n float gw=max(transformed.y,0.0);\n float gph=instanceMatrix[3][0]*0.7+instanceMatrix[3][2]*0.7;\n transformed.x+=sin(uTime*1.6+gph)*gw*0.7;\n transformed.z+=cos(uTime*1.2+gph*1.3)*gw*0.5;"); m.userData.shader = sh; }; return m; }
  function waterMat() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uDeep: { value: new THREE.Color(0.02, 0.10, 0.20) }, uShallow: { value: new THREE.Color(0.10, 0.46, 0.56) }, uSun: { value: new THREE.Vector3(0.4, 0.7, 0.3).normalize() } },
      vertexShader: 'varying vec3 vN;varying vec3 vV;varying float vW;uniform float uTime;void main(){vec3 p=position;float wx=p.x*0.5+uTime*1.3;float wz=p.z*0.7+uTime*0.9;float w=sin(wx)*0.12+sin(wz)*0.10+sin((p.x+p.z)*0.3+uTime*0.6)*0.08;p.y+=w;vW=w;vec3 n=normalize(vec3(-cos(wx)*0.06,1.0,-cos(wz)*0.07));vN=normalize(normalMatrix*n);vec4 wp=modelMatrix*vec4(p,1.0);vV=normalize(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}',
      fragmentShader: 'varying vec3 vN;varying vec3 vV;varying float vW;uniform vec3 uDeep;uniform vec3 uShallow;uniform vec3 uSun;void main(){vec3 N=normalize(vN);vec3 V=normalize(vV);float fres=pow(1.0-max(dot(N,V),0.0),3.0);vec3 col=mix(uDeep,uShallow,clamp(fres*0.7+0.25,0.0,1.0));vec3 R=reflect(-normalize(uSun),N);float spec=pow(max(dot(R,V),0.0),48.0);col+=spec*vec3(1.0,0.95,0.8)*0.85;float foam=smoothstep(0.15,0.22,vW);col=mix(col,vec3(0.8,0.92,0.95),foam*0.25);gl_FragColor=vec4(col,0.92);}'
    });
  }
  return { makeGeos: makeGeos, grassGeo: grassGeo, rockGeo: rockGeo, rockMat: rockMat, grassMat: grassMat, waterMat: waterMat };
}

/* dressing + sky + lights shared by every scene */
function addDressing(THREE, scene, kit, heightAt, radius) {
  // grass + rocks removed
}
function addWater(THREE, waterMesh, kit) { try { var m = kit.waterMat(); waterMesh.material = m; waterMesh._pw = true; anim.water.push(m); } catch (e) {} }
function addSky(THREE, scene, sunDir) {
  try { var gt = glowTex(THREE); var sm = new THREE.SpriteMaterial({ map: gt, color: 0xfff2d0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }); var sun = new THREE.Sprite(sm); var sd = sunDir.clone().normalize().multiplyScalar(260); sun.position.copy(sd); sun.scale.set(46, 46, 1); scene.add(sun); anim.sun.push(sun); } catch (e) {}
  try { var ct = cloudTex(THREE); for (var i = 0; i < 6; i++) { var cm = new THREE.SpriteMaterial({ map: ct, color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }); var cs = new THREE.Sprite(cm); cs.position.set((Math.random() * 2 - 1) * 130, 95 + Math.random() * 30, (Math.random() * 2 - 1) * 130); cs.scale.set(60 + Math.random() * 45, 18 + Math.random() * 12, 1); scene.add(cs); anim.cloud.push(cs); } } catch (e) {}
  try { var SN = 320, sp = new Float32Array(SN * 3); for (var i = 0; i < SN; i++) { var a = Math.random() * 6.283, rr = 300, yy = 40 + Math.random() * 250; sp[i * 3] = Math.cos(a) * rr; sp[i * 3 + 1] = yy; sp[i * 3 + 2] = Math.sin(a) * rr; } var sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); var st = new THREE.PointsMaterial({ size: 1.5, map: glowTex(THREE), transparent: true, opacity: 0, color: 0xffffff, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }); var stars = new THREE.Points(sg, st); stars.frustumCulled = false; scene.add(stars); anim.star.push(st); } catch (e) {}
}
function addLights(THREE, scene) {
  try { var rim = new THREE.DirectionalLight(0x88bbff, 0.5); rim.position.set(-1, 0.5, -1); scene.add(rim); var fill = new THREE.DirectionalLight(0xffd9a0, 0.25); fill.position.set(1, 0.3, 0.6); scene.add(fill); } catch (e) {}
}

/* swap a scene's existing tree InstancedMeshes to premium geometry (matrix copy) */
function swapMeshes(THREE, scene, oldMeshes, oldGeoBySubj, geos) {
  var pairs = []; for (var k in oldGeoBySubj) pairs.push({ subj: k, geo: oldGeoBySubj[k] });
  var rem = [], add = [];
  oldMeshes.forEach(function (ch) {
    if (!ch || !ch.isInstancedMesh) return;
    for (var p = 0; p < pairs.length; p++) {
      if (ch.geometry === pairs[p].geo) {
        var cap = ch.instanceMatrix.array.length / 16;
        var nm = new THREE.InstancedMesh(geos[pairs[p].subj], ch.material, cap);
        nm.instanceMatrix.array.set(ch.instanceMatrix.array); nm.count = ch.count;
        nm.instanceMatrix.needsUpdate = true; nm.frustumCulled = false;
        rem.push(ch); add.push({ subj: pairs[p].subj, mesh: nm }); break;
      }
    }
  });
  rem.forEach(function (m) { scene.remove(m); });
  return add; // caller wires them back into the scene's mesh registry
}

/* ── adopters ── */
function tryIsland() {
  if (done.island) return; var api = window.__forestIslandAPI;
  if (!api || !api.THREE || !api.meshes || !api.meshes.physics || !api.scene) return;
  try {
    var THREE = api.THREE, kit = makeKit(THREE), geos = kit.makeGeos('med');
    var add = swapMeshes(THREE, api.scene, [api.meshes.physics, api.meshes.chemistry, api.meshes.maths, api.meshes.oak].filter(Boolean), { physics: api.meshes.physics && api.meshes.physics.geometry, chemistry: api.meshes.chemistry && api.meshes.chemistry.geometry, maths: api.meshes.maths && api.meshes.maths.geometry, oak: api.meshes.oak && api.meshes.oak.geometry }, geos);
    add.forEach(function (a) { api.scene.add(a.mesh); api.meshes[a.subj] = a.mesh; }); // redirects the island's own registry
    addDressing(THREE, api.scene, kit, api.heightAt, 30);
    if (api.env && api.env.water) addWater(THREE, api.env.water, kit);
    addSky(THREE, api.scene, api.env && api.env.sun ? api.env.sun.position : new THREE.Vector3(10, 40, 20));
    addLights(THREE, api.scene);
    try { api.renderer.toneMappingExposure = 1.06; } catch (e) {}
    done.island = true;
  } catch (e) { console.warn('[forest-premium] island:', e); done.island = true; }
}
function tryBg() {
  if (done.bg || !window.__forestBgAdopt) return; var g = window.__forestBgAdopt();
  if (!g || !g.scene || !g.env || !g.THREE) return;
  try {
    var THREE = g.THREE, kit = makeKit(THREE), master = kit.makeGeos('bg');
    // Proxy so the bg's per-rebuild dispose only kills clones, never the master
    g.env.geos = new Proxy(master, { get: function (t, k) { var v = t[k]; return v && v.clone ? v.clone() : v; } });
    addDressing(THREE, g.scene, kit, g.heightAt, 175);
    if (g.env.water) addWater(THREE, g.env.water, kit);
    addSky(THREE, g.scene, g.env.sun ? g.env.sun.position : new THREE.Vector3(20, 70, 30));
    addLights(THREE, g.scene);
    done.bg = true;
    try { window.__forestBG && window.__forestBG.refresh(); } catch (e) {} // rebuild trees with premium geo now
  } catch (e) { console.warn('[forest-premium] bg:', e); done.bg = true; }
}
function tryFull() {
  if (done.full || !window.__forestFullAdopt) return; var g = window.__forestFullAdopt();
  if (!g || !g.scene || !g.world || !g.THREE || !g.treeGeos) return;
  try {
    var THREE = g.THREE, kit = makeKit(THREE), geos = kit.makeGeos('med');
    try { window.__forestFullSetGeos(geos); } catch (e) {}
    var add = swapMeshes(THREE, g.scene, g.world.children.filter(function (c) { return c && c.isInstancedMesh; }), g.treeGeos, geos);
    add.forEach(function (a) { g.world.add(a.mesh); });
    addDressing(THREE, g.scene, kit, g.heightAt, 45);
    var wm = null; g.world.children.forEach(function (ch) { if (ch && ch.isMesh && ch.material && ch.material.transparent && ch.position.y < 0 && !ch._pw) wm = ch; }); if (wm) addWater(THREE, wm, kit);
    addSky(THREE, g.scene, new THREE.Vector3(30, 80, 40));
    addLights(THREE, g.scene);
    done.full = true;
  } catch (e) { console.warn('[forest-premium] full:', e); done.full = true; }
}

/* central animation clock (grass wind, water, clouds, sun, stars) */
var raf = 0;
function tick(t) {
  raf = requestAnimationFrame(tick); if (document.hidden) return; var u = t * 0.001, night = nightNow();
  for (var i = 0; i < anim.grass.length; i++) { var m = anim.grass[i]; if (m.userData && m.userData.shader) m.userData.shader.uniforms.uTime.value = u; }
  for (var i = 0; i < anim.water.length; i++) anim.water[i].uniforms.uTime.value = u;
  for (var i = 0; i < anim.cloud.length; i++) { var c = anim.cloud[i]; c.material.rotation = u * 0.02; c.position.x += 0.012; if (c.position.x > 150) c.position.x = -150; c.material.opacity = 0.5 * (1 - night * 0.8); }
  for (var i = 0; i < anim.sun.length; i++) { var s = anim.sun[i]; var sc = 46 * (1 + 0.03 * Math.sin(u * 2)); s.scale.set(sc, sc, 1); s.material.opacity = 0.95 * (1 - night * 0.85); }
  for (var i = 0; i < anim.star.length; i++) anim.star[i].opacity = night * 0.9;
}

function loop() { tryIsland(); tryBg(); tryFull(); if (!(done.island && done.bg && done.full)) setTimeout(loop, 400); }
function boot() { if (!document.body) { requestAnimationFrame(boot); return; } requestAnimationFrame(tick); loop(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();