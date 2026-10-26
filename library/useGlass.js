/**
 * =============================================================================
 * glass/useGlass.js — Give any element a WebGL glass background
 * =============================================================================
 *   const ref = useRef(null);
 *   useGlass(ref, 'button');                       // look from the config group
 *   useGlass(ref, 'card', { tintOpacity: 0.8 });   // + per-element changes
 *   useGlass(ref, active ? 'switchOn' : 'switch'); // swap group with state
 *   return <button ref={ref} className={…}>Save</button>;
 *
 * The element keeps its HTML, layout, text and icons; only its background is
 * replaced by glass (and only while the WebGL glass is running — otherwise its
 * CSS stays exactly as it is). Hover, press and :disabled are tracked
 * automatically for the config's hover / pressed / disabled blocks; pressing
 * also grows the control (pressScale) and lights it up from the pointer
 * (pressGlow), like Apple's glass.
 * Pass group = null (or false) to turn the glass off for this element.
 *
 * "enabled": false in the config (or lab) = no glass for this element: it
 * keeps its normal, non-glass layout (no padding, no glass-only CSS), but the
 * look settings the group sets ITSELF — tint, text / font / icon, border,
 * shadow, shape / radius, plus their hover / pressed / disabled blocks — are
 * applied as plain CSS ([data-glass-plain], glass.css). Settings it only
 * inherits from "defaults" are not, so a disabled group without colours of
 * its own looks exactly like the glass being off everywhere.
 * =============================================================================
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { explicitKeys, resolveGlass, subscribeConfig } from './config';
import { getEntry, register, requestRender, subscribeStatus, unregister, update } from './registry';
import { scheduleLiveSync } from './live';
import { createSquish } from './squish';
import { autoTextEls, autoTextOf, dropAutoText, estimateAutoText } from './autoText';

export function useGlass(ref, group, props) {
  const handleRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const propsKey = propsKeyOf(props);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !group) return undefined;
    const handle = attachGlass(el, group, propsRef.current || {});
    handleRef.current = handle;
    return () => {
      handle.destroy();
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [ref, group]);

  // Per-element props changed (e.g. a different tint for a ringing call).
  useEffect(() => {
    handleRef.current?.setProps(propsRef.current || {});
  }, [propsKey, ref]);
}

/** A stable key for the props object (it's usually a new object each render). */
function propsKeyOf(props) {
  try {
    return JSON.stringify(props || {});
  } catch {
    return props; // (not JSON-able, e.g. circular: compare by identity)
  }
}

/** Element → its glass handle (one glass per element). */
const attached = new WeakMap();

/**
 * Give an element glass WITHOUT React (the plain-JS API under useGlass; the
 * standalone script uses it for any website):
 *   const glass = attachGlass(button, 'button', { tint: '#ff3b30' });
 *   glass.setProps({ tintOpacity: 0.8 });   // replace the per-element props
 *   glass.destroy();                        // remove the glass again
 * The glass only shows while <GlassProvider> (or the standalone start()) is
 * running; until then — and wherever WebGL can't run — the element keeps
 * its own CSS. Attaching an element that already has glass replaces it.
 * @param {HTMLElement} el
 * @param {string} group  config group ("button", "card"…)
 * @param {object} [props] per-element overrides of any glass property
 * @returns {{ id: number|null, setProps(props: object): void, destroy(): void }}
 */
export function attachGlass(el, group, props = {}) {
  if (!el || el.nodeType !== 1 || !group) return { id: null, setProps() {}, destroy() {} };
  const previous = attached.get(el);
  if (previous) {
    console.warn('glass: this element already had glass — replacing it (one glass per element)', el);
    previous.destroy();
  }
  let current = props || {};
  const id = register(el, group, current);
  const entryState = { hover: false, pressed: false, disabled: isDisabled(el) };
  update(id, { state: entryState });

  // --- Mirror the element's CSS hand-over flags from its resolved config ---
  const applyDom = () => {
    // Glass off: the state's look matters for the plain CSS (hover tint…).
    const resolvedPlain = resolveGlass(group, current, entryState);
    const cfg = resolvedPlain.enabled ? resolveGlass(group, current) : resolvedPlain;
    setFlag(el, 'glassActive', cfg.enabled ? '' : null);
    applyPlain(el, cfg.enabled ? null : cfg, cfg.enabled ? null : explicitKeys(group, current, entryState));
    // The group's name, for CSS that recreates its look without WebGL
    // (e.g. a site's mobile stylesheet: [data-glass-group="card"] {…}).
    setFlag(el, 'glassGroup', cfg.enabled ? group : null);
    setFlag(el, 'glassBorder', cfg.keepBorder ? null : 'off');
    setFlag(el, 'glassShadow', cfg.keepShadow ? null : 'off');
    if (cfg.textColor === 'auto') {
      // Readable text (autoText.js): WebGL glass keeps the colour its canvas
      // sampled; live glass / CSS fallback / not drawn yet → estimated.
      autoTextEls.add(el);
      const sampled = el.dataset.glassDrawn !== undefined && el.dataset.glassLive === undefined ? autoTextOf(el) : null;
      setVar(el, 'glassText', '--glass-text', sampled || estimateAutoText(el, cfg));
    } else {
      if (autoTextEls.has(el)) dropAutoText(el);
      setVar(el, 'glassText', '--glass-text', cfg.textColor);
    }
    setVar(el, 'glassFont', '--glass-font', cfg.font);
    setVar(el, 'glassWeight', '--glass-weight', cfg.fontWeight);
    setVar(el, 'glassIconColor', '--glass-icon-color', cfg.iconColor);
    setVar(el, 'glassIconSize', '--glass-icon-size', cfg.iconSize == null ? null : `${cfg.iconSize}px`);
    // Corners follow the glass shape (so CSS borders/shadows/focus rings match).
    setVar(el, 'glassRadius', '--glass-radius', cssRadius(cfg, cfg.enabled ? null : explicitKeys(group, current, entryState)));
    applyPadding(el, cfg);
  };
  applyDom();
  // Own press-glow value (it inherits, so don't light up with a parent).
  el.style.setProperty('--glass-glow', '0');
  const offConfig = subscribeConfig(applyDom);
  // Glass switching on/off changes the element's own CSS (e.g. the sidebar's
  // inset margins), which padding builds on. (Cancelled on destroy, so a
  // late frame can't put the flags back on an element that lost its glass.)
  let statusRaf = 0;
  const offStatus = subscribeStatus(() => {
    cancelAnimationFrame(statusRaf);
    statusRaf = requestAnimationFrame(applyDom);
  });

  // --- Interaction state ---
  const set = (patch) => {
    Object.assign(entryState, patch);
    update(id, { state: { ...entryState } });
    // Glass off → the plain CSS follows hover / pressed / disabled itself.
    if (el.dataset.glassPlain !== undefined) applyDom();
  };
  // Where the pointer is on the element (0–1), for the press glow. Written
  // straight onto the entry (no re-render) — it changes on every move.
  const track = (ev) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
    const e = getEntry(id);
    if (e) e.state.pointer = { x, y };
    el.style.setProperty('--glass-px', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--glass-py', `${(y * 100).toFixed(1)}%`);
    requestRender();
  };
  // Press: grow (Web Animations, so the element's own CSS transitions stay
  // untouched) and glow (--glass-glow eases via @property in glass.css).
  let pressAnim = null;
  // Squish & stretch (squish.js): made on the first press of an element whose
  // config has "squish" > 0; it then replaces the pressScale grow.
  let squish = null;
  let squishing = false; // this press is squishing
  let releasedOutside = false; // let go away from the element → no click (as on macOS)
  const press = (on) => {
    const cfg = resolveGlass(group, current);
    el.style.setProperty('--glass-glow', on && cfg.pressGlow > 0 ? '1' : '0');
    // (Only while WebGL draws it: page-wide glass on, or this element's own
    // glass drawn — a global.mobileLayers exception in the mobile layout.)
    const webgl = document.documentElement.dataset.glass || el.hasAttribute('data-glass-drawn');
    if (cfg.squish > 0) return; // (squish does the grow)
    if (cfg.pressScale === 1 || !webgl || typeof el.animate !== 'function') return;
    const from = getComputedStyle(el).scale;
    pressAnim?.cancel();
    pressAnim = el.animate([{ scale: !from || from === 'none' ? '1' : from }, { scale: on ? String(cfg.pressScale) : '1' }], {
      duration: on ? 220 : 420,
      easing: on ? 'cubic-bezier(.2,.9,.3,1.2)' : 'cubic-bezier(.3,1.5,.5,1)', // a little spring
      fill: 'forwards',
    });
  };
  const enter = () => set({ hover: true });
  const leave = () => {
    if (entryState.pressed) press(false);
    set({ hover: false, pressed: false });
  };
  const down = (ev) => {
    if (entryState.disabled) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    track(ev);
    // Squish: follow the pointer even outside the element (pointer capture).
    const cfg = resolveGlass(group, current);
    squishing = cfg.squish > 0 && !el.hasAttribute('data-gp-no-squish');
    if (squishing) {
      squish ||= createSquish(el, () => resolveGlass(group, current));
      try {
        el.setPointerCapture(ev.pointerId);
      } catch {
        // (no capture: the pull just stops at the element's edge)
      }
      squish.press(ev.clientX, ev.clientY);
    }
    // The press always ends, even if the pointerup never reaches this element
    // (an ancestor took pointer capture — e.g. a checkbox root over its glass
    // box: the box once stayed swollen "pressed" forever).
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    press(true);
    set({ pressed: true });
  };
  const move = (ev) => {
    if (!entryState.pressed) return;
    track(ev);
    if (squishing) squish.drag(ev.clientX, ev.clientY);
  };
  const up = (ev) => {
    if (!entryState.pressed) return;
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    if (squishing) {
      // Released well away from the element: no click, like macOS buttons.
      // (Its box is still stretched towards the pointer, so test against it
      // with a small margin.)
      const r = el.getBoundingClientRect();
      const m = 6;
      releasedOutside =
        ev?.type === 'pointerup' && (ev.clientX < r.left - m || ev.clientX > r.right + m || ev.clientY < r.top - m || ev.clientY > r.bottom + m);
      if (releasedOutside) setTimeout(() => (releasedOutside = false), 0);
      squish.release();
      squishing = false;
    }
    press(false);
    set({ pressed: false });
  };
  // Capture phase: runs before the element's own click handlers.
  const swallowClick = (ev) => {
    if (!releasedOutside) return;
    releasedOutside = false;
    ev.preventDefault();
    ev.stopImmediatePropagation();
  };
  el.addEventListener('pointerenter', enter);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('click', swallowClick, true);
  // :disabled / aria-disabled changes
  const mo = new MutationObserver(() => {
    const d = isDisabled(el);
    if (d !== entryState.disabled) set({ disabled: d, hover: d ? false : entryState.hover });
  });
  mo.observe(el, { attributes: true, attributeFilter: ['disabled', 'aria-disabled'] });
  // Size changes → redraw. (ResizeObserver is in every browser WebGL 2 runs
  // in; the guard only keeps very old browsers from throwing.)
  const ro =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          requestRender();
          scheduleLiveSync(el); // live glass rebuilds ITS filter for the new size (just this element)
        })
      : null;
  ro?.observe(el);

  let destroyed = false;
  const handle = {
    id,
    /** Replace the per-element props (same as useGlass's third argument). */
    setProps(next) {
      if (destroyed) return;
      current = next || {};
      update(id, { props: current });
      applyDom();
    },
    /** Remove the glass: the element gets its own CSS back. */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (attached.get(el) === handle) attached.delete(el);
      cancelAnimationFrame(statusRaf);
      offConfig();
      offStatus();
      mo.disconnect();
      ro?.disconnect();
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('lostpointercapture', up);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      el.removeEventListener('click', swallowClick, true);
      pressAnim?.cancel();
      squish?.destroy();
      for (const v of ['--glass-px', '--glass-py', '--glass-glow']) el.style.removeProperty(v);
      for (const k of ['glassActive', 'glassGroup', 'glassBorder', 'glassShadow']) setFlag(el, k, null);
      dropAutoText(el);
      for (const [k, v] of FLAG_VARS) setVar(el, k, v, null);
      applyPlain(el, null, null);
      applyPadding(el, null);
      delete el.dataset.glassLive;
      delete el.dataset.glassPos;
      for (const v of ['--glass-live-radius', '--glass-live-bg', '--glass-live-border', '--glass-live-shadow', '--glass-live-filter']) el.style.removeProperty(v);
      unregister(id);
    },
  };
  attached.set(el, handle);
  return handle;
}

/**
 * Change an element's per-element glass props WITHOUT a React render — for
 * animations that change the look every frame (e.g. a panel's morph
 * going from clear to frosted: setGlassProps(el, { tintOpacity, blur })).
 * Replaces the element's props (same as useGlass's third argument). The
 * element must already have glass (useGlass registered it); otherwise this
 * does nothing. The next re-register (group change) starts from the props
 * passed to useGlass again.
 * @param {HTMLElement} el
 * @param {object} props
 */
export function setGlassProps(el, props) {
  const id = Number(el?.dataset?.glassId);
  if (!id || !getEntry(id)) return;
  update(id, { props: props || {} });
}

/**
 * The element's current per-element glass props (a copy), or null when it
 * has no glass. (motion.js: a morph film starts from its target's props.)
 * @param {HTMLElement} el
 * @returns {object|null}
 */
export function getGlassProps(el) {
  const id = Number(el?.dataset?.glassId);
  const entry = id ? getEntry(id) : null;
  return entry ? { ...entry.props } : null;
}

/**
 * Change SOME of an element's per-element glass props, keeping the rest
 * (setGlassProps replaces them all) — e.g. a shape spring's radius on a card
 * that also has its own tint. Goes through the element's glass handle, so
 * its CSS hand-over (corner radius, live glass) follows too. Does nothing
 * when the element has no glass.
 * @param {HTMLElement} el
 * @param {object} partial
 */
export function mergeGlassProps(el, partial) {
  const current = getGlassProps(el);
  if (!current) return;
  const next = { ...current, ...partial };
  const handle = attached.get(el);
  if (handle) handle.setProps(next);
  else setGlassProps(el, next);
}

/**
 * padding: space around the glass. The whole element — glass AND its
 * content — moves in by that much (extra CSS margin; a sticky element's
 * `top` grows too, so a floating header keeps its gap when stuck). Applied
 * through glass.css only while the WebGL glass is on. The element's own
 * margins are re-read each time (with ours lifted off) and kept as the base.
 */
function applyPadding(el, cfg) {
  const pd = cfg?.enabled ? cfg.padding : null;
  const on = pd && (pd.top || pd.right || pd.bottom || pd.left);
  if (!on) {
    delete el.dataset.glassPadded;
    delete el.dataset.glassSticky;
    el.style.removeProperty('--glass-margin');
    el.style.removeProperty('--glass-sticky-top');
    return;
  }
  // The element's own margins / sticky top, without ours.
  delete el.dataset.glassPadded;
  delete el.dataset.glassSticky;
  const cs = getComputedStyle(el);
  const n = (v) => parseFloat(v) || 0;
  const o = {
    top: n(cs.marginTop),
    right: n(cs.marginRight),
    bottom: n(cs.marginBottom),
    left: n(cs.marginLeft),
    sticky: cs.position === 'sticky',
    stickyTop: n(cs.top),
  };
  el.style.setProperty('--glass-margin', `${o.top + pd.top}px ${o.right + pd.right}px ${o.bottom + pd.bottom}px ${o.left + pd.left}px`);
  el.dataset.glassPadded = '';
  if (o.sticky) {
    el.style.setProperty('--glass-sticky-top', `${o.stickyTop + pd.top}px`);
    el.dataset.glassSticky = '';
  }
}

/**
 * CSS border-radius matching the glass shape, or null to keep the element's
 * own. Glass off: only when the group sets shape / radius itself (`explicit`).
 */
function cssRadius(cfg, explicit) {
  if (!cfg.enabled && !(explicit && (explicit.has('shape') || explicit.has('radius')))) return null;
  if (cfg.shape === 'capsule') return '999px';
  if (cfg.shape === 'circle') return '50%';
  if (cfg.shape === 'rectangle') return '0px';
  return cfg.radius === 'auto' ? null : `${cfg.radius}px`;
}

const FLAG_VARS = [
  ['glassRadius', '--glass-radius'],
  ['glassText', '--glass-text'],
  ['glassFont', '--glass-font'],
  ['glassWeight', '--glass-weight'],
  ['glassIconColor', '--glass-icon-color'],
  ['glassIconSize', '--glass-icon-size'],
];

function isDisabled(el) {
  return el.matches?.(':disabled') || el.getAttribute('aria-disabled') === 'true';
}
function setFlag(el, key, value) {
  if (value == null) delete el.dataset[key];
  else el.dataset[key] = value;
}
function setVar(el, key, cssVar, value) {
  if (value == null) {
    delete el.dataset[key];
    el.style.removeProperty(cssVar);
  } else {
    el.dataset[key] = '';
    el.style.setProperty(cssVar, value);
  }
}

// --- Glass switched off: the group's own look as plain CSS -----------------------------

const PLAIN_VARS = [
  ['glassPlainBg', '--glass-plain-bg'],
  ['glassPlainBorder', '--glass-plain-border'],
  ['glassPlainShadow', '--glass-plain-shadow'],
];

/** A config colour ("#hex" or "var(--x)") at an opacity, as CSS. */
const withAlpha = (color, opacity) =>
  opacity >= 1 ? color : `color-mix(in srgb, ${color} ${Math.round(Math.max(0, opacity) * 1000) / 10}%, transparent)`;

/**
 * Apply (cfg + explicit keys) or remove (cfg = null) the plain-CSS look of an
 * element whose glass is switched off. Writes CSS variables + data flags that
 * glass.css turns into background / border / box-shadow (text, font, icon and
 * radius reuse the same variables as the glass hand-over).
 * @param {HTMLElement} el
 * @param {object|null} cfg       resolved config (with the current state)
 * @param {Set<string>|null} explicit  keys the group sets itself
 */
function applyPlain(el, cfg, explicit) {
  if (!cfg) {
    delete el.dataset.glassPlain;
    for (const [k, v] of PLAIN_VARS) setVar(el, k, v, null);
    return;
  }
  el.dataset.glassPlain = '';
  const has = (...keys) => keys.some((k) => explicit.has(k));

  // Background = the tint (a colour or a gradient) at tintOpacity.
  let bg = null;
  if (has('tint', 'tintOpacity')) {
    const t = cfg.tint;
    const op = cfg.tintOpacity;
    const stops = [t.from, t.via, t.to].filter(Boolean).map((c) => withAlpha(c, op));
    bg = stops.length === 1 || t.from === t.to && !t.via ? withAlpha(t.from, op) : `linear-gradient(${t.angle}deg, ${stops.join(', ')})`;
  }
  setVar(el, 'glassPlainBg', '--glass-plain-bg', bg);

  const border = has('borderWidth', 'borderColor', 'borderOpacity')
    ? `${cfg.borderWidth}px solid ${withAlpha(cfg.borderColor || '#ffffff', cfg.borderOpacity)}`
    : null;
  setVar(el, 'glassPlainBorder', '--glass-plain-border', border);

  const shadow = has('shadowColor', 'shadowOpacity', 'shadowBlur', 'shadowX', 'shadowY', 'shadowSpread')
    ? cfg.shadowOpacity > 0
      ? `${cfg.shadowX}px ${cfg.shadowY}px ${cfg.shadowBlur}px ${cfg.shadowSpread}px ${withAlpha(cfg.shadowColor || '#000000', cfg.shadowOpacity)}`
      : 'none'
    : null;
  setVar(el, 'glassPlainShadow', '--glass-plain-shadow', shadow);
}
