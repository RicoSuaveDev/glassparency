/**
 * =============================================================================
 * glass/squish.js — Squish & stretch: Apple's jelly-like Liquid Glass motion
 * =============================================================================
 * Studied from screen recordings of macOS 26 / iOS 26:
 *   - press      the glass swells (a close button on iOS grows ~1.3×)
 *   - hold+drag  it is pulled towards the pointer: it moves a little after
 *                it (rubber band, never far), stretches ALONG the pull and
 *                thins ACROSS it (volume stays about the same) — the macOS
 *                window close button turns into an oval leaning at the cursor
 *   - release    it springs back and wobbles (an under-damped spring), and
 *                the wobble itself squashes/stretches with its speed
 *
 * How it's drawn: the ELEMENT is moved and stretched with the CSS `translate`
 * and `scale` properties (not `transform`, so a site's own transform stays
 * untouched). Every glass renderer already follows the element's on-screen
 * box — WebGL glass reads getBoundingClientRect() each frame and live glass
 * is the element's own ::before — so the glass, its rim, tint, border and
 * shadow all deform with it, and the content (text / icon) stretches along
 * as it does on Apple's controls. Each frame asks the canvases to redraw.
 *
 * Driven two ways:
 *   1. Automatically by attachGlass (useGlass.js) for any glass element whose
 *      config has "squish" > 0 — set it on a group and every button of that
 *      group squishes. Tuning: squish, squishGrow, squishPull, squishBounce.
 *   2. By the widgets (widgets.js) for their moving parts (a tab bar's lens,
 *      a checkbox's box…): createSquish(el, …).press() / drag() / release(),
 *      or stretchFor() for a part they move themselves.
 *
 * Reduced motion (OS setting): no pull and no wobble; only a quick swell.
 * =============================================================================
 */
import { requestRender } from './registry';

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Spring stiffness (1/s²). Higher = snappier. Damping comes from squishBounce:
// bounce 0 = critically damped (no wobble), 1 = very jelly.
const STIFF = { press: 520, release: 300 };
// How much the moving glass stretches with its speed (per px/s), and the cap.
const SPEED_STRETCH = 0.00045;
const MAX_STRETCH = 0.55;

/**
 * Stretch factors for glass moving / pulled along (ux, uy) by `amount`
 * (0 = round, 0.3 = 30% longer along the motion). Thins across the motion so
 * the area stays about the same (1 / √(1 + e)), like a drop of liquid.
 * Only axis-aligned scale is possible on the element's box, so a diagonal
 * pull mixes the two axes by the direction's cos² / sin².
 * @returns {{ sx: number, sy: number }}
 */
export function stretchFor(ux, uy, amount) {
  const e = clamp(amount, 0, MAX_STRETCH);
  const len = Math.hypot(ux, uy);
  if (e <= 0 || len < 1e-6) return { sx: 1, sy: 1 };
  const cx = (ux / len) ** 2;
  const cy = (uy / len) ** 2;
  const along = 1 + e;
  const across = 1 / Math.sqrt(1 + e);
  return { sx: 1 + (along - 1) * cx + (across - 1) * cy, sy: 1 + (along - 1) * cy + (across - 1) * cx };
}

/**
 * Give an element the jelly motion.
 * @param {HTMLElement} el
 * @param {() => { squish: number, squishGrow: number, squishPull: number, squishBounce: number }} readCfg
 *        the element's current tuning (read on every press / release)
 * @returns {{ press(x:number, y:number): void, drag(x:number, y:number): void, release(): void,
 *             nudge(vx:number, vy:number): void, destroy(): void, readonly active: boolean }}
 */
export function createSquish(el, readCfg) {
  // Spring state: offset (px), grow factor, and their velocities.
  const s = { ox: 0, oy: 0, vx: 0, vy: 0, g: 1, vg: 0 };
  const target = { ox: 0, oy: 0, g: 1 };
  let cfg = readCfg();
  let held = false;
  let base = null; // the element's centre + size at rest (client px), taken on press
  let raf = 0;
  let last = 0;

  // Semi-implicit Euler in ≤ 1/240 s sub-steps (stable however slow the frame).
  const springStep = (x, v, to, k, zeta, dt) => {
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    const c = 2 * zeta * Math.sqrt(k);
    for (let i = 0; i < n; i++) {
      v += (-k * (x - to) - c * v) * h;
      x += v * h;
    }
    return [x, v];
  };

  const apply = () => {
    const strength = cfg.squish;
    // Stretch from the pull (how far it's being dragged out) + from its speed.
    const pull = cfg.squishPull > 0 ? Math.hypot(s.ox, s.oy) / cfg.squishPull : 0;
    const speed = Math.hypot(s.vx, s.vy);
    // Direction: the pull, or the motion when it's flying back.
    const ux = pull > 0.05 ? s.ox : s.vx;
    const uy = pull > 0.05 ? s.oy : s.vy;
    const amount = strength * (pull * 0.32 + speed * SPEED_STRETCH);
    const { sx, sy } = stretchFor(ux, uy, amount);
    const resting = Math.abs(s.ox) < 0.05 && Math.abs(s.oy) < 0.05 && Math.abs(s.g - 1) < 0.0005 && sx === 1 && sy === 1;
    if (resting) {
      el.style.removeProperty('translate');
      el.style.removeProperty('scale');
    } else {
      el.style.translate = `${s.ox.toFixed(2)}px ${s.oy.toFixed(2)}px`;
      el.style.scale = `${(s.g * sx).toFixed(4)} ${(s.g * sy).toFixed(4)}`;
    }
    requestRender();
  };

  const frame = (now) => {
    const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    const k = held ? STIFF.press : STIFF.release;
    // bounce 0 → ζ 1 (no overshoot); bounce 1 → ζ 0.2 (several wobbles).
    const zeta = held ? 0.85 : 1 - 0.8 * clamp(cfg.squishBounce, 0, 1);
    [s.ox, s.vx] = springStep(s.ox, s.vx, target.ox, k, zeta, dt);
    [s.oy, s.vy] = springStep(s.oy, s.vy, target.oy, k, zeta, dt);
    [s.g, s.vg] = springStep(s.g, s.vg, target.g, k * 1.4, Math.max(zeta, 0.45), dt);
    const settled =
      !held &&
      Math.abs(s.ox - target.ox) < 0.05 && Math.abs(s.oy - target.oy) < 0.05 && Math.abs(s.vx) < 2 && Math.abs(s.vy) < 2 &&
      Math.abs(s.g - target.g) < 0.0005 && Math.abs(s.vg) < 0.005;
    if (settled) Object.assign(s, { ox: target.ox, oy: target.oy, vx: 0, vy: 0, g: target.g, vg: 0 });
    apply();
    if (settled) {
      raf = 0;
      last = 0;
    } else raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  /** Where the pull should take the glass for a pointer at (x, y). */
  const pullTo = (x, y) => {
    if (!base || cfg.squishPull <= 0 || reducedMotion()) return { ox: 0, oy: 0 };
    const dx = x - base.cx;
    const dy = y - base.cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-3) return { ox: 0, oy: 0 };
    // Rubber band: follows 1:1 at first, then ever more slowly up to squishPull.
    const P = cfg.squishPull * cfg.squish;
    const reach = P * Math.tanh(dist / (P * 3 || 1));
    return { ox: (dx / dist) * reach, oy: (dy / dist) * reach };
  };

  return {
    get active() {
      return held || raf !== 0;
    },
    /** Pointer went down at client (x, y). */
    press(x, y) {
      cfg = readCfg();
      if (cfg.squish <= 0) return;
      held = true;
      // The element's rest position: its box now, minus our own offset.
      const r = el.getBoundingClientRect();
      base = { cx: r.left + r.width / 2 - s.ox, cy: r.top + r.height / 2 - s.oy };
      target.g = reducedMotion() ? 1 + (cfg.squishGrow - 1) * 0.5 : cfg.squishGrow;
      Object.assign(target, pullTo(x, y));
      kick();
    },
    /** Pointer moved to client (x, y) while held. */
    drag(x, y) {
      if (!held) return;
      Object.assign(target, pullTo(x, y));
      kick();
    },
    /** Pointer let go: spring back with a wobble. */
    release() {
      if (!held) return;
      held = false;
      cfg = readCfg();
      Object.assign(target, { ox: 0, oy: 0, g: 1 });
      if (reducedMotion()) Object.assign(s, { ox: 0, oy: 0, vx: 0, vy: 0, vg: 0 });
      kick();
    },
    /** A push (px/s) — e.g. a lens landing on a tab: it wobbles from the hit. */
    nudge(vx, vy) {
      cfg = readCfg();
      if (cfg.squish <= 0 || reducedMotion()) return;
      s.vx += vx;
      s.vy += vy;
      kick();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      el.style.removeProperty('translate');
      el.style.removeProperty('scale');
    },
  };
}
