/**
 * Glassparency — "glassparency/vanilla": the plain-JS API as a module.
 * The same functions as the script build's window.Glassparency (short names
 * plus the module's names), without starting by itself: call start().
 *
 *   import { start, applyLook } from 'glassparency/vanilla';
 *   start({ look: 'frosted' });            // provider + data-glassparency / class auto-attach
 *   start({ provider: false });            // a React app with its own <GlassProvider>: auto-attach only
 */
import type {
  GlassConfig,
  GlassGroupName,
  GlassHandle,
  GlassLook,
  GlassLookName,
  GlassProps,
  GlassQuality,
  GlassStatus,
  GlassToast,
} from './index.js';

export interface GlassStartOptions {
  /** A config, merged over the built-in presets (as configureGlass). */
  config?: GlassConfig;
  /** Scan the page for data-glassparency attributes / glass classes and follow changes (default true). */
  auto?: boolean;
  /** Also detect the CSS classes .glass, .glass-frosted… (the Tailwind plugin's) — default true. */
  classes?: boolean;
  /** The page look ("clear" | "frosted" | "tinted" | "smoke", or { name, color }). */
  look?: GlassLook | { name: GlassLook | null; color?: string } | null;
  /** false = don't mount the glass provider (the page already renders <GlassProvider>). Default true. */
  provider?: boolean;
  /** Add glass.css to the page (default true). */
  injectStyles?: boolean;
  /** CSP nonce for the <style> elements the glass adds. */
  nonce?: string;
}
/** Start the glass on this page (safe to call more than once; a no-op without a document). */
export declare function start(options?: GlassStartOptions): void;
/** Remove every glass start() added and stop the canvases. */
export declare function stop(): void;
/** The page look (null = none). Returns a function that puts the previous one back. */
export declare function applyLook(name: GlassLook | null, options?: { color?: string }): () => void;
export declare function getLook(): { name: string; color: string } | null;
export declare const LOOKS: GlassLookName[];
export declare function attach(el: HTMLElement, group: GlassGroupName, props?: GlassProps): GlassHandle & { destroy(): void };
export declare function setProps(el: HTMLElement, props: GlassProps): void;
export declare function getProps(el: HTMLElement): GlassProps | null;
export declare function mergeProps(el: HTMLElement, partial: GlassProps): void;
export declare function configure(config: GlassConfig | null): void;
export declare function addPresets(config: GlassConfig): () => void;
export declare function getConfig(): GlassConfig;
export declare function requestRender(): void;
export declare function defineElement(name?: string): boolean;
export declare function status(): GlassStatus;
export declare function onStatus(fn: (s: GlassStatus) => void): () => void;
export declare function quality(): GlassQuality;
export declare function onQuality(fn: (q: GlassQuality) => void): () => void;
/** A toast on the shared toaster; returns a function that dismisses it. */
export declare function toast(t: GlassToast): () => void;
/** Open / close a marked sheet, popover or menu (by element or id). */
export declare function open(target: HTMLElement | string): void;
export declare function close(target: HTMLElement | string): void;
export declare const version: string;

// The module's names (the same functions) and the create… functions.
export {
  attachGlass,
  setGlassProps,
  getGlassProps,
  mergeGlassProps,
  defineGlassElement,
  configureGlass,
  addGlassPresets,
  getGlassConfig,
  requestGlassRender,
  reserveSnapshotArea,
  applyGlassLook,
  getGlassLook,
  GLASS_LOOKS,
  GLASS_VERSION,
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
  createPopover,
  createMenu,
  createSelect,
  createTooltip,
  createSheet,
  createToaster,
  getGlassOverlay,
  createSquish,
  createShapeSpring,
  glassMorph,
} from './index.js';
export declare function getGlassStatus(): GlassStatus;
export declare function subscribeGlassStatus(fn: (s: GlassStatus) => void): () => void;
export declare function getGlassQuality(): GlassQuality;
export declare function subscribeGlassQuality(fn: (q: GlassQuality) => void): () => void;
