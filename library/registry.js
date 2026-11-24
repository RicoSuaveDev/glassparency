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
import { LAYERS, getGlobal, resolveGlass, subscribeConfig } from './config';
import { groupOf } from './blendGroup';
import { isExactBackground, isImageBackdrop } from './pageBackground';
import { pausedWhileHidden, subscribeGlassPower } from './power';

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
  // A per-element layer / tier change moves the element to another canvas:
  // the cached placements are stale, and every canvas must pick its
  // elements again. (Only config and group changes did this — an element
  // moved by its props, e.g. a popover's button lifted into the overlay for
  // its morph and put back, stayed drawn on the old canvas and missing from
  // the new one.)
  let moved = false;
  if (patch.props) {
    const was = e.props || {};
    moved = was.layer !== patch.props.layer || was.tier !== patch.props.tier;
    // (1.5.2) A custom shape added or removed can move the element to another
    // layer too — see liquidNeedsFloat in computePlacements.
    if (!moved && JSON.stringify(was.shape ?? null) !== JSON.stringify(patch.props.shape ?? null)) moved = true;
    e.props = patch.props;
  }
  if (moved) {
    placements = null;
    structureChanged();
  }
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
  if (pinnedById.delete(id)) notifyPinned();
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
/**
 * Something outside the registry changed which layer elements belong on —
 * a glass group (blendGroup.js) was made or removed around them. Every
 * canvas picks its elements again.
 */
export function glassLayersChanged() {
  structureChanged();
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
    let layer = cfg.layer !== 'auto' ? cfg.layer : up ? up.layer : 'base';
    // (1.5.2) Glass that melts — a <GlassGroup> member, or a custom shape
    // (path / svg / text) — is drawn ONLY by the WebGL liquid shader. On the
    // base layer that shader can't see an image or gradient page background
    // unless the config gives an exact copy of it (global.background object,
    // or a picture the base canvas paints): the element would stay on its
    // CSS stand-in forever and never melt. So "auto" puts it on the float
    // layer, which refracts a picture of the real page. A layer set by the
    // group or element ("base" on purpose) is left alone.
    // The element's own HTML (a button's label) must then stack ABOVE the
    // float canvas, or the glass covers it: live.js lifts it ("lifted").
    const lifted = cfg.layer === 'auto' && layer === 'base' && liquidNeedsFloat(cfg, e.el);
    if (lifted) layer = 'float';
    // A forced layer that differs from the parent's starts again at tier 0.
    const tier = cfg.tier !== 'auto' ? cfg.tier : up && up.layer === layer ? up.tier + 1 : 0;
    const p = { layer, tier: Math.min(tier, 5), lifted };
    map.set(e.id, p);
    resolving.delete(e.id);
    return p;
  };
  entries.forEach(place);
  return map;
}

/**
 * (1.5.2) Must this base-layer element move to the float layer to be drawn?
 * Only melting glass (group members, custom shapes — never morph glass,
 * whose layer stays the site's choice as before), and only when the base
 * canvas has no exact copy of the page background.
 */
function liquidNeedsFloat(cfg, el) {
  if (cfg.morph || !(cfg.customShape || groupOf(el))) return false;
  const g = getGlobal();
  return !(isExactBackground(g.background) || isImageBackdrop(g.backgroundImage));
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
// inside an open dialog or the orb's own container. ("top" also has a
// provider-made fallback host — see registerFallbackHost below.)
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
// FALLBACK hosts: <GlassProvider> mounts a "top" host of its own (fixed to the
// window, z-index global.zIndex.top) so a tab bar — on layer "top" by
// default — gets real glass with no <GlassLayerHost> in the app. A host the
// app registers itself always wins over it, and fallbacks never count as
// "newer" hosts in isCoveredHost (the app's own host isn't covering anything).
const fallbackHosts = new Map(); // layer → HTMLElement
export function registerFallbackHost(layer, el) {
  fallbackHosts.set(layer, el);
  hostListeners.forEach((fn) => fn());
  return () => {
    if (fallbackHosts.get(layer) === el) fallbackHosts.delete(layer);
    hostListeners.forEach((fn) => fn());
  };
}
/** layer → the host element its canvas is mounted in (the top of its stack, else the layer's fallback). */
export const getHosts = () => {
  const out = new Map(fallbackHosts);
  for (const [layer, stack] of hosts) out.set(layer, stack[stack.length - 1]);
  return out;
};
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

// --- Pinned glass (anchor "page") -------------------------------------------------------
// With global.anchor "page" the base / float / top canvases sit IN the page
// and scroll with it, so glass on ordinary elements can never trail the
// content. Glass on a fixed / sticky element would trail the other way, so
// it is drawn by a second, window-fixed canvas for its layer instead: the
// layer's "pinned" canvas. That canvas only exists while the layer has
// pinned glass (GlassCanvas reports it here as it finds it).
const pinnedById = new Map(); // entry id → its layer (only pinned entries)
const pinnedListeners = new Set();
let pinnedKey = '';
/** GlassCanvas (page-anchored): is this element's glass pinned (fixed / sticky)? */
export function setPinned(id, layer, on) {
  const had = pinnedById.get(id);
  if (on ? had === layer : had === undefined) return;
  if (on) pinnedById.set(id, layer);
  else pinnedById.delete(id);
  notifyPinned();
}
function notifyPinned() {
  const key = [...new Set(pinnedById.values())].sort().join(',');
  if (key === pinnedKey) return; // (only the SET of layers matters to listeners)
  pinnedKey = key;
  pinnedListeners.forEach((fn) => fn());
}
/** Layers that have pinned glass right now. */
export const pinnedLayers = () => (pinnedKey ? pinnedKey.split(',') : []);
/** Is this element's glass pinned (as last reported)? */
export const isPinnedEntry = (id) => pinnedById.has(id);
export function subscribePinned(fn) {
  pinnedListeners.add(fn);
  return () => pinnedListeners.delete(fn);
}
// The window-fixed hosts of those pinned canvases (layer → element).
const pinnedHosts = new Map();
export function registerPinnedHost(layer, el) {
  pinnedHosts.set(layer, el);
  hostListeners.forEach((fn) => fn());
  return () => {
    if (pinnedHosts.get(layer) === el) pinnedHosts.delete(layer);
    hostListeners.forEach((fn) => fn());
  };
}
export const getPinnedHosts = () => new Map(pinnedHosts);

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
  // Hidden tab (global.powerSaving, power.js): draw nothing now, but keep
  // the request — one redraw catches up as soon as the tab is shown.
  if (pausedWhileHidden()) {
    renderWanted = true;
    return;
  }
  renderers.forEach((fn) => fn());
}
let renderWanted = false; // a redraw was asked for while the tab was hidden
subscribeGlassPower(() => {
  if (!renderWanted || pausedWhileHidden()) return;
  renderWanted = false;
  requestRender();
});

/**
 * Can a style / size change of this element NOT move any WebGL glass?
 * True only when ALL of these hold:
 *   • it is out of the page flow (position absolute / fixed), so its new
 *     size or place can't push anything else around;
 *   • it is not WebGL glass itself, and has no WebGL glass inside it
 *     (glass with a liveMode — "live" SVG filter or "tint" — is drawn by the
 *     browser, never by a glass canvas).
 * Why: an animated control drawn as LIVE glass (the busy progress bar's
 * sliding fill, a slider knob) rewrites its inline style every frame. Each
 * write used to wake the redraw watchers (GlassProvider's MutationObserver,
 * useGlass's ResizeObserver), so every WebGL canvas redrew its whole layer
 * every frame, forever — measured in the UI lab: ~219 canvas redraws a
 * second with nothing moving. That saturated the GPU, and while scrolling
 * Chrome then skipped the main-thread frames the WebGL glass needs: buttons
 * and tab bars froze until the scroll ended.
 * Anything unsure (not yet synced by live.js, in flow, has WebGL glass in
 * it) returns false — redraw as before.
 */
export function cannotMoveWebglGlass(el) {
  if (!el || el.nodeType !== 1 || !el.isConnected) return false;
  const own = el.dataset.glassId ? entries.get(Number(el.dataset.glassId)) : null;
  if (own && !own.liveMode) return false; // WebGL glass itself (or not synced yet)
  for (const g of el.querySelectorAll('[data-glass-id]')) {
    if (!entries.get(Number(g.dataset.glassId))?.liveMode) return false; // WebGL glass inside
  }
  const pos = getComputedStyle(el).position;
  return pos === 'absolute' || pos === 'fixed';
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
  belowHits: 0, // floating canvases: frames that re-used the "everything below" cache
  belowMisses: 0, // … and frames that had to redraw it
  canvasSyncMs: 0, // canvas mode: last frame's element-position sync
  canvasPaintMs: 0, // … and drawing (page + glass)
};
