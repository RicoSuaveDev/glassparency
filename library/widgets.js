/**
 * =============================================================================
 * glass/widgets.js — More Liquid Glass controls (no React needed)
 * =============================================================================
 * Checkboxes, radio buttons, text fields, tab bars, sidebars and progress
 * bars, built like the switch and slider (controls.js): every visible part is
 * a glass element (attachGlass) whose look is a config group, nested so each
 * part refracts the one under it, and the motion is Apple's squish & stretch
 * (squish.js). Studied from screen recordings of macOS 26 System Settings and
 * iOS 26 Music:
 *
 * CHECKBOX   a rounded glass box; checked = accent fill + a white tick that
 *            draws itself. Press: the box swells and leans towards the
 *            pointer; release wobbles. Let go outside = no change (macOS).
 * RADIO      the same, round, with a white dot that pops in with a bounce.
 *            Radios with the same `name` uncheck each other; arrow keys move.
 * TEXT FIELD a glass capsule round a native <input>. Focus lights the rim
 *            (blend to the "Focus" group) and gives a small jelly pulse; an
 *            optional round clear (×) button swells when pressed (iOS).
 * LENS BAR   a glass bar with items and a glass LENS on the selected one —
 *            the iOS tab bar (horizontal) and the sidebar (vertical). Press:
 *            the lens lifts into clear glass, bigger than the bar, and
 *            follows the finger, stretching with its speed, bending and
 *            magnifying the icons under it; the accent colour WIPES across
 *            the icons exactly where the lens is (a clipped accent copy of
 *            each item). Release: it lands on the nearest item
 *            with a wobble and turns back into a soft tinted pill.
 * PROGRESS   a glass track with a glass fill that springs to the value; with
 *            no value a liquid drop slides back and forth, stretching as it
 *            speeds up and squashing as it turns.
 *
 * Every create* function returns { update(next), destroy() } (+ getters).
 * opts.groups renames a part's config group; opts.props gives a part extra
 * per-element glass props, e.g. { props: { box: { tint: '#ff2d55' } } }.
 * Without WebGL (phones…) the CSS in glass.css draws the same parts from the
 * same colours (--gp-* variables written here).
 * =============================================================================
 */
import { resolveGlass, subscribeConfig } from './config';
import { attachGlass } from './useGlass';
import { createSquish, stretchFor } from './squish';
import { blendLooks, capture, layerFor, makeLoop, propSetter, reducedMotion, rgbCss, rgbOf } from './controls';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const clamp01 = (n) => clamp(n, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD = 3; // px before a press counts as a drag

/**
 * Spring step (semi-implicit Euler): returns [x, v]. k = stiffness, zeta =
 * damping ratio. Split into ≤ 1/240 s sub-steps: a stiff spring stepped by a
 * whole slow frame (a busy or background tab: 50 ms) blows up — the tab bar's
 * lens once flew off to x = 6e8 px.
 */
export function spring(x, v, to, k, zeta, dt) {
  const n = Math.max(1, Math.ceil(dt * 240));
  const h = dt / n;
  const c = 2 * zeta * Math.sqrt(k);
  for (let i = 0; i < n; i++) {
    v += (-k * (x - to) - c * v) * h;
    x += v * h;
  }
  return [x, v];
}

/** SVG path of a rounded rectangle (for CSS clip-path: path()). */
function roundRectPath(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const f = (n) => n.toFixed(2);
  return (
    `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}` +
    `V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}` +
    `H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}` +
    `V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`
  );
}

// Held tab-bar lens proportions (iOS 26 Music, measured from screenshots:
// 1.33–1.49 wide : 1 tall): with few, wide items the lens used to take the
// item's whole width and looked too wide. While it lifts, its length eases
// down to at most this × its height; the stretch while moving still adds to it.
const LENS_MAX_ASPECT = 1.45;

/** A config group's squish tuning, for createSquish. */
const squishCfg = (group, props) => () => {
  const c = resolveGlass(group, props);
  return { squish: c.squish, squishGrow: c.squishGrow, squishPull: c.squishPull, squishBounce: c.squishBounce };
};

/**
 * Press handling shared by the checkbox and radio: pointer capture, squish
 * of `part` (pulled towards the pointer), and a tap — released over the
 * control — calls onTap. Keyboard / assistive-tech clicks (detail 0) too.
 */
function bindTap(root, part, readSquish, isDisabled, onTap) {
  const squish = createSquish(part, readSquish);
  let press = null;
  const inside = (e) => {
    const r = root.getBoundingClientRect();
    const m = 6;
    return e.clientX >= r.left - m && e.clientX <= r.right + m && e.clientY >= r.top - m && e.clientY <= r.bottom + m;
  };
  const down = (e) => {
    if (isDisabled() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    capture(root, e.pointerId);
    press = { id: e.pointerId };
    root.setAttribute('data-gp-pressed', '');
    squish.press(e.clientX, e.clientY);
  };
  const move = (e) => {
    if (press && e.pointerId === press.id) squish.drag(e.clientX, e.clientY);
  };
  const up = (e) => {
    if (!press || e.pointerId !== press.id) return;
    press = null;
    root.removeAttribute('data-gp-pressed');
    squish.release();
    if (e.type === 'pointerup' && inside(e)) onTap();
  };
  const click = (e) => {
    // Pointer taps were handled in pointerup; this is the keyboard (detail 0).
    if (e.detail === 0 && !isDisabled()) onTap();
    e.preventDefault(); // (inside a <label>: don't also toggle its own control)
  };
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('lostpointercapture', up);
  root.addEventListener('click', click);
  return () => {
    root.removeEventListener('pointerdown', down);
    root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerup', up);
    root.removeEventListener('pointercancel', up);
    root.removeEventListener('lostpointercapture', up);
    root.removeEventListener('click', click);
    squish.destroy();
  };
}

// =============================================================================
// Checkbox + radio (one engine: a radio is a round box with a dot)
// =============================================================================
const radioGroups = new Map(); // name → Set of radio controllers (they uncheck each other)

/**
 * @param {HTMLElement} root  ideally a <button type="button">; its children (label text) stay
 * @param {'checkbox'|'radio'} kind
 */
function createCheck(root, kind, opts) {
  const radio = kind === 'radio';
  const groups = radio
    ? { off: 'radio', on: 'radioOn', dot: 'radioDot', ...(opts.groups || {}) }
    : { off: 'checkbox', on: 'checkboxOn', ...(opts.groups || {}) };
  const props = opts.props || {};
  const boxProps = props.box || {};
  let checked = Boolean(opts.checked);
  let disabled = Boolean(opts.disabled);
  let onChange = opts.onChange;
  let name = opts.name || null;

  root.setAttribute(radio ? 'data-gp-radio' : 'data-gp-check', '');
  if (!root.hasAttribute('role')) root.setAttribute('role', kind);
  if (root.tagName !== 'BUTTON' && !root.hasAttribute('tabindex')) root.tabIndex = 0;
  const box = document.createElement('span');
  box.setAttribute('data-gp-box', '');
  box.setAttribute('aria-hidden', 'true');
  // The control squishes the box itself (bindTap); attachGlass must not also
  // squish it — two springs fought over it and one never let go.
  box.setAttribute('data-gp-no-squish', '');
  root.insertBefore(box, root.firstChild);

  // The tick (checkbox) or the dot (radio).
  let mark = null;
  let dot = null;
  if (radio) {
    dot = document.createElement('span');
    dot.setAttribute('data-gp-dot', '');
    box.appendChild(dot);
  } else {
    mark = document.createElementNS(SVG_NS, 'svg');
    mark.setAttribute('viewBox', '0 0 24 24');
    mark.innerHTML = '<path d="M5.5 12.5l4.25 4.25L18.5 7.5" pathLength="1" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
    box.appendChild(mark);
  }

  const fixed = { ...layerFor(box), ...boxProps };
  const boxGlass = attachGlass(box, groups.off, fixed);
  const setBox = propSetter(boxGlass, fixed);
  const dotGlass = dot ? attachGlass(dot, groups.dot, props.dot || {}) : null;
  let looks = null;
  // The checked look and the dot follow the box's style (config "style").
  const readLooks = () => {
    const off = resolveGlass(groups.off, boxProps);
    looks = { off, on: resolveGlass(groups.on, { style: off.style, ...boxProps }) };
    dotGlass?.setProps({ style: off.style, ...(props.dot || {}) });
  };
  readLooks();

  // Animated: on 0 … 1 (fill colour), mark 0 … 1 (tick drawn / dot size) + its speed.
  const cur = { on: checked ? 1 : 0, mark: checked ? 1 : 0, mv: 0 };

  const render = () => {
    const look = blendLooks(looks.off, looks.on, cur.on, box);
    setBox(look);
    box.style.setProperty('--gp-box', rgbCss(rgbOf(look.tint, box), look.tintOpacity));
    if (mark) {
      const p = mark.firstChild;
      p.style.strokeDasharray = '1';
      p.style.strokeDashoffset = String(1 - clamp01(cur.mark));
    }
    if (dot) {
      const s = Math.max(0, cur.mark);
      const d = box.clientWidth * 0.42 * s;
      Object.assign(dot.style, { width: `${d}px`, height: `${d}px`, left: `${(box.clientWidth - d) / 2}px`, top: `${(box.clientHeight - d) / 2}px` });
      dot.style.visibility = s < 0.02 ? 'hidden' : '';
    }
    root.setAttribute('aria-checked', String(checked));
  };

  const loop = makeLoop((dt) => {
    const goal = checked ? 1 : 0;
    if (reducedMotion()) {
      cur.on = cur.mark = goal;
      render();
      return false;
    }
    // Colour first, then the tick draws (or the dot pops in with a bounce).
    cur.on += (goal - cur.on) * (1 - Math.exp(-dt / 0.06));
    const markGoal = goal && cur.on > 0.4 ? 1 : goal ? cur.mark : 0;
    if (radio) [cur.mark, cur.mv] = spring(cur.mark, cur.mv, markGoal, 520, 0.42, dt);
    else cur.mark += (markGoal - cur.mark) * (1 - Math.exp(-dt / (goal ? 0.07 : 0.04)));
    const done = Math.abs(cur.on - goal) < 0.002 && Math.abs(cur.mark - markGoal) < 0.002 && Math.abs(cur.mv) < 0.01 && markGoal === goal;
    if (done) Object.assign(cur, { on: goal, mark: goal, mv: 0 });
    render();
    return !done;
  });

  const self = {
    get checked() {
      return checked;
    },
    get name() {
      return name;
    },
    /** (radio group) another radio was picked */
    _uncheck() {
      if (!checked) return;
      checked = false;
      loop.kick();
    },
    update(next = {}) {
      if (next.onChange !== undefined) onChange = next.onChange;
      if (next.disabled !== undefined) {
        disabled = Boolean(next.disabled);
        applyDisabled();
      }
      if (next.checked !== undefined && Boolean(next.checked) !== checked) {
        checked = Boolean(next.checked);
        if (radio && checked) uncheckOthers();
        loop.kick();
      }
    },
    destroy() {
      loop.stop();
      offTap();
      offConfig();
      root.removeEventListener('keydown', key);
      if (name) radioGroups.get(name)?.delete(self);
      dotGlass?.destroy();
      boxGlass.destroy();
      box.remove();
      root.removeAttribute(radio ? 'data-gp-radio' : 'data-gp-check');
    },
  };

  const uncheckOthers = () => {
    if (!name) return;
    for (const other of radioGroups.get(name) || []) if (other !== self) other._uncheck();
  };
  const toggle = () => {
    const next = radio ? true : !checked;
    if (next === checked) return;
    checked = next;
    if (radio) uncheckOthers();
    loop.kick();
    onChange?.(checked);
  };
  const offTap = bindTap(root, box, squishCfg(groups.off, boxProps), () => disabled, toggle);

  // Radios: arrow keys pick the next / previous radio of the same name.
  const key = (e) => {
    if (!radio || !name || disabled) return;
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const all = [...(radioGroups.get(name) || [])].map((c) => c._root).filter((n) => n.isConnected);
    all.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const i = all.indexOf(root);
    const nextRoot = all[(i + step + all.length) % all.length];
    if (!nextRoot) return;
    e.preventDefault();
    nextRoot.focus();
    nextRoot.click(); // (detail 0 → picks it)
  };
  root.addEventListener('keydown', key);
  self._root = root;
  if (radio && name) {
    if (!radioGroups.has(name)) radioGroups.set(name, new Set());
    radioGroups.get(name).add(self);
  }

  const applyDisabled = () => {
    if (root.tagName === 'BUTTON') root.disabled = disabled;
    root.setAttribute('aria-disabled', String(disabled));
  };
  applyDisabled();
  const offConfig = subscribeConfig(() => {
    readLooks();
    render();
  });
  // Sizes are read from the box (CSS), so draw once it's laid out.
  render();
  requestAnimationFrame(render);
  return self;
}

/**
 * Liquid Glass checkbox.
 * @param {HTMLElement} root
 * @param {{ checked?: boolean, disabled?: boolean, onChange?: (checked: boolean) => void,
 *           groups?: { off?: string, on?: string }, props?: { box?: object } }} [opts]
 */
export const createCheckbox = (root, opts = {}) => createCheck(root, 'checkbox', opts);

/**
 * Liquid Glass radio button. Radios with the same `name` uncheck each other.
 * @param {HTMLElement} root
 * @param {{ checked?: boolean, name?: string, disabled?: boolean, onChange?: (checked: boolean) => void,
 *           groups?: { off?: string, on?: string, dot?: string }, props?: { box?: object, dot?: object } }} [opts]
 */
export const createRadio = (root, opts = {}) => createCheck(root, 'radio', opts);

// =============================================================================
// Text field
// =============================================================================
/**
 * Liquid Glass text field: root is a wrapper (a <div> or <label>) round a
 * native <input> / <textarea>, plus anything else (a search icon…).
 * @param {HTMLElement} root
 * @param {{ clearable?: boolean, onClear?: () => void,
 *           groups?: { field?: string, focus?: string, clear?: string },
 *           props?: { field?: object, clear?: object } }} [opts]
 */
export function createTextField(root, opts = {}) {
  const groups = { field: 'textField', focus: 'textFieldFocus', clear: 'textFieldClear', ...(opts.groups || {}) };
  const props = opts.props || {};
  const fieldProps = props.field || {};
  const input = root.querySelector('input, textarea');
  root.setAttribute('data-gp-field', '');
  // The field handles its own (pull-free) squish: pointer capture would stop
  // text selection by dragging inside the input.
  root.setAttribute('data-gp-no-squish', '');

  const fixed = { ...layerFor(root), ...fieldProps };
  const glass = attachGlass(root, groups.field, fixed);
  const setGlass = propSetter(glass, fixed);
  const squish = createSquish(root, () => ({ ...squishCfg(groups.field, fieldProps)(), squishPull: 0 }));

  // Clear (×) button: round glass that swells when pressed (squish via its group).
  let clearBtn = null;
  let clearGlass = null;
  if (opts.clearable && input) {
    clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.setAttribute('data-gp-clear', '');
    clearBtn.setAttribute('aria-label', 'Clear');
    clearBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    root.appendChild(clearBtn);
    clearGlass = attachGlass(clearBtn, groups.clear, props.clear || {});
  }

  let looks = null;
  // The focus look and the clear button follow the field's style.
  const readLooks = () => {
    const field = resolveGlass(groups.field, fieldProps);
    looks = { field, focus: resolveGlass(groups.focus, { style: field.style, ...fieldProps }) };
    clearGlass?.setProps({ style: field.style, ...(props.clear || {}) });
  };
  readLooks();
  let focused = false;
  const cur = { f: 0 };
  const render = () => {
    const look = blendLooks(looks.field, looks.focus, cur.f, root);
    setGlass(look);
    root.style.setProperty('--gp-field', rgbCss(rgbOf(look.tint, root), look.tintOpacity));
    root.style.setProperty('--gp-focus-t', cur.f.toFixed(3));
  };
  const loop = makeLoop((dt) => {
    const goal = focused ? 1 : 0;
    cur.f = reducedMotion() ? goal : cur.f + (goal - cur.f) * (1 - Math.exp(-dt / 0.07));
    if (Math.abs(cur.f - goal) < 0.003) cur.f = goal;
    render();
    return cur.f !== goal;
  });

  const syncValue = () => {
    if (clearBtn) clearBtn.hidden = !input.value;
  };
  syncValue();
  const onFocus = () => {
    focused = true;
    root.setAttribute('data-gp-focused', '');
    loop.kick();
  };
  const onBlur = () => {
    focused = false;
    root.removeAttribute('data-gp-focused');
    loop.kick();
  };
  // A tap anywhere on the field: a small jelly pulse, and focus the input.
  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (input?.disabled) return;
    squish.press(e.clientX, e.clientY);
    const lift = () => {
      squish.release();
      window.removeEventListener('pointerup', lift, true);
      window.removeEventListener('pointercancel', lift, true);
    };
    window.addEventListener('pointerup', lift, true);
    window.addEventListener('pointercancel', lift, true);
    if (e.target !== input && !clearBtn?.contains(e.target)) {
      e.preventDefault(); // (keep the focus going to the input, not the wrapper)
      input?.focus();
    }
  };
  const clear = () => {
    // Set the value the way typing does, so React's onChange sees it too.
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    syncValue();
    opts.onClear?.();
  };
  root.addEventListener('pointerdown', down);
  input?.addEventListener('focus', onFocus);
  input?.addEventListener('blur', onBlur);
  input?.addEventListener('input', syncValue);
  clearBtn?.addEventListener('click', clear);
  const offConfig = subscribeConfig(() => {
    readLooks();
    render();
  });
  if (input && document.activeElement === input) onFocus();
  render();

  return {
    /** Call after changing the input's value from code (shows / hides ×). */
    update() {
      syncValue();
    },
    destroy() {
      loop.stop();
      offConfig();
      root.removeEventListener('pointerdown', down);
      input?.removeEventListener('focus', onFocus);
      input?.removeEventListener('blur', onBlur);
      input?.removeEventListener('input', syncValue);
      clearBtn?.removeEventListener('click', clear);
      clearGlass?.destroy();
      clearBtn?.remove();
      squish.destroy();
      glass.destroy();
      root.removeAttribute('data-gp-field');
      root.removeAttribute('data-gp-no-squish');
    },
  };
}

// =============================================================================
// Lens bar — tab bar (horizontal) and sidebar (vertical)
// =============================================================================
/**
 * A glass bar whose items ([data-gp-item] children — buttons or links) share
 * one sliding glass lens.
 * @param {HTMLElement} root
 * @param {{
 *   orientation?: 'horizontal'|'vertical',
 *   value?: number,                      // selected item index
 *   onChange?: (index: number) => void,
 *   lensScale?: number,                  // lens size while pressed (iOS tab bar ≈ 1.2)
 *   inset?: number,                      // px between the bar edge and the lens
 *   groups?: { bar?: string, lens?: string, lensActive?: string },
 *   props?: { bar?: object, lens?: object, lensActive?: object },
 * }} [opts]
 */
export function createLensBar(root, opts = {}) {
  const vertical = opts.orientation === 'vertical';
  const groups = vertical
    ? { bar: 'sidebarPanel', lens: 'sidebarLens', lensActive: 'sidebarLensActive', ...(opts.groups || {}) }
    : { bar: 'tabBar', lens: 'tabLens', lensActive: 'tabLensActive', ...(opts.groups || {}) };
  const props = opts.props || {};
  let lensScale = opts.lensScale ?? (vertical ? 1.06 : 1.3);
  let inset = opts.inset ?? (vertical ? 0 : 4);
  let onChange = opts.onChange;
  const items = () => [...root.querySelectorAll(':scope > [data-gp-item]')];
  let index = clamp(Math.round(opts.value ?? 0), 0, Math.max(0, items().length - 1));

  root.setAttribute('data-gp-lensbar', vertical ? 'vertical' : 'horizontal');
  root.setAttribute('data-gp-no-squish', '');
  const lens = document.createElement('span');
  lens.setAttribute('data-gp-lens', '');
  lens.setAttribute('aria-hidden', 'true');
  root.insertBefore(lens, root.firstChild);

  const barFixed = { ...layerFor(root), ...(props.bar || {}) };
  const barGlass = attachGlass(root, groups.bar, barFixed);
  const lensGlass = attachGlass(lens, groups.lens, props.lens || {});
  const setLens = propSetter(lensGlass, props.lens || {});
  // The bar swells a little while pressed (no pull: it stays put).
  const barSquish = createSquish(root, () => ({ ...squishCfg(groups.bar, props.bar || {})(), squishPull: 0 }));
  let looks = null;
  // The lens follows the bar's style (config "style" of the bar group).
  const readLooks = () => {
    const style = resolveGlass(groups.bar, props.bar || {}).style;
    looks = { lens: resolveGlass(groups.lens, { style, ...(props.lens || {}) }), active: resolveGlass(groups.lensActive, { style, ...(props.lensActive || {}) }) };
  };
  readLooks();

  /** Item boxes along the bar: { a: start, size, c: centre, b: cross start, bs: cross size } (px in root). */
  const boxes = () =>
    items().map((it) =>
      vertical
        ? { a: it.offsetTop, size: it.offsetHeight, c: it.offsetTop + it.offsetHeight / 2, b: it.offsetLeft, bs: it.offsetWidth }
        : { a: it.offsetLeft, size: it.offsetWidth, c: it.offsetLeft + it.offsetWidth / 2, b: it.offsetTop, bs: it.offsetHeight }
    );

  // Lens state: p = centre along the bar (px), v = its speed (px/s), lift 0 … 1.
  const cur = { p: null, v: 0, lift: 0 };
  let press = null; // { id, start, moved, grab }
  let goal = null; // where the lens is heading (px) when not held

  /** Lens length at centre p: blends the sizes of the items it's between. */
  const sizeAt = (bx, p) => {
    if (!bx.length) return 0;
    if (p <= bx[0].c) return bx[0].size;
    for (let i = 0; i < bx.length - 1; i++) if (p <= bx[i + 1].c) return lerp(bx[i].size, bx[i + 1].size, (p - bx[i].c) / (bx[i + 1].c - bx[i].c || 1));
    return bx[bx.length - 1].size;
  };
  const nearest = (bx, p) => {
    let best = 0;
    for (let i = 1; i < bx.length; i++) if (Math.abs(bx[i].c - p) < Math.abs(bx[best].c - p)) best = i;
    return best;
  };

  // --- Accent wipe copies ---------------------------------------------------------------
  // Each item gets TWO copies of its content laid exactly over it, and its own
  // content is hidden (kept for layout, text for screen readers):
  //   <span data-gp-wipe="base">   normal colour, clipped to OUTSIDE the lens
  //   <span data-gp-wipe="accent"> accent colour, clipped to INSIDE the lens
  // so every pixel of a label is drawn exactly once. (One accent copy over
  // the original drew the label twice where the lens was — the white edges
  // of the glyphs underneath showed round the coloured ones as noise.)
  // Rebuilt when the item's content changes (React re-render, new label…).
  const wipes = new Map(); // item → { base, accent }
  const copy = (it, kind) => {
    const w = document.createElement('span');
    w.setAttribute('data-gp-wipe', kind);
    w.setAttribute('aria-hidden', 'true');
    return w;
  };
  const buildWipe = (it) => {
    let w = wipes.get(it);
    if (!w) {
      w = { base: copy(it, 'base'), accent: copy(it, 'accent') };
      wipes.set(it, w);
    }
    const own = [...it.childNodes].filter((n) => n !== w.base && n !== w.accent);
    for (const span of [w.base, w.accent]) {
      span.replaceChildren(...own.map((n) => n.cloneNode(true)));
      for (const n of span.querySelectorAll('[id]')) n.removeAttribute('id'); // (no duplicate ids)
    }
    if (it.lastChild !== w.accent || w.accent.previousSibling !== w.base) it.append(w.base, w.accent);
    it.setAttribute('data-gp-wiped', '');
    // A <button> that isn't flex / grid centres its content vertically by
    // itself; the copies (spans) don't, so their text sat higher than the
    // label it covers. Centre them the same way (horizontally by text-align).
    const cs = getComputedStyle(it);
    const plainButton = it.tagName === 'BUTTON' && !/flex|grid/.test(cs.display);
    for (const span of [w.base, w.accent]) {
      if (plainButton) {
        const ta = cs.textAlign;
        Object.assign(span.style, {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: ta === 'left' || ta === 'start' ? 'flex-start' : ta === 'right' || ta === 'end' ? 'flex-end' : 'center',
        });
      } else for (const k of ['display', 'flexDirection', 'justifyContent', 'alignItems']) span.style[k] = '';
    }
  };
  // The items' normal text colour (they are made transparent once copied).
  const readBaseColor = () => {
    root.style.setProperty('--gp-item-base', getComputedStyle(root).color);
  };
  const syncWipes = () => {
    readBaseColor();
    const its = items();
    for (const [it, w] of wipes) {
      if (its.includes(it)) continue;
      w.base.remove();
      w.accent.remove();
      it.removeAttribute('data-gp-wiped');
      wipes.delete(it);
    }
    its.forEach(buildWipe);
  };
  const wipeObserver =
    typeof MutationObserver === 'function'
      ? new MutationObserver((records) => {
          let all = false;
          const dirty = new Set();
          for (const r of records) {
            const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
            if (!t || t.closest('[data-gp-wipe]')) continue; // (our own copies)
            const nodes = [...r.addedNodes, ...r.removedNodes];
            if (r.type === 'childList' && nodes.length && nodes.every((n) => n.nodeType === 1 && (n.hasAttribute('data-gp-wipe') || n === lens))) continue;
            if (t === root) all = true;
            else {
              const it = t.closest('[data-gp-item]');
              if (it && it.parentElement === root) dirty.add(it);
            }
          }
          if (all) syncWipes();
          else dirty.forEach(buildWipe);
          if (all || dirty.size) render();
        })
      : null;

  const render = () => {
    const bx = boxes();
    if (!bx.length) return;
    if (cur.p == null) cur.p = bx[index]?.c ?? bx[0].c;
    const crossStart = vertical ? 0 : inset;
    const crossSize = vertical ? bx[0].bs : (vertical ? root.clientWidth : root.clientHeight) - inset * 2;
    // Item length — capped to LENS_MAX_ASPECT × height as the lens lifts
    // (tab bars only; a sidebar's lens is a full-width row).
    const itemLen = sizeAt(bx, cur.p);
    const len = vertical ? itemLen : itemLen - Math.max(0, itemLen - crossSize * LENS_MAX_ASPECT) * cur.lift;
    // Lifted: bigger; moving: stretched along the bar, thinner across it.
    const s = 1 + (lensScale - 1) * cur.lift;
    const st = stretchFor(vertical ? 0 : cur.v, vertical ? cur.v : 0, Math.abs(cur.v) * 0.0009 * (0.4 + 0.6 * cur.lift));
    const along = len * s * (vertical ? st.sy : st.sx);
    const across = crossSize * s * (vertical ? st.sx : st.sy);
    const a0 = cur.p - along / 2;
    const b0 = (vertical ? bx[0].b : crossStart) + (crossSize - across) / 2;
    // The lens box in root px (left, top, width, height).
    const lx = vertical ? b0 : a0;
    const ly = vertical ? a0 : b0;
    const lw = vertical ? across : along;
    const lh = vertical ? along : across;
    Object.assign(lens.style, { left: `${lx}px`, top: `${ly}px`, width: `${lw}px`, height: `${lh}px` });
    setLens(blendLooks(looks.lens, looks.active, cur.lift, lens));
    lens.style.setProperty('--gp-lift', cur.lift.toFixed(3));
    // Lifted, the lens goes ABOVE the items (live glass then bends and
    // magnifies the icons under it, as on iOS); at rest it's a pill under them.
    if (cur.lift > 0.02) lens.setAttribute('data-gp-lifted', '');
    else lens.removeAttribute('data-gp-lifted');
    // The lens's corner radius, for the accent wipe's clip.
    const lr = looks.lens.shape === 'capsule' || looks.lens.shape === 'circle' ? Math.min(lw, lh) / 2 : looks.lens.radius === 'auto' ? 10 : Math.min(looks.lens.radius, lw / 2, lh / 2);
    // Accent wipe: each item's accent-coloured copy is clipped to the lens,
    // so the colour sweeps across the icons exactly where the lens is.
    // --gp-on (0 … 1, how much of the item the lens covers) is there for CSS.
    const its = items();
    bx.forEach((b, i) => {
      const it = its[i];
      const overlap = Math.max(0, Math.min(b.a + b.size, a0 + along) - Math.max(b.a, a0)) / (b.size || 1);
      it.style.setProperty('--gp-on', clamp01(overlap * 1.15).toFixed(3));
      const w = wipes.get(it);
      if (w) {
        // The lens in the item's own px.
        const L = lx - it.offsetLeft;
        const T = ly - it.offsetTop;
        const iw = it.offsetWidth;
        const ih = it.offsetHeight;
        const off = L >= iw || T >= ih || L + lw <= 0 || T + lh <= 0;
        if (off) {
          w.accent.style.visibility = 'hidden';
          w.base.style.clipPath = '';
        } else {
          const lens = roundRectPath(L, T, lw, lh, lr);
          w.accent.style.visibility = '';
          w.accent.style.clipPath = `path('${lens}')`;
          // Everything but the lens: the item's box (with room to spare) minus the lens.
          w.base.style.clipPath = `path(evenodd, 'M${-iw} ${-ih}H${iw * 2}V${ih * 2}H${-iw}Z${lens}')`;
        }
      }
      const sel = i === index;
      if (its[i].getAttribute('role') === 'tab') its[i].setAttribute('aria-selected', String(sel));
      else if (sel) its[i].setAttribute('aria-current', 'page');
      else its[i].removeAttribute('aria-current');
    });
  };

  const loop = makeLoop((dt) => {
    const bx = boxes();
    if (!bx.length) return false;
    const target = press ? press.target : goal ?? bx[index].c;
    const liftGoal = press ? 1 : 0;
    if (reducedMotion()) {
      cur.p = target;
      cur.v = 0;
      cur.lift = liftGoal;
      render();
      return Boolean(press);
    }
    // Held: follows the finger closely. Let go: a softer, wobbly landing.
    const prevP = cur.p ?? target;
    [cur.p, cur.v] = spring(prevP, cur.v, target, press ? 900 : 260, press ? 0.9 : 0.62, dt);
    cur.lift += (liftGoal - cur.lift) * (1 - Math.exp(-dt / (liftGoal ? 0.05 : 0.09)));
    const settled = !press && Math.abs(cur.p - target) < 0.1 && Math.abs(cur.v) < 3 && cur.lift < 0.003;
    if (settled) {
      cur.p = target;
      cur.v = 0;
      cur.lift = 0;
      goal = null;
    }
    render();
    return !settled;
  });

  // --- Pointer ----------------------------------------------------------------------------
  const along = (e) => {
    const r = root.getBoundingClientRect();
    return vertical ? e.clientY - r.top : e.clientX - r.left;
  };
  /** Finger position → lens target, rubber-banded past the first / last item. */
  const followTarget = (pos) => {
    const bx = boxes();
    const lo = bx[0].c;
    const hi = bx[bx.length - 1].c;
    const band = (over) => 18 * Math.tanh(over / 40);
    if (pos < lo) return lo - band(lo - pos);
    if (pos > hi) return hi + band(pos - hi);
    return pos;
  };
  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!items().length) return;
    capture(root, e.pointerId);
    const pos = along(e);
    press = { id: e.pointerId, start: pos, moved: false, target: followTarget(pos) };
    barSquish.press(e.clientX, e.clientY);
    loop.kick();
  };
  const move = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const pos = along(e);
    if (!press.moved && Math.abs(pos - press.start) > DRAG_THRESHOLD) press.moved = true;
    press.target = followTarget(pos);
    loop.kick();
  };
  const up = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const bx = boxes();
    const pick = nearest(bx, press.target);
    press = null;
    barSquish.release();
    select(pick, true);
  };
  const cancel = (e) => {
    if (!press || e.pointerId !== press.id) return;
    press = null;
    barSquish.release();
    goal = null;
    loop.kick();
  };
  /** Select an item (user = true: tell the owner). */
  const select = (i, user) => {
    const n = items().length;
    if (!n) return;
    i = clamp(i, 0, n - 1);
    const changed = i !== index;
    index = i;
    goal = boxes()[i].c;
    loop.kick();
    if (changed && user) onChange?.(i);
  };
  // Keyboard: arrows / Home / End move the selection; Enter / Space on an item picks it.
  const key = (e) => {
    const n = items().length;
    const step = vertical ? { ArrowDown: 1, ArrowUp: -1 }[e.key] : { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    let next = null;
    if (step) next = (index + step + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    items()[next]?.focus();
    select(next, true);
  };
  // Clicks on items from the keyboard (Enter / Space on a focused button).
  const click = (e) => {
    if (e.detail !== 0) return;
    const it = e.target.closest?.('[data-gp-item]');
    const i = items().indexOf(it);
    if (i >= 0) select(i, true);
  };
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('lostpointercapture', cancel);
  root.addEventListener('keydown', key);
  root.addEventListener('click', click);
  // Resized (window, layout, fonts): the items moved, so put the lens back on
  // the selected one — it kept its old pixel position and sat on the wrong
  // item. (Not while it's held: the finger decides then.)
  const ro =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          if (!press) {
            cur.p = null;
            cur.v = 0;
            goal = null;
          }
          render();
        })
      : null;
  ro?.observe(root);
  const offConfig = subscribeConfig(() => {
    readLooks();
    readBaseColor(); // (theme switch)
    render();
  });
  syncWipes();
  wipeObserver?.observe(root, { childList: true, subtree: true, characterData: true });
  render();
  requestAnimationFrame(render);

  return {
    get value() {
      return index;
    },
    update(next = {}) {
      if (next.onChange !== undefined) onChange = next.onChange;
      if (next.lensScale !== undefined) lensScale = next.lensScale;
      if (next.inset !== undefined) inset = next.inset;
      if (Number.isFinite(next.value) && next.value !== index && !press) select(next.value, false);
      else loop.kick();
    },
    destroy() {
      loop.stop();
      offConfig();
      ro?.disconnect();
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', cancel);
      root.removeEventListener('lostpointercapture', cancel);
      root.removeEventListener('keydown', key);
      root.removeEventListener('click', click);
      barSquish.destroy();
      lensGlass.destroy();
      barGlass.destroy();
      lens.remove();
      wipeObserver?.disconnect();
      for (const [it, w] of wipes) {
        w.base.remove();
        w.accent.remove();
        it.removeAttribute('data-gp-wiped');
      }
      wipes.clear();
      root.style.removeProperty('--gp-item-base');
      for (const it of items()) it.style.removeProperty('--gp-on');
      root.removeAttribute('data-gp-lensbar');
      root.removeAttribute('data-gp-no-squish');
    },
  };
}

/** iOS-style glass tab bar (horizontal lens bar). */
export const createTabBar = (root, opts = {}) => createLensBar(root, { ...opts, orientation: 'horizontal' });
/** Glass sidebar with a sliding selection lens (vertical lens bar). */
export const createSidebar = (root, opts = {}) => createLensBar(root, { ...opts, orientation: 'vertical' });

// =============================================================================
// Progress bar
// =============================================================================
/**
 * Liquid Glass progress bar. value 0–1, or null for "busy" (a sliding drop).
 * @param {HTMLElement} root  a <div>; size it with CSS (height ≈ 6–10px)
 * @param {{ value?: number|null, bead?: boolean,
 *           groups?: { track?: string, fill?: string, bead?: string },
 *           props?: { track?: object, fill?: object, bead?: object } }} [opts]
 */
export function createProgress(root, opts = {}) {
  const groups = { track: 'progressTrack', fill: 'progressFill', bead: 'progressBead', ...(opts.groups || {}) };
  const props = opts.props || {};
  let value = opts.value == null ? null : clamp01(Number(opts.value) || 0);
  let withBead = Boolean(opts.bead);

  root.setAttribute('data-gp-progress', '');
  root.setAttribute('role', 'progressbar');
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '100');
  const fill = document.createElement('span');
  fill.setAttribute('data-gp-fill', '');
  fill.setAttribute('aria-hidden', 'true');
  root.appendChild(fill);
  const bead = document.createElement('span');
  bead.setAttribute('data-gp-bead', '');
  bead.setAttribute('aria-hidden', 'true');
  // Inside the fill, so its glass bends the fill (and the track) under it.
  fill.appendChild(bead);

  const trackGlass = attachGlass(root, groups.track, { ...layerFor(root), ...(props.track || {}) });
  // The fill and bead follow the track's style (config "style").
  const partProps = (part) => ({ style: resolveGlass(groups.track, props.track || {}).style, ...(props[part] || {}) });
  const fillGlass = attachGlass(fill, groups.fill, partProps('fill'));
  let beadGlass = null;
  const syncStyle = () => {
    fillGlass.setProps(partProps('fill'));
    beadGlass?.setProps(partProps('bead'));
  };
  const syncBead = () => {
    if (withBead && !beadGlass) beadGlass = attachGlass(bead, groups.bead, partProps('bead'));
    if (!withBead && beadGlass) {
      beadGlass.destroy();
      beadGlass = null;
    }
    bead.hidden = !withBead;
  };
  syncBead();

  const cur = { w: value ?? 0, v: 0, t: 0 }; // w = shown fraction, v = its speed (1/s), t = busy clock (s)
  const render = () => {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    let x0;
    let w;
    let h = H;
    let speedPx;
    if (value == null) {
      // Busy: a drop ~28% of the track slides end to end (eased), stretching
      // with its speed and thinning (and squashing as it turns round).
      const seg = Math.max(H * 2, W * 0.28);
      const period = 1.6;
      const ph = (cur.t / period) * Math.PI * 2;
      const x = (W - seg) * (0.5 - 0.5 * Math.cos(ph));
      speedPx = ((W - seg) * Math.PI * Math.sin(ph)) / period;
      const e = Math.min(0.9, Math.abs(speedPx) * 0.0011);
      w = seg * (1 + e);
      h = H / Math.sqrt(1 + e);
      x0 = clamp(x - (w - seg) / 2, 0, W - w);
    } else {
      x0 = 0;
      speedPx = cur.v * W;
      if (withBead) {
        // With a bead: like a slider knob, its centre travels from half a
        // bead in from the start to half a bead in from the end, and the
        // fill reaches its centre — at 0% the bead sits at the very start of
        // the track instead of hanging off it.
        const bw0 = H * 2.4 * 1.35;
        w = bw0 / 2 + clamp01(cur.w) * Math.max(0, W - bw0);
      } else {
        w = cur.w <= 0.001 ? 0 : Math.max(H, Math.min(1, cur.w) * W);
      }
    }
    Object.assign(fill.style, { left: `${x0}px`, width: `${w}px`, top: `${(H - h) / 2}px`, height: `${h}px` });
    fill.style.visibility = w < 1 && !withBead ? 'hidden' : '';
    if (withBead) {
      // A glass bead riding the end of the fill, stretched by its speed,
      // kept inside the track.
      const d = H * 2.4;
      const st = stretchFor(speedPx, 0, Math.abs(speedPx) * 0.0012);
      const bw = d * 1.35 * st.sx;
      const bh = d * st.sy;
      const cxRoot = clamp(x0 + w, Math.min(bw / 2, W / 2), Math.max(W - bw / 2, W / 2));
      // (px inside the fill, which starts at x0 and is h tall)
      const cx = cxRoot - x0;
      Object.assign(bead.style, { left: `${cx - bw / 2}px`, top: `${(h - bh) / 2}px`, width: `${bw}px`, height: `${bh}px` });
    }
    const tr = resolveGlass(groups.track, props.track || {});
    const fl = resolveGlass(groups.fill, partProps('fill'));
    root.style.setProperty('--gp-track', rgbCss(rgbOf(tr.tint.from, root), tr.tintOpacity));
    fill.style.setProperty('--gp-fill', rgbCss(rgbOf(fl.tint.from, fill), fl.tintOpacity));
    if (value == null) root.removeAttribute('aria-valuenow');
    else root.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  };
  const loop = makeLoop((dt) => {
    if (value == null) {
      cur.t += reducedMotion() ? 0 : dt;
      render();
      return !reducedMotion();
    }
    if (reducedMotion()) {
      cur.w = value;
      cur.v = 0;
      render();
      return false;
    }
    [cur.w, cur.v] = spring(cur.w, cur.v, value, 160, 0.7, dt);
    const done = Math.abs(cur.w - value) < 0.0005 && Math.abs(cur.v) < 0.002;
    if (done) Object.assign(cur, { w: value, v: 0 });
    render();
    return !done;
  });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => render()) : null;
  ro?.observe(root);
  const offConfig = subscribeConfig(() => {
    syncStyle();
    render();
  });
  render();
  loop.kick();

  return {
    get value() {
      return value;
    },
    update(next = {}) {
      if ('value' in next) value = next.value == null ? null : clamp01(Number(next.value) || 0);
      if (next.bead !== undefined) {
        withBead = Boolean(next.bead);
        syncBead();
      }
      loop.kick();
    },
    destroy() {
      loop.stop();
      offConfig();
      ro?.disconnect();
      beadGlass?.destroy();
      fillGlass.destroy();
      trackGlass.destroy();
      fill.remove();
      bead.remove();
      root.removeAttribute('data-gp-progress');
    },
  };
}
