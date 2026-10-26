/**
 * =============================================================================
 * glass/motion.js — Shape springs and the liquid glass morph, for any element
 * =============================================================================
 * Plain JS (no React — the hooks are in useMotion.js); the script build
 * exposes both as Glassparency.createShapeSpring / Glassparency.glassMorph.
 *
 * 1. SHAPE SPRINGS — createShapeSpring(el)
 *      const spring = createShapeSpring(card);
 *      spring.to({ width: 260, height: 72, radius: 36 });   // capsule
 *      spring.to({ width: 120, height: 120, radius: 60 });  // circle
 *    Width, height and corner radius each follow an under-damped spring, so
 *    the element overshoots and wobbles into every new shape, like a liquid.
 *    The size is the element's own CSS width / height (every glass renderer
 *    follows the element's box); the radius is the glass's `radius` (merged
 *    into its per-element props) and its CSS border-radius (so the CSS
 *    fallback, borders and focus rings match). Works with or without glass.
 *    For glass, use shape "roundedRectangle" (circle / capsule ignore radius).
 *
 * 2. LIQUID MORPH — glassMorph(from, to)
 *      const morph = glassMorph(button, panel);   // panel grows out of button
 *      await morph.finished;
 *      await morph.reverse().finished;            // …and melts back into it
 *      glassMorph(button, panel, { direction: 'out' })  // close an open one
 *    `from` is any element (a button, an icon, a card); `to` is any element
 *    laid out where it should end up — hide it with the `hidden` attribute
 *    and glassMorph shows it. The film:
 *      1. it starts as exactly `from` — same box, corner radius and glass
 *         look — which takes over: `from`'s own glass is held back and its
 *         content fades out;
 *      2. that shape stretches and swells (springy) into `to`'s exact box
 *         and corner radius, while a part of it stays on `from` and shrinks
 *         away — a liquid neck when `to` is further off;
 *      3. the glass blends from `from`'s look (tint, frost, thickness, rim…)
 *         to `to`'s;
 *      4. `to` takes over (its own glass, or its CSS) and its content fades
 *         in; `from` fades back in (it is only hidden during the film).
 *    Backwards (reverse() / direction "out") it lands back on `from`'s exact
 *    shape and look, then `from` is shown again.
 *    How: two temporary empty <div>s in <body> with glass in ONE morph name,
 *    so one shader draws them as a single smooth distance field (merging,
 *    necking, splitting). They take `to`'s glass group + per-element props
 *    (or options.group), with the look blended from `from`'s resolved glass,
 *    so the film starts on `from`'s look and lands exactly on `to`'s. Both
 *    elements' own glass is suspended (registry `suspended`) while it plays.
 *    Morph glass refracts a picture of the page: the film's area is reserved
 *    for it (reserveSnapshotArea). Call glassMorph.warm(from, to) on hover /
 *    focus to have that picture ready before the click.
 *    Where the WebGL glass isn't running (phones' CSS layout, no WebGL,
 *    Reduce transparency) or with Reduce motion: no morph — `to` grows out of
 *    `from` with a plain CSS transform + fade instead, so it still works.
 *
 * Both step their springs / films with requestAnimationFrame and ask the
 * canvases to redraw each frame (the DOM watchers only see global.root).
 * =============================================================================
 */
import { requestRender, getEntry, update } from './registry';
import { resolveGlass } from './config';
import { reserveSnapshotArea, snapshot, subscribeSnapshot } from './snapshot';
import { attachGlass, getGlassProps, mergeGlassProps } from './useGlass';

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const clamp01 = (x) => clamp(x, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const px = (n) => `${Math.round(n * 10) / 10}px`;
/** Is the WebGL glass drawing right now? (GlassProvider sets it.) */
const glassOn = () => typeof document !== 'undefined' && document.documentElement.dataset.glass === 'on';

/**
 * One damped spring step, integrated in ≤ 1/240 s sub-steps (a stiff
 * spring stepped by one slow frame explodes — see squish.js).
 * @returns {[number, number]} new [position, velocity]
 */
function springStep(x, v, target, k, zeta, dt) {
  const c = 2 * zeta * Math.sqrt(k);
  const n = Math.max(1, Math.ceil(dt * 240));
  const h = dt / n;
  for (let i = 0; i < n; i += 1) {
    v += (-k * (x - target) - c * v) * h;
    x += v * h;
  }
  return [x, v];
}

/** Width / height padding + border the element's CSS width doesn't include. */
function boxExtra(el) {
  const cs = getComputedStyle(el);
  if (cs.boxSizing === 'border-box') return { x: 0, y: 0 };
  const n = (v) => parseFloat(v) || 0;
  return {
    x: n(cs.paddingLeft) + n(cs.paddingRight) + n(cs.borderLeftWidth) + n(cs.borderRightWidth),
    y: n(cs.paddingTop) + n(cs.paddingBottom) + n(cs.borderTopWidth) + n(cs.borderBottomWidth),
  };
}

// =============================================================================
// 1. Shape springs
// =============================================================================

/**
 * @param {HTMLElement} el
 * @param {{ stiffness?: number, damping?: number, radiusDamping?: number,
 *           onRest?: () => void }} [options]
 *   stiffness      spring stiffness (1/s²) — higher = snappier (default 170)
 *   damping        0–1: 1 = no overshoot, lower = more wobble (default 0.42)
 *   radiusDamping  the same for the corner radius (default 0.55: wobbles less)
 *   onRest         called each time it settles on a shape
 * @returns {{ to(shape: {width?: number, height?: number, radius?: number}, opts?: {immediate?: boolean}): void,
 *             readonly current: {width: number, height: number, radius: number},
 *             readonly moving: boolean, destroy(): void }}
 */
export function createShapeSpring(el, options = {}) {
  const k = options.stiffness ?? 170;
  const zeta = options.damping ?? 0.42;
  const zetaR = options.radiusDamping ?? 0.55;
  // Start from the element as it is now (border box; radius from its CSS).
  const startRadius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  const s = { w: el.offsetWidth, h: el.offsetHeight, r: startRadius, vw: 0, vh: 0, vr: 0 };
  const t = { w: s.w, h: s.h, r: s.r };
  const extra = boxExtra(el);
  let raf = 0;
  let last = 0;
  let destroyed = false;

  const apply = () => {
    el.style.width = px(Math.max(0, s.w - extra.x));
    el.style.height = px(Math.max(0, s.h - extra.y));
    const r = Math.max(0, Math.round(s.r * 10) / 10);
    el.style.borderRadius = px(r);
    // Glass corner radius (no-op without glass). Merged: the element's other
    // per-element props stay as they are.
    mergeGlassProps(el, { radius: r });
    requestRender();
  };

  const frame = (now) => {
    const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    [s.w, s.vw] = springStep(s.w, s.vw, t.w, k, zeta, dt);
    [s.h, s.vh] = springStep(s.h, s.vh, t.h, k, zeta, dt);
    [s.r, s.vr] = springStep(s.r, s.vr, t.r, k, zetaR, dt);
    // An overshoot never makes the box negative, nor the radius more than a pill.
    s.w = Math.max(1, s.w);
    s.h = Math.max(1, s.h);
    s.r = clamp(s.r, 0, Math.min(s.w, s.h) / 2);
    const settled =
      Math.abs(s.w - t.w) + Math.abs(s.h - t.h) + Math.abs(s.r - t.r) < 0.1 && Math.abs(s.vw) + Math.abs(s.vh) + Math.abs(s.vr) < 1;
    if (settled) Object.assign(s, { w: t.w, h: t.h, r: t.r, vw: 0, vh: 0, vr: 0 });
    apply();
    if (settled) {
      raf = 0;
      last = 0;
      options.onRest?.();
    } else raf = requestAnimationFrame(frame);
  };

  return {
    /** Spring to a new shape (any of width / height / radius; the rest stay). */
    to(shape = {}, opts = {}) {
      if (destroyed) return;
      if (shape.width != null) t.w = Math.max(1, shape.width);
      if (shape.height != null) t.h = Math.max(1, shape.height);
      if (shape.radius != null) t.r = Math.max(0, shape.radius);
      t.r = Math.min(t.r, Math.min(t.w, t.h) / 2);
      if (opts.immediate || reducedMotion()) {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
        Object.assign(s, { w: t.w, h: t.h, r: t.r, vw: 0, vh: 0, vr: 0 });
        apply();
        options.onRest?.();
        return;
      }
      if (!raf) raf = requestAnimationFrame(frame);
    },
    get current() {
      return { width: s.w, height: s.h, radius: s.r };
    },
    get moving() {
      return raf !== 0;
    },
    /** Stop (the element keeps the size it has now). */
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

// =============================================================================
// 2. Liquid morph
// =============================================================================
const OPEN_MS = 780; // the whole film, forwards
const CLOSE_MS = 620; // backwards (after the content has faded)
const FADE_MS = 180; // `to`'s content fading in / out
const FROM_FADE_MS = 120; // `from`'s content fading out as the film takes it over
const PICTURE_WAIT_MS = 300; // longest wait for a page picture before the film starts anyway
/** The look the film blends from `from`'s glass to `to`'s (numbers in both). */
const LOOK_KEYS = [
  'tintOpacity', 'blur', 'thickness', 'bevel', 'ior', 'saturation', 'brightness', 'chromaticAberration',
  'rimLight', 'innerGlow', 'borderOpacity', 'shadowOpacity', 'shadowBlur', 'shadowY', 'minify',
];

// --- Easing helpers -----------------------------------------------------------
/** 0 → 1 between e0 and e1 (smooth). */
const smooth = (e0, e1, x) => {
  const u = clamp01((x - e0) / (e1 - e0));
  return u * u * (3 - 2 * u);
};
/** Overshoots a little past 1 and settles — the springy liquid feel. */
const easeOutBack = (u, s = 1.25) => 1 + (s + 1) * (u - 1) ** 3 + s * (u - 1) ** 2;

/** An element's box in window px, + its corner radius (glass or CSS). */
function boxOf(el) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height, radius: radiusOf(el, r) };
}
function radiusOf(el, r) {
  const half = Math.min(r.width, r.height) / 2;
  const id = Number(el.dataset.glassId);
  const entry = id ? getEntry(id) : null;
  if (entry) {
    const p = resolveGlass(entry.group, entry.props);
    if (p.shape === 'circle' || p.shape === 'capsule') return half;
    if (p.shape === 'rectangle') return 0;
    if (typeof p.radius === 'number') return Math.min(p.radius, half);
  }
  return Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, half);
}

/** "#rgb" / "#rrggbb" → [r, g, b], else null. */
function hexRgb(c) {
  const m = typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
/** Two hex colours mixed (f 0 → a, 1 → b); anything else switches halfway. */
function mixColor(a, b, f) {
  const x = hexRgb(a);
  const y = hexRgb(b);
  if (!x || !y) return f < 0.5 ? a : b;
  return '#' + x.map((v, i) => Math.round(lerp(v, y[i], f)).toString(16).padStart(2, '0')).join('');
}
/** Two resolved tints ({from, via, to, angle}) mixed; `via` only when both have one. */
function mixTint(a, b, f) {
  if (!a || !b) return f < 0.5 ? a : b;
  const via = a.via && b.via ? mixColor(a.via, b.via, f) : f < 0.5 ? a.via : b.via;
  return { from: mixColor(a.from, b.from, f), via, to: mixColor(a.to, b.to, f), angle: lerp(a.angle ?? 180, b.angle ?? 180, f) };
}
/** The film's look at f (0 = `from`'s glass, 1 = `to`'s): the LOOK_KEYS numbers + the tint. */
function mixLook(a, b, f) {
  const out = { tint: mixTint(a.tint, b.tint, f) };
  for (const k of LOOK_KEYS) {
    if (typeof b[k] !== 'number') continue;
    out[k] = typeof a[k] === 'number' ? lerp(a[k], b[k], f) : b[k];
  }
  return out;
}

/**
 * One frame of the film at t (0 = exactly `from`, 1 = exactly `to`).
 *   body   — starts as `from`'s own box and corner radius and swells
 *            (springy) into `to`'s box and radius
 *   anchor — stays on `from` and shrinks into its centre (15–65%): while
 *            the body moves away the two melt into a liquid neck; when `to`
 *            covers `from` it is simply swallowed
 *   look   — 0 → 1 from `from`'s glass to `to`'s (mixLook)
 * Played backwards (t 1 → 0) the same frames land back on `from`.
 * @param {object} F - `from`'s box  @param {object} T - `to`'s box
 */
function filmFrame(t, F, T) {
  // Body: `from` → `to` with a little overshoot (the springy liquid feel).
  const s = easeOutBack(clamp01(t), 1.1);
  const body = {
    left: lerp(F.left, T.left, s),
    top: lerp(F.top, T.top, s),
    width: Math.max(0, lerp(F.width, T.width, s)),
    height: Math.max(0, lerp(F.height, T.height, s)),
  };
  body.radius = Math.min(Math.min(body.width, body.height) / 2, lerp(F.radius, T.radius, smooth(0, 0.6, t)));

  // Anchor: `from`'s box shrinking into its centre.
  const k = 1 - smooth(0.15, 0.65, t);
  const cx = F.left + F.width / 2;
  const cy = F.top + F.height / 2;
  const anchor = { left: cx - (F.width * k) / 2, top: cy - (F.height * k) / 2, width: F.width * k, height: F.height * k };
  anchor.radius = Math.min(Math.min(anchor.width, anchor.height) / 2, F.radius * k);

  return { body, anchor, look: smooth(0.1, 0.9, t) };
}

function placeFixed(el, r) {
  el.style.left = px(r.left);
  el.style.top = px(r.top);
  el.style.width = px(Math.max(0, r.width));
  el.style.height = px(Math.max(0, r.height));
}

let morphCount = 0;
/** Element → its running content fade (a new film cancels the old fade). */
const fades = new WeakMap();
/** Fade `to`'s content (Web Animations; the slab underneath isn't affected). */
function fade(to, inwards, keep) {
  fades.get(to)?.cancel();
  const a = to.animate?.(inwards ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], {
    duration: FADE_MS,
    easing: inwards ? 'ease-out' : 'ease-in',
    fill: keep ? 'forwards' : 'none',
  });
  if (a) fades.set(to, a);
  return a;
}

/**
 * `from` while the film plays: its own slab held back (the film draws it) and
 * its content faded out; shown again when the film ends, either way.
 */
const fromFades = new WeakMap();
function hideFrom(from) {
  setSuspended(from, true);
  if (fromFades.has(from)) return; // already hidden (a reversed film)
  const a = from.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: FROM_FADE_MS, easing: 'ease-in', fill: 'forwards' });
  fromFades.set(from, a || null);
}
function showFrom(from, animate) {
  setSuspended(from, false);
  if (!fromFades.has(from)) return;
  fromFades.get(from)?.cancel();
  fromFades.delete(from);
  if (animate) from.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
}

/** Does the current page picture cover `r` (window px, now)? */
function pictureCovers(r) {
  if (!snapshot.canvas) return false;
  // The picture's window position now (it was taken at another scroll).
  const x = snapshot.x - (window.scrollX - snapshot.scrollX);
  const y = snapshot.y - (window.scrollY - snapshot.scrollY);
  return x <= r.left && y <= r.top && x + snapshot.w >= r.right && y + snapshot.h >= r.bottom;
}
/**
 * Run `go` once the page picture covers `r`, or after PICTURE_WAIT_MS anyway.
 * The film starts full-size on `from`: without a picture its first frames
 * would be drawn as flat white glass. Returns a cancel function.
 */
function whenPictured(r, go) {
  if (pictureCovers(r)) {
    go();
    return () => {};
  }
  let off = null;
  let t = 0;
  const stop = () => {
    off?.();
    clearTimeout(t);
  };
  const run = () => {
    stop();
    go();
  };
  off = subscribeSnapshot(() => pictureCovers(r) && run());
  t = setTimeout(run, PICTURE_WAIT_MS);
  return stop;
}
/** `from`'s and `to`'s boxes together, cut to the window (the picture never reaches past it). */
function filmBoxes(F, T) {
  return {
    left: Math.max(0, Math.min(F.left, T.left)),
    top: Math.max(0, Math.min(F.top, T.top)),
    right: Math.min(window.innerWidth, Math.max(F.left + F.width, T.left + T.width)),
    bottom: Math.min(window.innerHeight, Math.max(F.top + F.height, T.top + T.height)),
  };
}

/** The area a film covers (window px), for the page picture. */
function filmArea(F, T) {
  const pad = Math.max(24, Math.min(F.width, F.height)); // the body's overshoot
  return {
    left: Math.min(F.left - pad, T.left),
    top: Math.min(F.top - pad, T.top),
    right: Math.max(F.left + F.width + pad, T.left + T.width),
    bottom: Math.max(F.top + F.height + pad, T.top + T.height),
  };
}

/** Show `to` (it may be hidden with the `hidden` attribute). */
function unhide(to) {
  if (to.hidden) to.hidden = false;
}

/**
 * Morph `from` into `to` (see the header).
 * @param {HTMLElement} from
 * @param {HTMLElement} to
 * @param {{ duration?: number, reverseDuration?: number, group?: string,
 *           look?: {tintOpacity?: number, blur?: number}, morphRadius?: number,
 *           layer?: string, zIndex?: number, fadeContent?: boolean,
 *           direction?: 'in' | 'out' }} [options]
 *   direction        "in" (default): `to` grows out of `from`; "out": the
 *                    shown `to` melts back into `from` and is hidden
 *   duration         ms of the film forwards (default 780)
 *   reverseDuration  ms backwards (default 620)
 *   group            glass group of the film (default: `to`'s, else "panel")
 *   look             the film's end tint / frost (default: `to`'s resolved look)
 *   morphRadius      how far the drops reach to melt (default 34 px)
 *   layer            glass layer of the film (default "float")
 *   fadeContent      fade `to` in at the end / out first when reversing (default true)
 * @returns {{ finished: Promise<void>, reverse(): any, cancel(): void }}
 */
export function glassMorph(from, to, options = {}) {
  if (!from || !to) throw new Error('glassMorph(from, to): both elements are needed');
  const opts = { duration: OPEN_MS, reverseDuration: CLOSE_MS, morphRadius: 34, layer: 'float', fadeContent: true, ...options };
  return runMorph(from, to, opts, opts.direction !== 'out');
}

/**
 * glassMorph(…) and .reverse() share this. resumeAt: a film time (0–1) to
 * continue from — a reverse() in the middle of a film plays back from where
 * it is, without the content fade or a jump to either end.
 */
function runMorph(from, to, opts, forwards, resumeAt) {
  let cancelled = false;
  let done = false;
  let currentT = null; // the film's time while it's drawing
  let raf = 0;
  let timer = 0;
  const cleanups = [];
  const cleanup = () => {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    while (cleanups.length) cleanups.pop()();
  };
  let resolveDone;
  const finished = new Promise((res) => (resolveDone = res));
  const handle = {
    finished,
    /** Play it the other way (`to` melts back into `from`, then is hidden again). */
    reverse() {
      if (!done && !cancelled && currentT != null) {
        // Mid-film: stop here (no end state) and continue backwards from this frame.
        cancelled = true;
        cleanup();
        resolveDone();
        return runMorph(from, to, opts, !forwards, currentT);
      }
      handle.cancel();
      return runMorph(from, to, opts, !forwards);
    },
    /** Stop where it is: `to` is shown (forwards) or hidden (backwards). */
    cancel() {
      if (cancelled) return;
      cancelled = true;
      cleanup();
      finish();
    },
  };
  // End state: forwards = `to` shown with its own glass; backwards = hidden.
  // Either way `from` is back (it is only hidden while the film plays).
  const finish = () => {
    done = true;
    showFrom(from, true);
    setSuspended(to, false);
    to.style.removeProperty('visibility');
    if (forwards) unhide(to);
    else to.hidden = true;
    resolveDone();
  };

  unhide(to); // measure it where it will be
  const F = boxOf(from);
  const T = boxOf(to);
  const film = glassOn() && !reducedMotion() && T.width >= 1 && T.height >= 1;

  if (!film) {
    // No WebGL morph: `to` grows out of `from` (or shrinks back) with a
    // plain transform + fade — still a sensible animation everywhere.
    const fromT = `translate(${F.left - T.left}px, ${F.top - T.top}px) scale(${Math.max(0.01, F.width / T.width)}, ${Math.max(0.01, F.height / T.height)})`;
    const frames = [
      { transformOrigin: '0 0', transform: fromT, opacity: 0 },
      { transformOrigin: '0 0', transform: 'none', opacity: 1 },
    ];
    const ms = reducedMotion() ? 1 : forwards ? 320 : 240;
    const anim = to.animate?.(forwards ? frames : [...frames].reverse(), { duration: ms, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
    if (anim) {
      cleanups.push(() => anim.cancel());
      anim.onfinish = () => {
        if (!cancelled) {
          cleanup();
          finish();
        }
      };
    } else finish();
    return handle;
  }

  // --- The WebGL film ----------------------------------------------------------
  const id = ++morphCount;
  const key = `glassMorph-${id}`;
  const toEntry = to.dataset.glassId ? getEntry(Number(to.dataset.glassId)) : null;
  const group = opts.group || toEntry?.group || 'panel';
  const baseProps = opts.group ? {} : { ...(getGlassProps(to) || {}) };
  // The film's look: `from`'s own glass at the start, `to`'s at the end
  // (opts.look overrides its end tint / frost). A `from` without glass
  // starts in `to`'s look.
  const toLook = { ...resolveGlass(group, baseProps), ...(opts.look || {}) };
  const fromEntry = from.dataset.glassId ? getEntry(Number(from.dataset.glassId)) : null;
  const fromLook = fromEntry ? resolveGlass(fromEntry.group, fromEntry.props) : toLook;

  // The page picture the morph glass refracts.
  reserveSnapshotArea(key, filmArea(F, T));
  cleanups.push(() => reserveSnapshotArea(key, null));

  // `to` stays hidden (and its own slab undrawn) until the film lands on it.
  // (Closing: it stays as it is until the film takes it over.)
  if (forwards || resumeAt != null) {
    to.style.visibility = 'hidden';
    setSuspended(to, true);
  }

  // Two empty glass shapes in ONE morph name → drawn as one liquid surface:
  // the body (becomes `to`) and the anchor (stays on `from`, shrinks away).
  const shapes = [0, 1].map(() => {
    const d = document.createElement('div');
    d.setAttribute('aria-hidden', 'true');
    d.dataset.glassMorphShape = '';
    d.style.cssText = `position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;margin:0;padding:0;border:0;z-index:${opts.zIndex ?? 1}`;
    document.body.appendChild(d);
    return d;
  });
  const props = (look, radius) => ({
    ...baseProps,
    morph: key,
    morphRadius: opts.morphRadius,
    sampler: 'webgl',
    layer: opts.layer,
    shape: 'roundedRectangle',
    radius: Math.max(0, Math.round(radius * 10) / 10),
    ...look,
  });
  const handles = shapes.map((d) => attachGlass(d, group, props(mixLook(fromLook, toLook, forwards ? 0 : 1), 0)));
  cleanups.push(() => {
    handles.forEach((h) => h.destroy());
    shapes.forEach((d) => d.remove());
    requestRender();
  });

  const draw = (t) => {
    currentT = t;
    const f = filmFrame(t, F, T);
    const look = mixLook(fromLook, toLook, f.look);
    placeFixed(shapes[0], f.anchor);
    placeFixed(shapes[1], f.body);
    handles[0].setProps(props(look, f.anchor.radius));
    handles[1].setProps(props(look, f.body.radius));
    requestRender();
  };

  const play = (t0, t1, ms) => {
    const start = performance.now();
    const tick = (now) => {
      if (cancelled) return;
      const u = clamp01((now - start) / ms);
      draw(lerp(t0, t1, u));
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    draw(t0);
    raf = requestAnimationFrame(tick);
    // Timers still fire when the tab isn't painted (rAF doesn't): land then.
    timer = setTimeout(land, ms + 40);
  };

  const land = () => {
    if (cancelled) return;
    if (forwards) {
      // `to` takes over, with its own glass, and its content fades in. The
      // film shapes stay under it (no gap between the two): one frame, or —
      // when the browser draws `to`'s glass on the element itself (live
      // glass), which fades in with its content — until the fade is done.
      // `from` comes back after that (finish), behind a solid `to`.
      setSuspended(to, false);
      to.style.removeProperty('visibility');
      const a = opts.fadeContent ? fade(to, true, false) : null;
      const end = () => {
        cleanup();
        finish();
      };
      if (a && drawnOnElement(to)) timer = setTimeout(end, FADE_MS);
      else requestAnimationFrame(end);
    } else {
      cleanup();
      finish();
    }
  };

  // Start once the page picture is there (`from` and `to` stay as they are
  // until then — at most PICTURE_WAIT_MS).
  const begin = () => {
    if (resumeAt != null) {
      // Continuing a reversed film: straight on from that frame, for the share
      // of the film that's left (`to` is already hidden behind the film).
      const goal = forwards ? 1 : 0;
      hideFrom(from);
      play(resumeAt, goal, Math.max(60, Math.abs(goal - resumeAt) * (forwards ? opts.duration : opts.reverseDuration)));
    } else if (forwards) {
      // The film starts as exactly `from` (box, radius, look): it takes over.
      hideFrom(from);
      play(0, 1, opts.duration);
    } else {
      // Backwards: `to`'s content fades out first (with its own glass still
      // on), then the film takes over from it and melts back into `from`.
      // `from` is hidden from the start (the film's first frames don't reach
      // it, and it would show through `to` while that fades).
      to.style.removeProperty('visibility');
      setSuspended(to, false);
      hideFrom(from);
      const out = opts.fadeContent ? fade(to, false, true) : null;
      if (out) cleanups.push(() => out.cancel());
      else fades.get(to)?.cancel();
      // Live glass fades out with `to`'s content: the film's first frame
      // (exactly `to`) is drawn under it meanwhile, so the frost stays.
      if (out && drawnOnElement(to)) draw(1);
      timer = setTimeout(
        () => {
          if (cancelled) return;
          to.style.visibility = 'hidden';
          setSuspended(to, true);
          play(1, 0, opts.reverseDuration);
        },
        out ? FADE_MS : 0
      );
    }
  };
  cleanups.push(whenPictured(filmBoxes(F, T), begin));
  return handle;
}

/**
 * Reserve the page picture a glassMorph(from, to) will need, BEFORE it runs
 * (e.g. on the button's pointerenter / focus) — so the film's first frames
 * refract the page instead of waiting ~40 ms for the picture.
 * @returns {() => void} release it again (if the morph never happens)
 */
glassMorph.warm = function warm(from, to) {
  if (!from || !to || !glassOn()) return () => {};
  const wasHidden = to.hidden;
  if (wasHidden) {
    // Measure it where it will be, without showing it.
    to.style.visibility = 'hidden';
    to.hidden = false;
  }
  const area = filmArea(boxOf(from), boxOf(to));
  if (wasHidden) {
    to.hidden = true;
    to.style.removeProperty('visibility');
  }
  const key = `glassMorph-warm-${++morphCount}`;
  reserveSnapshotArea(key, area);
  // Released by itself after a while (a hover that never became a click).
  const t = setTimeout(() => reserveSnapshotArea(key, null), 4000);
  return () => {
    clearTimeout(t);
    reserveSnapshotArea(key, null);
  };
};

/** Is the element's glass drawn by the browser on the element itself (live.js), not on a canvas? */
function drawnOnElement(el) {
  const id = Number(el.dataset.glassId);
  return Boolean(id && getEntry(id)?.liveMode);
}

/** Suspend / resume an element's own slab (no-op without glass). */
function setSuspended(el, on) {
  const id = Number(el.dataset.glassId);
  if (id && getEntry(id)) update(id, { suspended: on });
}
