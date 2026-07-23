/* forest-growth-shim.js
   Normalises window.__forestGrowth so forest-island-juice.js and
   forest-island-full.js always find every method they call
   (difficulty / difficultyOf / sizeFactor / heightFactor / heightScale /
   cum / dayStart / maturity / pendingDiff / stamp) — no matter which growth
   brain is installed, or if none is installed at all.
   Idempotent + order-tolerant: re-runs itself a few times on load so it
   catches the brain object whenever it gets created. Tiny, safe, no deps. */
(function () {
  'use strict';
  if (window.__forestGrowthShim) return;
  window.__forestGrowthShim = true;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function nrm(s) { s = (s || '').toString().toLowerCase(); return (s === 'math' || s === 'mathematics') ? 'maths' : s; }
  function userElo(subj) { try { if (window.AppState && window.AppState.elo) return window.AppState.elo[nrm(subj)] || 1200; } catch (e) {} return 1200; }
  function inlineDifficulty(qElo, subj) { return clamp01(((qElo || 1200) - userElo(subj) + 400) / 800); }
  function inlineSize(d) { d = clamp01(d); return 0.9 + 0.3 * d; }            // tough = bigger
  function inlineHeight(m) { m = clamp01(m); return 0.30 + 0.70 * m; }        // studied = taller

  function install() {
    var fg = window.__forestGrowth;
    if (!fg || typeof fg !== 'object') { fg = {}; window.__forestGrowth = fg; }

    // difficulty — accept either name the brain might use, else inline math
    var diffFn = (typeof fg.difficulty === 'function') ? fg.difficulty
               : (typeof fg.difficultyOf === 'function') ? fg.difficultyOf
               : inlineDifficulty;
    fg.difficulty = diffFn; fg.difficultyOf = diffFn;

    // size factor (tree width by difficulty)
    var sizeFn = (typeof fg.sizeFactor === 'function') ? fg.sizeFactor : inlineSize;
    fg.sizeFactor = sizeFn;

    // height factor (tree height by study maturity) — accept either name
    var hFn = (typeof fg.heightFactor === 'function') ? fg.heightFactor
            : (typeof fg.heightScale === 'function') ? fg.heightScale
            : inlineHeight;
    fg.heightFactor = hFn; fg.heightScale = hFn;

    // cumulative study seconds per subject (0 if no brain)
    var cumFn = (typeof fg.cum === 'function') ? fg.cum : function () { return 0; };
    fg.cum = cumFn;

    // study-seconds baseline at day start (for maturity math)
    var dsFn = (typeof fg.dayStart === 'function') ? fg.dayStart : function (s) { return cumFn(s); };
    fg.dayStart = dsFn;

    // maturity 0..1 from (plantCum, growSec, subject)
    if (typeof fg.maturity !== 'function') {
      fg.maturity = function (plantCum, growSec, subj) {
        growSec = growSec > 0 ? growSec : 10800;
        var base = (plantCum != null) ? plantCum : dsFn(subj);
        return clamp01(((cumFn(subj) || 0) - base) / growSec);
      };
    }

    // juice's consumePending() guards on truthiness; null = "no pending queue"
    if (!fg.pendingDiff) fg.pendingDiff = null;

    // app.js may call stamp(); provide a no-op so nothing throws if brain lacks it
    if (typeof fg.stamp !== 'function') fg.stamp = function () {};

    if (!window.__forestGrowthShimDone) {
      window.__forestGrowthShimDone = true;
      console.log('[forest-growth-shim] ready · difficulty=' + (diffFn === inlineDifficulty ? 'inline' : 'brain') +
                  ' · height=' + (hFn === inlineHeight ? 'inline' : 'brain') +
                  ' · cum=' + (cumFn === (function () { return 0; }) ? 'none' : 'brain'));
    }
  }

  // Run now, and a few more times so we catch the brain object whenever it
  // gets assigned (covers any script ordering). install() is idempotent.
  install();
  setTimeout(install, 0);
  setTimeout(install, 60);
  setTimeout(install, 250);
  setTimeout(install, 700);
  setTimeout(install, 1600);
})();