/**
 * Glassparency — "glassparency/svelte" (and "glassparency/svelte/actions"): Svelte wrappers (types).
 *   <div use:glass={'card'}>   <div use:glass={{ group: 'card', look: 'smoke' }}>
 *   <GlassSwitch bind:checked={on} />
 * Actions have the shape (node, params) → { update, destroy }; they work in
 * any framework (the Vue wrappers use the same ones).
 */
import type { Component } from 'svelte';
import type { GlassGroupName, GlassLook, GlassProps } from '../index.js';

export { start as startGlass, stop as stopGlass, applyLook as applyGlassLook, getLook as getGlassLook, LOOKS as GLASS_LOOKS, configure as configureGlass, addPresets as addGlassPresets, toast as glassToast } from '../vanilla.js';
export declare function ensureGlass(): void;

export interface GlassActionReturn<P> {
  update(params: P): void;
  destroy(): void;
}
export type GlassAction<P> = (node: HTMLElement, params?: P) => GlassActionReturn<P>;

export type GlassParams = GlassGroupName | { group?: GlassGroupName; look?: GlassLook; lookColor?: string; props?: GlassProps };
/** Params every control action takes besides its own (and its create… function's options). */
export interface GlassControlParams {
  look?: GlassLook;
  lookColor?: string;
  props?: Record<string, GlassProps> | GlassProps;
  groups?: Record<string, string>;
  [option: string]: unknown;
}
export declare const glass: GlassAction<GlassParams>;
export declare const glassSwitch: GlassAction<GlassControlParams & { checked?: boolean; disabled?: boolean; onChange?: (checked: boolean) => void }>;
export declare const glassSlider: GlassAction<GlassControlParams & { value?: number; min?: number; max?: number; step?: number; onChange?: (v: number) => void; onChangeEnd?: (v: number) => void }>;
export declare const glassCheckbox: GlassAction<GlassControlParams & { checked?: boolean; onChange?: (checked: boolean) => void }>;
export declare const glassRadio: GlassAction<GlassControlParams & { checked?: boolean; name?: string; onChange?: (checked: boolean) => void }>;
export declare const glassTextField: GlassAction<GlassControlParams & { clearable?: boolean; onClear?: () => void }>;
export declare const glassTabBar: GlassAction<GlassControlParams & { value?: number; onChange?: (index: number) => void }>;
export declare const glassSidebar: GlassAction<GlassControlParams & { value?: number; onChange?: (index: number) => void }>;
export declare const glassProgress: GlassAction<GlassControlParams & { value?: number | null; bead?: boolean }>;
export declare const glassSegmented: GlassAction<GlassControlParams & { value?: number; onChange?: (index: number) => void }>;
export declare const glassStepper: GlassAction<GlassControlParams & { value?: number; min?: number; max?: number; step?: number; onChange?: (v: number) => void }>;
export declare const glassRangeSlider: GlassAction<GlassControlParams & { value?: number | [number, number]; orientation?: 'horizontal' | 'vertical' }>;
export declare const glassBlockSlider: GlassAction<GlassControlParams & { value?: number; orientation?: 'vertical' | 'horizontal' }>;
export declare const glassTooltip: GlassAction<GlassControlParams & { text?: string }>;
export declare const glassSheet: GlassAction<GlassControlParams & { open?: boolean; detent?: number; detents?: number[]; onClose?: () => void }>;
export declare const glassPopover: GlassAction<GlassControlParams>;
export declare const glassMenu: GlassAction<GlassControlParams & { onSelect?: (index: number, item: HTMLElement) => void }>;
export declare const glassSelect: GlassAction<GlassControlParams & { value?: string; onChange?: (value: string, index: number) => void }>;

// Components (Svelte 5). Callback props are lower-case: onchange, onchangeend, onclear, onselect, onopenchange, onclose.
type P = Record<string, any>;
export declare const Glass: Component<P>;
export declare const GlassSwitch: Component<P, {}, 'checked'>;
export declare const GlassSlider: Component<P, {}, 'value'>;
export declare const GlassCheckbox: Component<P, {}, 'checked'>;
export declare const GlassRadio: Component<P, {}, 'checked'>;
export declare const GlassTextField: Component<P, {}, 'value'>;
export declare const GlassTabBar: Component<P, {}, 'value'>;
export declare const GlassSidebar: Component<P, {}, 'value'>;
export declare const GlassProgress: Component<P>;
export declare const GlassSegmented: Component<P, {}, 'value'>;
export declare const GlassStepper: Component<P, {}, 'value'>;
export declare const GlassRangeSlider: Component<P, {}, 'value'>;
export declare const GlassBlockSlider: Component<P, {}, 'value'>;
export declare const GlassPopover: Component<P>;
export declare const GlassMenu: Component<P>;
export declare const GlassSelect: Component<P, {}, 'value'>;
export declare const GlassTooltip: Component<P>;
export declare const GlassSheet: Component<P, {}, 'open'>;
