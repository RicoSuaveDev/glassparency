/**
 * Glassparency — "glassparency/vue": Vue 3 wrappers (types).
 *   app.use(GlassparencyPlugin, { look: 'frosted' })
 *   <div v-glass:card.frosted>…</div>   <GlassSwitch v-model="on" />
 */
import type { App, DefineComponent, Directive, Plugin } from 'vue';
import type { GlassGroupName, GlassLook, GlassProps } from './index.js';
import type { GlassStartOptions } from './vanilla.js';

export { start as startGlass, stop as stopGlass, applyLook as applyGlassLook, getLook as getGlassLook, LOOKS as GLASS_LOOKS, configure as configureGlass, addPresets as addGlassPresets, toast as glassToast } from './vanilla.js';
/** Start the glass once (the wrappers call it on first use; client only). */
export declare function ensureGlass(): void;

/** v-glass value: a group name, { group, look, lookColor, props }, or glass props. Arg = group, modifier = look. */
export type GlassDirectiveValue = GlassGroupName | { group?: GlassGroupName; look?: GlassLook; lookColor?: string; props?: GlassProps } | GlassProps | undefined;
export declare const vGlass: Directive<HTMLElement, GlassDirectiveValue>;

/** Props every control takes besides its own. */
interface Common {
  look?: GlassLook;
  lookColor?: string;
  /** Per-part glass props (e.g. { track: { … } }). */
  glassProps?: Record<string, GlassProps> | GlassProps;
  /** The glass groups of its parts. */
  groups?: Record<string, string>;
}
type C<P> = DefineComponent<P & Common>;

export declare const Glass: DefineComponent<{ as?: string | object; group?: GlassGroupName; glass?: GlassProps; look?: GlassLook; lookColor?: string }>;
export declare const GlassSwitch: C<{ modelValue?: boolean; checked?: boolean; disabled?: boolean }>;
export declare const GlassSlider: C<{ modelValue?: number; value?: number; min?: number; max?: number; step?: number; disabled?: boolean }>;
export declare const GlassCheckbox: C<{ modelValue?: boolean; checked?: boolean; disabled?: boolean; name?: string }>;
export declare const GlassRadio: C<{ modelValue?: boolean; checked?: boolean; disabled?: boolean; name?: string }>;
export declare const GlassTextField: C<{ modelValue?: string; clearable?: boolean }>;
export declare const GlassTabBar: C<{ modelValue?: number; value?: number; lensScale?: number; inset?: number }>;
export declare const GlassSidebar: C<{ modelValue?: number; value?: number; lensScale?: number; inset?: number }>;
export declare const GlassProgress: C<{ value?: number | null; bead?: boolean }>;
export declare const GlassSegmented: C<{ modelValue?: number; value?: number; lensScale?: number; inset?: number }>;
export declare const GlassStepper: C<{ modelValue?: number; value?: number; min?: number; max?: number; step?: number; wrap?: boolean; showValue?: boolean; format?: (v: number) => string; disabled?: boolean }>;
export declare const GlassRangeSlider: C<{ modelValue?: number | [number, number]; value?: number | [number, number]; min?: number; max?: number; step?: number; orientation?: 'horizontal' | 'vertical'; disabled?: boolean }>;
export declare const GlassBlockSlider: C<{ modelValue?: number; value?: number; min?: number; max?: number; step?: number; orientation?: 'vertical' | 'horizontal'; disabled?: boolean }>;
interface PairProps {
  label?: string;
  triggerClass?: string;
  panelClass?: string;
  ariaLabel?: string;
  group?: GlassGroupName;
  placement?: 'auto' | 'bottom' | 'top';
  align?: 'start' | 'center' | 'end';
  triggerGroup?: GlassGroupName;
  triggerProps?: GlassProps;
}
export declare const GlassPopover: C<PairProps>;
export declare const GlassMenu: C<PairProps>;
export declare const GlassSelect: C<PairProps & { modelValue?: string; options?: Array<{ value: string; label: string }>; placeholder?: string }>;
export declare const GlassTooltip: C<{ text?: string; placement?: 'top' | 'bottom'; delay?: number; group?: GlassGroupName }>;
export declare const GlassSheet: C<{ open?: boolean; detent?: number; detents?: number[]; dim?: number }>;

/** app.use(GlassparencyPlugin, { look, config, auto, classes, components }) */
export declare const GlassparencyPlugin: Plugin<[(GlassStartOptions & { components?: boolean })?]> & { install(app: App, options?: GlassStartOptions & { components?: boolean }): void };
