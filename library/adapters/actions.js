/**
 * =============================================================================
 * glass/adapters/actions.js — Glass + the controls as "actions" (any framework)
 * =============================================================================
 * The shared core of the Vue and Svelte wrappers ("glassparency/vue",
 * "glassparency/svelte"): every function here has the shape of a Svelte
 * action — (element, params) → { update(params), destroy() } — which is also
 * all a Vue directive or component needs. They are THIN: the plain-JS API
 * (the script build's window.Glassparency, ../standalone.js) does the work.
 *
 *   glass(el, 'card')                                     glass on any element
 *   glass(el, { group: 'card', look: 'frosted', props: { tint: '#e0e7ff' } })
 *   glassSwitch(el, { checked, onChange })                a control (el: a <button>)
 *   glassSlider(el, { value, min, max, onChange, onChangeEnd })   (el: a <div>)
 *   … one per create… function: glassCheckbox, glassRadio, glassTextField,
 *   glassTabBar, glassSidebar, glassProgress, glassSegmented, glassStepper,
 *   glassRangeSlider, glassBlockSlider, glassTooltip, glassSheet,
 *   glassPopover / glassMenu / glassSelect (el = a wrapper: its FIRST child
 *   is the button, its LAST child the panel).
 *
 * Params of the controls = the create… function's options (see controls.js,
 * widgets.js, pickers.js, overlays.js), plus:
 *   look, lookColor   the control's look (config.js "Looks") — goes on its
 *                     main part (a switch's track, a checkbox's box…)
 *   props             per-part glass props, as the create… functions take them
 * A value given (checked / value) makes the control CONTROLLED: it shows
 * what update() passes and asks onChange to change it (like React's).
 *
 * The first action used starts the glass (start({ auto: false }) — the
 * provider, without scanning the page for data-glassparency attributes; call
 * startGlass() for that). Nothing here runs on import, and everything is a
 * no-op on the server (no document): safe in SSR (Nuxt, SvelteKit, Next.js).
 * =============================================================================
 */
import {
  start,
  attachGlass,
  createSwitch,
  createSlider,
  createCheckbox,
  createRadio,
  createTextField,
  createTabBar,
  createSidebar,
  createProgress,
  createSegmented,
  createStepper,
  createRangeSlider,
  createBlockSlider,
  createTooltip,
  createSheet,
  createPopover,
  createMenu,
  createSelect,
} from '../standalone';

/** An action that does nothing (the server, or no element). */
const NOOP = { update() {}, destroy() {} };
const inBrowser = () => typeof document !== 'undefined';

let started = false;
/**
 * Make sure the glass runs (once). Wrappers call it on first use; start()
 * itself is safe to call again (startGlass() / app.use() may already have).
 */
export function ensureGlass() {
  if (started || !inBrowser()) return;
  started = true;
  start({ auto: false });
}

/** Glass params: 'group' | { group, look, lookColor, props } → [group, props]. */
function glassArgs(params) {
  if (typeof params === 'string' || params == null) return [params || 'panel', {}];
  const props = { ...(params.props || {}) };
  if (params.look !== undefined) props.look = params.look;
  if (params.lookColor !== undefined) props.lookColor = params.lookColor;
  return [params.group || 'panel', props];
}

/**
 * Glass on any element.
 *   use:glass={'card'}   use:glass={{ group: 'card', look: 'smoke', props: { tintOpacity: 0.5 } }}
 * A new group re-attaches; new props / look just update.
 * @param {HTMLElement} el
 * @param {string | { group?: string, look?: string, lookColor?: string, props?: object }} [params]
 */
export function glass(el, params) {
  if (!el || !inBrowser()) return NOOP;
  ensureGlass();
  let [group, props] = glassArgs(params);
  let key = JSON.stringify(props);
  let handle = attachGlass(el, group, props);
  return {
    update(next) {
      const [g, p] = glassArgs(next);
      const k = JSON.stringify(p);
      if (g !== group) {
        handle.destroy();
        group = g;
        key = k;
        handle = attachGlass(el, group, p);
      } else if (k !== key) {
        key = k;
        handle.setProps(p);
      }
    },
    destroy() {
      handle.destroy();
    },
  };
}

// --- The controls ------------------------------------------------------------------------

/** Pick the keys of `o` that are set (not undefined). */
const pick = (o, keys) => {
  const out = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
};
/** Functions can't be JSON'd: a key for "the things that need a rebuild". */
const keyOf = (o) => {
  try {
    return JSON.stringify(o);
  } catch {
    return String(Math.random()); // (not JSON-able: always rebuild)
  }
};

/**
 * Make an action from a create… function.
 * spec:
 *   part       the props key the look goes on ('track', 'box'…; null = the
 *              control takes glass props directly, e.g. a tooltip)
 *   value      the option that makes it controlled ('checked' | 'value' | null)
 *   callbacks  option names passed through as "call the latest one"
 *   live       options update() passes on (the rest need a rebuild: see fixed)
 *   fixed      options whose change rebuilds the control (groups, props,
 *              look are always among them)
 *   shape      (params) → anything else that needs a rebuild when it changes
 */
function control(create, spec) {
  return function action(el, params = {}) {
    if (!el || !inBrowser()) return NOOP;
    ensureGlass();
    let p = params || {};
    // The latest params' callbacks, so a new onChange never needs a rebuild.
    const calls = {};
    for (const name of spec.callbacks) calls[name] = (...args) => p[name]?.(...args);

    const glassProps = (q) => {
      if (q.look === undefined && q.lookColor === undefined) return q.props;
      const look = pick(q, ['look', 'lookColor']);
      if (!spec.part) return { ...(q.props || {}), ...look };
      return { ...(q.props || {}), [spec.part]: { ...(q.props?.[spec.part] || {}), ...look } };
    };
    const fixedKey = (q) => keyOf({ g: q.groups, p: q.props, l: q.look, c: q.lookColor, f: pick(q, spec.fixed || []), s: spec.shape?.(q) });
    const build = (q) => {
      const controlled = spec.value ? q[spec.value] !== undefined : false;
      const opts = { ...q, props: glassProps(q), ...calls };
      delete opts.look;
      delete opts.lookColor;
      if (spec.value) opts.controlled = controlled;
      return create(el, opts);
    };

    let key = fixedKey(p);
    let ctl = build(p);
    spec.after?.(ctl, p, true);
    return {
      update(next = {}) {
        p = next || {};
        const k = fixedKey(p);
        if (k !== key) {
          ctl.destroy();
          key = k;
          ctl = build(p);
          spec.after?.(ctl, p, true);
          return;
        }
        ctl.update(pick(p, spec.live));
        spec.after?.(ctl, p, false);
      },
      destroy() {
        ctl.destroy();
      },
    };
  };
}

/** A switch (el: a <button>). { checked, disabled, onChange, groups, props: { track }, look } */
export const glassSwitch = control(createSwitch, { part: 'track', value: 'checked', callbacks: ['onChange'], live: ['checked', 'disabled'] });
/** A slider (el: a <div>, sized with CSS). { value, min, max, step, disabled, onChange, onChangeEnd } */
export const glassSlider = control(createSlider, { part: 'track', value: 'value', callbacks: ['onChange', 'onChangeEnd'], live: ['value', 'min', 'max', 'step', 'disabled'] });
/** A checkbox (el: a <button>; its text is the label). { checked, disabled, onChange } */
export const glassCheckbox = control(createCheckbox, { part: 'box', value: 'checked', callbacks: ['onChange'], live: ['checked', 'disabled'], fixed: ['name'] });
/** A radio (el: a <button>). { checked, name, disabled, onChange } */
export const glassRadio = control(createRadio, { part: 'box', value: 'checked', callbacks: ['onChange'], live: ['checked', 'disabled'], fixed: ['name'] });
/** A text field (el: a wrapper round an <input>). { clearable, onClear } */
export const glassTextField = control(createTextField, { part: 'field', value: null, callbacks: ['onClear'], live: [], fixed: ['clearable'] });
/** A tab bar (el: a wrapper; its children are the items). { value, onChange, lensScale, inset } */
export const glassTabBar = control(createTabBar, { part: 'bar', value: 'value', callbacks: ['onChange'], live: ['value', 'lensScale', 'inset'] });
/** A sidebar with a selection lens (as glassTabBar, standing up). */
export const glassSidebar = control(createSidebar, { part: 'bar', value: 'value', callbacks: ['onChange'], live: ['value', 'lensScale', 'inset'] });
/** A progress bar (el: a <div>). { value: 0–1 | null (busy), bead } */
export const glassProgress = control(createProgress, { part: 'track', value: null, callbacks: [], live: ['value', 'bead'] });
/** A segmented control (el: a wrapper; its children are the segments). { value, onChange } */
export const glassSegmented = control(createSegmented, { part: 'bar', value: 'value', callbacks: ['onChange'], live: ['value', 'lensScale', 'inset'] });
/** A stepper (el: an empty <div>). { value, min, max, step, wrap, showValue, format, disabled, onChange } */
export const glassStepper = control(createStepper, {
  part: 'body',
  value: 'value',
  callbacks: ['onChange'],
  live: ['value', 'min', 'max', 'step', 'disabled', 'showValue', 'format'],
  fixed: ['wrap'],
});
/** A range slider (two knobs: value [lo, hi]) or a standing one (orientation "vertical"). */
export const glassRangeSlider = control(createRangeSlider, {
  part: 'track',
  value: 'value',
  callbacks: ['onChange', 'onChangeEnd'],
  live: ['value', 'min', 'max', 'step', 'disabled'],
  // (one knob or two, and the orientation, are fixed per instance)
  fixed: ['orientation'],
  shape: (q) => Array.isArray(q.value),
});
/** A Control Center block slider (el: a <div>; children = its icon). */
export const glassBlockSlider = control(createBlockSlider, {
  part: 'body',
  value: 'value',
  callbacks: ['onChange', 'onChangeEnd'],
  live: ['value', 'min', 'max', 'step', 'disabled'],
  fixed: ['orientation'],
});
/** A tooltip on el. { text, placement, delay, group, props } */
export const glassTooltip = control(createTooltip, { part: null, value: null, callbacks: [], live: ['text'], fixed: ['placement', 'delay', 'group'] });
/**
 * A bottom sheet (el: the panel with your content; moved into the glass
 * overlay while open). { open, detent, detents, onClose, onDetentChange }
 */
export const glassSheet = control(createSheet, {
  part: null,
  value: null,
  callbacks: ['onClose', 'onDetentChange'],
  live: [],
  fixed: ['detents', 'dim'],
  // open / close follow the `open` param (after every create / update).
  after(ctl, p, fresh) {
    if (p.open) ctl.open(p.detent ?? 0);
    else if (!fresh) ctl.close();
  },
});

/**
 * Popover / menu / select: el is a wrapper whose FIRST element child is the
 * button and LAST element child the panel. The button gets glass too
 * (triggerGroup, default "button"; triggerProps = its glass props).
 */
function pair(create, live, callbacks) {
  const inner = (wrapper, opts) => {
    const button = wrapper.firstElementChild;
    const panel = wrapper.lastElementChild;
    const { triggerGroup, triggerProps, ...rest } = opts;
    const btnGlass = attachGlass(button, triggerGroup || 'button', triggerProps || {});
    const ctl = create(button, panel, rest);
    return {
      update: (next) => ctl.update(next),
      open: () => ctl.open?.(),
      close: () => ctl.close?.(),
      destroy() {
        ctl.destroy();
        btnGlass.destroy();
      },
    };
  };
  return control(inner, { part: null, value: null, callbacks, live, fixed: ['group', 'placement', 'align', 'triggerGroup', 'triggerProps', 'items'] });
}
/** A popover. { group, props, placement, align, onOpenChange, triggerGroup, triggerProps } */
export const glassPopover = pair(createPopover, [], ['onOpenChange']);
/** A menu (panel children: <button role="menuitem">). + onSelect(index, item) */
export const glassMenu = pair(createMenu, [], ['onOpenChange', 'onSelect']);
/** A select (panel children: <button role="option" data-value="…">). { value, onChange(value, index) } */
export const glassSelect = pair(createSelect, ['value'], ['onChange', 'onOpenChange']);
