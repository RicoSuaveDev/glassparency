/**
 * =============================================================================
 * glass/controls.js — Liquid Glass switches and sliders (no React needed)
 * =============================================================================
 * Recreates how switches and sliders behave in Apple's Liquid Glass (macOS 26
 * System Settings, studied frame by frame from a screen recording):
 *
 * SWITCH  a coloured capsule track with a solid white capsule knob.
 *   press      the knob swells (~1.42×, taller than the track) and turns
 *              into clear glass that shows the track SHRUNK inside it, with
 *              a clear band of page round it (glass "minify") (~120 ms)
 *   drag       the glass knob follows the pointer; the track colour fades
 *              between the off and on colours with the knob's position
 *   release    snaps to the nearer side, then shrinks back to solid white
 *   click      grow → slide across (~350 ms) → shrink (~160 ms)
 *   keyboard   Space / Enter toggle with the same animation
 *
 * SLIDER  a thin track, a coloured fill up to the knob's centre, and a solid
 *         white capsule knob.
 *   press      the knob jumps to the pointer and turns into clear glass
 *              ~1.35× bigger (~40 ms); the fill shows through it
 *   drag       value follows the pointer (stepped)
 *   release    ~100 ms back to a solid white knob
 *   keyboard   ←/→ ↑/↓ one step, PageUp/PageDown ten, Home/End
 *
 * Every part is a glass element (attachGlass), nested so each one refracts
 * the part under it, in live (Chromium) and WebGL mode alike:
 *   switch: root = track (groups "switch" / "switchOn") → knob
 *           ("switchKnob" at rest, "switchKnobActive" as glass)
 *   slider: root (hit area, no glass) → track ("sliderTrack") → fill
 *           ("sliderFill") → knob ("sliderKnob" / "sliderKnobActive")
 * The knob's look is interpolated between its two groups every frame
 * (setProps), so all of it is tunable in glass.config.json. Without WebGL
 * (phones, reduced transparency…) the same parts are drawn by the CSS in
 * glass.css from the same colours.
 *
 *   const sw = createSwitch(buttonEl, { checked: true, onChange: (on) => … });
 *   sw.update({ checked: false, disabled: true });  sw.destroy();
 *   const sl = createSlider(divEl, { value: 40, min: 0, max: 100, step: 1, onChange, onChangeEnd });
 *
 * Controlled use (React): pass the current value with update(); a change
 * from the user calls onChange and shows it straight away. If the owner
 * doesn't take it within REVERT_MS, the control goes back to the value it
 * was given.
 * =============================================================================
 */
import { resolveGlass, subscribeConfig } from './config';
import { attachGlass } from './useGlass';

// (The helpers marked `export` below are shared with widgets.js.)

// --- Tuning (from the recording) ------------------------------------------------------------
// Proportions follow iOS 26 / macOS 26: a 62×28 track, a capsule knob
// (1.55 : 1) inset 2px, and a glass knob clearly taller than the track, so
// it shows a band of page round the (shrunk — see "minify") track.
const SWITCH_ACTIVE_SCALE = 1.42; // glass knob size vs the solid knob
const SLIDER_ACTIVE_SCALE = 1.35;
const KNOB_RATIO = 1.55; // switch knob: width = height × ratio
const SLIDER_KNOB_RATIO = 1.4; // slider knob
const SWITCH_INSET = 2; // px between the track edge and the knob
const DRAG_THRESHOLD = 3; // px of movement before a press counts as a drag
const REVERT_MS = 1500; // controlled: owner didn't take the change → go back
// Easing time constants (s): ~95% of the way in 3× this.
const TAU = { liftUp: 0.035, liftDown: 0.05, pos: 0.075, sliderPos: 0.04 };

/** Glass properties that are blended between a knob's two looks. */
const BLEND_KEYS = [
  'tintOpacity', 'blur', 'thickness', 'bevel', 'ior', 'chromaticAberration', 'rimLight', 'innerGlow',
  'shadowOpacity', 'shadowBlur', 'shadowX', 'shadowY', 'borderOpacity', 'saturation', 'brightness', 'minify',
];

export const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const lerp = (a, b, t) => a + (b - a) * t;

// --- Colours -------------------------------------------------------------------------------
let probe = null;
/** Any CSS colour (or var(--x) read from el) → [r, g, b] 0–255. */
export function rgbOf(value, el) {
  let css = String(value || '').trim();
  const v = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.*))?\)$/.exec(css);
  if (v) css = (el && getComputedStyle(el).getPropertyValue(v[1]).trim()) || (v[2] || '').trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  if (typeof document === 'undefined') return [255, 255, 255];
  probe ||= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!probe) return [255, 255, 255];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#ffffff';
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}
export const rgbCss = ([r, g, b], a = 1) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * 1000) / 1000})`;
export const mixRgb = (a, b, t) => a.map((c, i) => lerp(c, b[i], t));

/**
 * A look between two resolved glass groups (t = 0 → a, 1 → b), as
 * per-element props: numbers blended, tint colours mixed.
 */
export function blendLooks(a, b, t, el) {
  const out = {};
  for (const k of BLEND_KEYS) out[k] = Math.round(lerp(a[k], b[k], t) * 1000) / 1000;
  const c = mixRgb(rgbOf(a.tint.from, el), rgbOf(b.tint.from, el), t);
  out.tint = rgbCss(c).replace('rgba', 'rgb').replace(/, 1\)$/, ')');
  // These are finished values (any crystal / frosted style is already in
  // them): don't let the element's group apply its style rules a 2nd time.
  out.style = 'default';
  return out;
}

// --- A tiny animation loop ------------------------------------------------------------------
/** Calls step(dt) every frame until it returns false (settled). */
export function makeLoop(step) {
  let raf = 0;
  let last = 0;
  const frame = (now) => {
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    if (step(dt)) raf = requestAnimationFrame(frame);
    else {
      raf = 0;
      last = 0;
    }
  };
  return {
    kick() {
      if (!raf) raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    },
  };
}
/** Pointer capture that never throws (an id the browser no longer tracks would). */
export function capture(el, id) {
  try {
    el.setPointerCapture?.(id);
  } catch {
    // (no capture: moves outside the control just aren't followed)
  }
}

/** Move x towards target with time constant tau (seconds). */
export const damp = (x, target, tau, dt) => (tau <= 0 ? target : target + (x - target) * Math.exp(-dt / tau));

/** Per-element prop updates only when something visible changed (+ fixed props). */
export function propSetter(handle, fixed = {}) {
  let key = '';
  return (props) => {
    const k = JSON.stringify(props);
    if (k === key) return;
    key = k;
    handle.setProps({ ...fixed, ...props });
  };
}

/**
 * Glass for a control that isn't inside other glass goes on the FLOATING
 * layer. On the base layer the WebGL glass is drawn behind the page, so a
 * switch on an opaque card (a white settings panel) would vanish in Safari /
 * Firefox. Inside glass (a glass card, a dialog) it simply follows its parent.
 */
export const layerFor = (el) => (el.parentElement?.closest('[data-glass-id]') ? {} : { layer: 'float' });

/**
 * A switch / slider's style → the style its KNOB uses. Only crystal changes
 * them (a clearer glass knob while pressed); frosted switches and sliders
 * look exactly like the default ones — a milky knob hid the track under it.
 */
const knobStyle = (style) => (style === 'crystal' ? 'crystal' : 'default');

// =============================================================================
// Switch
// =============================================================================
/**
 * Turn an element (ideally a <button type="button">) into a Liquid Glass switch.
 * @param {HTMLElement} root
 * @param {{
 *   checked?: boolean, disabled?: boolean,
 *   onChange?: (checked: boolean) => void,
 *   controlled?: boolean,   // true: the owner passes the value back with update()
 *   groups?: { off?: string, on?: string, knob?: string, knobActive?: string },
 *   props?: { track?: object },   // per-element glass props for the track, e.g. { style: 'crystal' }
 * }} [opts]
 */
export function createSwitch(root, opts = {}) {
  const groups = { off: 'switch', on: 'switchOn', knob: 'switchKnob', knobActive: 'switchKnobActive', ...(opts.groups || {}) };
  let checked = Boolean(opts.checked);
  let disabled = Boolean(opts.disabled);
  let onChange = opts.onChange;
  const controlled = Boolean(opts.controlled);

  root.setAttribute('data-gp-switch', '');
  if (!root.hasAttribute('role')) root.setAttribute('role', 'switch');
  if (root.tagName !== 'BUTTON' && !root.hasAttribute('tabindex')) root.tabIndex = 0;
  const knob = document.createElement('span');
  knob.setAttribute('data-gp-knob', '');
  knob.setAttribute('aria-hidden', 'true');
  root.appendChild(knob);

  const trackProps = opts.props?.track || {};
  const fixed = { ...layerFor(root), ...trackProps };
  const trackGlass = attachGlass(root, groups.off, fixed);
  const knobGlass = attachGlass(knob, groups.knob);
  const setTrack = propSetter(trackGlass, fixed);
  const setKnob = propSetter(knobGlass);

  // Animated state: pos 0 (off) … 1 (on), lift 0 (solid knob) … 1 (glass).
  const cur = { pos: checked ? 1 : 0, lift: 0 };
  const target = { pos: cur.pos };
  let pressed = false;
  let dragging = false;
  let press = null; // { id, x, startPos, travel }
  let revertTimer = 0;
  let looks = null; // resolved groups (re-read when the config / theme changes)
  // The switch's style (config "style" of groups.off, or the track props)
  // only changes the KNOB — the glass it turns into while pressed / dragged
  // (see knobStyle). The track always keeps its default look (a crystal
  // track lost its colour).
  const readLooks = () => {
    const st = { style: knobStyle(resolveGlass(groups.off, trackProps).style) };
    const plain = { ...trackProps, style: 'default' };
    looks = { off: resolveGlass(groups.off, plain), on: resolveGlass(groups.on, plain), knob: resolveGlass(groups.knob, st), active: resolveGlass(groups.knobActive, st) };
  };
  readLooks();

  const render = () => {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    const inset = Math.min(SWITCH_INSET, H / 4);
    const kh = H - inset * 2;
    const kw = Math.min(kh * KNOB_RATIO, W - inset * 2);
    const travel = Math.max(0, W - inset * 2 - kw);
    const s = 1 + (SWITCH_ACTIVE_SCALE - 1) * cur.lift;
    const w = kw * s;
    const h = kh * s;
    const cx = inset + cur.pos * travel + kw / 2;
    Object.assign(knob.style, { left: `${cx - w / 2}px`, top: `${H / 2 - h / 2}px`, width: `${w}px`, height: `${h}px` });
    // Track colour follows the knob's position (on ↔ off cross-fade).
    const track = blendLooks(looks.off, looks.on, cur.pos, root);
    setTrack(track);
    const k = blendLooks(looks.knob, looks.active, cur.lift, knob);
    setKnob(k);
    // The same colours for the CSS look (no WebGL / before the glass draws).
    root.style.setProperty('--gp-track', rgbCss(rgbOf(track.tint, root), track.tintOpacity));
    knob.style.setProperty('--gp-knob', rgbCss(rgbOf(k.tint, knob), k.tintOpacity));
    knob.style.setProperty('--gp-lift', cur.lift.toFixed(3));
    root.setAttribute('aria-checked', String(checked));
    if (cur.lift > 0.01) knob.setAttribute('data-gp-active', '');
    else knob.removeAttribute('data-gp-active');
  };

  const loop = makeLoop((dt) => {
    if (reducedMotion()) {
      cur.pos = target.pos;
      cur.lift = pressed ? 1 : 0;
      render();
      return false;
    }
    const travelling = !dragging && Math.abs(cur.pos - target.pos) > 0.004;
    // Glass while pressed or travelling; the knob first turns to glass,
    // then slides (as in the recording), then turns solid again.
    const liftTarget = pressed || travelling ? 1 : 0;
    cur.lift = damp(cur.lift, liftTarget, liftTarget > cur.lift ? TAU.liftUp : TAU.liftDown, dt);
    if (!dragging && (cur.lift > 0.6 || !travelling)) cur.pos = damp(cur.pos, target.pos, TAU.pos, dt);
    if (Math.abs(cur.lift - liftTarget) < 0.003) cur.lift = liftTarget;
    if (Math.abs(cur.pos - target.pos) < 0.002 && !dragging) cur.pos = target.pos;
    render();
    return pressed || cur.lift !== liftTarget || cur.pos !== target.pos;
  });

  /** The user changed it. */
  const commit = (next) => {
    target.pos = next ? 1 : 0;
    loop.kick();
    if (next === checked) return;
    if (!controlled) checked = next;
    onChange?.(next);
    clearTimeout(revertTimer);
    if (controlled) {
      // Show it at once; if the owner doesn't take it, go back.
      revertTimer = setTimeout(() => {
        target.pos = checked ? 1 : 0;
        loop.kick();
      }, REVERT_MS);
    }
  };

  // --- Pointer --------------------------------------------------------------------------
  const geometry = () => {
    const H = root.clientHeight;
    const inset = Math.min(SWITCH_INSET, H / 4);
    const kw = Math.min((H - inset * 2) * KNOB_RATIO, root.clientWidth - inset * 2);
    return Math.max(1, root.clientWidth - inset * 2 - kw);
  };
  const down = (e) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    capture(root, e.pointerId);
    press = { id: e.pointerId, x: e.clientX, startPos: cur.pos, travel: geometry() };
    pressed = true;
    dragging = false;
    loop.kick();
  };
  const move = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x;
    if (!dragging && Math.abs(dx) > DRAG_THRESHOLD) dragging = true;
    if (dragging) {
      cur.pos = target.pos = clamp01(press.startPos + dx / press.travel);
      loop.kick();
    }
  };
  const up = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const wasDrag = dragging;
    press = null;
    pressed = false;
    dragging = false;
    commit(wasDrag ? cur.pos > 0.5 : !checked);
  };
  const cancel = (e) => {
    if (!press || e.pointerId !== press.id) return;
    press = null;
    pressed = false;
    dragging = false;
    target.pos = checked ? 1 : 0;
    loop.kick();
  };
  // Keyboard (and assistive tech) activate a <button> with a click whose
  // detail is 0; pointer clicks were already handled in pointerup.
  const click = (e) => {
    if (e.detail === 0 && !disabled) commit(!checked);
  };
  const key = (e) => {
    if (root.tagName === 'BUTTON' || disabled) return; // (a button turns these into a click)
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      commit(!checked);
    }
  };
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('lostpointercapture', cancel);
  root.addEventListener('click', click);
  root.addEventListener('keydown', key);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => render()) : null;
  ro?.observe(root);
  const offConfig = subscribeConfig(() => {
    readLooks();
    render();
  });
  const applyDisabled = () => {
    if (root.tagName === 'BUTTON') root.disabled = disabled;
    root.setAttribute('aria-disabled', String(disabled));
  };
  applyDisabled();
  render();

  return {
    /** New value / settings from the owner. */
    update(next = {}) {
      if (next.onChange !== undefined) onChange = next.onChange;
      if (next.disabled !== undefined && Boolean(next.disabled) !== disabled) {
        disabled = Boolean(next.disabled);
        applyDisabled();
      }
      if (next.checked !== undefined && Boolean(next.checked) !== checked) {
        checked = Boolean(next.checked);
        clearTimeout(revertTimer);
        if (!dragging) target.pos = checked ? 1 : 0;
        loop.kick();
      } else if (next.checked !== undefined && !dragging && !pressed) {
        clearTimeout(revertTimer);
        if (target.pos !== (checked ? 1 : 0)) {
          // (owner kept the old value: settle back once the revert time is up)
          revertTimer = setTimeout(() => {
            target.pos = checked ? 1 : 0;
            loop.kick();
          }, REVERT_MS);
        }
      }
    },
    get checked() {
      return checked;
    },
    destroy() {
      loop.stop();
      clearTimeout(revertTimer);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', cancel);
      root.removeEventListener('lostpointercapture', cancel);
      root.removeEventListener('click', click);
      root.removeEventListener('keydown', key);
      ro?.disconnect();
      offConfig();
      knobGlass.destroy();
      trackGlass.destroy();
      knob.remove();
      root.removeAttribute('data-gp-switch');
      root.style.removeProperty('--gp-track');
    },
  };
}

// =============================================================================
// Slider
// =============================================================================
/**
 * Turn an element (a <div>) into a Liquid Glass slider (role="slider").
 * @param {HTMLElement} root
 * @param {{
 *   value?: number, min?: number, max?: number, step?: number, disabled?: boolean,
 *   onChange?: (value: number) => void,      // while dragging / each key press
 *   onChangeEnd?: (value: number) => void,   // when the user lets go
 *   controlled?: boolean,
 *   groups?: { track?: string, fill?: string, knob?: string, knobActive?: string },
 *   props?: { track?: object },   // per-element glass props for the track, e.g. { style: 'crystal' }
 * }} [opts]
 */
export function createSlider(root, opts = {}) {
  const groups = { track: 'sliderTrack', fill: 'sliderFill', knob: 'sliderKnob', knobActive: 'sliderKnobActive', ...(opts.groups || {}) };
  let min = Number.isFinite(opts.min) ? opts.min : 0;
  let max = Number.isFinite(opts.max) ? opts.max : 100;
  let step = opts.step > 0 ? opts.step : 1;
  let disabled = Boolean(opts.disabled);
  let onChange = opts.onChange;
  let onChangeEnd = opts.onChangeEnd;
  const controlled = Boolean(opts.controlled);
  const snap = (v) => {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const s = Math.round((Math.min(hi, Math.max(lo, v)) - min) / step) * step + min;
    return Math.min(hi, Math.max(lo, Number(s.toFixed(10))));
  };
  let value = snap(Number.isFinite(opts.value) ? opts.value : min);

  root.setAttribute('data-gp-slider', '');
  root.setAttribute('role', 'slider');
  root.setAttribute('aria-orientation', 'horizontal');
  if (!root.hasAttribute('tabindex')) root.tabIndex = 0;
  const track = document.createElement('span');
  track.setAttribute('data-gp-track', '');
  const fill = document.createElement('span');
  fill.setAttribute('data-gp-fill', '');
  const knob = document.createElement('span');
  knob.setAttribute('data-gp-knob', '');
  for (const n of [track, fill, knob]) n.setAttribute('aria-hidden', 'true');
  // Nested so each part refracts the one under it: track → fill → knob.
  fill.appendChild(knob);
  track.appendChild(fill);
  root.appendChild(track);

  const trackProps = opts.props?.track || {};
  const trackGlass = attachGlass(track, groups.track, { ...layerFor(root), ...trackProps });
  const fillGlass = attachGlass(fill, groups.fill);
  const knobGlass = attachGlass(knob, groups.knob);
  const setKnob = propSetter(knobGlass);

  const frac = (v) => (max === min ? 0 : clamp01((v - min) / (max - min)));
  const cur = { pos: frac(value), lift: 0 };
  let pressed = false;
  let press = null; // { id, grab } grab = pointer offset from the knob centre (px)
  let revertTimer = 0;
  let looks = null;
  // Like the switch: the slider's style (config "style" of groups.track)
  // only changes the knob's pressed glass; track and fill keep their default look.
  const readLooks = () => {
    const plain = { style: 'default' };
    const st = { style: knobStyle(resolveGlass(groups.track, trackProps).style) };
    looks = { knob: resolveGlass(groups.knob, st), active: resolveGlass(groups.knobActive, st), track: resolveGlass(groups.track, plain), fill: resolveGlass(groups.fill, plain) };
    trackGlass.setProps({ ...layerFor(root), ...trackProps, ...plain });
    fillGlass.setProps(plain);
  };
  readLooks();

  /** Knob size at rest (px) for this slider's height. */
  const knobSize = () => {
    const H = root.clientHeight;
    const kh = Math.max(8, Math.round(H * 0.62));
    return { kh, kw: Math.round(kh * SLIDER_KNOB_RATIO) };
  };

  const render = () => {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    const { kh, kw } = knobSize();
    const cx = kw / 2 + cur.pos * Math.max(0, W - kw); // knob centre (px from the left)
    fill.style.width = `${cx}px`;
    const s = 1 + (SLIDER_ACTIVE_SCALE - 1) * cur.lift;
    const w = kw * s;
    const h = kh * s;
    const th = track.clientHeight;
    Object.assign(knob.style, { left: `${cx - w / 2}px`, top: `${th / 2 - h / 2}px`, width: `${w}px`, height: `${h}px` });
    const k = blendLooks(looks.knob, looks.active, cur.lift, knob);
    setKnob(k);
    track.style.setProperty('--gp-track', rgbCss(rgbOf(looks.track.tint.from, track), looks.track.tintOpacity));
    fill.style.setProperty('--gp-fill', rgbCss(rgbOf(looks.fill.tint.from, fill), looks.fill.tintOpacity));
    knob.style.setProperty('--gp-knob', rgbCss(rgbOf(k.tint, knob), k.tintOpacity));
    knob.style.setProperty('--gp-lift', cur.lift.toFixed(3));
    if (cur.lift > 0.01) knob.setAttribute('data-gp-active', '');
    else knob.removeAttribute('data-gp-active');
  };
  const writeAria = () => {
    root.setAttribute('aria-valuemin', String(min));
    root.setAttribute('aria-valuemax', String(max));
    root.setAttribute('aria-valuenow', String(value));
    root.setAttribute('aria-disabled', String(disabled));
  };

  let shown = value; // the value the knob is heading to
  const loop = makeLoop((dt) => {
    const goal = frac(shown);
    const liftTarget = pressed ? 1 : 0;
    if (reducedMotion()) {
      cur.pos = goal;
      cur.lift = liftTarget;
      render();
      return false;
    }
    cur.lift = damp(cur.lift, liftTarget, liftTarget > cur.lift ? TAU.liftUp * 0.5 : TAU.liftDown * 0.7, dt);
    cur.pos = press ? goal : damp(cur.pos, goal, TAU.sliderPos, dt);
    if (Math.abs(cur.lift - liftTarget) < 0.003) cur.lift = liftTarget;
    if (Math.abs(cur.pos - goal) < 0.0008) cur.pos = goal;
    render();
    return pressed || cur.lift !== liftTarget || cur.pos !== goal;
  });

  /** The user picked v. */
  const set = (v, end) => {
    const next = snap(v);
    shown = next;
    loop.kick();
    if (next !== value) {
      if (!controlled) value = next;
      writeAriaNow(next);
      onChange?.(next);
    }
    if (end) {
      onChangeEnd?.(next);
      clearTimeout(revertTimer);
      if (controlled) {
        revertTimer = setTimeout(() => {
          shown = value;
          writeAriaNow(value);
          loop.kick();
        }, REVERT_MS);
      }
    }
  };
  const writeAriaNow = (v) => root.setAttribute('aria-valuenow', String(v));

  // --- Pointer --------------------------------------------------------------------------
  const valueAt = (clientX, grab) => {
    const r = root.getBoundingClientRect();
    const { kw } = knobSize();
    const span = Math.max(1, r.width - kw);
    return min + clamp01((clientX - grab - r.left - kw / 2) / span) * (max - min);
  };
  const down = (e) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    capture(root, e.pointerId);
    root.focus?.({ preventScroll: true });
    // On the knob: keep where it was grabbed. On the track: jump there.
    const kr = knob.getBoundingClientRect();
    const onKnob = e.clientX >= kr.left && e.clientX <= kr.right;
    press = { id: e.pointerId, grab: onKnob ? e.clientX - (kr.left + kr.width / 2) : 0 };
    pressed = true;
    set(valueAt(e.clientX, press.grab), false);
    e.preventDefault();
  };
  const move = (e) => {
    if (!press || e.pointerId !== press.id) return;
    set(valueAt(e.clientX, press.grab), false);
  };
  const up = (e) => {
    if (!press || e.pointerId !== press.id) return;
    press = null;
    pressed = false;
    set(shown, true);
  };
  const key = (e) => {
    if (disabled) return;
    const big = Math.max(step, (max - min) / 10);
    const delta = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: big, PageDown: -big }[e.key];
    let next = null;
    if (delta !== undefined) next = shown + delta;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    set(next, true);
  };
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('lostpointercapture', up);
  root.addEventListener('keydown', key);
  // Inside a <label>, a click would also "activate" the label's own control
  // (e.g. toggle a checkbox next to the slider) — the slider keeps its clicks.
  const swallowClick = (e) => e.preventDefault();
  root.addEventListener('click', swallowClick);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => render()) : null;
  ro?.observe(root);
  const offConfig = subscribeConfig(() => {
    readLooks();
    render();
  });
  writeAria();
  render();

  return {
    update(next = {}) {
      if (next.onChange !== undefined) onChange = next.onChange;
      if (next.onChangeEnd !== undefined) onChangeEnd = next.onChangeEnd;
      let changed = false;
      if (Number.isFinite(next.min) && next.min !== min) (min = next.min), (changed = true);
      if (Number.isFinite(next.max) && next.max !== max) (max = next.max), (changed = true);
      if (next.step > 0 && next.step !== step) (step = next.step), (changed = true);
      if (next.disabled !== undefined) disabled = Boolean(next.disabled);
      if (Number.isFinite(next.value)) {
        const v = snap(next.value);
        if (v !== value || changed) {
          value = v;
          clearTimeout(revertTimer);
          if (!press) shown = v;
        }
      }
      writeAria();
      loop.kick();
    },
    get value() {
      return value;
    },
    destroy() {
      loop.stop();
      clearTimeout(revertTimer);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      root.removeEventListener('lostpointercapture', up);
      root.removeEventListener('keydown', key);
      root.removeEventListener('click', swallowClick);
      ro?.disconnect();
      offConfig();
      knobGlass.destroy();
      fillGlass.destroy();
      trackGlass.destroy();
      track.remove();
      root.removeAttribute('data-gp-slider');
    },
  };
}
