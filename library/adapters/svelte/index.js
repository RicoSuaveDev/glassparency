/**
 * =============================================================================
 * glass/adapters/svelte/index.js — Svelte 5 wrappers ("glassparency/svelte")
 * =============================================================================
 *   <script>
 *     import { glass, startGlass, GlassSwitch } from 'glassparency/svelte';
 *     startGlass({ look: 'frosted' });   // optional: the glass starts by itself on first use
 *     let wifi = $state(true);
 *   </script>
 *   <div use:glass={'card'}>…</div>
 *   <div use:glass={{ group: 'card', look: 'smoke' }}>…</div>
 *   <GlassSwitch bind:checked={wifi} aria-label="Wi-Fi" />
 *
 * Shipped as .svelte source (Svelte 5, runes) — compiled by your app's own
 * Svelte (SvelteKit / vite-plugin-svelte), like every Svelte library. The
 * actions (./actions.js, compiled) work in any Svelte version, and are
 * SSR-safe: nothing runs until an element is mounted in the browser.
 * (This file is copied as-is into the package by build.mjs.)
 * =============================================================================
 */
export * from './actions.js';
export { default as Glass } from './Glass.svelte';
export { default as GlassBlockSlider } from './GlassBlockSlider.svelte';
export { default as GlassCheckbox } from './GlassCheckbox.svelte';
export { default as GlassMenu } from './GlassMenu.svelte';
export { default as GlassPopover } from './GlassPopover.svelte';
export { default as GlassProgress } from './GlassProgress.svelte';
export { default as GlassRadio } from './GlassRadio.svelte';
export { default as GlassRangeSlider } from './GlassRangeSlider.svelte';
export { default as GlassSegmented } from './GlassSegmented.svelte';
export { default as GlassSelect } from './GlassSelect.svelte';
export { default as GlassSheet } from './GlassSheet.svelte';
export { default as GlassSidebar } from './GlassSidebar.svelte';
export { default as GlassSlider } from './GlassSlider.svelte';
export { default as GlassStepper } from './GlassStepper.svelte';
export { default as GlassSwitch } from './GlassSwitch.svelte';
export { default as GlassTabBar } from './GlassTabBar.svelte';
export { default as GlassTextField } from './GlassTextField.svelte';
export { default as GlassTooltip } from './GlassTooltip.svelte';
