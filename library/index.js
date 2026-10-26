/**
 * Glassparency — Liquid Glass for the web (react-three-fiber + drei).
 * Start with the README.
 */
export { default as GlassProvider, GlassLayerHost } from './GlassProvider';
// The npm package's version (build.mjs fills it in; "dev" when run from source).
/* global __LIQUID_GLASS_VERSION__ */
export const GLASS_VERSION = typeof __LIQUID_GLASS_VERSION__ !== 'undefined' ? __LIQUID_GLASS_VERSION__ : 'dev';
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
  isColor as isGlassColor,
  SCHEMA as GLASS_SCHEMA,
  LAYERS as GLASS_LAYERS,
  getGlobal as getGlassGlobal,
  groupNames as glassGroupNames,
  rawGroup as rawGlassGroup,
  rawThemeGroup as rawGlassThemeGroup,
  getGlassTheme,
  rawDefaults as rawGlassDefaults,
  resolveGlass,
  setOverride as setGlassOverride,
  clearOverride as clearGlassOverride,
  getOverride as getGlassOverride,
  setStateOverride as setGlassStateOverride,
  setForcedState as setGlassForcedState,
  STATE_KEYS as GLASS_STATE_KEYS,
  subscribeConfig as subscribeGlassConfig,
} from './config';
export { getStatus as getGlassStatus, subscribeStatus as subscribeGlassStatus, stats as glassStats } from './registry';
// Automatic quality: which level is in use (global.quality "auto" | "high" | "medium" | "low").
export { getGlassQuality, subscribeGlassQuality, QUALITY_LEVELS as GLASS_QUALITY_LEVELS } from './quality';
export { LIVE_SUPPORTED as GLASS_LIVE_SUPPORTED, liveCount as glassLiveCount } from './live';
