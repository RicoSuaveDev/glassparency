/**
 * =============================================================================
 * glass/lightFollow.js — Pointer / tilt highlight (config "lightFollow")
 * =============================================================================
 * OPT-IN (default "off"). The specular rim light normally comes from a fixed
 * direction (lightAngle). With "lightFollow":
 *   "pointer" — it turns towards the mouse / pen pointer: the edge nearest
 *               the cursor lights up, and the light swings round as the
 *               cursor passes over the glass;
 *   "tilt"    — it follows how the phone / tablet is tilted
 *               (DeviceOrientationEvent), like a fixed light above the
 *               screen catching the glass as you move it;
 *   "auto"    — "pointer" on devices with a mouse (hover + fine pointer),
 *               "tilt" on touch screens.
 * lightFollowAmount (0–1) says how far the light turns away from lightAngle.
 *
 * HOW (one module for every renderer):
 *   • The INPUTS are global — one pointer, one device tilt — and are smoothed
 *     here (frame-rate independent exponential easing, a critically damped
 *     "spring" without overshoot), in ONE requestAnimationFrame loop that
 *     runs only while they are still settling, then stops.
 *   • Each renderer asks followLightAngle(lightAngle, mode, amount, rect)
 *     for the angle to light an element with, from the smoothed inputs and
 *     the element's box: WebGL glass every frame it draws (GlassCanvas
 *     uLight), live glass (live.js inset rim shadows) and CSS glass
 *     (cssGlass.js — its lit-edge arcs turn) from subscribeLightFollow.
 *   • Every settling frame calls requestRender() (WebGL redraws on demand).
 *
 * COST WHEN OFF: nothing. followLightAngle returns lightAngle at once for
 * "off", and no listener is added until some glass actually asks for a mode
 * — no pointer listener, no orientation listener, no animation frame.
 * prefers-reduced-motion: reduce → the light stays at lightAngle.
 *
 * iOS: DeviceOrientationEvent.requestPermission() must be called from a
 * user gesture (a tap) — and shows a system prompt. The library NEVER asks
 * by itself: call enableTiltHighlight() from your own button's click.
 * Elsewhere (Android, …) orientation events need no permission and start as
 * soon as tilt glass is on the page.
 * =============================================================================
 */
import { requestRender } from './registry';

// --- Tuning --------------------------------------------------------------------------------
const POINTER_TAU = 0.11; // s: how quickly the light catches up with the pointer
const TILT_TAU = 0.16; // s: … with the device tilt (sensors are noisy: a bit slower)
const NEUTRAL_TAU = 2.5; // s: how slowly the "resting" pose follows the way the device is held
const TILT_RANGE = 28; // degrees of tilt (away from the resting pose) for the full swing
const SETTLED = 0.0015; // smoothed values closer than this to their target = settled

// --- State ---------------------------------------------------------------------------------
// Pointer in client px (smoothed x, y → target tx, ty) and its presence
// (k: 1 while the pointer is in the window, eased back to 0 when it leaves,
// so the light glides home to lightAngle instead of jumping).
const ptr = { x: 0, y: 0, tx: 0, ty: 0, k: 0, tk: 0, seen: false };
// Tilt as a light-direction offset (x right, y UP, each −1…1), smoothed.
const tilt = { x: 0, y: 0, tx: 0, ty: 0, nb: null, ng: null };
let pointerOn = false; // pointer listeners added
let tiltOn = false; // orientation listener added
let tiltAllowed = null; // iOS permission: null = not asked yet, true / false
let raf = 0;
let last = 0;
const subs = new Set(); // per settling frame: live.js / cssGlass.js re-light their elements

/** prefers-reduced-motion: reduce (checked live — the user may switch it). */
let motionQuery = null;
const reduced = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  motionQuery ||= window.matchMedia('(prefers-reduced-motion: reduce)');
  return motionQuery.matches;
};

/** "auto" → "pointer" with a mouse, "tilt" on a touch screen. */
let fineQuery = null;
function resolveMode(mode) {
  if (mode !== 'auto') return mode;
  if (typeof window === 'undefined' || !window.matchMedia) return 'pointer';
  fineQuery ||= window.matchMedia('(hover: hover) and (pointer: fine)');
  return fineQuery.matches ? 'pointer' : 'tilt';
}

// --- Inputs --------------------------------------------------------------------------------
function onPointerMove(e) {
  if (e.pointerType === 'touch') return; // a finger has no hover: press glow covers touch
  ptr.tx = e.clientX;
  ptr.ty = e.clientY;
  ptr.tk = 1;
  if (!ptr.seen) {
    // First sighting: start AT the pointer (no glide in from the corner).
    ptr.seen = true;
    ptr.x = ptr.tx;
    ptr.y = ptr.ty;
  }
  wake();
}
function onPointerGone(e) {
  // (pointerout of the window: relatedTarget null; blur: the window lost focus)
  if (e.type === 'pointerout' && e.relatedTarget) return;
  ptr.tk = 0;
  wake();
}
function addPointer() {
  if (pointerOn || typeof window === 'undefined') return;
  pointerOn = true;
  window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
  document.addEventListener('pointerout', onPointerGone, { passive: true });
  window.addEventListener('blur', onPointerGone, { passive: true });
}

function onOrientation(e) {
  if (e.beta == null || e.gamma == null) return;
  // The resting pose follows how the device is held (slowly — see tick),
  // so only TILTING it moves the light, not holding it at an angle.
  if (tilt.nb == null) {
    tilt.nb = e.beta;
    tilt.ng = e.gamma;
  }
  tilt.b = e.beta;
  tilt.g = e.gamma;
  aimTilt();
  wake();
}
/** Tilt target from the latest reading vs the resting pose (screen axes). */
function aimTilt() {
  if (tilt.b == null) return;
  // Right side tipped down (gamma +) → the light slides to the raised LEFT
  // edge; top tipped back (beta +) → to the TOP edge (y up).
  let x = -(tilt.g - tilt.ng) / TILT_RANGE;
  let y = (tilt.b - tilt.nb) / TILT_RANGE;
  // Landscape: the sensor axes stay the device's, the screen turned.
  const ang = (typeof screen !== 'undefined' && screen.orientation?.angle) || (typeof window !== 'undefined' && Number(window.orientation)) || 0;
  if (ang) {
    const a = (-ang * Math.PI) / 180;
    [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  }
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  tilt.tx = x;
  tilt.ty = y;
}
function addTilt() {
  if (tiltOn || typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') return;
  // iOS: only after enableTiltHighlight() was granted (never prompt here).
  if (typeof window.DeviceOrientationEvent.requestPermission === 'function' && tiltAllowed !== true) return;
  tiltOn = true;
  window.addEventListener('deviceorientation', onOrientation, { passive: true });
}

/**
 * iOS (13+) only shows device-tilt data after the user allows it, and the
 * request must come from a tap. Call this from your own button's click
 * handler to turn the tilt highlight on there; it resolves true when tilt
 * data will flow (always true where no permission is needed), false when
 * the user said no or the device has no orientation sensor. Never called by
 * the library itself.
 * @returns {Promise<boolean>}
 */
export async function enableTiltHighlight() {
  if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') return false;
  const ask = window.DeviceOrientationEvent.requestPermission;
  if (typeof ask === 'function') {
    try {
      tiltAllowed = (await ask.call(window.DeviceOrientationEvent)) === 'granted';
    } catch {
      tiltAllowed = false; // (not from a user gesture, or blocked)
    }
    if (!tiltAllowed) return false;
  } else tiltAllowed = true;
  addTilt();
  requestRender();
  return true;
}

// --- The settling loop ---------------------------------------------------------------------
function wake() {
  if (raf || typeof requestAnimationFrame !== 'function') return;
  last = 0;
  raf = requestAnimationFrame(tick);
}
function tick(now) {
  raf = 0;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now;
  const ease = (tau) => 1 - Math.exp(-dt / tau);
  const ep = ease(POINTER_TAU);
  ptr.x += (ptr.tx - ptr.x) * ep;
  ptr.y += (ptr.ty - ptr.y) * ep;
  ptr.k += (ptr.tk - ptr.k) * ep;
  // The resting pose drifts towards the current one (then re-aim).
  if (tilt.b != null) {
    const en = ease(NEUTRAL_TAU);
    tilt.nb += (tilt.b - tilt.nb) * en;
    tilt.ng += (tilt.g - tilt.ng) * en;
    aimTilt();
  }
  const et = ease(TILT_TAU);
  tilt.x += (tilt.tx - tilt.x) * et;
  tilt.y += (tilt.ty - tilt.y) * et;
  for (const fn of subs) fn();
  requestRender();
  // Keep going until everything has settled (pointer within 0.5 px).
  const busy =
    Math.abs(ptr.tx - ptr.x) > 0.5 ||
    Math.abs(ptr.ty - ptr.y) > 0.5 ||
    Math.abs(ptr.tk - ptr.k) > SETTLED ||
    Math.abs(tilt.tx - tilt.x) > SETTLED ||
    Math.abs(tilt.ty - tilt.y) > SETTLED ||
    (tilt.b != null && (Math.abs(tilt.b - tilt.nb) > 0.05 || Math.abs(tilt.g - tilt.ng) > 0.05));
  if (busy) {
    last = now;
    raf = requestAnimationFrame(tick);
  }
}

// --- Per-element CSS variables, without touching the page ---------------------------------
/**
 * Live / CSS glass get the light direction as CSS variables, rewritten on
 * every settling frame. As inline styles, each write would be a page
 * change: the glass's own MutationObservers (redraws, page snapshots) would
 * wake up 60 times a second. So they go in a constructed stylesheet instead
 * (document.adoptedStyleSheets — CSSOM edits are not DOM mutations): one
 * rule per element, `[data-gp-light="7"] { --glass-lx: …; }`, and the element
 * only gets its data-gp-light attribute once. (No constructed sheets — very
 * old browsers — → inline style, as a fallback.)
 */
let sheet;
let nextRule = 1;
const rules = new WeakMap(); // element → its CSSStyleRule (or null: inline fallback)
function ruleFor(el) {
  if (rules.has(el)) return rules.get(el);
  if (sheet === undefined) {
    sheet = null;
    try {
      if (typeof CSSStyleSheet === 'function' && Array.isArray(document.adoptedStyleSheets)) {
        sheet = new CSSStyleSheet();
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      }
    } catch {
      sheet = null;
    }
  }
  let rule = null;
  if (sheet) {
    const id = String(nextRule++);
    el.setAttribute('data-gp-light', id);
    rule = sheet.cssRules[sheet.insertRule(`[data-gp-light="${id}"]{}`, sheet.cssRules.length)];
  }
  rules.set(el, rule);
  return rule;
}
/** Set (value) or remove (null) one of the element's light variables. */
export function setLightVar(el, name, value) {
  if (value == null && !rules.has(el)) return; // (nothing was ever set)
  const style = ruleFor(el)?.style || el.style;
  if (value == null) style.removeProperty(name);
  else if (style.getPropertyValue(name) !== value) style.setProperty(name, value);
}

/** Live / CSS glass: called on every settling frame. @returns {() => void} unsubscribe */
export function subscribeLightFollow(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Is the light following anything for this mode (listeners started on demand)? */
export function followsLight(mode, amount = 1) {
  if (!mode || mode === 'off' || !(amount > 0) || reduced()) return false;
  const m = resolveMode(mode);
  if (m === 'pointer') addPointer();
  else if (m === 'tilt') addTilt();
  return true;
}

/**
 * The light angle (degrees, CSS style: 0 = top, 90 = right) for one element
 * right now — its lightAngle when the mode is "off" (no work at all), else
 * turned towards the pointer / tilt by up to `amount`.
 * @param {number} base      the element's lightAngle
 * @param {string} mode      lightFollow: off | auto | pointer | tilt
 * @param {number} amount    lightFollowAmount (0–1)
 * @param {{left:number, top:number, width:number, height:number}} rect   client px
 */
export function followLightAngle(base, mode, amount, rect) {
  if (!mode || mode === 'off' || !(amount > 0)) return base; // (the default: free)
  if (!followsLight(mode, amount) || !rect) return base;
  const m = resolveMode(mode);
  const a0 = (base * Math.PI) / 180;
  const bx = Math.sin(a0); // towards the light, y up
  const by = Math.cos(a0);
  let fx = bx;
  let fy = by;
  let w = 0; // how much of the follow direction to use
  if (m === 'pointer') {
    if (ptr.k < 0.001) return base;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const vx = ptr.x - cx;
    const vy = cy - ptr.y; // (y up)
    const len = Math.hypot(vx, vy);
    if (len < 1e-3) return base;
    // Near the middle the follow direction fades out (it would spin
    // wildly as the cursor crosses the centre); from about the edge on it
    // points straight at the pointer.
    const reach = Math.max(8, 0.5 * Math.hypot(rect.width, rect.height));
    const s = Math.min(1, len / reach);
    fx = (vx / len) * s + bx * (1 - s);
    fy = (vy / len) * s + by * (1 - s);
    w = amount * ptr.k;
  } else if (m === 'tilt') {
    const s = Math.min(1, Math.hypot(tilt.x, tilt.y));
    if (s < 1e-3) return base;
    // (a small tilt leans the light a little; a full one points it along the tilt)
    fx = tilt.x + bx * (1 - s);
    fy = tilt.y + by * (1 - s);
    w = amount;
  } else return base;
  const lx = bx + (fx - bx) * w;
  const ly = by + (fy - by) * w;
  if (Math.hypot(lx, ly) < 1e-3) return base;
  return (Math.atan2(lx, ly) * 180) / Math.PI;
}
