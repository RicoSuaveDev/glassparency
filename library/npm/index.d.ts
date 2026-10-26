/**
 * Glassparency — TypeScript types (hand-written; the library is plain JS).
 */
// JSX comes from 'react' (React 19's types have no global JSX namespace).
import type { ComponentPropsWithoutRef, DetailedHTMLProps, ElementType, ForwardRefExoticComponent, HTMLAttributes, JSX, ReactNode, RefAttributes, RefObject } from 'react';

// --- Config ---------------------------------------------------------------------------------

/** A CSS colour: "#hex", "var(--name)", "rgb(…)", "hsl(…)", "white"… (its alpha is ignored). */
export type GlassColor = string;
/** A colour or a CSS-style gradient (angle in CSS degrees: 180 = top → bottom). */
export type GlassTint = GlassColor | { from: GlassColor; via?: GlassColor | null; to: GlassColor; angle?: number };
export interface GlassSides {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}
export type GlassLayer = 'base' | 'float' | 'modal' | 'top';

/** Every glass property (all optional: anything left out comes from the group / defaults). */
/** The look family: "default" = the group's own values (Apple), "crystal" = clearer, thicker glass, "frosted" = milky, heavily frosted glass in the group's own tint. */
export type GlassStyle = 'default' | 'crystal' | 'frosted';

export interface GlassProps {
  enabled?: boolean;
  style?: GlassStyle;
  layer?: 'auto' | GlassLayer;
  tier?: 'auto' | 0 | 1 | 2 | 3 | 4 | 5;
  sampler?: 'auto' | 'webgl' | 'live';
  shape?: 'rectangle' | 'roundedRectangle' | 'circle' | 'capsule';
  radius?: number | 'auto';
  scale?: { x?: number; y?: number };
  bleed?: GlassSides;
  padding?: GlassSides;
  thickness?: number;
  bevel?: number;
  bevelSegments?: number;
  profile?: 'squircle' | 'classic';
  ior?: number;
  /** Lens: > 0 shrinks what's behind (0.2 = 20% smaller), < 0 magnifies it (−0.15 = 15% bigger). −0.5 … 0.5. */
  minify?: number;
  chromaticAberration?: number;
  anisotropy?: number;
  roughness?: number;
  blur?: number;
  distortion?: number;
  distortionScale?: number;
  temporalDistortion?: number;
  samples?: number;
  reflection?: number;
  saturation?: number;
  brightness?: number;
  rimLight?: number;
  rimWidth?: number;
  lightAngle?: number;
  innerGlow?: number;
  pressScale?: number;
  pressGlow?: number;
  /** Squish & stretch while pressed: strength 0–1 (0 = off; replaces pressScale when on). */
  squish?: number;
  /** How much it swells while pressed (1–1.6). */
  squishGrow?: number;
  /** How far it's pulled towards the pointer, px (0–60). */
  squishPull?: number;
  /** Wobble when let go: 0 = none, 1 = very jelly. */
  squishBounce?: number;
  morph?: string;
  morphRadius?: number;
  tint?: GlassTint;
  tintOpacity?: number;
  /** A CSS colour, or "auto": textLight / textDark, whichever reads better over what's behind the glass. */
  textColor?: string | 'auto' | null;
  /** textColor "auto": the light text colour (default "#ffffff"). */
  textLight?: string | null;
  /** textColor "auto": the dark text colour (default "#1d1d1f"). */
  textDark?: string | null;
  font?: string | null;
  fontWeight?: string | null;
  iconColor?: string | null;
  iconSize?: number | null;
  borderWidth?: number;
  borderColor?: GlassColor;
  borderOpacity?: number;
  shadowColor?: GlassColor;
  shadowOpacity?: number;
  shadowBlur?: number;
  shadowX?: number;
  shadowY?: number;
  shadowSpread?: number;
  keepBorder?: boolean;
  keepShadow?: boolean;
}

/** A group (or "defaults"): properties plus the looks for hover / pressed / disabled. */
export interface GlassGroup extends GlassProps {
  hover?: GlassProps;
  pressed?: GlassProps;
  disabled?: GlassProps;
  /** Fine-tuning merged over the "crystal" style's rules for this group. */
  crystal?: GlassProps;
  /** Fine-tuning merged over the "frosted" style's rules for this group. */
  frosted?: GlassProps;
}

/** An exact copy of a CSS page background (see the README, "Page background"). */
export interface GlassBackgroundTheme {
  base: { top: string; bottom: string };
  glows?: Array<{ rx: number; ry: number; at: [number, number]; rgb: [number, number, number]; alpha: number; stop: number }>;
}

export interface GlassGlobal {
  enabled?: boolean;
  /** Element whose changes move glass and that WebGL floating glass photographs (default "body"). */
  root?: string;
  /** "auto" = the page's own background colour; or an exact copy per theme. */
  background?: 'auto' | GlassBackgroundTheme | { light?: GlassBackgroundTheme; dark?: GlassBackgroundTheme };
  /** With background "auto": a picture (URL, CORS-enabled) the base canvas paints cover-fitted once loaded; base glass then stays WebGL and refracts it. */
  backgroundImage?: string | null;
  /** Layout that never starts WebGL (CSS glass only). Default "(max-width: 860px)"; null = never. */
  mobileQuery?: string | null;
  zIndex?: { base?: number; float?: number };
  theme?: 'auto' | 'light' | 'dark';
  /** Where the page-wide canvases sit: "viewport" (fixed, default) or "page" (scrolls with the page: no lag on phones). */
  anchor?: 'viewport' | 'page';
  maxDpr?: number;
  bufferScale?: number;
  /** "auto" (default) = full quality, throttled only while animation is too slow; or a fixed level. */
  quality?: 'auto' | 'high' | 'medium' | 'low';
  debugOutlines?: boolean;
  snapshot?: { enabled?: boolean; debounceMs?: number; minIntervalMs?: number; margin?: number; scale?: number };
}

export interface GlassConfig {
  global?: GlassGlobal;
  defaults?: GlassGroup;
  groups?: Record<string, GlassGroup>;
  themes?: { dark?: { defaults?: GlassGroup; groups?: Record<string, GlassGroup> } };
}

/** A resolved, validated look (what the renderer uses). */
export type ResolvedGlass = Required<Omit<GlassProps, 'tint' | 'scale' | 'bleed' | 'padding'>> & {
  tint: { from: string; via: string | null; to: string; angle: number };
  scale: { x: number; y: number };
  bleed: Required<GlassSides>;
  padding: Required<GlassSides>;
};

// --- React ------------------------------------------------------------------------------------

export interface GlassProviderProps {
  children?: ReactNode;
  /** Your config, deep-merged over the built-in presets. */
  config?: GlassConfig;
  /** Draws <Glass icon="name"> icons. */
  renderIcon?: (name: string, size: number) => ReactNode;
  /** Add glass.css to the page (default true). false = import "<package>/glass.css" yourself. */
  injectStyles?: boolean;
  /** CSP nonce for the <style> elements the glass adds. */
  nonce?: string;
}
export declare function GlassProvider(props: GlassProviderProps): JSX.Element;
export declare function GlassLayerHost(props: { layer?: GlassLayer }): JSX.Element;

export type GlassComponentProps<T extends ElementType = 'div'> = {
  as?: T;
  group?: string;
  glass?: GlassProps;
  icon?: ReactNode | string;
  iconSize?: number;
} & Omit<ComponentPropsWithoutRef<T>, 'as'>;
export declare const Glass: ForwardRefExoticComponent<GlassComponentProps<ElementType> & RefAttributes<HTMLElement>>;

// --- Switch + slider ------------------------------------------------------------------------

/** Glass groups used for each part of a switch (defaults shown). */
export interface GlassSwitchGroups { off?: string /* "switch" */; on?: string /* "switchOn" */; knob?: string /* "switchKnob" */; knobActive?: string /* "switchKnobActive" */ }
/** Glass groups used for each part of a slider (defaults shown). */
export interface GlassSliderGroups { track?: string /* "sliderTrack" */; fill?: string /* "sliderFill" */; knob?: string /* "sliderKnob" */; knobActive?: string /* "sliderKnobActive" */ }

export type GlassSwitchProps = {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  groups?: GlassSwitchGroups;
  /** Per-element glass props for the track, e.g. { track: { style: 'crystal' } } (the style only changes the knob). */
  glassProps?: { track?: GlassProps };
} & Omit<ComponentPropsWithoutRef<'button'>, 'onChange' | 'type' | 'role'>;
/** Liquid Glass on/off switch: click it or drag the knob; the knob turns into glass while pressed. */
export declare const GlassSwitch: ForwardRefExoticComponent<GlassSwitchProps & RefAttributes<HTMLButtonElement>>;

export type GlassSliderProps = {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  disabled?: boolean;
  groups?: GlassSliderGroups;
  /** Per-element glass props for the track (its fill and knob follow its style). */
  glassProps?: { track?: GlassProps };
} & Omit<ComponentPropsWithoutRef<'div'>, 'onChange' | 'defaultValue' | 'role'>;
/** Liquid Glass slider: drag the knob, click the track, or use the keyboard. */
export declare const GlassSlider: ForwardRefExoticComponent<GlassSliderProps & RefAttributes<HTMLDivElement>>;

export interface GlassSwitchController {
  update(next: { checked?: boolean; disabled?: boolean; onChange?: (checked: boolean) => void }): void;
  readonly checked: boolean;
  destroy(): void;
}
export interface GlassSliderController {
  update(next: { value?: number; min?: number; max?: number; step?: number; disabled?: boolean; onChange?: (v: number) => void; onChangeEnd?: (v: number) => void }): void;
  readonly value: number;
  destroy(): void;
}
/** Plain-JS switch on any element (ideally a <button type="button">). */
export declare function createSwitch(
  el: HTMLElement,
  opts?: { checked?: boolean; disabled?: boolean; onChange?: (checked: boolean) => void; controlled?: boolean; groups?: GlassSwitchGroups; props?: { track?: GlassProps } }
): GlassSwitchController;
/** Plain-JS slider on any element (a <div>). */
export declare function createSlider(
  el: HTMLElement,
  opts?: { value?: number; min?: number; max?: number; step?: number; disabled?: boolean; onChange?: (v: number) => void; onChangeEnd?: (v: number) => void; controlled?: boolean; groups?: GlassSliderGroups; props?: { track?: GlassProps } }
): GlassSliderController;

// --- Checkbox, radio, text field, tab bar, sidebar, progress bar (widgets.js) ----------------

export interface GlassCheckGroups { off?: string /* "checkbox" | "radio" */; on?: string /* "checkboxOn" | "radioOn" */; dot?: string /* radios: "radioDot" */ }
export type GlassCheckProps = {
  checked?: boolean;
  defaultChecked?: boolean;
  /** Checkbox: the new state. Radio: called with true when the user picks it. */
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Radios with the same name uncheck each other. */
  name?: string;
  groups?: GlassCheckGroups;
  glassProps?: { box?: GlassProps; dot?: GlassProps };
  /** The label. */
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<'button'>, 'onChange' | 'type' | 'role'>;
/** Liquid Glass checkbox: a glass box that fills with the accent and draws a tick; squishes when pressed. */
export declare const GlassCheckbox: ForwardRefExoticComponent<GlassCheckProps & RefAttributes<HTMLButtonElement>>;
/** Liquid Glass radio button: a glass circle with a dot that pops in. */
export declare const GlassRadio: ForwardRefExoticComponent<GlassCheckProps & RefAttributes<HTMLButtonElement>>;

export interface GlassTextFieldGroups { field?: string /* "textField" */; focus?: string /* "textFieldFocus" */; clear?: string /* "textFieldClear" */ }
export type GlassTextFieldProps = {
  /** Drawn before the input (a search icon…). */
  icon?: ReactNode;
  /** A round × button that empties the field (fires the input's onChange). */
  clearable?: boolean;
  onClear?: () => void;
  groups?: GlassTextFieldGroups;
  glassProps?: { field?: GlassProps; clear?: GlassProps };
} & ComponentPropsWithoutRef<'input'>;
/** Liquid Glass text field: a glass capsule round a native <input> (props go to the input; className/style to the capsule). */
export declare const GlassTextField: ForwardRefExoticComponent<GlassTextFieldProps & RefAttributes<HTMLInputElement>>;

export interface GlassLensBarGroups { bar?: string /* "tabBar" | "sidebarPanel" */; lens?: string /* "tabLens" | "sidebarLens" */; lensActive?: string /* "tabLensActive" | "sidebarLensActive" */ }
export type GlassLensBarProps = {
  /** Selected item index. */
  value?: number;
  defaultValue?: number;
  onChange?: (index: number) => void;
  /** Lens size while pressed (tab bar 1.3, sidebar 1.06). */
  lensScale?: number;
  /** px between the bar's edge and the lens (tab bar 4, sidebar 0). */
  inset?: number;
  groups?: GlassLensBarGroups;
  glassProps?: { bar?: GlassProps; lens?: GlassProps; lensActive?: GlassProps };
  /** The items: give each one data-gp-item. */
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<'div'>, 'onChange' | 'defaultValue'>;
/** iOS-style glass tab bar: press and slide — a glass lens follows, magnifying the icons and wiping the accent colour across them. */
export declare const GlassTabBar: ForwardRefExoticComponent<GlassLensBarProps & RefAttributes<HTMLDivElement>>;
/** Glass sidebar with the same sliding lens, vertical. */
export declare const GlassSidebar: ForwardRefExoticComponent<GlassLensBarProps & RefAttributes<HTMLDivElement>>;

export interface GlassProgressGroups { track?: string /* "progressTrack" */; fill?: string /* "progressFill" */; bead?: string /* "progressBead" */ }
export type GlassProgressProps = {
  /** 0–1, or null = busy (a liquid drop slides back and forth). */
  value?: number | null;
  /** A glass bead riding the end of the fill. */
  bead?: boolean;
  groups?: GlassProgressGroups;
  glassProps?: { track?: GlassProps; fill?: GlassProps; bead?: GlassProps };
} & ComponentPropsWithoutRef<'div'>;
/** Liquid Glass progress bar. */
export declare const GlassProgress: ForwardRefExoticComponent<GlassProgressProps & RefAttributes<HTMLDivElement>>;

export interface GlassWidgetController {
  update(next?: Record<string, unknown>): void;
  destroy(): void;
}
export declare function createCheckbox(
  el: HTMLElement,
  opts?: { checked?: boolean; disabled?: boolean; onChange?: (checked: boolean) => void; groups?: GlassCheckGroups; props?: { box?: GlassProps } }
): GlassWidgetController & { readonly checked: boolean };
export declare function createRadio(
  el: HTMLElement,
  opts?: { checked?: boolean; name?: string; disabled?: boolean; onChange?: (checked: boolean) => void; groups?: GlassCheckGroups; props?: { box?: GlassProps; dot?: GlassProps } }
): GlassWidgetController & { readonly checked: boolean };
export declare function createTextField(
  el: HTMLElement,
  opts?: { clearable?: boolean; onClear?: () => void; groups?: GlassTextFieldGroups; props?: { field?: GlassProps; clear?: GlassProps } }
): GlassWidgetController;
type LensBarOpts = { value?: number; onChange?: (index: number) => void; lensScale?: number; inset?: number; groups?: GlassLensBarGroups; props?: { bar?: GlassProps; lens?: GlassProps; lensActive?: GlassProps } };
export declare function createLensBar(el: HTMLElement, opts?: LensBarOpts & { orientation?: 'horizontal' | 'vertical' }): GlassWidgetController & { readonly value: number };
export declare function createTabBar(el: HTMLElement, opts?: LensBarOpts): GlassWidgetController & { readonly value: number };
export declare function createSidebar(el: HTMLElement, opts?: LensBarOpts): GlassWidgetController & { readonly value: number };
export declare function createProgress(
  el: HTMLElement,
  opts?: { value?: number | null; bead?: boolean; groups?: GlassProgressGroups; props?: { track?: GlassProps; fill?: GlassProps; bead?: GlassProps } }
): GlassWidgetController & { readonly value: number | null };

// --- Squish & stretch (squish.js) -------------------------------------------------------------

export interface GlassSquish {
  /** Pointer went down at client (x, y). */
  press(x: number, y: number): void;
  /** Pointer moved while held. */
  drag(x: number, y: number): void;
  /** Let go: springs back with a wobble. */
  release(): void;
  /** A push (px/s), e.g. on landing. */
  nudge(vx: number, vy: number): void;
  readonly active: boolean;
  destroy(): void;
}
/** Squish & stretch for an element you move yourself (glass elements with "squish" > 0 get it automatically). */
export declare function createSquish(
  el: HTMLElement,
  readCfg: () => { squish: number; squishGrow: number; squishPull: number; squishBounce: number }
): GlassSquish;
/** Stretch factors for something moving along (ux, uy) by `amount` (0.3 = 30% longer, thinner across). */
export declare function stretchFor(ux: number, uy: number, amount: number): { sx: number; sy: number };

export declare function useGlass(ref: RefObject<HTMLElement | null>, group: string | null | false | undefined, props?: GlassProps): void;

// --- Shape springs + liquid morph (motion.js, useMotion.js) ---------------------------------

export interface GlassShape {
  width?: number;
  height?: number;
  radius?: number;
}
export interface GlassShapeSpringOptions {
  /** Spring stiffness (1/s²); higher = snappier. Default 170. */
  stiffness?: number;
  /** 0–1: 1 = no overshoot, lower = more wobble. Default 0.42. */
  damping?: number;
  /** Damping of the corner radius. Default 0.55. */
  radiusDamping?: number;
  /** Called each time it settles on a shape. */
  onRest?: () => void;
}
export interface GlassShapeSpring {
  /** Spring to a new shape (any of width / height / radius, px). */
  to(shape: GlassShape, opts?: { immediate?: boolean }): void;
  readonly current: Required<GlassShape>;
  readonly moving: boolean;
  destroy(): void;
}
/** Spring an element's width, height and corner radius (glass + CSS) between shapes. */
export declare function createShapeSpring(el: HTMLElement, options?: GlassShapeSpringOptions): GlassShapeSpring;
/** React: spring to `shape` whenever it changes (the first one applies at once). */
export declare function useShapeSpring(
  ref: RefObject<HTMLElement | null>,
  shape: GlassShape,
  options?: GlassShapeSpringOptions
): RefObject<GlassShapeSpring | null>;

export interface GlassMorphOptions {
  /** ms of the film forwards. Default 780. */
  duration?: number;
  /** ms backwards. Default 620. */
  reverseDuration?: number;
  /** Glass group of the film. Default: the target's group, else "panel". */
  group?: string;
  /** The film's end tint / frost. Default: the target's resolved look. */
  look?: { tintOpacity?: number; blur?: number };
  /** How far the drops reach to melt (px). Default 34. */
  morphRadius?: number;
  /** Glass layer of the film. Default "float". */
  layer?: GlassLayer;
  /** z-index of the film's (empty) shapes. Default 1. */
  zIndex?: number;
  /** Fade the target's content in at the end / out first. Default true. */
  fadeContent?: boolean;
  /** "in" (default): the target grows out of `from`; "out": it melts back and is hidden. */
  direction?: 'in' | 'out';
}
export interface GlassMorph {
  /** Resolves when the film has landed (or was cancelled / reversed). */
  finished: Promise<void>;
  /** Play it the other way (mid-film: from where it is). */
  reverse(): GlassMorph;
  /** Stop: the target is shown ("in") or hidden ("out"). */
  cancel(): void;
}
/**
 * Morph `from` into `to` as liquid glass. `to` is any element laid out where
 * it ends up; hide it with the `hidden` attribute and glassMorph shows it.
 * Without WebGL glass (or with Reduce motion) it grows out of `from` with a
 * plain transform + fade instead.
 */
export declare const glassMorph: ((from: HTMLElement, to: HTMLElement, options?: GlassMorphOptions) => GlassMorph) & {
  /** Reserve the page picture the film needs before it runs (hover / focus). Returns a release function. */
  warm(from: HTMLElement, to: HTMLElement): () => void;
};
// --- <glass-ui> (element.js) -----------------------------------------------------------------

/** The custom element's tag name: "glass-ui". */
export declare const GLASS_ELEMENT: 'glass-ui';
/**
 * Register <glass-ui> (GlassProvider and the script build do it for you), or the
 * same element under another name (it must contain a hyphen). False on the server.
 */
export declare function defineGlassElement(name?: string): boolean;
export interface GlassUIElement extends HTMLElement {
  /** Config group (attribute "group", default "panel"). */
  group: string;
  /** Per-element glass props (attribute "props", JSON). */
  props: GlassProps;
}
declare global {
  interface HTMLElementTagNameMap {
    'glass-ui': GlassUIElement;
  }
}
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /** Glass as an element: <glass-ui group="card" props='{"tint":"#e0e7ff"}'>…</glass-ui> */
      'glass-ui': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { group?: string; props?: string };
    }
  }
}

/** React: morph `toRef` out of `fromRef` while `open`, back when not. The hook owns the target's `hidden`. */
export declare function useGlassMorph(
  fromRef: RefObject<HTMLElement | null>,
  toRef: RefObject<HTMLElement | null>,
  open: boolean,
  options?: Omit<GlassMorphOptions, 'direction'>
): void;

// --- Plain JavaScript -------------------------------------------------------------------------

export interface GlassHandle {
  id: number | null;
  setProps(props: GlassProps): void;
  destroy(): void;
}
export declare function attachGlass(el: HTMLElement, group: string, props?: GlassProps): GlassHandle;
export declare function setGlassProps(el: HTMLElement, props: GlassProps): void;
/** The element's current per-element props (a copy), or null when it has no glass. */
export declare function getGlassProps(el: HTMLElement): GlassProps | null;
/** Change some per-element props, keeping the rest (setGlassProps replaces them all). */
export declare function mergeGlassProps(el: HTMLElement, partial: GlassProps): void;
export declare function configureGlass(config: GlassConfig | null, opts?: { silent?: boolean }): void;
/** Add a preset pack (extra groups etc.) over the built-in presets and under configureGlass(), which keeps it. Returns a remove function. */
export declare function addGlassPresets(config: GlassConfig): () => void;
export declare function getGlassConfig(): GlassConfig;
export declare function requestGlassRender(): void;
export declare function reserveSnapshotArea(key: string, rect: { left: number; top: number; right: number; bottom: number } | null): void;
export declare function isGlassColor(value: unknown): boolean;
export declare const GLASS_VERSION: string;

// --- Tools (for building a live tuning panel) -------------------------------------------------

export declare const GLASS_SCHEMA: Record<string, { type: string; label: string; section: string; min?: number; max?: number; step?: number; values?: string[] }>;
export declare const GLASS_LAYERS: GlassLayer[];
export declare const GLASS_STATE_KEYS: Array<'hover' | 'pressed' | 'disabled'>;
export declare const GLASS_LIVE_SUPPORTED: boolean;
export declare function getGlassGlobal(): Required<Omit<GlassGlobal, 'zIndex' | 'snapshot'>> & {
  zIndex: { base: number; float: number };
  snapshot: Required<NonNullable<GlassGlobal['snapshot']>>;
};
export declare function glassGroupNames(): string[];
export declare function rawGlassGroup(group: string): GlassGroup;
export declare function rawGlassThemeGroup(group: string): GlassGroup;
export declare function rawGlassDefaults(): GlassGroup;
export declare function getGlassTheme(): 'light' | 'dark';
export declare function resolveGlass(group: string, props?: GlassProps, state?: { hover?: boolean; pressed?: boolean; disabled?: boolean }): ResolvedGlass;
export declare function setGlassOverride(group: string, props: GlassGroup): void;
export declare function clearGlassOverride(group: string): void;
export declare function getGlassOverride(group: string): GlassGroup;
export declare function setGlassStateOverride(group: string, state: 'hover' | 'pressed' | 'disabled', props: GlassProps): void;
export declare function setGlassForcedState(group: string, state: 'hover' | 'pressed' | 'disabled' | null): void;
export declare function subscribeGlassConfig(fn: (version: number) => void): () => void;
export type GlassStatus = { state: 'off' | 'loading' | 'on' | 'fallback'; reason: string };
export declare function getGlassStatus(): GlassStatus;
export declare function subscribeGlassStatus(fn: (status: GlassStatus) => void): () => void;
export declare const glassStats: { frames: number; lastFrameMs: number; snapshots: number; lastSnapshotMs: number; lastSnapshotAt: number };
export declare function glassLiveCount(): number;
/** Automatic quality: the level in use, whether it's automatic, and the fps it last measured while animating. */
export type GlassQuality = { level: 'high' | 'medium' | 'low'; auto: boolean; fps: number };
export declare function getGlassQuality(): GlassQuality;
export declare function subscribeGlassQuality(fn: () => void): () => void;
export declare const GLASS_QUALITY_LEVELS: Array<{ name: 'high' | 'medium' | 'low'; samples: number; bufferScale: number; dpr: number }>;
