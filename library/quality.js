/**
 * =============================================================================
 * glass/quality.js — Automatic quality: full quality, throttled only when needed
 * =============================================================================
 *   global.quality: "auto" (default) | "high" | "medium" | "low"
 *
 * The glass always starts at full quality (the config's own values). With
 * "auto" it watches how fast frames come while the glass is ANIMATING —
 * something moving, morphing, springing (an idle page draws nothing, so it is
 * never measured and never throttled) — and only when that stays slow does
 * it step down one level:
 *
 *   high    the config as written                        (default)
 *   medium  refraction samples ≤ 4, buffer resolution ×0.75, pixel density ≤ 1.25
 *   low     refraction samples ≤ 3, buffer resolution ×0.5,  pixel density 1
 *
 * "Slow" = the median frame over ~1 s of continuous animation is under
 * ~40 fps (or 1.6× slower than the screen's own refresh, if that is slower:
 * a 30 Hz screen isn't "slow"). It steps back up after ~6 s of smooth
 * animation, but not to a level that was too slow in the last 30 s (no
 * ping-pong). Hidden tabs are never measured. A fixed "high" / "medium" /
 * "low" switches the automatic part off (e.g. to preview a level).
 *
 * GlassCanvas reads the caps (samplesCap, bufferScaleFactor, dprCap) and
 * calls noteFrame() once per drawn frame; getGlassQuality() /
 * subscribeGlassQuality() report the level (for a status line / tuning panel).
 * =============================================================================
 */
import { getGlobal, subscribeConfig } from './config';

export const QUALITY_LEVELS = [
  { name: 'high', samples: Infinity, bufferScale: 1, dpr: Infinity },
  { name: 'medium', samples: 4, bufferScale: 0.75, dpr: 1.25 },
  { name: 'low', samples: 3, bufferScale: 0.5, dpr: 1 },
];
const NAMES = QUALITY_LEVELS.map((l) => l.name);

const WINDOW_MS = 1000; // judge ~1 s of continuous frames at a time
const MIN_FRAMES = 20; // …with at least this many frames in it
const GAP_MS = 120; // a longer gap = the animation stopped (demand frames): start over
const SLOW_FPS = 40;
const GOOD_WINDOWS_UP = 6; // smooth windows in a row before stepping back up
const SETTLE_MS = 1500; // after a change: ignore frames (shader recompiles, resizes)
const FAILED_MEMORY_MS = 30000; // don't return to a level that was too slow this recently

let autoLevel = 0;
let lastFrameAt = 0;
let windowStart = 0;
let deltas = [];
let goodWindows = 0;
let settleUntil = 0;
let refreshMs = 1000 / 60; // the screen's frame time (shortest seen)
let lastFps = 0;
const failedAt = new Map(); // level → when it was too slow
const listeners = new Set();

/** The level in use: forced by global.quality, else the automatic one. */
function currentIndex() {
  const q = getGlobal().quality;
  return q === 'auto' ? autoLevel : Math.max(0, NAMES.indexOf(q));
}
const current = () => QUALITY_LEVELS[currentIndex()];

/** The level's index (0 = high) — a cheap snapshot for useSyncExternalStore. */
export const getQualityIndex = () => currentIndex();

// --- What the renderer asks ------------------------------------------------------------
/** Refraction samples to use for a group that asks for `samples`. */
export const samplesCap = (samples) => Math.max(1, Math.min(samples, current().samples));
/** Multiplier on global.bufferScale. */
export const bufferScaleFactor = () => current().bufferScale;
/** Highest pixel density (on top of global.maxDpr). */
export const dprCap = (maxDpr) => Math.min(maxDpr, current().dpr);

// --- Status ----------------------------------------------------------------------------
let snapshotCache = null;
/** { level: "high" | "medium" | "low", auto: boolean, fps: number } — stable between changes. */
export function getGlassQuality() {
  const level = current().name;
  const auto = getGlobal().quality === 'auto';
  if (!snapshotCache || snapshotCache.level !== level || snapshotCache.auto !== auto || snapshotCache.fps !== lastFps) {
    snapshotCache = { level, auto, fps: lastFps };
  }
  return snapshotCache;
}
export function subscribeGlassQuality(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());
// A forced level set in the config changes what the renderer should use.
let lastForced = null;
subscribeConfig(() => {
  const q = getGlobal().quality;
  if (q !== lastForced) {
    lastForced = q;
    resetWindow();
    notify();
  }
});

function resetWindow() {
  windowStart = 0;
  deltas = [];
}

function setAutoLevel(next, fps, why) {
  if (next === autoLevel) return;
  if (next > autoLevel) failedAt.set(autoLevel, performance.now());
  autoLevel = next;
  goodWindows = 0;
  settleUntil = performance.now() + SETTLE_MS;
  resetWindow();
  console.info(`glass: quality → ${QUALITY_LEVELS[next].name} (${why}, ~${fps} fps while animating)`);
  notify();
}

/**
 * Called by every glass canvas once per drawn frame (frames of several
 * canvases in the same animation frame count once).
 * @param {number} now - performance.now()
 */
export function noteFrame(now) {
  const dt = now - lastFrameAt;
  if (dt < 2) return; // another canvas, same frame
  lastFrameAt = now;
  if (getGlobal().quality !== 'auto') return;
  if (typeof document !== 'undefined' && document.hidden) return resetWindow();
  if (dt > GAP_MS) return resetWindow(); // the animation had stopped: not a slow frame
  if (now < settleUntil) return;
  refreshMs = Math.min(refreshMs, Math.max(4, dt)); // fastest frames seen ≈ the screen's refresh
  if (!windowStart) windowStart = now;
  deltas.push(dt);
  if (now - windowStart < WINDOW_MS || deltas.length < MIN_FRAMES) return;

  // Judge the window by its median frame (one hitch doesn't count).
  const sorted = deltas.slice().sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const fps = Math.round(1000 / median);
  const prevFps = lastFps;
  lastFps = fps;
  resetWindow();
  const slowMs = Math.max(1000 / SLOW_FPS, refreshMs * 1.6);
  if (median > slowMs) {
    goodWindows = 0;
    if (autoLevel < QUALITY_LEVELS.length - 1) setAutoLevel(autoLevel + 1, fps, 'frames too slow');
  } else if (autoLevel > 0 && median < refreshMs * 1.15) {
    goodWindows += 1;
    const recentFail = performance.now() - (failedAt.get(autoLevel - 1) || -Infinity) < FAILED_MEMORY_MS;
    if (goodWindows >= GOOD_WINDOWS_UP && !recentFail) setAutoLevel(autoLevel - 1, fps, 'smooth again');
  } else goodWindows = 0;
  if (fps !== prevFps) notify();
}
