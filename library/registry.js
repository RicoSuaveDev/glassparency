/**
 * =============================================================================
 * glass/registry.js — Which page elements have glass, and on which layer
 * =============================================================================
 * Plain JavaScript (no three.js), so it lives in the main bundle and elements
 * can register before the WebGL part has even downloaded.
 *
 *   register(el, group, props)  → id     (called by useGlass)
 *   update(id, patch) / unregister(id)
 *   placement(id) → { layer, tier }       where the element's glass is drawn
 *   requestRender()                       ask every glass canvas to redraw
 *
 * Layers and tiers
 * ----------------
 * A LAYER is one transparent canvas stacked in the page (glass/config.js
 * LAYERS): "base" sits behind all page content, "float" sits under the
 * header / docks / menus, "modal" sits inside an open dialog, "top" sits
 * in front of the page content, under the floating UI (e.g. a glass orb).
 * A TIER is the order inside a layer: a button on a card is drawn after
 * (and refracts) the card.
 *
 * Both are worked out automatically from the DOM: an element takes the layer
 * of the nearest glass element around it and sits one tier above it. A group
 * can force a layer (the header says "float") in glass.config.json.
 * =============================================================================
 */
import { LAYERS, resolveGlass, subscribeConfig } from './config';

let nextId = 1;
const entries = new Map(); // id → entry
let structureVersion = 0; // bumps when elements come and go
const structureListeners = new Set();

/**
 * @typedef {object} GlassEntry
 * @property {number} id
 * @property {HTMLElement} el
 * @property {string} group
 * @property {object} props        per-element overrides
 * @property {{hover:boolean, pressed:boolean, disabled:boolean}} state
 * @property {boolean} [suspended]  slab not drawn for now (motion.js: a
 *           glassMorph target while the morph film plays — it is shown, with
 *           its glass, the moment the film lands on it)
 */

export function register(el, group, props = {}) {
  const id = nextId++;
  entries.set(id, { id, el, group, props, state: { hover: false, pressed: false, disabled: false } });
  el.dataset.glassId = String(id);
  structureChanged();
  return id;
}

export function update(id, patch) {
  const e = entries.get(id);
  if (!e) return;
  if (patch.state) e.state = { ...e.state, ...patch.state };
  if (patch.props) e.props = patch.props;
  if (patch.suspended !== undefined) e.suspended = Boolean(patch.suspended);
  if (patch.group && patch.group !== e.group) {
    e.group = patch.group;
    structureChanged(); // a new group can mean a new layer
    return;
  }
  e.propsVersion = (e.propsVersion || 0) + 1;
  notifyProps(id);
  requestRender();
}

export function unregister(id) {
  const e = entries.get(id);
  if (!e) return;
  if (e.el.dataset.glassId === String(id)) {
    delete e.el.dataset.glassId;
    delete e.el.dataset.glassDrawn; // (set by GlassCanvas once its slab is drawn)
  }
  entries.delete(id);
  structureChanged();
}

export const getEntry = (id) => entries.get(id);
export const allEntries = () => [...entries.values()];
export const getStructureVersion = () => structureVersion;

/** Called when elements are added/removed (canvases rebuild their mesh list). */
export function subscribeStructure(fn) {
  structureListeners.add(fn);
  return () => structureListeners.delete(fn);
}
function structureChanged() {
  structureVersion += 1;
  placements = null;
  structureListeners.forEach((fn) => fn(structureVersion));
  requestRender();
}

// Prop changes (hover, variant…) — canvases re-read props without rebuilding.
const propListeners = new Set();
export function subscribeProps(fn) {
  propListeners.add(fn);
  return () => propListeners.delete(fn);
}
/** id = the element whose props / state changed (live.js re-syncs only it). */
function notifyProps(id) {
  propListeners.forEach((fn) => fn(id));
}
subscribeConfig(() => {
  placements = null; // a group may have changed layer
  structureVersion += 1;
  structureListeners.forEach((fn) => fn(structureVersion));
  notifyProps();
  requestRender();
});

// --- Layer / tier of each element (cached until something changes) ---------------------
let placements = null; // Map id → { layer, tier }

/** { layer, tier } for an element (see the header comment). */
export function placement(id) {
  if (!placements) placements = computePlacements();
  return placements.get(id) || { layer: 'base', tier: 0 };
}

function computePlacements() {
  const map = new Map();
  const resolving = new Set();
  const place = (e) => {
    if (map.has(e.id)) return map.get(e.id);
    if (resolving.has(e.id)) return { layer: 'base', tier: 0 }; // (cycle guard)
    resolving.add(e.id);
    const cfg = resolveGlass(e.group, e.props);
    // Nearest glass element around this one (skip the element itself).
    const parentEl = e.el.parentElement?.closest('[data-glass-id]');
    const parent = parentEl ? entries.get(Number(parentEl.dataset.glassId)) : null;
    const up = parent ? place(parent) : null;
    const layer = cfg.layer !== 'auto' ? cfg.layer : up ? up.layer : 'base';
    // A forced layer that differs from the parent's starts again at tier 0.
    const tier = cfg.tier !== 'auto' ? cfg.tier : up && up.layer === layer ? up.tier + 1 : 0;
    const p = { layer, tier: Math.min(tier, 5) };
    map.set(e.id, p);
    resolving.delete(e.id);
    return p;
  };
  entries.forEach(place);
  return map;
}

export const layerIndex = (layer) => Math.max(0, LAYERS.indexOf(layer));

/** Is this DOM element the root of a non-base glass element? (snapshot skips those) */
export function isFloatingGlass(el) {
  const id = el?.dataset?.glassId;
  if (!id) return false;
  return placement(Number(id)).layer !== 'base';
}

// --- Layer hosts (where each layer's canvas is mounted) --------------------------------
// "base" and "float" are created by <GlassProvider>; "modal" (a dialog) and
// "top" (e.g. a glass orb) by <GlassLayerHost>
// inside an open dialog or the orb's own container.
//
// STACKED DIALOGS: a dialog opened from inside another (the "Delete this
// task?" confirm over the Edit task dialog) registers a second "modal" host.
// Each layer therefore keeps a STACK of hosts and the canvas lives in the
// newest one. When that dialog closes its host is popped and the canvas moves
// back to the dialog underneath. (This used to be one host per layer: the
// confirm replaced the editor's host, and closing it deleted the layer —
// the editor lost its glass until it was reopened.)
const hosts = new Map(); // layer → HTMLElement[] (last = where the canvas is)
const hostListeners = new Set();
export function registerHost(layer, el) {
  const stack = hosts.get(layer) || [];
  hosts.set(layer, [...stack.filter((h) => h !== el), el]);
  hostListeners.forEach((fn) => fn());
  return () => {
    const rest = (hosts.get(layer) || []).filter((h) => h !== el);
    if (rest.length) hosts.set(layer, rest);
    else hosts.delete(layer);
    hostListeners.forEach((fn) => fn());
  };
}
/** layer → the host element its canvas is mounted in (the top of its stack). */
export const getHosts = () => new Map([...hosts].map(([layer, stack]) => [layer, stack[stack.length - 1]]));
/**
 * Is this element's glass covered by a newer host of its own layer? (A dialog
 * under a confirm.) Its glass isn't drawn then — the only canvas is the top
 * dialog's, which sits ABOVE the covered dialog, so drawing the slabs there
 * would paint over that dialog's text. It keeps its own CSS look instead (under
 * the top dialog's dimmer) until the top dialog closes.
 */
export function isCoveredHost(layer, el) {
  const stack = hosts.get(layer);
  if (!stack || stack.length < 2) return false;
  const container = stack[stack.length - 1].parentElement;
  return Boolean(container && !container.contains(el));
}
export function subscribeHosts(fn) {
  hostListeners.add(fn);
  return () => hostListeners.delete(fn);
}

// --- Redraw requests ------------------------------------------------------------------------
// Canvases render on demand (nothing moves → no GPU work). Anything that could
// move or restyle glass calls requestRender(); holdRender(ms) keeps frames coming
// while a CSS animation/transition runs.
const renderers = new Set();
export function addRenderer(invalidate) {
  renderers.add(invalidate);
  return () => renderers.delete(invalidate);
}
export function requestRender() {
  renderers.forEach((fn) => fn());
}
let holdUntil = 0;
export function holdRender(ms) {
  holdUntil = Math.max(holdUntil, performance.now() + ms);
  requestRender();
}
export const isHolding = () => performance.now() < holdUntil;

// --- Named icons for <Glass icon="name"> ------------------------------------------------------
// The library has no icon set of its own: <GlassProvider renderIcon> hands
// it the app's (e.g. an <Icon name size /> component).
let iconRenderer = null;
export const setIconRenderer = (fn) => {
  iconRenderer = typeof fn === 'function' ? fn : null;
};
export const getIconRenderer = () => iconRenderer;

// --- Status + stats (for a live tuning / debug panel) -----------------------------------------
let status = { state: 'off', reason: 'not started' };
const statusListeners = new Set();
export function setStatus(state, reason = '') {
  status = { state, reason };
  statusListeners.forEach((fn) => fn(status));
}
export const getStatus = () => status;
export function subscribeStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export const stats = {
  frames: 0, // total frames drawn (all canvases)
  lastFrameMs: 0,
  snapshots: 0,
  lastSnapshotMs: 0,
  lastSnapshotAt: 0,
};
