/**
 * =============================================================================
 * glass/devtools.js — Tuning and debugging (the "glassparency/devtools" entry)
 * =============================================================================
 *   import { setGlassOverride, glassStats } from 'glassparency/devtools';
 *
 * What a tuning panel or a debugging session needs — live overrides of a
 * group's settings, forced hover / pressed states, the raw (unresolved)
 * config blocks, the settings schema, render counters. None of it is needed
 * to USE the glass, so it isn't part of the main entry any more.
 * (The main entry still re-exports these names until the next major
 * version, each warning once that it moved here.)
 * =============================================================================
 */
export {
  setOverride as setGlassOverride,
  clearOverride as clearGlassOverride,
  getOverride as getGlassOverride,
  setStateOverride as setGlassStateOverride,
  setForcedState as setGlassForcedState,
  rawGroup as rawGlassGroup,
  rawThemeGroup as rawGlassThemeGroup,
  rawDefaults as rawGlassDefaults,
  groupNames as glassGroupNames,
  subscribeConfig as subscribeGlassConfig,
  isColor as isGlassColor,
  SCHEMA as GLASS_SCHEMA,
  STATE_KEYS as GLASS_STATE_KEYS,
} from './config';
export { stats as glassStats } from './registry';
export { liveCount as glassLiveCount } from './live';

import { getEntry } from './registry';

/**
 * What the library knows about one glass element — for tuning panels that
 * let you click a control on the page to inspect it (the showcase's
 * Inspector does this).
 *   group     the element's glass group ("button", "switchKnob"…)
 *   renderer  how it is drawn right now:
 *             "live"  — live SVG filter (Chromium)
 *             "tint"  — tint only (nested live glass)
 *             "webgl" — drawn on a WebGL canvas
 *             "css"   — the CSS fallback (no WebGL glass drawn for it)
 *   props     a copy of its per-element props
 * Returns null for an element that has no glass.
 * @param {Element|null|undefined} el
 * @returns {{ group: string, renderer: 'live'|'tint'|'webgl'|'css', props: object } | null}
 */
export function getGlassInfo(el) {
  const id = Number(el?.dataset?.glassId);
  const e = id ? getEntry(id) : null;
  if (!e) return null;
  const renderer = e.liveMode === 'live' ? 'live' : e.liveMode === 'tint' ? 'tint' : e.el.hasAttribute('data-glass-drawn') ? 'webgl' : 'css';
  return { group: e.group, renderer, props: { ...(e.props || {}) } };
}

/**
 * Test the WebGL context-loss recovery: loses the WebGL context of every
 * glass canvas on the page (WEBGL_lose_context — the same events a GPU
 * reset fires), then restores them after `restoreAfter` ms. The page shows
 * the CSS glass while it's lost and the provider rebuilds the WebGL glass
 * once it's back (watch getGlassStatus(): "loading" → "on").
 *   restoreAfter  ms until the contexts come back (default 1000); null =
 *                 never — tests the "never restored" path (the provider
 *                 then tries a fresh context by itself after a few seconds)
 * Resolves with how many canvases were lost, once they are restored (or
 * straight away with restoreAfter null).
 * @param {{ restoreAfter?: number|null }} [opts]
 * @returns {Promise<number>}
 */
export function loseGlassContext({ restoreAfter = 1000 } = {}) {
  if (typeof document === 'undefined') return Promise.resolve(0);
  // The layer canvases (GlassCanvas marks them) and canvas mode's page canvas.
  const canvases = [...document.querySelectorAll('canvas[data-glass-webgl], canvas[data-glass-page]')];
  const exts = [];
  for (const c of canvases) {
    // getContext with the type it already has returns that same context.
    const gl = c.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext || gl.isContextLost()) continue;
    ext.loseContext();
    exts.push(ext);
  }
  if (restoreAfter == null) return Promise.resolve(exts.length);
  return new Promise((resolve) => {
    setTimeout(() => {
      for (const ext of exts) {
        try {
          ext.restoreContext();
        } catch {
          // (already restored / canvas gone)
        }
      }
      resolve(exts.length);
    }, Math.max(0, restoreAfter));
  });
}
