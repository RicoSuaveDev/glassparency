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
 * The newer controls (pickers.js, overlays.js):
 *   <div data-glassparency-segmented><button>Day</button><button aria-selected="true">Week</button>…</div>
 *   <input type="number" min="0" max="20" value="3" data-glassparency-stepper aria-label="Quantity">
 *   <div data-glassparency-range><input type="range" value="20"><input type="range" value="80"></div>   (two knobs)
 *   <div data-glassparency-range data-glassparency-vertical><input type="range" value="40"></div>        (standing up)
 *   <div data-glassparency-block><svg…/><input type="range" value="60"></div>   (Control Center; + data-glassparency-horizontal)
 *   <select data-glassparency-select aria-label="Sort"><option value="a">A</option>…</select>
 *   <button data-glassparency="button" data-glassparency-popover="info">Info</button>  <div id="info" hidden>…</div>
 *   <button data-glassparency="button" data-glassparency-menu="acts">Actions</button>
 *   <div id="acts" hidden><button role="menuitem">Copy</button>…</div>   → "glassparency:select" { index, item } on the button
 *   <button data-glassparency-tooltip="Share" aria-label="Share">…</button>
 *   <div id="details" data-glassparency-sheet data-glassparency-detents="0.4,0.9" hidden>…</div>
 *   <button data-glassparency-open="details">Details</button>   (opens a sheet, popover or menu by id)
 *   Glassparency.toast({ title: 'Saved', body: '…' })
 *   <div data-glassparency-scroll-edge="top soft" data-glassparency-scroll-edge-inset="56">…</div>
 *                              scroll edge effect on a scroll container (scrollEdge.js)
 * Glass that melts together (1.5.2): the glass INSIDE a marked container is
 * one liquid surface; pieces closer than the spacing (px) melt into a blob:
 *   <div data-glassparency-group="24"><button data-glassparency="iconButton">…</button>…</div>
 * Custom shapes (1.5.2) are ordinary props:
 *   <div data-glassparency="panel" data-glassparency-props='{"shape":{"path":"M12 2…","viewBox":"0 0 24 24"}}'></div>
 *   <button data-glassparency="iconButton" data-glassparency-props='{"shape":{"svg":"child"}}'><svg…/></button>
 *   <h1 data-glassparency="panel" data-glassparency-props='{"shape":{"text":true}}'>Liquid</h1>
 * A popover / menu / select panel's look: data-glassparency-panel-props='{…}'
 * on its button (data-glassparency-props there is the button's own glass).
 * Settings: window.GlassparencyConfig = {…} before the script, or
 * Glassparency.configure({…}) any time (same format as glass.config.json;
 * merged over the built-in presets).
 * Looks (ready-made themes — config.js "Looks"): clear, frosted, tinted, smoke:
 *   <html data-glassparency-look="frosted">          the whole page
 *   <div data-glassparency="card" data-glassparency-look="smoke">   one element
 *   data-glassparency-look-color="#ff2d55"           the tinted look's colour
 *   Glassparency.applyLook('tinted', { color: '#ff2d55' })   from JavaScript
 * (data-glassparency-look alone also gives an element glass, group "panel".)
 * CSS classes (the Tailwind plugin, "glassparency/tailwind", makes these —
 * any stylesheet may use them): an element with one of them gets glass, the
 * same as the attributes above (the attributes win where both are set):
 *   class="glass"                       glass, group "panel"
 *   class="glass-frosted" (-clear, -tinted, -smoke)   glass with that look
 *   class="glass-group-card"            the group ("glass-group-[myGroup]" too)
 *   --glassparency-look-color: …        (CSS) the tinted look's colour
 *                                       (Tailwind: glass-tint-rose-500)
 * Turn class detection off with start({ classes: false }) (or a
 * data-no-classes attribute on the <script> tag).
 *
 * JavaScript API (window.Glassparency in the script build). Every function
 * also has the module's name — attachGlass, setGlassProps, getGlassProps,
 * mergeGlassProps, defineGlassElement, configureGlass, addGlassPresets,
 * getGlassConfig, requestGlassRender, getGlassStatus / subscribeGlassStatus,
 * getGlassQuality / subscribeGlassQuality, GLASS_VERSION — the short names
 * below are aliases of those:
 *   start({ config, auto = true, classes = true, look, provider = true, injectStyles = true, nonce })   begin
 *                              look: the page look (as applyLook); provider: false =
 *                              only attach (a React app that renders <GlassProvider> itself)
 *   stop()                                                       remove all glass
 *   attach(el, group, props) → { setProps(props), destroy() }    by hand
 *   setProps(el, props)        change an element's look without re-attaching
 *   createSwitch(el, opts) / createSlider(el, opts)   controls by hand (controls.js)
 *   createCheckbox / createRadio / createTextField / createTabBar /
 *   createSidebar / createProgress (el, opts)          the other controls (widgets.js)
 *   createSegmented / createStepper / createRangeSlider / createBlockSlider (el, opts)
 *                              segmented control, stepper, range / vertical / block sliders
 *   createPopover / createMenu / createSelect (button, panel, opts), createTooltip(el, opts),
 *   createSheet(el, opts), createToaster(opts), getGlassOverlay()   overlays (overlays.js)
 *   toast({ title, body, icon, duration, props })   a toast (one shared toaster)
 *   open(elOrId) / close(elOrId)   open / close a marked sheet, popover or menu
 *   createSquish(el, readCfg)  squish & stretch for anything you move yourself
 *   createShapeSpring(el, opts)  spring an element between shapes (motion.js)
 *   glassMorph(from, to, opts) liquid-morph one element into another (motion.js)
 *   createGlassGroup(el, { spacing }) → { setSpacing(px), destroy() }   glass that melts (blendGroup.js)
 *   getProps(el) / mergeProps(el, partial)   read / change SOME per-element props
 *   <glass-ui group="card" props='{…}'>  glass as an element (element.js),
 *                              registered by start(); defineElement(name) by hand
 *   configure(config)          merge a config over the built-in one
 *   applyLook(name, { color }) → undo()   the page look (null = none); getLook(); LOOKS
 *   addPresets(config) → remove()   extra groups under configure() (kept by it)
 *   getConfig()                the config in use
 *   requestRender()            redraw now (after moving elements yourself)
 *   reserveSnapshotArea(key, rect | null)
 *   status() / onStatus(fn)    'loading' | 'on' | 'fallback' (+ reason)
 *   quality() / onQuality(fn)  { level: 'high' | 'medium' | 'low', auto, fps }
 *   power() / onPower(fn)      { enabled, hidden, reducedMotion, lowBattery } (power.js)
 *   loseGlassContext(opts)     test: lose + restore every glass canvas's WebGL context
 *   version                    the package version
 * =============================================================================
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import GlassProvider, { ensureGlassStyles } from './GlassProvider';
import { attachGlass, getGlassProps, mergeGlassProps, setGlassProps } from './useGlass';
import { createShapeSpring, glassMorph } from './motion';
import { defineGlassElement } from './element';
import { getGlassQuality, subscribeGlassQuality } from './quality';
import { getGlassPower, subscribeGlassPower } from './power';
import { loseGlassContext } from './devtools';
import { addGlassPresets, applyGlassLook, configureGlass, getGlassConfig, getGlassLook, LOOK_NAMES } from './config';
import { getStatus, requestRender as requestGlassRender, subscribeStatus } from './registry';
import { reserveSnapshotArea as reserveArea } from './snapshot';
import { createSlider, createSwitch } from './controls';
import { createCheckbox, createProgress, createRadio, createSidebar, createTabBar, createTextField } from './widgets';
import { createSquish } from './squish';
import { createBlockSlider, createRangeSlider, createSegmented, createStepper } from './pickers';
import { createMenu, createPopover, createSelect, createSheet, createToaster, createTooltip, getGlassOverlay } from './overlays';
import { createScrollEdge } from './scrollEdge';
import { enableTiltHighlight } from './lightFollow';
import { createGlassGroup } from './blendGroup';

/** Declarative attributes. */
const ATTR = 'data-glassparency';
const PROPS_ATTR = 'data-glassparency-props';
// Looks (config.js "Looks"): on a glass element = its look; on <html> /
// <body> = the page look. The colour is the tinted look's.
const LOOK_ATTR = 'data-glassparency-look';
const LOOK_COLOR_ATTR = 'data-glassparency-look-color';
// CSS classes that mean "glass here" (the Tailwind plugin's; see the header).
// A look class implies glass, like the plain "glass" class.
const LOOK_CLASSES = { 'glass-clear': 'clear', 'glass-frosted': 'frosted', 'glass-tinted': 'tinted', 'glass-smoke': 'smoke' };
const GROUP_CLASS = 'glass-group-'; // glass-group-card, glass-group-[myGroup]
const CLASS_SEL = ['.glass', ...Object.keys(LOOK_CLASSES).map((c) => `.${c}`), `[class*="${GROUP_CLASS}"]`].join(', ');
const LOOK_COLOR_VAR = '--glassparency-look-color';
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
  // The newer controls (pickers.js, overlays.js).
  segmented: { attr: 'data-glassparency-segmented', sel: '*' },
  stepper: { attr: 'data-glassparency-stepper', sel: 'input' },
  range: { attr: 'data-glassparency-range', sel: '*' },
  block: { attr: 'data-glassparency-block', sel: '*' },
  select: { attr: 'data-glassparency-select', sel: 'select' },
  popover: { attr: 'data-glassparency-popover', sel: '*' },
  menu: { attr: 'data-glassparency-menu', sel: '*' },
  tooltip: { attr: 'data-glassparency-tooltip', sel: '*' },
  sheet: { attr: 'data-glassparency-sheet', sel: '*' },
  // Scroll edge effect on a scroll container (scrollEdge.js): "top" | "bottom" | "both" [+ "soft" | "hard"].
  scrolledge: { attr: 'data-glassparency-scroll-edge', sel: '*' },
};
const PANEL_PROPS_ATTR = 'data-glassparency-panel-props'; // a popover / menu / select panel's look
const GROUP_ATTR = 'data-glassparency-group'; // a glass group container: spacing in px (blendGroup.js)
const OPEN_ATTR = 'data-glassparency-open'; // a button that opens a sheet / popover / menu by id
const WIDGETS = Object.values(W)
  .map((w) => (w.sel === '*' ? `[${w.attr}]` : `${w.sel}[${w.attr}]`))
  .join(', ');
const widgets = new Map(); // element → { kind, ctl, off } (glass checkboxes, radios, fields, bars, progress)

let reactRoot = null; // the React root running <GlassProvider>
let container = null; // its (empty) element in <body>
let observer = null; // watches the page for data-glassparency elements
let classes = true; // also detect the glass CSS classes (start({ classes: false }) = attributes only)
let pageLookUndo = null; // set while <html> / <body> data-glassparency-look sets the page look
const auto = new Map(); // element → { group, raw, handle } (declarative glass)
const inputs = new Map(); // native input → { widget, ctl, off } (glass switches / sliders)
const groups = new Map(); // container → createGlassGroup handle (data-glassparency-group)

/**
 * Start the glass on this page (safe to call more than once).
 * @param {{config?: object, auto?: boolean, injectStyles?: boolean, nonce?: string}} [options]
 */
export function start(options = {}) {
  if (typeof document === 'undefined') return;
  if (options.config !== undefined) configureGlass(options.config);
  // The page look, if asked for (the same as applyLook; null = none).
  if (options.look !== undefined) {
    const l = options.look && typeof options.look === 'object' ? options.look : { name: options.look };
    applyGlassLook(l.name ?? null, { color: l.color });
  }
  if (!document.body) {
    // Loaded from <head>: wait for <body>.
    document.addEventListener('DOMContentLoaded', () => start({ ...options, config: undefined, look: undefined }), { once: true });
    return;
  }
  // (read before the first scan; to change it later: stop(), then start())
  if (!observer && options.classes !== undefined) classes = options.classes !== false;
  // provider: false — a page that already runs <GlassProvider> (a React /
  // Next.js app using the classes or attributes): only attach, no 2nd provider.
  if (!reactRoot && options.provider !== false) {
    container = document.createElement('div');
    container.setAttribute('data-glass-host', 'provider'); // the glass's own node: page watchers skip it
    container.setAttribute('data-glass-ignore', '');
    document.body.appendChild(container);
    reactRoot = createRoot(container);
    // glass.css goes in NOW, not when React gets round to the provider's
    // effect: startAuto() below builds the switches / sliders straight away,
    // and they must be measured with our CSS already applied (see
    // ensureGlassStyles in GlassProvider.jsx).
    if (options.injectStyles ?? true) ensureGlassStyles(options.nonce);
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
  for (const g of groups.values()) g.destroy();
  groups.clear();
  toaster?.destroy();
  toaster = null;
  pageLookUndo?.();
  pageLookUndo = null;
  document.removeEventListener('click', openerClick);
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
  if (a) a.raw = rawOf(el); // (so the attribute watcher doesn't undo it)
  setGlassProps(el, props);
};
/** An element's current per-element props (a copy), or null. */
export const getProps = (el) => getGlassProps(el);
/** Change some per-element props, keeping the rest. */
export const mergeProps = (el, partial) => {
  const a = auto.get(el);
  if (a) a.raw = rawOf(el); // (as setProps)
  mergeGlassProps(el, partial);
};
export { createSwitch, createSlider, createCheckbox, createRadio, createTextField, createTabBar, createSidebar, createProgress, createSquish };
export { createSegmented, createStepper, createRangeSlider, createBlockSlider };
export { createPopover, createMenu, createSelect, createTooltip, createSheet, createToaster, getGlassOverlay };
// Scroll edge effect + the iOS tilt-permission helper (scrollEdge.js, lightFollow.js).
export { createScrollEdge, enableTiltHighlight };

let toaster = null; // the shared toaster behind toast()
/** Show a toast ({ title, body, icon, duration, props }); returns a function that dismisses it. */
export const toast = (t) => (toaster ||= createToaster()).show(t);

/** A marked sheet / popover / menu, by element or id. */
const markedCtl = (target) => {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return null;
  if (widgets.has(el)) return widgets.get(el).ctl;
  // A popover / menu panel: find the button that points at it.
  for (const [btn, w] of widgets) if ((w.kind === 'popover' || w.kind === 'menu') && btn.getAttribute(W[w.kind].attr) === el.id) return w.ctl;
  return null;
};
/** Open a marked sheet (or popover / menu) — by element or id. */
export const open = (target) => markedCtl(target)?.open?.();
/** Close a marked sheet (or popover / menu) — by element or id. */
export const close = (target) => markedCtl(target)?.close?.();
export { createShapeSpring, glassMorph, createGlassGroup };
/** Register <glass-ui> (start() already does) — or the same element under another name. */
export const defineElement = (name) => defineGlassElement(name);
export const configure = (config) => configureGlass(config);
/** The page look: 'clear' | 'frosted' | 'tinted' | 'smoke' (null = none) — see config.js "Looks". */
export const applyLook = (name, options) => applyGlassLook(name, options);
/** The page look in use ({ name, color }) or null. */
export const getLook = () => getGlassLook();
/** The built-in look names. */
export const LOOKS = LOOK_NAMES;
export const addPresets = (config) => addGlassPresets(config);
export const getConfig = () => getGlassConfig();
export const requestRender = () => requestGlassRender();
export const reserveSnapshotArea = (key, rect) => reserveArea(key, rect);
export const status = () => getStatus();
export { GLASS_VERSION as version } from './index';
export const onStatus = (fn) => subscribeStatus(fn);
export const quality = () => getGlassQuality();
export const onQuality = (fn) => subscribeGlassQuality(fn);
export const power = () => getGlassPower();
export const onPower = (fn) => subscribeGlassPower(fn);
// (A debugging helper — the module build has it in "glassparency/devtools".)
export { loseGlassContext };

// One vocabulary: the script build has the module's names too (the same
// functions as above), so code moves between `import … from "glassparency"`
// and window.Glassparency unchanged. The short names stay as aliases.
export {
  attach as attachGlass,
  setProps as setGlassProps,
  getProps as getGlassProps,
  mergeProps as mergeGlassProps,
  defineElement as defineGlassElement,
  configure as configureGlass,
  addPresets as addGlassPresets,
  getConfig as getGlassConfig,
  requestRender as requestGlassRender,
  status as getGlassStatus,
  onStatus as subscribeGlassStatus,
  quality as getGlassQuality,
  onQuality as subscribeGlassQuality,
  power as getGlassPower,
  onPower as subscribeGlassPower,
  applyLook as applyGlassLook,
  getLook as getGlassLook,
  LOOKS as GLASS_LOOKS,
};
export { GLASS_VERSION } from './index';

// --- Declarative glass: data-glassparency="<group>" -------------------------------------

function startAuto() {
  if (observer) return;
  document.addEventListener('click', openerClick);
  syncPageLook(); // (before the scan: the glass is resolved with it from the start)
  scan(document.body);
  observer = new MutationObserver((records) => {
    let removed = false;
    for (const r of records) {
      if (r.type === 'attributes') {
        // <html> / <body> data-glassparency-look: the page look.
        if ((r.target === document.documentElement || r.target === document.body) && (r.attributeName === LOOK_ATTR || r.attributeName === LOOK_COLOR_ATTR)) {
          syncPageLook();
          continue;
        }
        // A class change: only elements that are (or become) class glass matter
        // (class changes are frequent on most sites — everything else is skipped).
        if (r.attributeName === 'class') {
          if (widgets.has(r.target)) refreshWidget(r.target); // (a control's look class)
          else if (auto.has(r.target) || r.target.matches?.(CLASS_SEL)) sync(r.target);
          continue;
        }
        if (widgets.has(r.target)) refreshWidget(r.target);
        else if (r.target.matches?.(WIDGETS)) widget(r.target);
        if (r.attributeName === GROUP_ATTR) syncGroup(r.target);
        else if (inputs.has(r.target)) refreshInput(r.target);
        else if (r.attributeName === ATTR || r.attributeName === PROPS_ATTR || r.attributeName === LOOK_ATTR || r.attributeName === LOOK_COLOR_ATTR) sync(r.target);
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
      for (const el of [...groups.keys()]) if (!el.isConnected) syncGroup(el);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      ATTR, PROPS_ATTR, LOOK_ATTR, LOOK_COLOR_ATTR, SWITCH_ATTR, SLIDER_ATTR, GROUP_ATTR, 'disabled', 'min', 'max', 'step', 'value',
      ...Object.values(W).map((w) => w.attr),
      ...(classes ? ['class'] : []),
    ],
  });
  // <html> isn't inside <body>: watched on its own (its look attributes only).
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [LOOK_ATTR, LOOK_COLOR_ATTR] });
}

/**
 * <html> / <body> data-glassparency-look="…" → the page look (<body> wins).
 * Only while the attribute is there: removing it puts back whatever look
 * the page had before (applyLook / start({ look }) / the config's).
 */
function syncPageLook() {
  const from = [document.body, document.documentElement].find((n) => n?.hasAttribute(LOOK_ATTR));
  pageLookUndo?.();
  pageLookUndo = null;
  if (!from) return;
  const color = from.getAttribute(LOOK_COLOR_ATTR) || undefined;
  pageLookUndo = applyGlassLook(from.getAttribute(LOOK_ATTR) || null, { color });
}

/** A click on a data-glassparency-open="<id>" button opens that sheet / popover / menu. */
function openerClick(e) {
  const btn = e.target.closest?.(`[${OPEN_ATTR}]`);
  if (!btn) return;
  const ctl = markedCtl(btn.getAttribute(OPEN_ATTR));
  if (ctl) {
    e.preventDefault();
    ctl.open();
  }
}

/** Attach every data-glassparency element (and glass control input) in (and including) `node`. */
function scan(node) {
  if (node.matches?.(`[${GROUP_ATTR}]`)) syncGroup(node);
  node.querySelectorAll?.(`[${GROUP_ATTR}]`).forEach(syncGroup);
  const sel = glassSel();
  if (node.matches?.(sel)) sync(node);
  node.querySelectorAll?.(sel).forEach(sync);
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
  const group = groupOf(el);
  const raw = rawOf(el);
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
      current.handle.setProps(elementProps(el));
    }
    return;
  }
  current?.handle.destroy();
  auto.set(el, { group, raw, handle: attachGlass(el, group, elementProps(el)) });
}

/** Elements that get glass: data-glassparency, data-glassparency-look, and (unless off) the glass classes. */
const glassSel = () => `[${ATTR}], [${LOOK_ATTR}]${classes ? `, ${CLASS_SEL}` : ''}`;

/**
 * An element's glass group ('' = no glass): data-glassparency="<group>";
 * else, for an element marked only by a look (attribute or class) or the
 * classes, glass-group-<name> / glass-group-[name], or "panel".
 * (<html> / <body>: a look there is the PAGE look, not glass on them;
 * <glass-ui> is its own glass.)
 */
function groupOf(el) {
  const attr = (el.getAttribute(ATTR) || '').trim();
  if (attr) return attr;
  if (el === document.documentElement || el === document.body || el.localName === 'glass-ui') return '';
  // A marked control (data-glassparency-tabbar…) with a look: the look is the
  // control's (elementProps), not a 2nd glass on the same element.
  if (el.matches(WIDGETS) || el.matches(CONTROLS)) return '';
  const cls = classes ? [...el.classList] : [];
  const marked = el.hasAttribute(LOOK_ATTR) || cls.some((c) => c === 'glass' || c in LOOK_CLASSES || c.startsWith(GROUP_CLASS));
  if (!marked) return '';
  const g = cls.find((c) => c.startsWith(GROUP_CLASS));
  return g ? g.slice(GROUP_CLASS.length).replace(/^\[(.*)\]$/, '$1') || 'panel' : 'panel';
}

/** An element's look: data-glassparency-look, else a look class ('' = none of its own). */
function lookOf(el) {
  const attr = el.getAttribute(LOOK_ATTR);
  if (attr !== null) return attr.trim();
  if (!classes) return '';
  for (const c of el.classList) if (c in LOOK_CLASSES) return LOOK_CLASSES[c];
  return '';
}

/** What decides an element's props (compared to skip needless updates). */
const rawOf = (el) => `${el.getAttribute(PROPS_ATTR) || ''}\u0001${lookOf(el)}\u0001${el.getAttribute(LOOK_COLOR_ATTR) || ''}`;

/**
 * An element's per-element props: data-glassparency-props, plus its look
 * (data-glassparency-look / a look class) and the tinted colour
 * (data-glassparency-look-color, else the CSS variable --glassparency-look-color —
 * what the Tailwind plugin's glass-tint-* classes set). A "look" inside the
 * props JSON wins.
 */
function elementProps(el) {
  const p = parseProps(el.getAttribute(PROPS_ATTR) || '', el);
  const look = lookOf(el);
  if (look && p.look === undefined) p.look = look;
  if (p.lookColor === undefined) {
    let color = el.getAttribute(LOOK_COLOR_ATTR) || '';
    if (!color && (p.look || look) === 'tinted') {
      try {
        color = getComputedStyle(el).getPropertyValue(LOOK_COLOR_VAR).trim();
      } catch {
        color = ''; // (not rendered yet — the look's default colour)
      }
    }
    if (color) p.lookColor = color;
  }
  return p;
}

/** A data-glassparency-group container: make, update or remove its glass group. */
function syncGroup(el) {
  const g = groups.get(el);
  const on = el.isConnected && el.hasAttribute(GROUP_ATTR);
  if (!on) {
    g?.destroy();
    groups.delete(el);
    return;
  }
  const raw = el.getAttribute(GROUP_ATTR);
  const spacing = raw === '' || !Number.isFinite(Number(raw)) ? undefined : Number(raw);
  if (g) g.setSpacing(spacing ?? 24);
  else groups.set(el, createGlassGroup(el, { spacing }));
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
  const props = elementProps(el); // (data-glassparency-props + its look, if any)
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
    widgets.set(el, { kind, raw: rawOf(el), ctl, extra: box, off: () => el.removeEventListener('change', follow) });
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
    widgets.set(el, { kind, raw: rawOf(el), ctl, extra: bar, off: () => {} });
    return;
  }

  if (kind === 'field') {
    const ctl = createTextField(el, { clearable: el.hasAttribute('data-glassparency-clearable'), props: { field: props } });
    widgets.set(el, { kind, raw: rawOf(el), ctl, off: () => {} });
    return;
  }

  if (kind in NEW_KINDS) {
    const made = NEW_KINDS[kind](el, props, fire);
    if (made) widgets.set(el, { kind, raw: rawOf(el), ...made });
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
  widgets.set(el, { kind, raw: rawOf(el), ctl, off: () => (marked ? null : items.forEach((it) => it.removeAttribute('data-gp-item'))) });
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
  if (kindOf(el) !== w.kind || rawOf(el) !== w.raw) {
    unwidget(el);
    widget(el);
    return;
  }
  if (w.kind === 'checkbox' || w.kind === 'radio') w.ctl.update({ checked: el.checked, disabled: el.disabled });
  else if (w.kind === 'progress') w.ctl.update({ value: progressValue(el), bead: el.hasAttribute('data-glassparency-bead') });
  else if (w.refresh) w.refresh();
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

// --- Segmented, stepper, range / block sliders, select, popover, menu, tooltip, sheet -------

/** A number from an attribute / input value, or d. */
const numOr = (v, d) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));
/** min / max / step of a range or number input. */
const limitsOf = (input, dMax = 100) => ({
  min: numOr(input?.getAttribute('min'), 0),
  max: numOr(input?.getAttribute('max'), dMax),
  step: input?.getAttribute('step') === 'any' ? 0.000001 : numOr(input?.getAttribute('step'), 1),
});
/** Name a made control like its source: aria-label, or its <label>'s text. */
function nameLike(target, src) {
  const name = src.getAttribute('aria-label') || [...(src.labels || [])].map((l) => l.textContent.trim()).join(' ');
  if (name) target.setAttribute('aria-label', name);
  const cls = src.getAttribute('data-glassparency-class');
  if (cls) target.className = cls;
}
const placementOf = (el) => ({
  placement: el.getAttribute('data-glassparency-placement') || undefined,
  align: el.getAttribute('data-glassparency-align') || undefined,
});

/**
 * kind → (el, props, fire) → { ctl, extra?, off, refresh? } (or null: not usable yet).
 * `extra` is a made element that unwidget removes (and shows `el` again).
 */
const NEW_KINDS = {
  // Children are the segments (or only those marked data-gp-item), like a tab bar.
  segmented(el, props, fire) {
    const marked = el.querySelector(':scope > [data-gp-item]');
    const items = marked ? [...el.querySelectorAll(':scope > [data-gp-item]')] : [...el.children];
    for (const it of items) it.setAttribute('data-gp-item', '');
    const selected = items.findIndex((it) => it.getAttribute('aria-selected') === 'true' || it.hasAttribute('data-selected'));
    const ctl = createSegmented(el, { value: Math.max(0, selected), props: { bar: props }, onChange: (index) => fire(el, 'glassparency:change', { index }) });
    return { ctl, off: () => (marked ? null : items.forEach((it) => it.removeAttribute('data-gp-item'))) };
  },

  // <input type="number"> → a glass stepper after it (the input stays, hidden and in sync).
  stepper(el, props, fire) {
    const box = document.createElement('div');
    nameLike(box, el);
    el.after(box);
    el.style.display = 'none';
    const lim = limitsOf(el);
    const ctl = createStepper(box, {
      value: numOr(el.value, lim.min),
      ...lim,
      disabled: el.disabled,
      wrap: el.hasAttribute('data-glassparency-wrap'),
      props: { body: props },
      onChange: (v) => {
        el.value = String(v);
        fire(el, 'input');
        fire(el, 'change');
      },
    });
    const follow = () => ctl.update({ value: numOr(el.value, lim.min), ...limitsOf(el), disabled: el.disabled });
    el.addEventListener('change', follow);
    return { ctl, extra: box, off: () => el.removeEventListener('change', follow), refresh: follow };
  },

  // A wrapper round one or two <input type="range"> (two = two knobs; data-glassparency-vertical = standing up).
  range(el, props, fire) {
    const ins = [...el.querySelectorAll('input[type="range"]')].slice(0, 2);
    if (!ins.length) return null;
    const slider = document.createElement('div');
    nameLike(slider, el.hasAttribute('aria-label') ? el : ins[0]);
    for (const i of ins) i.style.display = 'none';
    el.appendChild(slider);
    const lim = limitsOf(ins[0]);
    const valueNow = () => (ins.length === 2 ? [numOr(ins[0].value, lim.min), numOr(ins[1].value, lim.max)] : numOr(ins[0].value, lim.min));
    const ctl = createRangeSlider(slider, {
      value: valueNow(),
      ...lim,
      orientation: el.hasAttribute('data-glassparency-vertical') ? 'vertical' : 'horizontal',
      disabled: ins[0].disabled,
      props: { track: props },
      onChange: (v) => {
        const vals = Array.isArray(v) ? v : [v];
        ins.forEach((i, k) => {
          i.value = String(vals[k]);
          fire(i, 'input');
        });
      },
      onChangeEnd: () => ins.forEach((i) => fire(i, 'change')),
    });
    const follow = () => ctl.update({ value: valueNow(), disabled: ins[0].disabled });
    for (const i of ins) i.addEventListener('change', follow);
    return {
      ctl,
      off: () => {
        for (const i of ins) {
          i.removeEventListener('change', follow);
          i.style.removeProperty('display');
        }
        slider.remove();
      },
      refresh: follow,
    };
  },

  // A block (its icon stays) round an optional <input type="range"> (kept hidden and in sync).
  block(el, props, fire) {
    const input = el.querySelector('input[type="range"]');
    if (input) input.style.display = 'none';
    const lim = limitsOf(input);
    const ctl = createBlockSlider(el, {
      value: numOr(input?.value, numOr(el.getAttribute('data-glassparency-value'), lim.min)),
      ...lim,
      orientation: el.hasAttribute('data-glassparency-horizontal') ? 'horizontal' : 'vertical',
      disabled: Boolean(input?.disabled),
      props: { body: props },
      onChange: (v) => {
        if (input) {
          input.value = String(v);
          fire(input, 'input');
        }
        fire(el, 'glassparency:change', { value: v });
      },
      onChangeEnd: () => input && fire(input, 'change'),
    });
    const follow = () => input && ctl.update({ value: numOr(input.value, lim.min), disabled: input.disabled });
    input?.addEventListener('change', follow);
    return {
      ctl,
      off: () => {
        input?.removeEventListener('change', follow);
        input?.style.removeProperty('display');
      },
      refresh: follow,
    };
  },

  // <select> → a glass pop-up button + options panel (the <select> stays, hidden and in sync).
  select(el, props, fire) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-gp-select-trigger', '');
    nameLike(btn, el);
    const label = document.createElement('span');
    label.setAttribute('data-gp-select-label', '');
    btn.append(label);
    btn.insertAdjacentHTML('beforeend', '<svg data-gp-chevron viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    const panel = document.createElement('div');
    for (const o of el.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('data-value', o.value);
      if (o.disabled) b.setAttribute('aria-disabled', 'true');
      b.insertAdjacentHTML('beforeend', '<svg data-gp-check-mark viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.25 4.25L18.5 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
      const t = document.createElement('span');
      t.textContent = o.textContent;
      b.append(t);
      panel.append(b);
    }
    const showLabel = () => (label.textContent = el.selectedOptions[0]?.textContent || el.getAttribute('data-glassparency-placeholder') || 'Choose…');
    showLabel();
    el.after(btn);
    btn.after(panel);
    el.style.display = 'none';
    const btnGlass = attachGlass(btn, el.getAttribute('data-glassparency-trigger') || 'button', props);
    const ctl = createSelect(btn, panel, {
      value: el.value,
      props: parseProps(el.getAttribute(PANEL_PROPS_ATTR) || '', el),
      ...placementOf(el),
      onChange: (v) => {
        el.value = v;
        showLabel();
        fire(el, 'input');
        fire(el, 'change');
      },
    });
    const follow = () => {
      showLabel();
      ctl.update({ value: el.value });
    };
    el.addEventListener('change', follow);
    return {
      ctl,
      extra: btn,
      off: () => {
        el.removeEventListener('change', follow);
        btnGlass.destroy();
        panel.remove();
      },
      refresh: follow,
    };
  },

  // A button + its panel (by id). The button's own glass is data-glassparency="button" as usual.
  popover: (el, props, fire) => pairOf(el, 'popover', fire),
  menu: (el, props, fire) => pairOf(el, 'menu', fire),

  tooltip(el, props) {
    const ctl = createTooltip(el, { text: el.getAttribute(W.tooltip.attr) || undefined, placement: el.getAttribute('data-glassparency-placement') || undefined, props });
    return { ctl, off: () => {}, refresh: () => ctl.update({ text: el.getAttribute(W.tooltip.attr) || '' }) };
  },

  // A sheet panel: opened by data-glassparency-open="<id>" buttons or Glassparency.open(id).
  sheet(el, props, fire) {
    const detents = (el.getAttribute('data-glassparency-detents') || '')
      .split(',')
      .map(Number)
      .filter((d) => d > 0 && d <= 1);
    const ctl = createSheet(el, { detents: detents.length ? detents : undefined, props, onClose: () => fire(el, 'glassparency:close') });
    return { ctl, off: () => {} };
  },

  // A scroll container: data-glassparency-scroll-edge="top soft" (+ -size="32",
  // -inset="56" or "56 80" for top / bottom, -color="#fff"). On <body> / <html>:
  // the page's own scrolling.
  scrolledge(el) {
    const read = () => {
      const words = (el.getAttribute(W.scrolledge.attr) || '').trim().split(/\s+/);
      const inset = (el.getAttribute('data-glassparency-scroll-edge-inset') || '').trim().split(/\s+/).map(Number);
      return {
        edges: words.find((w) => w === 'top' || w === 'bottom' || w === 'both') || 'top',
        effect: words.includes('hard') ? 'hard' : 'soft',
        size: el.getAttribute('data-glassparency-scroll-edge-size') ?? undefined,
        inset: { top: inset[0] || 0, bottom: inset.length > 1 ? inset[1] || 0 : inset[0] || 0 },
        color: el.getAttribute('data-glassparency-scroll-edge-color') || 'auto',
      };
    };
    const ctl = createScrollEdge(el === document.body || el === document.documentElement ? window : el, read());
    return { ctl, off: () => {}, refresh: () => ctl.update(read()) };
  },
};

/** A popover / menu: the button (el) and its panel (the element with the id it names). */
function pairOf(el, kind, fire) {
  const panel = document.getElementById(el.getAttribute(W[kind].attr) || '');
  if (!panel) return null;
  const create = kind === 'menu' ? createMenu : createPopover;
  const ctl = create(el, panel, {
    props: parseProps(el.getAttribute(PANEL_PROPS_ATTR) || '', el),
    ...placementOf(el),
    onOpenChange: (open) => fire(el, 'glassparency:toggle', { open }),
    ...(kind === 'menu' ? { onSelect: (index, item) => fire(el, 'glassparency:select', { index, item }) } : {}),
  });
  return { ctl, off: () => {} };
}
