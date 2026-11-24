/**
 * =============================================================================
 * glass/adapters/svelte/actions.js — the Svelte actions (compiled by build.mjs)
 * =============================================================================
 *   <div use:glass={'card'}>   <button use:glassSwitch={{ checked, onChange }}></button>
 * The actions are ../actions.js (shared with the Vue wrappers); this file adds
 * the plain-JS API under the module's names, for startGlass({ look }) etc.
 * =============================================================================
 */
export * from '../actions';
export {
  start as startGlass,
  stop as stopGlass,
  applyLook as applyGlassLook,
  getLook as getGlassLook,
  LOOKS as GLASS_LOOKS,
  configure as configureGlass,
  addPresets as addGlassPresets,
  toast as glassToast,
} from '../../standalone';
