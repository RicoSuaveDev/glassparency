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
 *      1. a clear droplet swells out from behind `from`;
 *      2. a blob pulls away from it towards `to` — the liquid neck
 *         stretches, then snaps;
 *      3. the blob swells into `to`'s exact box and corner radius and
 *         swallows the droplet; the glass goes from clear to `to`'s look;
 *      4. `to` takes over (its own glass, or its CSS) and its content fades in.
 *    How: two temporary empty <div>s in <body> with glass in ONE morph name,
 *    so one shader draws them as a single smooth distance field (merging,
 *    necking, splitting). They take `to`'s glass group + per-element props
 *    (or options.group), so the film lands exactly on `to`'s look. `to`'s own
 *    glass is suspended (registry `suspended`) until the film lands.
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
import { reserveSnapshotArea } from './snapshot';
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
const CLEAR = { tintOpacity: 0.04, blur: 0 }; // the film starts as clear glass

// --- Easing helpers -----------------------------------------------------------
/** 0 → 1 between e0 and e1 (smooth). */
const smooth = (e0, e1, x) => {
  const u = clamp01((x - e0) / (e1 - e0));
  return u * u * (3 - 2 * u);
};
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
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

/**
 * One frame of the film at t (0 = only `from`, 1 = `to`).
 *   drop  — the droplet behind `from`: swells out, then is absorbed
 *   blob  — 0.06–0.40 pulls away from the droplet towards `to` (the neck
 *           stretches and snaps); 0.36–1 swells into `to`'s box, back over
 *           the droplet so they melt together again
 *   look  — clear while they're drops, `to`'s tint / frost as it lands
 *   content — opacity of `to`'s content (last 20%)
 * @param {object} F - `from`'s box  @param {object} T - `to`'s box
 * @param {{tintOpacity: number, blur: number}} end - `to`'s look
 */
function filmFrame(t, F, T, end) {
  const size = Math.max(8, Math.min(F.width, F.height)); // the droplet: from-sized circle
  const dropC = { x: F.left + F.width / 2, y: F.top + F.height / 2 };

  // 1) Droplet: drips out (0 → 20%), absorbed (72 → 100%).
  const grow = Math.max(0, easeOutBack(clamp01(t / 0.2), 1.6));
  const ds = size * grow * (1 - smooth(0.72, 1, t));
  const drop = { left: dropC.x - ds / 2, top: dropC.y - ds / 2, width: ds, height: ds, radius: ds / 2 };

  // 2a) A small drop pulls away towards `to` (the neck stretches, snaps).
  // Far targets: about two droplets away; close ones: part of the way.
  const tc = { x: T.left + T.width / 2, y: T.top + T.height / 2 };
  const dist = Math.hypot(tc.x - dropC.x, tc.y - dropC.y);
  const dir = dist > 1 ? { x: (tc.x - dropC.x) / dist, y: (tc.y - dropC.y) / dist } : { x: 0, y: 1 };
  const reach = Math.min(size * 2.2, Math.max(size * 0.8, dist * 0.6));
  const away = { x: dropC.x + dir.x * reach, y: dropC.y + dir.y * reach };
  const pull = easeInOut(clamp01((t - 0.06) / 0.34));
  const small = lerp(size * Math.min(1, grow), size * 1.35, pull);
  const c = { x: lerp(dropC.x, away.x, pull), y: lerp(dropC.y, away.y, pull) };
  let blob = { left: c.x - small / 2, top: c.y - small / 2, width: small, height: small };

  // 2b) It swells into `to` (springy), back over the droplet.
  const swell = t <= 0.36 ? 0 : easeOutBack(clamp01((t - 0.36) / 0.64), 1.1);
  if (swell > 0) {
    blob = {
      left: lerp(blob.left, T.left, swell),
      top: lerp(blob.top, T.top, swell),
      width: lerp(blob.width, T.width, swell),
      height: lerp(blob.height, T.height, swell),
    };
  }
  const half = Math.max(0, Math.min(blob.width, blob.height) / 2);
  blob.radius = Math.min(half, lerp(half, T.radius, smooth(0, 0.55, swell)));

  // 3) Look + content.
  const f = smooth(0.3, 0.95, t);
  const look = { tintOpacity: lerp(CLEAR.tintOpacity, end.tintOpacity, f), blur: lerp(CLEAR.blur, end.blur, f) };
  return { drop, blob, look, content: smooth(0.8, 1, t) };
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

/** The area a film covers (window px), for the page picture. */
function filmArea(F, T) {
  const pad = Math.min(F.width, F.height) * 2.5; // the droplet + the pulled-away drop
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
  const finish = () => {
    done = true;
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
  const resolved = resolveGlass(group, baseProps);
  const end = { tintOpacity: opts.look?.tintOpacity ?? resolved.tintOpacity, blur: opts.look?.blur ?? resolved.blur };

  // The page picture the morph glass refracts.
  reserveSnapshotArea(key, filmArea(F, T));
  cleanups.push(() => reserveSnapshotArea(key, null));

  // `to` stays hidden (and its own slab undrawn) until the film lands on it.
  to.style.visibility = 'hidden';
  setSuspended(to, true);

  // Two empty glass shapes in ONE morph name → drawn as one liquid surface.
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
    tintOpacity: look.tintOpacity,
    blur: look.blur,
  });
  const handles = shapes.map((d) => attachGlass(d, group, props(CLEAR, 0)));
  cleanups.push(() => {
    handles.forEach((h) => h.destroy());
    shapes.forEach((d) => d.remove());
    requestRender();
  });

  const draw = (t) => {
    currentT = t;
    const f = filmFrame(t, F, T, end);
    placeFixed(shapes[0], f.drop);
    placeFixed(shapes[1], f.blob);
    handles[0].setProps(props(f.look, f.drop.radius));
    handles[1].setProps(props(f.look, f.blob.radius));
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
      // film shapes stay one more frame under it (no gap between the two).
      setSuspended(to, false);
      to.style.removeProperty('visibility');
      if (opts.fadeContent) fade(to, true, false);
      requestAnimationFrame(() => {
        cleanup();
        finish();
      });
    } else {
      cleanup();
      finish();
    }
  };

  if (resumeAt != null) {
    // Continuing a reversed film: straight on from that frame, for the share
    // of the film that's left (`to` is already hidden behind the film).
    const goal = forwards ? 1 : 0;
    play(resumeAt, goal, Math.max(60, Math.abs(goal - resumeAt) * (forwards ? opts.duration : opts.reverseDuration)));
  } else if (forwards) {
    play(0, 1, opts.duration);
  } else {
    // Backwards: `to`'s content fades out first (with its own glass still
    // on), then the film takes over from it and melts back into `from`.
    to.style.removeProperty('visibility');
    setSuspended(to, false);
    const out = opts.fadeContent ? fade(to, false, true) : null;
    if (out) cleanups.push(() => out.cancel());
    else fades.get(to)?.cancel();
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

/** Suspend / resume an element's own slab (no-op without glass). */
function setSuspended(el, on) {
  const id = Number(el.dataset.glassId);
  if (id && getEntry(id)) update(id, { suspended: on });
}
