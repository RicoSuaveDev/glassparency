/**
 * =============================================================================
 * glass/ripple.js — Water ripples through the glass when the pointer moves over it
 * =============================================================================
 * Any group with `ripple` > 0 (glass.config.json) ripples like the surface of
 * water: the pointer entering the element drops a ring where it came in, and
 * moving across it drops more along the way. Each ring spreads out at
 * `rippleSpeed` px/s, `rippleWavelength` px wide, and fades over
 * `rippleDuration` ms; `ripple` is how far (px) the crest bends what's behind
 * the glass. At most MAX_RIPPLES rings at once (the oldest gives way).
 *
 * This file only keeps the rings (per element, in element px) and steps them
 * with requestAnimationFrame while any is alive; the RENDERERS draw them:
 *   - live glass (Chromium, live.js): extra SVG filter stages — a radial map
 *     placed at each ring's centre + an animated table that draws the ring
 *     (only attributes change per frame, nothing is re-decoded);
 *   - WebGL glass (GlassCanvas.jsx): the transmission shader shifts where it
 *     reads the page picture along each ring (uniform glassRipples[]).
 *   Phones' CSS glass (no WebGL) and Reduce motion: no ripples.
 *
 *   const r = createRipples(entryId, readCfg)   (attachGlass does this)
 *   r.enter(x, y) / r.move(x, y)   pointer in element px
 *   activeRipples(entry) → [{ x, y, radius, amp }]   what to draw now
 *   subscribeRipples(fn)           fn(entryId) on every frame of a ripple
 * =============================================================================
 */
import { getEntry, requestRender } from './registry';

/** Rings drawn at once per element (each is a few filter stages / shader loop turns). */
export const MAX_RIPPLES = 3;
/** A new ring only after the pointer moved this many wavelengths… */
const SPAWN_DISTANCE = 1.6;
/** …and this long after the last one (ms). */
const SPAWN_GAP_MS = 160;

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const listeners = new Set();
/** Called with the entry id on every animation frame while it has rings (live.js redraws its filter). */
export function subscribeRipples(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Elements with rings alive → stepped together in one rAF loop. */
const animating = new Set();
let raf = 0;
function tick() {
  raf = 0;
  const now = performance.now();
  for (const id of [...animating]) {
    const e = getEntry(id);
    if (!e?.ripples?.length) {
      animating.delete(id);
      continue;
    }
    const cfg = e.rippleCfg;
    e.ripples = e.ripples.filter((r) => now - r.born < cfg.rippleDuration);
    for (const fn of listeners) fn(id);
    if (!e.ripples.length) animating.delete(id);
  }
  requestRender(); // WebGL glass reads activeRipples() in its own frame
  if (animating.size) raf = requestAnimationFrame(tick);
}
function wake(id) {
  animating.add(id);
  if (!raf) raf = requestAnimationFrame(tick);
}

/**
 * The rings to draw right now, for one element.
 *   radius  how far the crest has spread (px)
 *   amp     how far it bends what's behind (px): eases in over the first
 *           10 % of its life, then fades out (quadratic) to 0
 * @returns {{ x: number, y: number, radius: number, amp: number }[]}
 */
export function activeRipples(entry, now = performance.now()) {
  const list = entry?.ripples;
  const cfg = entry?.rippleCfg;
  if (!list?.length || !cfg) return [];
  return list.map((r) => {
    const t = Math.min(1, Math.max(0, (now - r.born) / cfg.rippleDuration));
    const fadeIn = Math.min(1, t / 0.1);
    return { x: r.x, y: r.y, radius: (cfg.rippleSpeed * (now - r.born)) / 1000, amp: cfg.ripple * fadeIn * (1 - t) * (1 - t) };
  });
}

/**
 * Ripples for one glass element.
 * @param {number} id - registry entry id
 * @param {() => { ripple: number, rippleWavelength: number, rippleSpeed: number, rippleDuration: number }} readCfg
 */
export function createRipples(id, readCfg) {
  let last = null; // { x, y, t } of the newest ring
  const drop = (x, y) => {
    const e = getEntry(id);
    if (!e) return;
    const cfg = readCfg();
    if (!(cfg.ripple > 0) || reducedMotion()) return;
    e.rippleCfg = { ripple: cfg.ripple, rippleWavelength: cfg.rippleWavelength, rippleSpeed: cfg.rippleSpeed, rippleDuration: cfg.rippleDuration };
    const now = performance.now();
    e.ripples = [...(e.ripples || []), { x, y, born: now }].slice(-MAX_RIPPLES);
    last = { x, y, t: now };
    wake(id);
  };
  return {
    /** Pointer came in at (x, y) element px → a ring from there. */
    enter(x, y) {
      drop(x, y);
    },
    /** Pointer moved → a new ring once it's far enough from the last one. */
    move(x, y) {
      const cfg = readCfg();
      if (!(cfg.ripple > 0)) return;
      const now = performance.now();
      if (!last || (Math.hypot(x - last.x, y - last.y) >= cfg.rippleWavelength * SPAWN_DISTANCE && now - last.t >= SPAWN_GAP_MS)) drop(x, y);
    },
    destroy() {
      const e = getEntry(id);
      if (e) e.ripples = [];
      animating.delete(id);
    },
  };
}
