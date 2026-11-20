/**
 * Glassparency — Liquid Glass for the web (react-three-fiber + drei).
 * Start with the README.
 */
export { default as GlassProvider, GlassLayerHost } from './GlassProvider';
// The npm package's version (build.mjs fills it in; "dev" when run from source).
/* global __LIQUID_GLASS_VERSION__ */
export const GLASS_VERSION = typeof __LIQUID_GLASS_VERSION__ !== 'undefined' ? __LIQUID_GLASS_VERSION__ : 'dev';

// Two copies of the library on one page (two versions installed, or the
// script build AND the module): each has its own registry, so glass from one
// copy is never drawn by the other's provider — it just stays CSS. Say so.
// (Published builds only: in development, hot reloading re-runs this module.)
if (GLASS_VERSION !== 'dev' && typeof globalThis !== 'undefined') {
  const KEY = Symbol.for('glassparency.copies');
  const copies = (globalThis[KEY] ||= []);
  copies.push(GLASS_VERSION);
  if (copies.length === 2) {
    console.warn(
      `glassparency: ${copies.length} copies are loaded on this page (${copies.join(', ')}). Glass from one copy isn't drawn by the other's <GlassProvider> — make sure only one is installed (npm ls glassparency) and don't load the script build next to the module.`
    );
  }
}
export { default as Glass } from './Glass';
export { useGlass, attachGlass, setGlassProps, getGlassProps, mergeGlassProps } from './useGlass';
// Shape springs + the liquid morph for any element (plain JS + React hooks).
export { createShapeSpring, glassMorph } from './motion';
export { useShapeSpring, useGlassMorph } from './useMotion';
// <glass-ui group="card">: glass as an HTML element, for any framework.
export { defineGlassElement, GLASS_ELEMENT } from './element';
// Liquid Glass switch + slider (React components, and the plain-JS versions they use).
export { GlassSwitch, GlassSlider, GlassCheckbox, GlassRadio, GlassTextField, GlassTabBar, GlassSidebar, GlassProgress } from './GlassControls';
export { createSwitch, createSlider } from './controls';
// Checkboxes, radios, text fields, tab bars, sidebars, progress bars (plain JS).
export { createCheckbox, createRadio, createTextField, createLensBar, createTabBar, createSidebar, createProgress } from './widgets';
// Squish & stretch for any element you animate yourself.
export { createSquish, stretchFor } from './squish';
export { reserveSnapshotArea } from './snapshot';
// Ask every glass canvas to draw a new frame (e.g. an element moved by JS,
// outside global.root, where the automatic DOM watchers don't look).
export { requestRender as requestGlassRender } from './registry';
export {
  configureGlass,
  addGlassPresets,
  getGlassConfig,
  LAYERS as GLASS_LAYERS,
  getGlobal as getGlassGlobal,
  getGlassTheme,
  resolveGlass,
} from './config';
export { getStatus as getGlassStatus, subscribeStatus as subscribeGlassStatus } from './registry';
// Automatic quality: which level is in use (global.quality "auto" | "high" | "medium" | "low").
export { getGlassQuality, subscribeGlassQuality, QUALITY_LEVELS as GLASS_QUALITY_LEVELS } from './quality';
export { LIVE_SUPPORTED as GLASS_LIVE_SUPPORTED } from './live';
// global.backdrop "canvas" (the live page in one canvas — Chromium 157+).
export { CANVAS_BACKDROP_SUPPORTED as GLASS_CANVAS_BACKDROP_SUPPORTED } from './pageCanvas';

// --- Moved to "glassparency/devtools" (tuning + debugging) ---------------------------------
// Still exported here until the next major version; each function warns once.
import * as devtools from './devtools';
const movedWarned = new Set();
const moved = (name) =>
  function movedToDevtools(...args) {
    if (!movedWarned.has(name)) {
      movedWarned.add(name);
      console.warn(`glassparency: ${name} moved to "glassparency/devtools" — import it from there (the main entry drops it in the next major version).`);
    }
    return devtools[name](...args);
  };
/** @deprecated import from "glassparency/devtools" */
export const setGlassOverride = moved('setGlassOverride');
/** @deprecated import from "glassparency/devtools" */
export const clearGlassOverride = moved('clearGlassOverride');
/** @deprecated import from "glassparency/devtools" */
export const getGlassOverride = moved('getGlassOverride');
/** @deprecated import from "glassparency/devtools" */
export const setGlassStateOverride = moved('setGlassStateOverride');
/** @deprecated import from "glassparency/devtools" */
export const setGlassForcedState = moved('setGlassForcedState');
/** @deprecated import from "glassparency/devtools" */
export const rawGlassGroup = moved('rawGlassGroup');
/** @deprecated import from "glassparency/devtools" */
export const rawGlassThemeGroup = moved('rawGlassThemeGroup');
/** @deprecated import from "glassparency/devtools" */
export const rawGlassDefaults = moved('rawGlassDefaults');
/** @deprecated import from "glassparency/devtools" */
export const glassGroupNames = moved('glassGroupNames');
/** @deprecated import from "glassparency/devtools" */
export const subscribeGlassConfig = moved('subscribeGlassConfig');
/** @deprecated import from "glassparency/devtools" */
export const isGlassColor = moved('isGlassColor');
/** @deprecated import from "glassparency/devtools" */
export const glassLiveCount = moved('glassLiveCount');
// (objects, not functions — re-exported as they are)
/** @deprecated import from "glassparency/devtools" */
export const GLASS_SCHEMA = devtools.GLASS_SCHEMA;
/** @deprecated import from "glassparency/devtools" */
export const GLASS_STATE_KEYS = devtools.GLASS_STATE_KEYS;
/** @deprecated import from "glassparency/devtools" */
export const glassStats = devtools.glassStats;
