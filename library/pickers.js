/**
 * =============================================================================
 * glass/pickers.js — Segmented control, stepper, range / vertical / block sliders
 * =============================================================================
 * More Liquid Glass controls, built exactly like the ones in controls.js and
 * widgets.js: every visible part is a glass element (attachGlass) whose look
 * is a config group in glass.config.json, nested so each part refracts the
 * part under it, and they move with Apple's squish & stretch.
 *
 * SEGMENTED   a small glass capsule with a sliding lens on the picked
 *             segment (Day / Week / Month). It IS a lens bar (widgets.js) —
 *             press, slide, let go — with compact proportions and its own
 *             groups (segmented / segmentedLens / segmentedLensActive).
 * STEPPER     a glass capsule: − <value> +. Tap = one step; hold =
 *             repeat, faster and faster. The capsule leans towards the half
 *             you press (squish pull). A half at its limit is dimmed.
 * RANGE       the slider (controls.js) with TWO knobs (value [low, high]),
 *             or ONE knob standing up (orientation "vertical"). Same parts
 *             and groups as the slider: track → fill → knob(s).
 * BLOCK       Control Center's thick slider: a big glass block whose white
 *             fill IS the value (no knob). Drag anywhere — the value moves
 *             with your finger (relative, not a jump); tap jumps there.
 *             Pull past either end and the block stretches like rubber, then
 *             springs back when you let go. The icon is black by default
 *             (--gp-block-icon or the site's color changes it).
 *
 * Every create* function returns { update(next), destroy() } (+ getters).
 * opts.groups renames a part's config group; opts.props gives a part extra
 * per-element glass props (e.g. { props: { body: { style: 'crystal' } } }).
 * Without WebGL (phones, Safari…) glass.css draws the same parts in CSS.
 * =============================================================================
 */
import { resolveGlass, subscribeConfig } from './config';
import { attachGlass } from './useGlass';
import { createSquish } from './squish';
import { requestRender } from './registry';
import { blendLooks, capture, damp, layerFor, makeLoop, propSetter, reducedMotion, rgbCss, rgbOf } from './controls';
import { createLensBar, spring } from './widgets';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const clamp01 = (n) => clamp(n, 0, 1);
const DRAG_THRESHOLD = 3; // px of movement before a press counts as a drag
const SVG = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

/** A config group's squish tuning, for createSquish (overrides win). */
const squishCfg = (group, props, over = {}) => () => {
  const c = resolveGlass(group, props);
  return { squish: c.squish, squishGrow: c.squishGrow, squishPull: c.squishPull, squishBounce: c.squishBounce, ...over };
};

/** min / max / step → a function that rounds and clamps a value onto the steps. */
function snapper(get) {
  return (v) => {
    const { min, max, step } = get();
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const s = Math.round((clamp(v, lo, hi) - min) / step) * step + min;
    return clamp(Number(s.toFixed(10)), lo, hi);
  };
}

// =============================================================================
// Segmented control
// =============================================================================
/**
 * Liquid Glass segmented control: root holds the segments as [data-gp-item]
 * children (buttons). A compact horizontal lens bar.
 * @param {HTMLElement} root
 * @param {{ value?: number, onChange?: (index: number) => void, lensScale?: number, inset?: number,
 *           groups?: { bar?: string, lens?: string, lensActive?: string },
 *           props?: { bar?: object, lens?: object, lensActive?: object } }} [opts]
 */
export function createSegmented(root, opts = {}) {
  root.setAttribute('data-gp-segmented', '');
  if (!root.hasAttribute('role')) root.setAttribute('role', 'tablist');
  const props = opts.props || {};
  // On its own it goes on the FLOATING layer like the switch and slider (live
  // glass in Chromium), not "top" like a tab bar: it's a control in the page,
  // not a bar pinned over it. Inside other glass it follows that glass.
  const own = layerFor(root);
  const ctl = createLensBar(root, {
    lensScale: 1.16,
    inset: 2,
    ...opts,
    orientation: 'horizontal',
    groups: { bar: 'segmented', lens: 'segmentedLens', lensActive: 'segmentedLensActive', ...(opts.groups || {}) },
    props: { ...props, bar: { ...own, ...(props.bar || {}) } },
  });
  return {
    get value() {
      return ctl.value;
    },
    update: (next) => ctl.update(next),
    destroy() {
      ctl.destroy();
      root.removeAttribute('data-gp-segmented');
    },
  };
}

// =============================================================================
// Stepper
// =============================================================================
/**
 * Liquid Glass stepper (− value +). root: an empty <div>; the parts are added.
 * @param {HTMLElement} root
 * @param {{ value?: number, min?: number, max?: number, step?: number, disabled?: boolean,
 *           onChange?: (value: number) => void, wrap?: boolean,
 *           showValue?: boolean,                 // the number between − and + (default true)
 *           format?: (value: number) => string,  // how it's written (default String)
 *           groups?: { body?: string }, props?: { body?: object } }} [opts]
 */
export function createStepper(root, opts = {}) {
  const groups = { body: 'stepper', ...(opts.groups || {}) };
  const props = opts.props || {};
  const bodyProps = props.body || {};
  const cfg = { min: Number.isFinite(opts.min) ? opts.min : 0, max: Number.isFinite(opts.max) ? opts.max : 100, step: opts.step > 0 ? opts.step : 1 };
  const snap = snapper(() => cfg);
  let value = snap(Number.isFinite(opts.value) ? opts.value : cfg.min);
  let disabled = Boolean(opts.disabled);
  let onChange = opts.onChange;
  const wrap = Boolean(opts.wrap); // past max → min (and back)
  let showValue = opts.showValue !== false;
  let format = typeof opts.format === 'function' ? opts.format : String;

  root.setAttribute('data-gp-stepper', '');
  root.setAttribute('data-gp-no-squish', ''); // (we squish it ourselves, towards the half pressed)
  if (!root.hasAttribute('role')) root.setAttribute('role', 'group');
  const half = (dir, label, path) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-gp-step', String(dir));
    b.setAttribute('aria-label', label);
    b.innerHTML = SVG(path);
    return b;
  };
  const dec = half(-1, 'Decrease', 'M6 12h12');
  const inc = half(1, 'Increase', 'M12 6v12M6 12h12');
  // The value between the halves (read out when it changes).
  const num = document.createElement('span');
  num.setAttribute('data-gp-stepper-value', '');
  num.setAttribute('aria-live', 'polite');
  root.append(dec, num, inc);

  const fixed = { ...layerFor(root), ...bodyProps };
  const glass = attachGlass(root, groups.body, fixed);
  const squish = createSquish(root, squishCfg(groups.body, bodyProps));

  const sync = () => {
    const lo = Math.min(cfg.min, cfg.max);
    const hi = Math.max(cfg.min, cfg.max);
    const set = (b, off) => {
      // aria-disabled (not `disabled`): a disabled <button> gets no pointer
      // events, so a press on it would go to the capsule behind instead.
      b.setAttribute('aria-disabled', String(off));
      if (off) b.setAttribute('data-gp-off', '');
      else b.removeAttribute('data-gp-off');
    };
    num.textContent = format(value);
    num.hidden = !showValue;
    set(dec, disabled || (!wrap && value <= lo));
    set(inc, disabled || (!wrap && value >= hi));
    root.setAttribute('aria-disabled', String(disabled));
  };
  /** One step; false = at the limit (nothing changed). */
  const stepBy = (dir) => {
    if (disabled) return false;
    let next = value + dir * cfg.step;
    const lo = Math.min(cfg.min, cfg.max);
    const hi = Math.max(cfg.min, cfg.max);
    if (wrap && next > hi) next = lo;
    else if (wrap && next < lo) next = hi;
    next = snap(next);
    if (next === value) return false;
    value = next;
    sync();
    onChange?.(value);
    return true;
  };

  // Hold to repeat: first repeat after 420 ms, then faster down to 40 ms.
  let press = null; // { id, btn, dir, timer, delay }
  const stopRepeat = () => {
    if (press) clearTimeout(press.timer);
  };
  const repeat = () => {
    if (!press) return;
    if (!stepBy(press.dir)) return; // (hit the limit: stop)
    press.delay = Math.max(40, press.delay * 0.82);
    press.timer = setTimeout(repeat, press.delay);
  };
  const down = (e) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const btn = e.target.closest?.('[data-gp-step]');
    if (!btn || !root.contains(btn)) return;
    capture(root, e.pointerId);
    e.preventDefault(); // (no text selection / focus flash while holding)
    const dir = Number(btn.getAttribute('data-gp-step'));
    press = { id: e.pointerId, btn, dir, timer: 0, delay: 120 };
    btn.setAttribute('data-gp-pressed', '');
    squish.press(e.clientX, e.clientY);
    stepBy(dir);
    press.timer = setTimeout(repeat, 420);
  };
  const move = (e) => {
    if (press && e.pointerId === press.id) squish.drag(e.clientX, e.clientY);
  };
  const up = (e) => {
    if (!press || e.pointerId !== press.id) return;
    stopRepeat();
    press.btn.removeAttribute('data-gp-pressed');
    press = null;
    squish.release();
  };
  // Keyboard / assistive tech: Enter / Space on a half is a click with detail 0.
  const click = (e) => {
    const btn = e.target.closest?.('[data-gp-step]');
    if (btn && e.detail === 0) stepBy(Number(btn.getAttribute('data-gp-step')));
  };
  const key = (e) => {
    // Home / End: straight to the lowest / highest value (as a spin button).
    if ((e.key === 'Home' || e.key === 'End') && !disabled) {
      e.preventDefault();
      const lo = Math.min(cfg.min, cfg.max);
      const hi = Math.max(cfg.min, cfg.max);
      const goal = snap(e.key === 'Home' ? lo : hi);
      if (goal !== value) {
        value = goal;
        sync();
        onChange?.(value);
      }
      return;
    }
    const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    stepBy(dir);
  };
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('lostpointercapture', up);
  root.addEventListener('click', click);
  root.addEventListener('keydown', key);
  // CSS look (no WebGL): the body's own colour.
  const paint = () => {
    const c = resolveGlass(groups.body, bodyProps);
    root.style.setProperty('--gp-stepper', rgbCss(rgbOf(c.tint.from, root), c.tintOpacity));
  };
  const offConfig = subscribeConfig(paint);
  paint();
  sync();

  return {
    get value() {
      return value;
    },
    update(next = {}) {
      if (next.onChange !== undefined) onChange = next.onChange;
      if (Number.isFinite(next.min)) cfg.min = next.min;
      if (Number.isFinite(next.max)) cfg.max = next.max;
      if (next.step > 0) cfg.step = next.step;
      if (next.disabled !== undefined) disabled = Boolean(next.disabled);
      if (next.showValue !== undefined) showValue = next.showValue !== false;
      if (typeof next.format === 'function') format = next.format;
      if (Number.isFinite(next.value)) value = snap(next.value);
      sync();
    },
    destroy() {
      stopRepeat();
      offConfig();
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      root.removeEventListener('lostpointercapture', up);
      root.removeEventListener('click', click);
      root.removeEventListener('keydown', key);
      squish.destroy();
      glass.destroy();
      dec.remove();
      num.remove();
      inc.remove();
      root.removeAttribute('data-gp-stepper');
      root.removeAttribute('data-gp-no-squish');
    },
  };
}

// =============================================================================
// Range slider (two knobs) + vertical slider (one knob, standing up)
// =============================================================================
const KNOB_RATIO = 1.4; // knob width : height (same as the slider)
const ACTIVE_SCALE = 1.35; // glass knob size vs the solid knob
const knobStyle = (style) => (style === 'crystal' ? 'crystal' : 'default');

/**
 * Liquid Glass slider with two knobs (value = [low, high]) or one
 * (value = number), lying down or standing up.
 * @param {HTMLElement} root  a <div>; size it with CSS
 * @param {{ value?: number|[number, number], min?: number, max?: number, step?: number,
 *           orientation?: 'horizontal'|'vertical', disabled?: boolean,
 *           onChange?: (value: number|[number, number]) => void,
 *           onChangeEnd?: (value: number|[number, number]) => void,
 *           groups?: { track?: string, fill?: string, knob?: string, knobActive?: string },
 *           props?: { track?: object } }} [opts]
 */
export function createRangeSlider(root, opts = {}) {
  const groups = { track: 'sliderTrack', fill: 'sliderFill', knob: 'sliderKnob', knobActive: 'sliderKnobActive', ...(opts.groups || {}) };
  const vertical = opts.orientation === 'vertical';
  const range = Array.isArray(opts.value);
  const cfg = { min: Number.isFinite(opts.min) ? opts.min : 0, max: Number.isFinite(opts.max) ? opts.max : 100, step: opts.step > 0 ? opts.step : 1 };
  const snap = snapper(() => cfg);
  let disabled = Boolean(opts.disabled);
  let onChange = opts.onChange;
  let onChangeEnd = opts.onChangeEnd;
  const order = (v) => (v[0] <= v[1] ? v : [v[1], v[0]]);
  let vals = range ? order([snap(opts.value[0]), snap(opts.value[1])]) : [snap(Number.isFinite(opts.value) ? opts.value : cfg.min)];
  const out = () => (range ? [...vals] : vals[0]);

  root.setAttribute('data-gp-range', '');
  root.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
  const track = document.createElement('span');
  track.setAttribute('data-gp-track', '');
  const fill = document.createElement('span');
  fill.setAttribute('data-gp-fill', '');
  // Nested so each part refracts the one under it: track → fill → knob(s).
  const knobs = vals.map(() => {
    const k = document.createElement('span');
    k.setAttribute('data-gp-knob', '');
    fill.appendChild(k);
    return k;
  });
  track.append(fill);
  root.appendChild(track);
  for (const n of [track, fill]) n.setAttribute('aria-hidden', 'true');
  // ARIA: one knob → the root is the slider; two → each knob is one.
  const sliders = range ? knobs : [root];
  for (const s of sliders) {
    s.setAttribute('role', 'slider');
    s.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
    if (!s.hasAttribute('tabindex')) s.tabIndex = 0;
  }
  if (range) {
    root.setAttribute('role', 'group');
    knobs[0].setAttribute('aria-label', 'Minimum');
    knobs[1].setAttribute('aria-label', 'Maximum');
  } else knobs[0].setAttribute('aria-hidden', 'true');

  const trackProps = opts.props?.track || {};
  const trackGlass = attachGlass(track, groups.track, { ...layerFor(root), ...trackProps });
  const fillGlass = attachGlass(fill, groups.fill);
  const knobGlass = knobs.map((k) => attachGlass(k, groups.knob));
  const setKnob = knobGlass.map((g) => propSetter(g));
  let looks = null;
  const readLooks = () => {
    const plain = { style: 'default' };
    const st = { style: knobStyle(resolveGlass(groups.track, trackProps).style) };
    looks = { knob: resolveGlass(groups.knob, st), active: resolveGlass(groups.knobActive, st), track: resolveGlass(groups.track, plain), fill: resolveGlass(groups.fill, plain) };
    trackGlass.setProps({ ...layerFor(root), ...trackProps, ...plain });
    fillGlass.setProps(plain);
  };
  readLooks();

  const frac = (v) => (cfg.max === cfg.min ? 0 : clamp01((v - cfg.min) / (cfg.max - cfg.min)));
  // Per knob: pos (0–1, eased) and lift (0 solid … 1 glass).
  const cur = vals.map((v) => ({ pos: frac(v), lift: 0 }));
  let shown = [...vals]; // where the knobs are heading
  let press = null; // { id, i, grab }

  /** Lengths in px: L = along the slider, knob size at rest (kw across × kh along… see below). */
  const geo = () => {
    const L = vertical ? root.clientHeight : root.clientWidth;
    const cross = vertical ? root.clientWidth : root.clientHeight;
    const kh = Math.max(8, Math.round(cross * 0.62));
    const kw = Math.round(kh * KNOB_RATIO);
    // The knob is the same pill either way (wider than tall); its length
    // ALONG the slider is kw lying down, kh standing up.
    return { L, kw, kh, ka: vertical ? kh : kw };
  };
  /** Knob centre along the slider (px from its start: left, or the BOTTOM standing up). */
  const centreOf = (pos, g) => g.ka / 2 + pos * Math.max(0, g.L - g.ka);

  const render = () => {
    const g = geo();
    if (!g.L) return;
    const cs = cur.map((c) => centreOf(c.pos, g));
    const a = range ? cs[0] : 0; // fill from a to b (along px)
    const b = range ? cs[1] : cs[0];
    const tw = track.clientWidth;
    const th = track.clientHeight;
    if (vertical) Object.assign(fill.style, { left: '0px', width: '100%', top: `${g.L - b}px`, height: `${Math.max(0, b - a)}px` });
    else Object.assign(fill.style, { left: `${a}px`, width: `${Math.max(0, b - a)}px` });
    cs.forEach((c, i) => {
      const s = 1 + (ACTIVE_SCALE - 1) * cur[i].lift;
      const w = g.kw * s;
      const h = g.kh * s;
      const k = knobs[i];
      // (knob boxes are in the fill's px)
      if (vertical) Object.assign(k.style, { left: `${tw / 2 - w / 2}px`, top: `${b - c - h / 2}px`, width: `${w}px`, height: `${h}px` });
      else Object.assign(k.style, { left: `${c - w / 2 - a}px`, top: `${th / 2 - h / 2}px`, width: `${w}px`, height: `${h}px` });
      k.style.zIndex = press?.i === i ? '2' : '1';
      const look = blendLooks(looks.knob, looks.active, cur[i].lift, k);
      setKnob[i](look);
      k.style.setProperty('--gp-knob', rgbCss(rgbOf(look.tint, k), look.tintOpacity));
      k.style.setProperty('--gp-lift', cur[i].lift.toFixed(3));
      if (cur[i].lift > 0.01) k.setAttribute('data-gp-active', '');
      else k.removeAttribute('data-gp-active');
    });
    track.style.setProperty('--gp-track', rgbCss(rgbOf(looks.track.tint.from, track), looks.track.tintOpacity));
    fill.style.setProperty('--gp-fill', rgbCss(rgbOf(looks.fill.tint.from, fill), looks.fill.tintOpacity));
  };
  const writeAria = () => {
    sliders.forEach((s, i) => {
      s.setAttribute('aria-valuemin', String(range && i === 1 ? shown[0] : cfg.min));
      s.setAttribute('aria-valuemax', String(range && i === 0 ? shown[1] : cfg.max));
      s.setAttribute('aria-valuenow', String(shown[i]));
      s.setAttribute('aria-disabled', String(disabled));
    });
    root.setAttribute('aria-disabled', String(disabled));
  };

  const loop = makeLoop((dt) => {
    let busy = Boolean(press);
    cur.forEach((c, i) => {
      const goal = frac(shown[i]);
      const liftGoal = press?.i === i ? 1 : 0;
      if (reducedMotion()) {
        c.pos = goal;
        c.lift = liftGoal;
        return;
      }
      c.lift = damp(c.lift, liftGoal, liftGoal > c.lift ? 0.018 : 0.035, dt);
      c.pos = press?.i === i ? goal : damp(c.pos, goal, 0.04, dt);
      if (Math.abs(c.lift - liftGoal) < 0.003) c.lift = liftGoal;
      if (Math.abs(c.pos - goal) < 0.0008) c.pos = goal;
      if (c.lift !== liftGoal || c.pos !== goal) busy = true;
    });
    render();
    return busy;
  });

  /** The user moved knob i to v. */
  const set = (i, v, end) => {
    let next = snap(v);
    if (range) next = i === 0 ? Math.min(next, shown[1]) : Math.max(next, shown[0]); // (knobs never cross)
    const changed = next !== shown[i];
    shown = shown.map((s, j) => (j === i ? next : s));
    vals = [...shown];
    writeAria();
    loop.kick();
    if (changed) onChange?.(out());
    if (end) onChangeEnd?.(out());
  };

  // --- Pointer ----------------------------------------------------------------------------
  /** Pointer → px along the slider (from the left, or from the bottom standing up). */
  const alongOf = (e) => {
    const r = root.getBoundingClientRect();
    return vertical ? r.bottom - e.clientY : e.clientX - r.left;
  };
  const valueAt = (along, grab) => {
    const g = geo();
    return cfg.min + clamp01((along - grab - g.ka / 2) / Math.max(1, g.L - g.ka)) * (cfg.max - cfg.min);
  };
  const down = (e) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    capture(root, e.pointerId);
    const g = geo();
    const p = alongOf(e);
    const cs = cur.map((c) => centreOf(c.pos, g));
    // The nearest knob (two knobs on top of each other: the one you move away from the other).
    let i = 0;
    if (range) {
      const d0 = Math.abs(p - cs[0]);
      const d1 = Math.abs(p - cs[1]);
      i = d1 < d0 || (d1 === d0 && p > cs[1]) ? 1 : 0;
    }
    const onKnob = Math.abs(p - cs[i]) <= g.ka / 2;
    press = { id: e.pointerId, i, grab: onKnob ? p - cs[i] : 0 };
    (range ? knobs[i] : root).focus?.({ preventScroll: true });
    set(i, valueAt(p, press.grab), false);
    e.preventDefault();
  };
  const move = (e) => {
    if (!press || e.pointerId !== press.id) return;
    set(press.i, valueAt(alongOf(e), press.grab), false);
  };
  const up = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const i = press.i;
    press = null;
    set(i, shown[i], true);
  };
  const key = (e) => {
    if (disabled) return;
    const i = range ? Math.max(0, knobs.indexOf(document.activeElement)) : 0;
    const big = Math.max(cfg.step, (cfg.max - cfg.min) / 10);
    const delta = { ArrowRight: cfg.step, ArrowUp: cfg.step, ArrowLeft: -cfg.step, ArrowDown: -cfg.step, PageUp: big, PageDown: -big }[e.key];
    let next = null;
    if (delta !== undefined) next = shown[i] + delta;
    else if (e.key === 'Home') next = cfg.min;
    else if (e.key === 'End') next = cfg.max;
    if (next === null) return;
    e.preventDefault();
    set(i, next, true);
  };
  const swallowClick = (e) => e.preventDefault(); // (inside a <label>)
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('lostpointercapture', up);
  root.addEventListener('keydown', key);
  root.addEventListener('click', swallowClick);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => render()) : null;
  ro?.observe(root);
  const offConfig = subscribeConfig(() => {
    readLooks();
    render();
  });
  writeAria();
  render();
  requestAnimationFrame(render);

  return {
    get value() {
      return out();
    },
    update(next = {}) {
      if (next.onChange !== undefined) onChange = next.onChange;
      if (next.onChangeEnd !== undefined) onChangeEnd = next.onChangeEnd;
      if (Number.isFinite(next.min)) cfg.min = next.min;
      if (Number.isFinite(next.max)) cfg.max = next.max;
      if (next.step > 0) cfg.step = next.step;
      if (next.disabled !== undefined) disabled = Boolean(next.disabled);
      if (next.value !== undefined && !press) {
        const v = range ? (Array.isArray(next.value) ? order([snap(next.value[0]), snap(next.value[1])]) : null) : Number.isFinite(next.value) ? [snap(next.value)] : null;
        if (v) vals = shown = v;
      }
      writeAria();
      loop.kick();
    },
    destroy() {
      loop.stop();
      offConfig();
      ro?.disconnect();
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      root.removeEventListener('lostpointercapture', up);
      root.removeEventListener('keydown', key);
      root.removeEventListener('click', swallowClick);
      knobGlass.forEach((g) => g.destroy());
      fillGlass.destroy();
      trackGlass.destroy();
      track.remove();
      root.removeAttribute('data-gp-range');
    },
  };
}

// =============================================================================
// Block slider (Control Center)
// =============================================================================
/**
 * Control Center-style thick slider. Children (an icon) stay; the glass
 * block, a clipped white fill and the motion are added.
 * @param {HTMLElement} root  a <div>; size it with CSS (e.g. 72 × 160)
 * @param {{ value?: number, min?: number, max?: number, step?: number,
 *           orientation?: 'vertical'|'horizontal', disabled?: boolean,
 *           onChange?: (value: number) => void, onChangeEnd?: (value: number) => void,
 *           groups?: { body?: string }, props?: { body?: object } }} [opts]
 */
export function createBlockSlider(root, opts = {}) {
  const groups = { body: 'blockSlider', ...(opts.groups || {}) };
  const bodyProps = opts.props?.body || {};
  const vertical = opts.orientation !== 'horizontal';
  const cfg = { min: Number.isFinite(opts.min) ? opts.min : 0, max: Number.isFinite(opts.max) ? opts.max : 100, step: opts.step > 0 ? opts.step : 1 };
  const snap = snapper(() => cfg);
  let value = snap(Number.isFinite(opts.value) ? opts.value : cfg.min);
  let disabled = Boolean(opts.disabled);
  let onChange = opts.onChange;
  let onChangeEnd = opts.onChangeEnd;

  root.setAttribute('data-gp-block', vertical ? 'vertical' : 'horizontal');
  root.setAttribute('data-gp-no-squish', ''); // (it moves itself: press swell + rubber band)
  root.setAttribute('role', 'slider');
  root.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
  if (!root.hasAttribute('tabindex')) root.tabIndex = 0;
  // The fill is plain CSS (flat top edge, like Control Center), clipped to
  // the block's rounded shape by its own box — the glass element itself must
  // not clip (overflow: hidden would cut off its live glass and shadow).
  const clip = document.createElement('span');
  clip.setAttribute('data-gp-block-clip', '');
  clip.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('span');
  fill.setAttribute('data-gp-block-fill', '');
  clip.appendChild(fill);
  root.insertBefore(clip, root.firstChild);

  // The icon's colour is the block's own (black by default, --gp-block-icon
  // changes it) — not the glass's automatic text colour, which turned it
  // white over dark glass: invisible on the white fill. props.body.textColor wins.
  const fixed = { ...layerFor(root), textColor: 'var(--gp-block-icon, #000000)', ...bodyProps };
  const glass = attachGlass(root, groups.body, fixed);

  const frac = (v) => (cfg.max === cfg.min ? 0 : clamp01((v - cfg.min) / (cfg.max - cfg.min)));
  // f = shown fill 0–1; g = swell (1 at rest) + speed; band = rubber stretch (px, signed) + speed.
  const cur = { f: frac(value), g: 1, vg: 0, band: 0, vb: 0 };
  let press = null; // { id, start, startF, moved, raw }

  const render = () => {
    const L = vertical ? root.clientHeight : root.clientWidth;
    if (!L) return;
    const pct = `${(clamp01(cur.f) * 100).toFixed(3)}%`;
    if (vertical) Object.assign(fill.style, { left: '0', right: '0', bottom: '0', top: 'auto', height: pct, width: '' });
    else Object.assign(fill.style, { left: '0', top: '0', bottom: '0', right: 'auto', width: pct, height: '' });
    // Swell + rubber band: stretched ALONG the pull (and a little thinner
    // across it), moved towards it so the far end stays about where it was.
    const k = Math.abs(cur.band) / L;
    const along = cur.g * (1 + k);
    const across = cur.g * (1 - k * 0.35);
    const shift = cur.band / 2;
    root.style.scale = vertical ? `${across.toFixed(4)} ${along.toFixed(4)}` : `${along.toFixed(4)} ${across.toFixed(4)}`;
    root.style.translate = vertical ? `0 ${(-shift).toFixed(2)}px` : `${shift.toFixed(2)}px 0`;
    requestRender(); // (the glass follows the element's moved box: redraw it)
    root.style.setProperty('--gp-block-t', cur.f.toFixed(3));
  };
  const paint = () => {
    const c = resolveGlass(groups.body, bodyProps);
    root.style.setProperty('--gp-block', rgbCss(rgbOf(c.tint.from, root), c.tintOpacity));
    const r = c.shape === 'capsule' || c.shape === 'circle' ? '999px' : c.radius === 'auto' ? '22px' : `${c.radius}px`;
    root.style.setProperty('--gp-block-r', r);
  };
  const writeAria = () => {
    root.setAttribute('aria-valuemin', String(cfg.min));
    root.setAttribute('aria-valuemax', String(cfg.max));
    root.setAttribute('aria-valuenow', String(value));
    root.setAttribute('aria-disabled', String(disabled));
  };

  const loop = makeLoop((dt) => {
    const goalF = frac(value);
    const goalG = press ? 1.04 : 1;
    if (reducedMotion()) {
      Object.assign(cur, { f: goalF, g: 1, vg: 0, band: 0, vb: 0 });
      render();
      return false;
    }
    cur.f = press ? clamp01(press.raw) : damp(cur.f, goalF, 0.05, dt);
    [cur.g, cur.vg] = spring(cur.g, cur.vg, goalG, press ? 600 : 320, press ? 0.8 : 0.45, dt);
    if (!press) [cur.band, cur.vb] = spring(cur.band, cur.vb, 0, 320, 0.42, dt);
    const settled = !press && Math.abs(cur.f - goalF) < 0.0008 && Math.abs(cur.g - 1) < 0.0005 && Math.abs(cur.vg) < 0.01 && Math.abs(cur.band) < 0.05 && Math.abs(cur.vb) < 0.5;
    if (settled) Object.assign(cur, { f: goalF, g: 1, vg: 0, band: 0, vb: 0 });
    render();
    return !settled;
  });

  const commit = (f, end) => {
    const next = snap(cfg.min + clamp01(f) * (cfg.max - cfg.min));
    if (next !== value) {
      value = next;
      writeAria();
      onChange?.(value);
    }
    if (end) onChangeEnd?.(value);
    loop.kick();
  };

  const alongOf = (e) => {
    const r = root.getBoundingClientRect();
    return vertical ? r.bottom - e.clientY : e.clientX - r.left;
  };
  const length = () => (vertical ? root.clientHeight : root.clientWidth) || 1;
  const down = (e) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    capture(root, e.pointerId);
    root.focus?.({ preventScroll: true });
    press = { id: e.pointerId, start: alongOf(e), startF: cur.f, moved: false, raw: cur.f };
    e.preventDefault();
    loop.kick();
  };
  const move = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const d = alongOf(e) - press.start;
    if (!press.moved && Math.abs(d) > DRAG_THRESHOLD) press.moved = true;
    if (!press.moved) return;
    // Relative drag: the value moves WITH the finger from where it was.
    const L = length();
    press.raw = press.startF + d / L;
    // Past an end: rubber band (eases out, never more than ~26 px).
    const over = (press.raw - clamp01(press.raw)) * L;
    cur.band = Math.sign(over) * 26 * Math.tanh(Math.abs(over) / 90);
    cur.vb = 0;
    commit(press.raw, false);
  };
  const up = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    // A tap (no drag) jumps to where you tapped.
    if (!p.moved && e.type === 'pointerup') commit(alongOf(e) / length(), true);
    else commit(clamp01(p.raw), true);
  };
  const key = (e) => {
    if (disabled) return;
    const big = Math.max(cfg.step, (cfg.max - cfg.min) / 10);
    const delta = { ArrowRight: cfg.step, ArrowUp: cfg.step, ArrowLeft: -cfg.step, ArrowDown: -cfg.step, PageUp: big, PageDown: -big }[e.key];
    let next = null;
    if (delta !== undefined) next = value + delta;
    else if (e.key === 'Home') next = cfg.min;
    else if (e.key === 'End') next = cfg.max;
    if (next === null) return;
    e.preventDefault();
    commit(frac(snap(next)), true);
  };
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('lostpointercapture', up);
  root.addEventListener('keydown', key);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => render()) : null;
  ro?.observe(root);
  const offConfig = subscribeConfig(() => {
    paint();
    render();
  });
  paint();
  writeAria();
  render();

  return {
    get value() {
      return value;
    },
    update(next = {}) {
      if (next.onChange !== undefined) onChange = next.onChange;
      if (next.onChangeEnd !== undefined) onChangeEnd = next.onChangeEnd;
      if (Number.isFinite(next.min)) cfg.min = next.min;
      if (Number.isFinite(next.max)) cfg.max = next.max;
      if (next.step > 0) cfg.step = next.step;
      if (next.disabled !== undefined) disabled = Boolean(next.disabled);
      if (Number.isFinite(next.value) && !press) value = snap(next.value);
      writeAria();
      loop.kick();
    },
    destroy() {
      loop.stop();
      offConfig();
      ro?.disconnect();
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      root.removeEventListener('lostpointercapture', up);
      root.removeEventListener('keydown', key);
      glass.destroy();
      clip.remove();
      root.style.removeProperty('scale');
      root.style.removeProperty('translate');
      root.removeAttribute('data-gp-block');
      root.removeAttribute('data-gp-no-squish');
    },
  };
}
