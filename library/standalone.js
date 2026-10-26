/**
 * =============================================================================
 * glass/standalone.js — Liquid Glass on ANY web page, no React needed
 * =============================================================================
 * The npm package builds this into one self-contained script
 * (dist/glassparency.standalone.js — React, three.js and the rest inside) for
 * sites that aren't React apps: WordPress, Shopify themes, plain HTML…
 *
 *   <script src="https://unpkg.com/<package>/dist/glassparency.standalone.js"></script>
 *   <button data-glassparency="button">Save</button>
 *   <div data-glassparency="card" data-glassparency-props='{"tint":"#e0e7ff"}'>…</div>
 *
 * The script starts by itself (add data-manual to the <script> tag to start
 * it yourself) and gives every element with data-glassparency="<group>"
 * glass — also elements added later, and it follows attribute changes.
 * Switches and sliders: native inputs marked like this become Liquid Glass
 * controls (the input stays in the page, hidden and in sync, so forms,
 * <label for> and "input" / "change" listeners keep working):
 *   <input type="checkbox" data-glassparency-switch aria-label="Wi-Fi">
 *   <input type="range" min="0" max="100" data-glassparency-slider aria-label="Volume">
 * The other controls (widgets.js) the same way:
 *   <label><input type="checkbox" data-glassparency-checkbox> On Desktop</label>
 *   <label><input type="radio" name="size" value="s" data-glassparency-radio> Small</label>
 *   <progress data-glassparency-progress value="40" max="100"></progress>   (no value = busy)
 *   <div data-glassparency-field data-glassparency-clearable><svg…/><input placeholder="Search"></div>
 *   <nav data-glassparency-tabbar><button>Home</button><button aria-selected="true">Radio</button>…</nav>
 *   <nav data-glassparency-sidebar><a href="/">Home</a><a href="/radio" aria-current="page">Radio</a>…</nav>
 * Bars: the children are the items (or only those marked data-gp-item); the
 * selected one is aria-selected="true" / aria-current / data-selected, and
 * picking one fires a "glassparency:change" event ({ detail: { index } }) on
 * the bar. data-glassparency-props='{"style":"crystal"}' styles any of them.
 * Settings: window.GlassparencyConfig = {…} before the script, or
 * Glassparency.configure({…}) any time (same format as glass.config.json;
 * merged over the built-in presets).
 *
 * JavaScript API (window.Glassparency in the script build):
 *   start({ config, auto = true, injectStyles = true, nonce })   begin
 *   stop()                                                       remove all glass
 *   attach(el, group, props) → { setProps(props), destroy() }    by hand
 *   setProps(el, props)        change an element's look without re-attaching
 *   createSwitch(el, opts) / createSlider(el, opts)   controls by hand (controls.js)
 *   createCheckbox / createRadio / createTextField / createTabBar /
 *   createSidebar / createProgress (el, opts)          the other controls (widgets.js)
 *   createSquish(el, readCfg)  squish & stretch for anything you move yourself
 *   createShapeSpring(el, opts)  spring an element between shapes (motion.js)
 *   glassMorph(from, to, opts) liquid-morph one element into another (motion.js)
 *   getProps(el) / mergeProps(el, partial)   read / change SOME per-element props
 *   <glass-ui group="card" props='{…}'>  glass as an element (element.js),
 *                              registered by start(); defineElement(name) by hand
 *   configure(config)          merge a config over the built-in one
 *   addPresets(config) → remove()   extra groups under configure() (kept by it)
 *   getConfig()                the config in use
 *   requestRender()            redraw now (after moving elements yourself)
 *   reserveSnapshotArea(key, rect | null)
 *   status() / onStatus(fn)    'loading' | 'on' | 'fallback' (+ reason)
 *   quality() / onQuality(fn)  { level: 'high' | 'medium' | 'low', auto, fps }
 *   version                    the package version
 * =============================================================================
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import GlassProvider from './GlassProvider';
import { attachGlass, getGlassProps, mergeGlassProps, setGlassProps } from './useGlass';
import { createShapeSpring, glassMorph } from './motion';
import { defineGlassElement } from './element';
import { getGlassQuality, subscribeGlassQuality } from './quality';
import { addGlassPresets, configureGlass, getGlassConfig } from './config';
import { getStatus, requestRender as requestGlassRender, subscribeStatus } from './registry';
import { reserveSnapshotArea as reserveArea } from './snapshot';
import { createSlider, createSwitch } from './controls';
import { createCheckbox, createProgress, createRadio, createSidebar, createTabBar, createTextField } from './widgets';
import { createSquish } from './squish';

/** Declarative attributes. */
const ATTR = 'data-glassparency';
const PROPS_ATTR = 'data-glassparency-props';
const SWITCH_ATTR = 'data-glassparency-switch'; // on <input type="checkbox">
const SLIDER_ATTR = 'data-glassparency-slider'; // on <input type="range">
const CONTROLS = `input[${SWITCH_ATTR}], input[${SLIDER_ATTR}]`;
// The other controls (widgets.js): attribute → what it goes on.
const W = {
  checkbox: { attr: 'data-glassparency-checkbox', sel: 'input[type="checkbox"]' },
  radio: { attr: 'data-glassparency-radio', sel: 'input[type="radio"]' },
  progress: { attr: 'data-glassparency-progress', sel: 'progress' },
  field: { attr: 'data-glassparency-field', sel: '*' },
  tabbar: { attr: 'data-glassparency-tabbar', sel: '*' },
  sidebar: { attr: 'data-glassparency-sidebar', sel: '*' },
};
const WIDGETS = Object.values(W)
  .map((w) => (w.sel === '*' ? `[${w.attr}]` : `${w.sel}[${w.attr}]`))
  .join(', ');
const widgets = new Map(); // element → { kind, ctl, off } (glass checkboxes, radios, fields, bars, progress)

let reactRoot = null; // the React root running <GlassProvider>
let container = null; // its (empty) element in <body>
let observer = null; // watches the page for data-glassparency elements
const auto = new Map(); // element → { group, raw, handle } (declarative glass)
const inputs = new Map(); // native input → { widget, ctl, off } (glass switches / sliders)

/**
 * Start the glass on this page (safe to call more than once).
 * @param {{config?: object, auto?: boolean, injectStyles?: boolean, nonce?: string}} [options]
 */
export function start(options = {}) {
  if (typeof document === 'undefined') return;
  if (options.config !== undefined) configureGlass(options.config);
  if (!document.body) {
    // Loaded from <head>: wait for <body>.
    document.addEventListener('DOMContentLoaded', () => start({ ...options, config: undefined }), { once: true });
    return;
  }
  if (!reactRoot) {
    container = document.createElement('div');
    container.setAttribute('data-glass-host', 'provider'); // the glass's own node: page watchers skip it
    container.setAttribute('data-glass-ignore', '');
    document.body.appendChild(container);
    reactRoot = createRoot(container);
    reactRoot.render(createElement(GlassProvider, { injectStyles: options.injectStyles ?? true, nonce: options.nonce }));
  }
  if (options.auto !== false) startAuto();
}

/** Remove every glass this script added and stop the canvases. */
export function stop() {
  observer?.disconnect();
  observer = null;
  for (const { handle } of auto.values()) handle.destroy();
  auto.clear();
  for (const input of [...inputs.keys()]) unenhance(input);
  for (const el of [...widgets.keys()]) unwidget(el);
  reactRoot?.unmount();
  reactRoot = null;
  container?.remove();
  container = null;
}

/** Give an element glass by hand (see useGlass.js attachGlass). */
export const attach = (el, group, props) => attachGlass(el, group, props);
/** Change an element's per-element props without re-attaching it. */
export const setProps = (el, props) => {
  const a = auto.get(el);
  if (a) a.raw = el.getAttribute(PROPS_ATTR) || ''; // (so the attribute watcher doesn't undo it)
  setGlassProps(el, props);
};
/** An element's current per-element props (a copy), or null. */
export const getProps = (el) => getGlassProps(el);
/** Change some per-element props, keeping the rest. */
export const mergeProps = (el, partial) => {
  const a = auto.get(el);
  if (a) a.raw = el.getAttribute(PROPS_ATTR) || ''; // (as setProps)
  mergeGlassProps(el, partial);
};
export { createSwitch, createSlider, createCheckbox, createRadio, createTextField, createTabBar, createSidebar, createProgress, createSquish };
export { createShapeSpring, glassMorph };
/** Register <glass-ui> (start() already does) — or the same element under another name. */
export const defineElement = (name) => defineGlassElement(name);
export const configure = (config) => configureGlass(config);
export const addPresets = (config) => addGlassPresets(config);
export const getConfig = () => getGlassConfig();
export const requestRender = () => requestGlassRender();
export const reserveSnapshotArea = (key, rect) => reserveArea(key, rect);
export const status = () => getStatus();
export { GLASS_VERSION as version } from './index';
export const onStatus = (fn) => subscribeStatus(fn);
export const quality = () => getGlassQuality();
export const onQuality = (fn) => subscribeGlassQuality(fn);

// --- Declarative glass: data-glassparency="<group>" -------------------------------------

function startAuto() {
  if (observer) return;
  scan(document.body);
  observer = new MutationObserver((records) => {
    let removed = false;
    for (const r of records) {
      if (r.type === 'attributes') {
        if (widgets.has(r.target)) refreshWidget(r.target);
        else if (r.target.matches?.(WIDGETS)) widget(r.target);
        if (inputs.has(r.target)) refreshInput(r.target);
        else if (r.attributeName === ATTR || r.attributeName === PROPS_ATTR) sync(r.target);
        else if (r.target.matches?.(CONTROLS)) enhance(r.target);
      }
      else {
        r.addedNodes.forEach((n) => n.nodeType === 1 && scan(n));
        if (r.removedNodes.length) removed = true;
      }
    }
    // Elements taken out of the page lose their glass (checked after the
    // whole batch, so an element that was only MOVED keeps it).
    if (removed) {
      for (const [el, a] of auto) {
        if (!el.isConnected) {
          a.handle.destroy();
          auto.delete(el);
        }
      }
      for (const input of [...inputs.keys()]) if (!input.isConnected) unenhance(input);
      for (const el of [...widgets.keys()]) if (!el.isConnected) unwidget(el);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [ATTR, PROPS_ATTR, SWITCH_ATTR, SLIDER_ATTR, 'disabled', 'min', 'max', 'step', 'value', ...Object.values(W).map((w) => w.attr)],
  });
}

/** Attach every data-glassparency element (and glass control input) in (and including) `node`. */
function scan(node) {
  if (node.matches?.(`[${ATTR}]`)) sync(node);
  node.querySelectorAll?.(`[${ATTR}]`).forEach(sync);
  if (node.matches?.(CONTROLS)) enhance(node);
  node.querySelectorAll?.(CONTROLS).forEach(enhance);
  if (node.matches?.(WIDGETS)) widget(node);
  node.querySelectorAll?.(WIDGETS).forEach(widget);
}

// --- Native inputs → glass switches / sliders --------------------------------------------

/** Swap a marked checkbox / range input for a glass control (the input stays, hidden). */
function enhance(input) {
  if (inputs.has(input) || !input.isConnected) return;
  const isSwitch = input.type === 'checkbox' && input.hasAttribute(SWITCH_ATTR);
  const isSlider = input.type === 'range' && input.hasAttribute(SLIDER_ATTR);
  if (!isSwitch && !isSlider) return;
  const widget = document.createElement(isSwitch ? 'button' : 'div');
  if (isSwitch) widget.type = 'button';
  // Name it like the input: aria-label, or the text of its <label>.
  const name = input.getAttribute('aria-label') || [...(input.labels || [])].map((l) => l.textContent.trim()).join(' ');
  if (name) widget.setAttribute('aria-label', name);
  if (input.hasAttribute('aria-describedby')) widget.setAttribute('aria-describedby', input.getAttribute('aria-describedby'));
  const cls = input.getAttribute('data-glassparency-class');
  if (cls) widget.className = cls;
  input.after(widget);
  input.style.display = 'none';
  const fire = (type) => input.dispatchEvent(new Event(type, { bubbles: true }));
  const num = (v, d) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));
  const ctl = isSwitch
    ? createSwitch(widget, {
        checked: input.checked,
        disabled: input.disabled,
        onChange: (v) => {
          input.checked = v;
          fire('input');
          fire('change');
        },
      })
    : createSlider(widget, {
        value: Number(input.value),
        min: num(input.min, 0),
        max: num(input.max, 100),
        step: input.step === 'any' ? 0.000001 : num(input.step, 1),
        disabled: input.disabled,
        onChange: (v) => {
          input.value = String(v);
          fire('input');
        },
        onChangeEnd: () => fire('change'),
      });
  // The input changed by itself (its <label> clicked, a script set it and
  // fired an event): follow it.
  const follow = () => refreshInput(input);
  input.addEventListener('change', follow);
  input.addEventListener('input', follow);
  inputs.set(input, { widget, ctl, isSwitch, off: () => (input.removeEventListener('change', follow), input.removeEventListener('input', follow)) });
}

/** Bring a glass control in line with its input (value, disabled, range). */
function refreshInput(input) {
  const e = inputs.get(input);
  if (!e) return;
  if (!input.hasAttribute(e.isSwitch ? SWITCH_ATTR : SLIDER_ATTR)) {
    unenhance(input);
    return;
  }
  if (e.isSwitch) e.ctl.update({ checked: input.checked, disabled: input.disabled });
  else {
    const n = (v, d) => (v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
    e.ctl.update({ value: Number(input.value), min: n(input.min, 0), max: n(input.max, 100), step: n(input.step, 1), disabled: input.disabled });
  }
}

/** Put a native input back the way it was. */
function unenhance(input) {
  const e = inputs.get(input);
  if (!e) return;
  e.off();
  e.ctl.destroy();
  e.widget.remove();
  input.style.removeProperty('display');
  inputs.delete(input);
}

/** Bring one element's glass in line with its attributes. */
function sync(el) {
  const group = (el.getAttribute(ATTR) || '').trim();
  const raw = el.getAttribute(PROPS_ATTR) || '';
  const current = auto.get(el);
  if (!group || !el.isConnected) {
    if (current) {
      current.handle.destroy();
      auto.delete(el);
    }
    return;
  }
  if (current && current.group === group) {
    if (current.raw !== raw) {
      current.raw = raw;
      current.handle.setProps(parseProps(raw, el));
    }
    return;
  }
  current?.handle.destroy();
  auto.set(el, { group, raw, handle: attachGlass(el, group, parseProps(raw, el)) });
}

/** data-glassparency-props JSON → props ({} when empty or invalid, with a warning). */
function parseProps(raw, el) {
  if (!raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    console.warn(`glass: ${PROPS_ATTR} is not valid JSON — ignored`, el);
    return {};
  }
}

// --- Checkboxes, radios, text fields, tab bars, sidebars, progress bars ------------------

/** Which widget kind an element is marked as (or null). */
function kindOf(el) {
  for (const [kind, w] of Object.entries(W)) if (el.hasAttribute(w.attr) && (w.sel === '*' || el.matches(w.sel))) return kind;
  return null;
}

/** The glass box / dot / bar for a marked element. */
function widget(el) {
  if (widgets.has(el) || !el.isConnected) return;
  const kind = kindOf(el);
  if (!kind) return;
  const props = parseProps(el.getAttribute(PROPS_ATTR) || '', el);
  const fire = (target, type, detail) =>
    target.dispatchEvent(detail ? new CustomEvent(type, { bubbles: true, detail }) : new Event(type, { bubbles: true }));

  if (kind === 'checkbox' || kind === 'radio') {
    // A glass box after the (hidden) input; the input's <label> text stays.
    const box = document.createElement('button');
    box.type = 'button';
    const name = el.getAttribute('aria-label') || [...(el.labels || [])].map((l) => l.textContent.trim()).join(' ');
    if (name) box.setAttribute('aria-label', name);
    const cls = el.getAttribute('data-glassparency-class');
    if (cls) box.className = cls;
    el.after(box);
    el.style.display = 'none';
    const create = kind === 'checkbox' ? createCheckbox : createRadio;
    const ctl = create(box, {
      checked: el.checked,
      disabled: el.disabled,
      name: kind === 'radio' ? `${el.form?.id || ''}|${el.name || ''}` : undefined,
      props: { box: props },
      onChange: (v) => {
        el.checked = kind === 'radio' ? true : v;
        fire(el, 'input');
        fire(el, 'change');
      },
    });
    // The input changed by itself (label clicked, a script…). A radio's
    // siblings don't get an event when it's picked: refresh the whole group.
    const follow = () => {
      if (kind === 'radio' && el.name) {
        for (const [other, w] of widgets) if (w.kind === 'radio' && other.name === el.name) refreshWidget(other);
      } else refreshWidget(el);
    };
    el.addEventListener('change', follow);
    widgets.set(el, { kind, raw: el.getAttribute(PROPS_ATTR) || '', ctl, extra: box, off: () => el.removeEventListener('change', follow) });
    return;
  }

  if (kind === 'progress') {
    // A glass bar after the (hidden) <progress>; follows its value / max.
    const bar = document.createElement('div');
    const cls = el.getAttribute('data-glassparency-class') || el.className;
    if (cls) bar.className = cls;
    el.after(bar);
    el.style.display = 'none';
    const ctl = createProgress(bar, { value: progressValue(el), bead: el.hasAttribute('data-glassparency-bead'), props: { track: props } });
    widgets.set(el, { kind, raw: el.getAttribute(PROPS_ATTR) || '', ctl, extra: bar, off: () => {} });
    return;
  }

  if (kind === 'field') {
    const ctl = createTextField(el, { clearable: el.hasAttribute('data-glassparency-clearable'), props: { field: props } });
    widgets.set(el, { kind, raw: el.getAttribute(PROPS_ATTR) || '', ctl, off: () => {} });
    return;
  }

  // Tab bar / sidebar: the children are the items unless some are marked.
  const marked = el.querySelector(':scope > [data-gp-item]');
  const items = marked ? [...el.querySelectorAll(':scope > [data-gp-item]')] : [...el.children];
  for (const it of items) it.setAttribute('data-gp-item', '');
  const selected = items.findIndex(
    (it) => it.getAttribute('aria-selected') === 'true' || (it.hasAttribute('aria-current') && it.getAttribute('aria-current') !== 'false') || it.hasAttribute('data-selected')
  );
  const create = kind === 'tabbar' ? createTabBar : createSidebar;
  const ctl = create(el, {
    value: Math.max(0, selected),
    props: { bar: props },
    onChange: (index) => fire(el, 'glassparency:change', { index }),
  });
  widgets.set(el, { kind, raw: el.getAttribute(PROPS_ATTR) || '', ctl, off: () => (marked ? null : items.forEach((it) => it.removeAttribute('data-gp-item'))) });
}

/** <progress> → 0–1, or null while it has no value (busy). */
function progressValue(el) {
  if (!el.hasAttribute('value')) return null;
  const max = Number(el.getAttribute('max')) > 0 ? Number(el.getAttribute('max')) : 1;
  return Math.min(1, Math.max(0, Number(el.getAttribute('value')) / max || 0));
}

/** Bring a widget in line with its element (unmarked → removed). */
function refreshWidget(el) {
  const w = widgets.get(el);
  if (!w) return;
  // Unmarked, marked as something else, or new props: build it again.
  if (kindOf(el) !== w.kind || (el.getAttribute(PROPS_ATTR) || '') !== w.raw) {
    unwidget(el);
    widget(el);
    return;
  }
  if (w.kind === 'checkbox' || w.kind === 'radio') w.ctl.update({ checked: el.checked, disabled: el.disabled });
  else if (w.kind === 'progress') w.ctl.update({ value: progressValue(el), bead: el.hasAttribute('data-glassparency-bead') });
  else w.ctl.update({});
}

/** Put a marked element back the way it was. */
function unwidget(el) {
  const w = widgets.get(el);
  if (!w) return;
  w.off();
  w.ctl.destroy();
  if (w.extra) {
    w.extra.remove();
    el.style.removeProperty('display');
  }
  widgets.delete(el);
}
