/* forest-color-fix.js — re-bakes correct per-subject tree colours from each
   tree's shape (Y-heights), so a corrupted colour array can never show as
   all-black or all-green again. Fixes the small Daily Grove island with ZERO
   edits to forest-island.js (it reads the exposed api.meshes, keyed by subject).
   Safe + idempotent: each geometry is fixed once (__colFixed guard). */
(function () {
  'use strict';
  if (window.__forestColorFix) return; window.__forestColorFix = true;

  // trunk colour + canopy bottom→top gradient, PER SUBJECT (the four looks)
  var PAL = {
    physics:   { trunk:[0.30,0.20,0.12], bot:[0.02,0.40,0.52], top:[0.12,0.70,0.86] }, // teal spruce
    chemistry: { trunk:[0.32,0.21,0.12], bot:[0.05,0.50,0.10], top:[0.18,0.82,0.22] }, // green round
    maths:     { trunk:[0.32,0.20,0.11], bot:[0.85,0.46,0.02], top:[1.00,0.74,0.10] }, // gold
    oak:       { trunk:[0.16,0.11,0.07], bot:[0.06,0.16,0.05], top:[0.15,0.34,0.11] }  // dark green
  };

  function bake(THREE, geo, subj) {
    if (!geo || !geo.attributes || !geo.attributes.position) return;
    var pal = PAL[subj] || PAL.chemistry;
    var pos = geo.attributes.position, n = pos.count;
    var ymin = 1e9, ymax = -1e9, i, y;
    for (i = 0; i < n; i++) { y = pos.getY(i); if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    var trunkTop = ymin + (ymax - ymin) * 0.30;          // below this line = trunk
    var col = new Float32Array(n * 3);
    for (i = 0; i < n; i++) {
      y = pos.getY(i);
      if (y < trunkTop) {
        col[i*3] = pal.trunk[0]; col[i*3+1] = pal.trunk[1]; col[i*3+2] = pal.trunk[2];
      } else {
        var t = (y - trunkTop) / Math.max(0.001, (ymax - trunkTop));
        col[i*3]   = pal.bot[0] + (pal.top[0] - pal.bot[0]) * t;
        col[i*3+1] = pal.bot[1] + (pal.top[1] - pal.bot[1]) * t;
        col[i*3+2] = pal.bot[2] + (pal.top[2] - pal.bot[2]) * t;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.attributes.color.needsUpdate = true;
  }

  function fixIsland() {
    var api = window.__forestIslandAPI;
    if (!api || !api.THREE || !api.meshes) return false;
    var T = api.THREE;
    ['physics', 'chemistry', 'maths', 'oak'].forEach(function (s) {
      var m = api.meshes[s];
      if (m && m.geometry && !m.geometry.__colFixed) { bake(T, m.geometry, s); m.geometry.__colFixed = true; }
    });
    return true;
  }

  var tries = 0;
  (function wait() { if (fixIsland()) return; if (tries++ < 200) setTimeout(wait, 250); })();
  setInterval(fixIsland, 2000);   // catches any later terrain rebuild
})();