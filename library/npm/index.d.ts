/**
 * Glassparency — TypeScript types (hand-written; the library is plain JS).
 */
// JSX comes from 'react' (React 19's types have no global JSX namespace).
import type { ComponentPropsWithRef, ComponentPropsWithoutRef, DetailedHTMLProps, ElementType, ForwardRefExoticComponent, HTMLAttributes, JSX, ReactNode, RefAttributes, RefObject } from 'react';

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

/**
 * The config's group names — generated from the built-in glass.config.json
 * when the package is built, for autocomplete. Add your own:
 *   declare module 'glassparency' { interface GlassGroups { promoCard: true } }
 * (Any other string is still accepted.)
 */
export interface GlassGroups {
/*@@GLASS_GROUPS@@*/
}
/** A group name: one of GlassGroups (autocompleted), or any string. */
export type GlassGroupName = keyof GlassGroups | (string & {});

/** Every glass property (all optional: anything left out comes from the group / defaults). */
/** The look family: "default" = the group's own values (Apple), "crystal" = clearer, thicker glass, "frosted" = milky, heavily frosted glass in the group's own tint. */
export type GlassStyle = 'default' | 'crystal' | 'frosted';

/**
 * A ready-made look (theme) for the whole page or one element:
 * "clear" (barely-there glass, bright rim), "frosted" (milky, heavily
 * frosted), "tinted" (one colour — lookColor), "smoke" (dark smoke:
 * smoked near-black glass; "dark-smoke" works too). "none" = no look for
 * this element even when the page has one. Custom looks from the config's
 * "looks" block are accepted by name.
 */
export type GlassLookName = 'clear' | 'frosted' | 'tinted' | 'smoke';
export type GlassLook = GlassLookName | 'dark-smoke' | 'none' | (string & {});

/**
 * A custom glass outline (1.5.2): the glass is drawn from a distance field of
 * the shape, fitted into the element's box. Pass it as `shape`.
 *   { path: 'M…', viewBox?: '0 0 24 24', fillRule?: 'nonzero' | 'evenodd', fit?: 'contain' | 'fill' }
 *   { svg: '<svg …>…</svg>' | SVGElement | 'child' }   ('child' = the element's own first <svg>, which is then hidden)
 *   { text: string | true }                           (true = the element's own text; see <GlassText>)
 */
export type GlassCustomShape =
  | { path: string; viewBox?: string; fillRule?: 'nonzero' | 'evenodd'; fit?: 'contain' | 'fill' }
  | { svg: string | SVGElement | 'child'; fit?: 'contain' | 'fill' }
  | { text: string | true };
/** A custom shape after validation (ResolvedGlass.customShape). */
export type GlassResolvedCustomShape =
  | { kind: 'path'; path: string; viewBox: string | null; fillRule: 'nonzero' | 'evenodd'; fit: 'contain' | 'fill' }
  | { kind: 'svg'; svg: string; fit: 'contain' | 'fill' }
  | { kind: 'text'; text: string | true };

export interface GlassProps {
  enabled?: boolean;
  style?: GlassStyle;
  /** This element's (or group's) look — wins over the page look. "none" = no look. */
  look?: GlassLook;
  /** The tinted look's colour for this element (any CSS colour). */
  lookColor?: string;
  layer?: 'auto' | GlassLayer;
  tier?: 'auto' | 0 | 1 | 2 | 3 | 4 | 5;
  sampler?: 'auto' | 'webgl' | 'live';
  /** A named shape, or a custom outline (path / svg icon / text — see GlassCustomShape). */
  shape?: 'rectangle' | 'roundedRectangle' | 'circle' | 'capsule' | GlassCustomShape;
  radius?: number | 'auto';
  /** The outline's corners: round (default) or Apple-style continuous-curvature squircle (rounded rectangles only). */
  corners?: 'round' | 'squircle';
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
  /** Opt-in pointer / tilt highlight: the rim light turns towards the pointer or follows the device tilt (default 'off'). */
  lightFollow?: 'off' | 'auto' | 'pointer' | 'tilt';
  /** How far the followed light turns away from lightAngle, 0–1 (default 1). */
  lightFollowAmount?: number;
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
  /** Water ripples when the pointer moves over the glass: crest strength in px (0–24, 0 = off). */
  ripple?: number;
  /** Ripple ring width, px (4–60). */
  rippleWavelength?: number;
  /** How fast a ring spreads, px/s (20–600). */
  rippleSpeed?: number;
  /** How long a ring takes to fade out, ms (200–4000). */
  rippleDuration?: number;
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
  /** The page look from the config (applyGlassLook() / <GlassProvider look> win over it). */
  look?: GlassLook;
  /** The tinted look's colour (default "#5b7cfa"). */
  lookColor?: string;
  /** Element whose changes move glass and that WebGL floating glass photographs (default "body"). */
  root?: string;
  /** "auto" = the page's own background colour; or an exact copy per theme. */
  background?: 'auto' | GlassBackgroundTheme | { light?: GlassBackgroundTheme; dark?: GlassBackgroundTheme };
  /** With background "auto": a picture (URL, CORS-enabled) the base canvas paints cover-fitted once loaded; base glass then stays WebGL and refracts it. */
  backgroundImage?: string | null;
  /** Layout that never starts WebGL (CSS glass only). Default "(max-width: 860px)"; null = never. */
  mobileQuery?: string | null;
  /** The library's own CSS Liquid Glass where WebGL / live glass isn't drawing: true (default, 2 backdrop layers), "full", "lite" or false. */
  cssGlass?: boolean | 'full' | 'lite';
  /** Layers that still get WebGL in the mobile layout (only their own glass). Default ["top"] (tab bars). */
  mobileLayers?: GlassLayer[];
  zIndex?: { base?: number; float?: number; top?: number };
  theme?: 'auto' | 'light' | 'dark';
  /** Where the page-wide canvases sit: "viewport" (fixed, default) or "page" (scrolls with the page: no lag on phones). */
  anchor?: 'viewport' | 'page';
  /**
   * What floating WebGL glass refracts. "snapshot" (default): a picture of the
   * page, retaken a moment after it changes. "canvas": the LIVE page — the
   * page is rendered inside one canvas (HTML-in-Canvas, Chromium 157+) that
   * draws it and all the glass every time anything changes; other browsers
   * keep "snapshot". Read once when <GlassProvider> mounts. Limits: images /
   * iframes from other origins without CORS draw blank; the page scrolls in
   * its own box instead of the window.
   */
  backdrop?: 'snapshot' | 'canvas';
  maxDpr?: number;
  bufferScale?: number;
  /** "auto" (default) = full quality, throttled only while animation is too slow; or a fixed level. */
  quality?: 'auto' | 'high' | 'medium' | 'low';
  /**
   * Saving power (default true): draw nothing while the tab is hidden (one
   * redraw catches up when it's shown), and animate like "Reduce motion"
   * while the battery is low (≤ 20 %) and unplugged — Battery Status API,
   * where the browser has it. The OS "Reduce motion" setting is followed
   * either way. false = always draw / animate in full.
   */
  powerSaving?: boolean;
  debugOutlines?: boolean;
  snapshot?: {
    enabled?: boolean;
    debounceMs?: number;
    minIntervalMs?: number;
    margin?: number;
    scale?: number;
    /** Picture the whole page: true, "mobile" (default: only in the mobile layout) or false. */
    fullPage?: boolean | 'mobile';
    /** Picture resolution in the mobile layout (default 2). */
    mobileScale?: number;
  };
}

/**
 * A look in the config's "looks" block: fine-tuning for a built-in look (its
 * props are merged over the look's rules for every glass part), or a new
 * look built on one ("base").
 */
export interface GlassLookDefinition extends GlassProps {
  /** The built-in look whose rules it starts from (none = only these props). */
  base?: GlassLookName;
  /** The tinted look's colour. */
  color?: string;
  /** What changes in dark mode. */
  dark?: GlassProps;
}

export interface GlassConfig {
  global?: GlassGlobal;
  defaults?: GlassGroup;
  groups?: Record<string, GlassGroup>;
  themes?: { dark?: { defaults?: GlassGroup; groups?: Record<string, GlassGroup> } };
  /** Custom looks, or fine-tuning of the built-in ones (see GlassLookDefinition). */
  looks?: Record<string, GlassLookDefinition>;
}

/** A resolved, validated look (what the renderer uses). */
export type ResolvedGlass = Required<Omit<GlassProps, 'tint' | 'scale' | 'bleed' | 'padding' | 'shape'>> & {
  /** "custom" when the outline is a custom shape (then customShape holds it). */
  shape: 'rectangle' | 'roundedRectangle' | 'circle' | 'capsule' | 'custom';
  customShape: GlassResolvedCustomShape | null;
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
  /** The page look: "clear" | "frosted" | "tinted" | "smoke" (or { name, color }). Same store as applyGlassLook(). */
  look?: GlassLook | { name: GlassLook | null; color?: string } | null;
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
  /** The element (or component) to render: <Glass as="button"> gets <button>'s props and ref. */
  as?: T;
  group?: GlassGroupName;
  glass?: GlassProps;
  /** This element's look (shorthand for glass={{ look }}). */
  look?: GlassLook;
  /** The tinted look's colour (shorthand for glass={{ lookColor }}). */
  lookColor?: string;
  icon?: ReactNode | string;
  iconSize?: number;
  /** The glass outline: a named shape or a custom one (same as glass={{ shape }}, which it overrides). */
  shape?: GlassProps['shape'];
} & Omit<ComponentPropsWithRef<T>, 'as' | 'group' | 'glass' | 'look' | 'lookColor' | 'icon' | 'iconSize' | 'shape'>;
/** Glass on any element: <Glass as="button" group="button" onClick={…}>. Props and ref follow `as` (default "div"). */
export declare const Glass: <T extends ElementType = 'div'>(props: GlassComponentProps<T>) => JSX.Element | null;

// --- Glass groups (melting) + glass text (1.5.2) ------------------------------------------

export type GlassGroupProps<T extends ElementType = 'div'> = {
  /** The container element (default "div"). */
  as?: T;
  /** Glass pieces inside melt together once they're this close (px, default 24, max 200). */
  spacing?: number;
} & Omit<ComponentPropsWithRef<T>, 'as' | 'spacing'>;
/**
 * Like Apple's GlassEffectContainer: the glass inside is drawn as one liquid
 * surface — pieces within `spacing` px melt together, and pull apart as they
 * move away (live while they animate). Up to 16 pieces melt per group (and
 * up to 4 of them with custom shapes); more are drawn on their own. Members
 * on different layers / tiers never melt. CSS fallback: separate pieces.
 */
export declare const GlassGroup: <T extends ElementType = 'div'>(props: GlassGroupProps<T>) => JSX.Element | null;

export type GlassTextProps<T extends ElementType = 'span'> = {
  /** The element (default "span"; e.g. "h1"). */
  as?: T;
  group?: GlassGroupName;
  glass?: GlassProps;
} & Omit<ComponentPropsWithRef<T>, 'as' | 'group' | 'glass'>;
/**
 * Headline text made of glass: the glyphs (in the element's own font) are the
 * glass outline. The DOM text stays — selectable, accessible — but is
 * see-through while glass draws it. inline-block + white-space: pre by default.
 */
export declare const GlassText: <T extends ElementType = 'span'>(props: GlassTextProps<T>) => JSX.Element | null;

export interface GlassGroupController {
  readonly el: HTMLElement | null;
  /** Change the spacing (px). */
  setSpacing(px: number): void;
  /** Stop melting: the members are separate glass again. */
  destroy(): void;
}
/** Plain JS: make `el` a glass group container (its glass children melt together). */
export declare function createGlassGroup(el: HTMLElement, options?: { spacing?: number }): GlassGroupController;

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

/** A plain-JS control: update() takes the same options as its create… call (only what changes). */
export interface GlassWidgetController<U = Record<string, unknown>> {
  update(next?: U): void;
  destroy(): void;
}
type CheckboxOpts = { checked?: boolean; disabled?: boolean; onChange?: (checked: boolean) => void; groups?: GlassCheckGroups; props?: { box?: GlassProps } };
type RadioOpts = { checked?: boolean; name?: string; disabled?: boolean; onChange?: (checked: boolean) => void; groups?: GlassCheckGroups; props?: { box?: GlassProps; dot?: GlassProps } };
type TextFieldOpts = { clearable?: boolean; onClear?: () => void; groups?: GlassTextFieldGroups; props?: { field?: GlassProps; clear?: GlassProps } };
type ProgressOpts = { value?: number | null; bead?: boolean; groups?: GlassProgressGroups; props?: { track?: GlassProps; fill?: GlassProps; bead?: GlassProps } };
export declare function createCheckbox(
  el: HTMLElement,
  opts?: CheckboxOpts
): GlassWidgetController<CheckboxOpts> & { readonly checked: boolean };
export declare function createRadio(
  el: HTMLElement,
  opts?: RadioOpts
): GlassWidgetController<RadioOpts> & { readonly checked: boolean };
export declare function createTextField(
  el: HTMLElement,
  opts?: TextFieldOpts
): GlassWidgetController<TextFieldOpts>;
type LensBarOpts = { value?: number; onChange?: (index: number) => void; lensScale?: number; inset?: number; groups?: GlassLensBarGroups; props?: { bar?: GlassProps; lens?: GlassProps; lensActive?: GlassProps } };
export declare function createLensBar(el: HTMLElement, opts?: LensBarOpts & { orientation?: 'horizontal' | 'vertical' }): GlassWidgetController<LensBarOpts> & { readonly value: number };
export declare function createTabBar(el: HTMLElement, opts?: LensBarOpts): GlassWidgetController<LensBarOpts> & { readonly value: number };
export declare function createSidebar(el: HTMLElement, opts?: LensBarOpts): GlassWidgetController<LensBarOpts> & { readonly value: number };
export declare function createProgress(
  el: HTMLElement,
  opts?: ProgressOpts
): GlassWidgetController<ProgressOpts> & { readonly value: number | null };

// --- Segmented control, stepper, range / vertical / block sliders (pickers.js) ---------------

/** Segmented control: a compact lens bar (Day / Week / Month). Groups "segmented", "segmentedLens", "segmentedLensActive". */
export type GlassSegmentedProps = {
  /** Picked segment index. */
  value?: number;
  defaultValue?: number;
  onChange?: (index: number) => void;
  /** Lens size while pressed (default 1.16). */
  lensScale?: number;
  /** px between the control's edge and the lens (default 2). */
  inset?: number;
  groups?: GlassLensBarGroups;
  glassProps?: { bar?: GlassProps; lens?: GlassProps; lensActive?: GlassProps };
  /** The segments: give each one data-gp-item. */
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<'div'>, 'onChange' | 'defaultValue'>;
/** Liquid Glass segmented control: tap a segment, or press and slide the lens across. */
export declare const GlassSegmented: ForwardRefExoticComponent<GlassSegmentedProps & RefAttributes<HTMLDivElement>>;

export interface GlassStepperGroups { body?: string /* "stepper" */ }
export type GlassStepperProps = {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  /** Past max goes to min (and back). Default false: the half at a limit is dimmed. */
  wrap?: boolean;
  /** The number between − and + (default true). */
  showValue?: boolean;
  /** How the number is written (default String). */
  format?: (value: number) => string;
  onChange?: (value: number) => void;
  disabled?: boolean;
  groups?: GlassStepperGroups;
  glassProps?: { body?: GlassProps };
} & Omit<ComponentPropsWithoutRef<'div'>, 'onChange' | 'defaultValue'>;
/** Liquid Glass stepper (− value +): tap for one step, hold to repeat faster and faster. */
export declare const GlassStepper: ForwardRefExoticComponent<GlassStepperProps & RefAttributes<HTMLDivElement>>;

export type GlassRangeValue = number | [number, number];
export type GlassRangeSliderProps = {
  /** [low, high] = two knobs; a number = one knob. Fixed per instance (changing it re-creates the slider). */
  value?: GlassRangeValue;
  defaultValue?: GlassRangeValue;
  min?: number;
  max?: number;
  step?: number;
  /** "vertical": standing up, the value grows upwards. Default "horizontal". */
  orientation?: 'horizontal' | 'vertical';
  onChange?: (value: GlassRangeValue) => void;
  onChangeEnd?: (value: GlassRangeValue) => void;
  disabled?: boolean;
  groups?: GlassSliderGroups;
  glassProps?: { track?: GlassProps };
} & Omit<ComponentPropsWithoutRef<'div'>, 'onChange' | 'defaultValue'>;
/** Liquid Glass slider with two knobs (they never cross), or one standing up. Same parts and groups as <GlassSlider>. */
export declare const GlassRangeSlider: ForwardRefExoticComponent<GlassRangeSliderProps & RefAttributes<HTMLDivElement>>;

export interface GlassBlockSliderGroups { body?: string /* "blockSlider" */ }
export type GlassBlockSliderProps = {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  /** Default "vertical" (72 × 160); "horizontal" (220 × 56). Size it with CSS. */
  orientation?: 'vertical' | 'horizontal';
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  disabled?: boolean;
  groups?: GlassBlockSliderGroups;
  glassProps?: { body?: GlassProps };
  /** An icon, drawn at the start (black by default: --gp-block-icon or your own color changes it). */
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<'div'>, 'onChange' | 'defaultValue'>;
/** Control Center-style block slider: the white fill is the value. Drag (it moves with your finger), tap to jump; it stretches past the ends. */
export declare const GlassBlockSlider: ForwardRefExoticComponent<GlassBlockSliderProps & RefAttributes<HTMLDivElement>>;

type SegmentedOpts = LensBarOpts;
type StepperOpts = { value?: number; min?: number; max?: number; step?: number; disabled?: boolean; wrap?: boolean; showValue?: boolean; format?: (value: number) => string; onChange?: (value: number) => void; groups?: GlassStepperGroups; props?: { body?: GlassProps } };
type RangeSliderOpts = { value?: GlassRangeValue; min?: number; max?: number; step?: number; orientation?: 'horizontal' | 'vertical'; disabled?: boolean; onChange?: (value: GlassRangeValue) => void; onChangeEnd?: (value: GlassRangeValue) => void; groups?: GlassSliderGroups; props?: { track?: GlassProps } };
type BlockSliderOpts = { value?: number; min?: number; max?: number; step?: number; orientation?: 'vertical' | 'horizontal'; disabled?: boolean; onChange?: (value: number) => void; onChangeEnd?: (value: number) => void; groups?: GlassBlockSliderGroups; props?: { body?: GlassProps } };
/** Plain-JS segmented control: el's [data-gp-item] children are the segments. */
export declare function createSegmented(el: HTMLElement, opts?: SegmentedOpts): GlassWidgetController<SegmentedOpts> & { readonly value: number };
/** Plain-JS stepper on an empty <div> (the − / value / + parts are added). */
export declare function createStepper(el: HTMLElement, opts?: StepperOpts): GlassWidgetController<StepperOpts> & { readonly value: number };
/** Plain-JS range (two knobs) or vertical slider on a <div>. */
export declare function createRangeSlider(el: HTMLElement, opts?: RangeSliderOpts): GlassWidgetController<RangeSliderOpts> & { readonly value: GlassRangeValue };
/** Plain-JS block slider on a <div> (its children — an icon — stay). */
export declare function createBlockSlider(el: HTMLElement, opts?: BlockSliderOpts): GlassWidgetController<BlockSliderOpts> & { readonly value: number };

// --- Popover, menu, select, tooltip, sheet, toasts (overlays.js) --------------------------------
// All of them live in one shared overlay on <body>, above everything, with its own glass canvas
// (layer "modal"). A popover / menu / select panel is ONE glass that starts on its button and grows
// out over it; it shrinks back into the button when closed.

/** The trigger button + panel props shared by <GlassPopover>, <GlassMenu> and <GlassSelect>. */
type GlassOverlayTriggerProps = {
  /** Glass group of the trigger button (default "button"). */
  triggerGroup?: GlassGroupName;
  triggerClassName?: string;
  /** Per-element glass props for the trigger button. */
  triggerGlass?: GlassProps;
  /** The panel's class. */
  className?: string;
  /** The panel's glass group ("popover" / "menu" by default). */
  group?: GlassGroupName;
  /** Per-element glass props for the panel, e.g. { style: 'frosted' }. */
  glassProps?: GlassProps;
  /** "bottom": grows down from the button's top edge; "top": up from its bottom edge; "auto" (default): down unless only up fits. */
  placement?: 'auto' | 'bottom' | 'top';
  /** Lines the panel up with the button's start (default), centre or end. */
  align?: 'start' | 'center' | 'end';
  /** Accessible name for the trigger button. */
  'aria-label'?: string;
} & Omit<ComponentPropsWithoutRef<'span'>, 'onChange' | 'onSelect' | 'className'>;

export type GlassPopoverProps = GlassOverlayTriggerProps & {
  /** The trigger button's content. */
  label: ReactNode;
  /** The panel's content. */
  children?: ReactNode;
  onOpenChange?: (open: boolean) => void;
};
/** Liquid Glass popover: a glass button whose panel grows out of it. Escape or a press outside closes it. */
export declare function GlassPopover(props: GlassPopoverProps): JSX.Element;

export type GlassMenuProps = GlassOverlayTriggerProps & {
  label: ReactNode;
  /** The items: <button role="menuitem">…</button> (data-gp-keep-open: picking it doesn't close the menu). */
  children?: ReactNode;
  onSelect?: (index: number, item: HTMLElement) => void;
  onOpenChange?: (open: boolean) => void;
};
/** Liquid Glass menu: a soft highlight slides between the items; arrows, Enter, Escape and type-ahead work. */
export declare function GlassMenu(props: GlassMenuProps): JSX.Element;

export interface GlassSelectOption {
  value: string | number;
  label: ReactNode;
}
export type GlassSelectProps = GlassOverlayTriggerProps & {
  options: GlassSelectOption[];
  value?: string | number;
  /** Called with the option's value as a string. */
  onChange?: (value: string) => void;
  /** Shown when no option is picked (default "Choose…"). */
  placeholder?: ReactNode;
};
/** Liquid Glass select (pop-up button): opens with the picked option highlighted and ticked. */
export declare function GlassSelect(props: GlassSelectProps): JSX.Element;

export type GlassTooltipProps = {
  text: string;
  /** Default "top" (flips below when there's no room). */
  placement?: 'top' | 'bottom';
  /** ms of hovering before it shows (default 500; right after another tooltip: at once). */
  delay?: number;
  group?: GlassGroupName;
  glassProps?: GlassProps;
  /** The element it describes. */
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<'span'>, 'children'>;
/** Liquid Glass tooltip on hover or keyboard focus, popping in with a bounce. */
export declare function GlassTooltip(props: GlassTooltipProps): JSX.Element;

export interface GlassSheetGroups { rest?: string /* "sheet" */; full?: string /* "sheetFull" */ }
export type GlassSheetProps = {
  open: boolean;
  /** The user closed it (dragged it down, tapped the dimmed page, Escape). */
  onClose?: () => void;
  /** Resting heights as fractions of the window (default [0.45, 0.92]). */
  detents?: number[];
  /** Index into detents to open at / move to (default 0). */
  detent?: number;
  onDetentChange?: (index: number) => void;
  className?: string;
  groups?: GlassSheetGroups;
  glassProps?: GlassProps;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'className'>;
/** iOS-style Liquid Glass bottom sheet: drag its top (a flick jumps detents); thicker glass and a darker page as it rises. */
export declare function GlassSheet(props: GlassSheetProps): JSX.Element | null;

export interface GlassToast {
  title?: string;
  body?: string;
  /** An element (cloned) or an SVG / HTML string. */
  icon?: Element | string;
  /** ms before it leaves (default 4000; 0 = until swiped away). */
  duration?: number;
  /**
   * How screen readers announce it: "status" (default, politely — after
   * what they're reading) or "alert" (straight away — for errors).
   */
  role?: 'status' | 'alert';
  /** Per-element glass props for this toast, e.g. { style: 'crystal' }. */
  props?: GlassProps;
}
export interface GlassToaster {
  /** Shows a toast; returns a function that dismisses it. */
  show(toast: GlassToast): () => void;
  /** Dismisses every toast. */
  clear(): void;
}
/** Toasts (banners) that drop in from the top of the window: const toast = useGlassToaster(); toast.show({ title: 'Saved' }). */
export declare function useGlassToaster(opts?: { group?: GlassGroupName; max?: number; duration?: number }): GlassToaster;

export interface GlassPopoverController {
  readonly isOpen: boolean;
  open(): void;
  /** refocus: give the focus back to the button. */
  close(refocus?: boolean): void;
  toggle(): void;
  /** Re-place it after its content changed size. */
  reposition(): void;
  update(next?: { onOpenChange?: (open: boolean) => void; props?: GlassProps }): void;
  destroy(): void;
}
type PopoverOpts = {
  group?: GlassGroupName;
  props?: GlassProps;
  placement?: 'auto' | 'bottom' | 'top';
  align?: 'start' | 'center' | 'end';
  /** false: no grow / shrink motion. */
  morph?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called once it has fully opened. */
  onShown?: () => void;
  /** What gets the focus when it opens (default "first": the first focusable thing inside). */
  focus?: 'first' | 'panel' | 'none';
  /** false: clicks on the button don't toggle it (call open() / close() yourself). */
  bindAnchor?: boolean;
};
type MenuOpts = PopoverOpts & { onSelect?: (index: number, item: HTMLElement) => void; selected?: number };
type SelectOpts = PopoverOpts & { value?: string | number; onChange?: (value: string, index: number) => void };
/** Plain-JS popover: `panel` grows out of `button`. */
export declare function createPopover(button: HTMLElement, panel: HTMLElement, opts?: PopoverOpts): GlassPopoverController;
/** Plain-JS menu: the panel's [role=menuitem] / [data-gp-item] children are the items. */
export declare function createMenu(
  button: HTMLElement,
  panel: HTMLElement,
  opts?: MenuOpts
): Omit<GlassPopoverController, 'reposition' | 'update'> & { readonly selected: number; update(next?: { onSelect?: MenuOpts['onSelect']; selected?: number; props?: GlassProps }): void };
/** Plain-JS select: the panel's children with data-value are the options. */
export declare function createSelect(
  button: HTMLElement,
  panel: HTMLElement,
  opts?: SelectOpts
): { readonly isOpen: boolean; open(): void; close(refocus?: boolean): void; update(next?: { value?: string | number; onChange?: SelectOpts['onChange']; props?: GlassProps }): void; destroy(): void };
/** Plain-JS tooltip on any element (text defaults to its aria-label). */
export declare function createTooltip(
  el: HTMLElement,
  opts?: { text?: string; placement?: 'top' | 'bottom'; delay?: number; group?: GlassGroupName; props?: GlassProps }
): { show(): void; hide(): void; update(next?: { text?: string; props?: GlassProps }): void; destroy(): void };
export interface GlassSheetController {
  readonly isOpen: boolean;
  readonly detent: number;
  /** Open at detent index i (default 0), or move there if it's open. */
  open(i?: number): void;
  close(): void;
  snapTo(i: number): void;
  update(next?: { onClose?: () => void; onDetentChange?: (index: number) => void; detents?: number[]; props?: GlassProps }): void;
  destroy(): void;
}
/** Plain-JS bottom sheet: `el` is the panel with your content (moved into the overlay while open). */
export declare function createSheet(
  el: HTMLElement,
  opts?: { detents?: number[]; onClose?: () => void; onDetentChange?: (index: number) => void; dim?: number; groups?: GlassSheetGroups; props?: GlassProps }
): GlassSheetController;
/** Plain-JS toasts. */
export declare function createToaster(opts?: { group?: GlassGroupName; max?: number; duration?: number }): GlassToaster & { destroy(): void };
/** The shared overlay element on <body> (e.g. to portal your own panel into it). */
export declare function getGlassOverlay(): HTMLElement;

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

/** Glass on a ref'd element. Returns its handle (stable across renders; no-ops until the glass is on). */
export declare function useGlass(ref: RefObject<HTMLElement | null>, group: GlassGroupName | null | false | undefined, props?: GlassProps): GlassHandle;

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
  group?: GlassGroupName;
  /** The film's end tint / frost. Default: the target's resolved look (it starts in `from`'s look). */
  look?: { tintOpacity?: number; blur?: number };
  /** How far the liquid neck reaches before it snaps (px). Default 34. */
  morphRadius?: number;
  /** Glass layer of the film. Default "float". */
  layer?: GlassLayer;
  /** z-index of the film's (empty) shapes. Default 1. */
  zIndex?: number;
  /** Fade the target's content in at the end / out first. Default true. */
  fadeContent?: boolean;
  /** "in" (default): the target grows out of `from`; "out": it melts back and is hidden. */
  direction?: 'in' | 'out';
  /** Keep `from` on screen the whole time (the target buds off it). Default true. */
  keepFrom?: boolean;
  /**
   * The target REPLACES `from`, like a popover: `from` steps aside as the film starts (the film is
   * `from`'s own glass, grown), stays hidden while the target is open, and comes back once the target
   * has melted back into it. Lay the target out over `from`. Implies keepFrom: false. Default false.
   */
  replaceFrom?: boolean;
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
 * Morph `from` into `to` as liquid glass: the film starts as `from`'s own shape
 * and look and swells into `to` (`from` is hidden while it plays). `to` is any
 * element laid out where it ends up; hide it with the `hidden` attribute and
 * glassMorph shows it.
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
      'glass-ui': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { group?: GlassGroupName; props?: string };
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

/** An element's glass: what attachGlass() and useGlass() return. */
export interface GlassHandle {
  readonly id: number | null;
  /** The element the glass is on. */
  readonly el: HTMLElement | null;
  /** Replace the per-element props. */
  setProps(props: GlassProps): void;
  /** Change SOME per-element props, keeping the rest. */
  merge(partial: GlassProps): void;
  /** The per-element props (a copy). */
  getProps(): GlassProps | null;
  /** Hover / pressed from code — the same look, press grow and glow the pointer gives. */
  setState(state: { hover?: boolean; pressed?: boolean }): void;
  /** Water rings from (x, y) in the element's own px (default: its centre). Groups with "ripple" > 0. */
  ripple(x?: number, y?: number): void;
  /** Remove the glass (attachGlass only — useGlass removes it on unmount). */
  destroy?(): void;
}
export declare function attachGlass(el: HTMLElement, group: GlassGroupName, props?: GlassProps): GlassHandle & { destroy(): void };
export declare function setGlassProps(el: HTMLElement, props: GlassProps): void;
/** The element's current per-element props (a copy), or null when it has no glass. */
export declare function getGlassProps(el: HTMLElement): GlassProps | null;
/** Change some per-element props, keeping the rest (setGlassProps replaces them all). */
export declare function mergeGlassProps(el: HTMLElement, partial: GlassProps): void;
export declare function configureGlass(config: GlassConfig | null, opts?: { silent?: boolean }): void;
/** Add a preset pack (extra groups etc.) over the built-in presets and under configureGlass(), which keeps it. Returns a remove function. */
export declare function addGlassPresets(config: GlassConfig): () => void;
export declare function getGlassConfig(): GlassConfig;
/**
 * The look of every glass on the page, in one line: applyGlassLook('frosted'),
 * applyGlassLook('tinted', { color: '#ff2d55' }), applyGlassLook(null) = none.
 * Elements / groups with their own `look` keep theirs. Returns a function
 * that puts the previous page look back.
 */
export declare function applyGlassLook(name: GlassLook | null, options?: { color?: string }): () => void;
/** The page look in use (applyGlassLook's, else the config's global.look), or null. */
export declare function getGlassLook(): { name: string; color: string } | null;
/** The built-in look names. */
export declare const GLASS_LOOKS: GlassLookName[];
export declare function requestGlassRender(): void;
export declare function reserveSnapshotArea(key: string, rect: { left: number; top: number; right: number; bottom: number } | null): void;

// --- Scroll edge effect + tilt highlight (1.5.2) -----------------------------------------------
export interface GlassScrollEdgeOptions {
  /** Which edges get the effect (default 'top'). */
  edges?: 'top' | 'bottom' | 'both';
  /** soft = gradual blur + fade (default); hard = a more opaque backing with a crisp edge. */
  effect?: 'soft' | 'hard';
  /** px of fade beyond the bar (default 32). */
  size?: number;
  /** px fully covered at the edge — the pinned bar's height (default 0); one number or per edge. */
  inset?: number | { top?: number; bottom?: number };
  /** What the content fades into: 'auto' (nearest opaque background, default) or a CSS colour. */
  color?: string;
}
export interface GlassScrollEdgeController {
  update(options: GlassScrollEdgeOptions): void;
  destroy(): void;
  host: HTMLElement | null;
}
/** Scroll edge effect on a scroll container — or on the page itself (window / document). */
export declare function createScrollEdge(target: HTMLElement | Window | Document, options?: GlassScrollEdgeOptions): GlassScrollEdgeController;
export type GlassScrollEdgeProps = GlassScrollEdgeOptions &
  Omit<HTMLAttributes<HTMLElement>, 'color'> & {
    /** The container's tag (default 'div'). */
    as?: keyof JSX.IntrinsicElements;
    children?: ReactNode;
  };
/** A scroll container (overflow-y auto unless its style says otherwise) with the scroll edge effect. A pinned bar inside needs z-index ≥ 2. */
export declare const GlassScrollEdge: ForwardRefExoticComponent<GlassScrollEdgeProps & RefAttributes<HTMLElement>>;
/**
 * Turn the tilt highlight on where the browser asks first (iOS): call from a tap / click handler.
 * Resolves true when tilt data will flow, false when refused or unsupported. Never called by the library itself.
 */
export declare function enableTiltHighlight(): Promise<boolean>;
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const isGlassColor: typeof import('./devtools').isGlassColor;
export declare const GLASS_VERSION: string;

// --- Tools (for building a live tuning panel) -------------------------------------------------

/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const GLASS_SCHEMA: typeof import('./devtools').GLASS_SCHEMA;
export declare const GLASS_LAYERS: GlassLayer[];
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const GLASS_STATE_KEYS: typeof import('./devtools').GLASS_STATE_KEYS;
export declare const GLASS_LIVE_SUPPORTED: boolean;
/** Can this browser run global.backdrop "canvas" (HTML-in-Canvas, Chromium 157+)? */
export declare const GLASS_CANVAS_BACKDROP_SUPPORTED: boolean;
export declare function getGlassGlobal(): Required<Omit<GlassGlobal, 'zIndex' | 'snapshot'>> & {
  zIndex: { base: number; float: number; top: number };
  snapshot: Required<NonNullable<GlassGlobal['snapshot']>>;
};
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const glassGroupNames: typeof import('./devtools').glassGroupNames;
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const rawGlassGroup: typeof import('./devtools').rawGlassGroup;
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const rawGlassThemeGroup: typeof import('./devtools').rawGlassThemeGroup;
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const rawGlassDefaults: typeof import('./devtools').rawGlassDefaults;
export declare function getGlassTheme(): 'light' | 'dark';
export declare function resolveGlass(group: GlassGroupName, props?: GlassProps, state?: { hover?: boolean; pressed?: boolean; disabled?: boolean }): ResolvedGlass;
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const setGlassOverride: typeof import('./devtools').setGlassOverride;
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const clearGlassOverride: typeof import('./devtools').clearGlassOverride;
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const getGlassOverride: typeof import('./devtools').getGlassOverride;
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const setGlassStateOverride: typeof import('./devtools').setGlassStateOverride;
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const setGlassForcedState: typeof import('./devtools').setGlassForcedState;
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const subscribeGlassConfig: typeof import('./devtools').subscribeGlassConfig;
export type GlassStatus = { state: 'off' | 'loading' | 'on' | 'fallback'; reason: string };
export declare function getGlassStatus(): GlassStatus;
export declare function subscribeGlassStatus(fn: (status: GlassStatus) => void): () => void;
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const glassStats: typeof import('./devtools').glassStats;
/** @deprecated moved to "glassparency/devtools" (still here until the next major version) */
export declare const glassLiveCount: typeof import('./devtools').glassLiveCount;
/** Automatic quality: the level in use, whether it's automatic, and the fps it last measured while animating. */
export type GlassQuality = { level: 'high' | 'medium' | 'low'; auto: boolean; fps: number };
export declare function getGlassQuality(): GlassQuality;
export declare function subscribeGlassQuality(fn: () => void): () => void;
export declare const GLASS_QUALITY_LEVELS: Array<{ name: 'high' | 'medium' | 'low'; samples: number; bufferScale: number; dpr: number }>;
/**
 * Saving power (global.powerSaving):
 *   enabled        global.powerSaving is on
 *   hidden         the tab is hidden (drawing is paused while enabled)
 *   reducedMotion  animations jump to their end right now (OS "Reduce motion", or low battery while enabled)
 *   lowBattery     the battery is low (≤ 20 %) and unplugged (Battery Status API; always false without it)
 */
export type GlassPower = { enabled: boolean; hidden: boolean; reducedMotion: boolean; lowBattery: boolean };
/** The power-saving state (stable between changes: fine for useSyncExternalStore). */
export declare function getGlassPower(): GlassPower;
/** Called whenever the power-saving state changes. */
export declare function subscribeGlassPower(fn: () => void): () => void;
