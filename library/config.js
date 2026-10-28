/**
 * =============================================================================
 * glass/config.js — Reads glass.config.json and works out each element's look
 * =============================================================================
 * Order of precedence (later wins):
 *   defaults  →  themes[theme].defaults
 *   →  groups[group]  →  themes[theme].groups[group]
 *   →  props passed to useGlass()/<Glass>
 *   →  runtime overrides (a live tuning panel — setGlassOverride…)
 *   →  the hover / pressed / disabled block for the element's current state
 *
 * THEMES (light / dark mode): the top-level settings are the LIGHT look.
 * "themes": { "dark": { "defaults": {…}, "groups": { "card": {…} } } } lists
 * only what changes in dark mode (mostly tint / border / shadow / rim light).
 * The theme is worked out from the page (see readTheme: global.theme, then
 * <html data-theme="…"> — what most theme switchers set — then
 * a "dark" class, then the page's CSS color-scheme) and watched, so switching
 * theme re-resolves every glass element live. The library never imports the
 * app's theme code.
 *
 * WHERE THE CONFIG COMES FROM: glass.config.json is the built-in config
 * (the presets: every built-in group's tuning). configureGlass(config) — or <GlassProvider config={…}> —
 * deep-merges a site's own config on top of it, so a site only lists what
 * it changes.
 *
 * Every value is checked against SCHEMA: numbers are clamped to a safe range
 * and anything unusable falls back to the default with a console warning
 * (once per problem), so a typo in the JSON can never break the page.
 *
 * Saving glass.config.json while `npm run dev` is running hot-reloads it —
 * see the import.meta.hot block at the bottom.
 * =============================================================================
 */
import rawConfig from './glass.config.json';

// --- What each property may be --------------------------------------------------
// type: 'number' (with min/max), 'enum' (one of values), 'color' (#hex or
// {from, via?, to, angle}), 'size' ({x, y}), 'sides' ({top, right, bottom,
// left}), 'bool', 'string' (nullable), 'radius' (px number or "auto"),
// 'layer', 'tier'. A live tuning panel can build its controls from this table too.
export const SCHEMA = {
  enabled: { type: 'bool', label: 'Enabled', section: 'General' },
  layer: { type: 'layer', label: 'Layer', section: 'General' },
  tier: { type: 'tier', label: 'Tier', section: 'General' },
  // How floating glass sees the page: live (Chromium, real time) or WebGL
  // (+ page snapshots). See live.js.
  sampler: { type: 'enum', values: ['auto', 'webgl', 'live'], default: 'auto', label: 'Sampler (live = real-time, Chromium)', section: 'General' },
  // The look family (see STYLES below): default = Apple's (the group's own
  // values), crystal = clearer, thicker glass, frosted = milky, heavily
  // frosted glass in the group's own tint colour. A control's parts (a tab
  // bar's lens, a switch's knob, a checkbox's tick box…) follow its style.
  style: { type: 'enum', values: ['default', 'crystal', 'frosted'], default: 'default', label: 'Style', section: 'General' },

  shape: { type: 'enum', values: ['rectangle', 'roundedRectangle', 'circle', 'capsule'], default: 'roundedRectangle', label: 'Shape', section: 'Shape' },
  // auto = the element's CSS corner radius (16px if its corners are square).
  radius: { type: 'radius', min: 0, max: 200, step: 1, label: 'Corner radius (px, or auto)', section: 'Shape' },
  scale: { type: 'size', min: 0.5, max: 1.5, step: 0.01, label: 'Scale X / Y', section: 'Shape' },
  // Hide the rim on some sides: the slab is extended past the element by this
  // many px and cut off at the element's edge (for full-width bars).
  bleed: { type: 'sides', min: 0, max: 200, step: 1, label: 'Hide rim (px past edge)', section: 'Shape' },
  // Space around the glass: the element — glass and content together — moves
  // in by this much (e.g. a header floating as a capsule with a gap round it).
  padding: { type: 'sides', min: 0, max: 200, step: 1, label: 'Padding (space around the glass, px)', section: 'Shape' },

  thickness: { type: 'number', min: 0, max: 120, step: 1, label: 'Thickness', section: 'Glass' },
  // Up to 120: big round lenses (e.g. a draggable glass orb) need a wide rim. shapes.js
  // clamps it to the shape's corner radius, so large values are safe.
  bevel: { type: 'number', min: 0, max: 120, step: 0.5, label: 'Edge bevel (px)', section: 'Glass' },
  bevelSegments: { type: 'number', min: 1, max: 16, step: 1, label: 'Bevel smoothness', section: 'Glass', integer: true },
  // Shape of the rim's curve. squircle = Apple-style lens: flat for most of
  // the rim, then curving away sharply at the very edge (wide, smooth bend).
  // classic = a plain quarter circle (the original look).
  profile: { type: 'enum', values: ['squircle', 'classic'], default: 'squircle', label: 'Rim curve', section: 'Glass' },
  ior: { type: 'number', min: 1, max: 2.5, step: 0.01, label: 'IOR (refraction)', section: 'Glass' },
  // Lens that SHRINKS what's behind it (Apple's switch knob: the track looks
  // smaller through the glass, with a clear band of page round it), or —
  // negative — MAGNIFIES it (Apple's tab-bar lens while dragged).
  // 0 = off, 0.2 = things look 20% smaller, −0.15 = 15% bigger.
  minify: { type: 'number', min: -0.5, max: 0.5, step: 0.01, label: 'Shrink (+) / magnify (−) what’s behind', section: 'Glass' },
  chromaticAberration: { type: 'number', min: 0, max: 1, step: 0.005, label: 'Chromatic aberration', section: 'Glass' },
  anisotropy: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Anisotropy (smear)', section: 'Glass' },
  roughness: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Roughness (grain)', section: 'Glass' },
  blur: { type: 'number', min: 0, max: 64, step: 1, label: 'Frost blur (px)', section: 'Glass' },
  distortion: { type: 'number', min: 0, max: 2, step: 0.01, label: 'Distortion', section: 'Glass' },
  distortionScale: { type: 'number', min: 0.01, max: 2, step: 0.01, label: 'Distortion scale', section: 'Glass' },
  temporalDistortion: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Moving distortion', section: 'Glass' },
  samples: { type: 'number', min: 1, max: 16, step: 1, label: 'Samples (quality)', section: 'Glass', integer: true },
  reflection: { type: 'number', min: 0, max: 3, step: 0.05, label: 'Edge reflection', section: 'Glass' },
  saturation: { type: 'number', min: 0, max: 3, step: 0.05, label: 'Saturation of what’s behind', section: 'Glass' },
  brightness: { type: 'number', min: 0.5, max: 1.5, step: 0.01, label: 'Brightness of what’s behind', section: 'Glass' },

  // Specular rim: the bright hairline round the edge, lit from lightAngle.
  rimLight: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Rim highlight', section: 'Light' },
  rimWidth: { type: 'number', min: 0.5, max: 8, step: 0.25, label: 'Rim highlight width (px)', section: 'Light' },
  lightAngle: { type: 'number', min: -180, max: 180, step: 1, label: 'Light direction (deg, −45 = top-left)', section: 'Light' },
  innerGlow: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Inner glow', section: 'Light' },
  // Press: the control grows a little and lights up from where it's touched.
  pressScale: { type: 'number', min: 0.8, max: 1.2, step: 0.005, label: 'Grow when pressed', section: 'Light' },
  pressGlow: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Glow when pressed', section: 'Light' },

  // Squish & stretch (squish.js): Apple's jelly-like glass. While pressed the
  // glass swells (squishGrow) and is pulled towards the pointer — stretching
  // along the pull and thinning across it — then wobbles back on release.
  // squish 0 = off (the plain pressScale grow is used instead).
  squish: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Squish & stretch (0 = off)', section: 'Squish' },
  squishGrow: { type: 'number', min: 1, max: 1.6, step: 0.01, label: 'Swell when pressed', section: 'Squish' },
  squishPull: { type: 'number', min: 0, max: 60, step: 1, label: 'Pull towards the pointer (px)', section: 'Squish' },
  squishBounce: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Wobble on release', section: 'Squish' },

  // Ripples (ripple.js): the pointer moving over the glass sends water rings
  // through it — a ring where it comes in, more as it moves. ripple 0 = off.
  ripple: { type: 'number', min: 0, max: 24, step: 0.5, label: 'Ripple strength (px, 0 = off)', section: 'Ripple' },
  rippleWavelength: { type: 'number', min: 4, max: 60, step: 1, label: 'Ripple ring width (px)', section: 'Ripple' },
  rippleSpeed: { type: 'number', min: 20, max: 600, step: 5, label: 'Ripple speed (px/s)', section: 'Ripple' },
  rippleDuration: { type: 'number', min: 200, max: 4000, step: 50, label: 'Ripple fades over (ms)', section: 'Ripple' },

  // Liquid morph: glass elements with the same morph name (and layer) melt
  // into each other when they come within morphRadius px — like Apple's
  // morphing buttons. "" = off.
  morph: { type: 'string', label: 'Morph group name', section: 'Morph' },
  morphRadius: { type: 'number', min: 0, max: 80, step: 1, label: 'Morph reach (px)', section: 'Morph' },

  tint: { type: 'color', label: 'Tint', section: 'Colour' },
  tintOpacity: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Tint opacity', section: 'Colour' },

  // "auto" = textLight or textDark, whichever is more readable over what's
  // actually behind the glass (autoText.js samples it).
  textColor: { type: 'string', label: 'Text colour (or auto)', section: 'Content', css: true },
  textLight: { type: 'string', label: 'Auto text: light colour', section: 'Content' },
  textDark: { type: 'string', label: 'Auto text: dark colour', section: 'Content' },
  font: { type: 'string', label: 'Font family', section: 'Content', css: true },
  fontWeight: { type: 'string', label: 'Font weight', section: 'Content', css: true },
  iconColor: { type: 'string', label: 'Icon colour', section: 'Content', css: true },
  iconSize: { type: 'number', min: 8, max: 64, step: 1, label: 'Icon size (px)', section: 'Content', nullable: true },

  // Border + drop shadow drawn BY THE GLASS, so they always follow its real
  // shape (capsule, padding, scale…). Colours: "#hex" or "var(--name)".
  borderWidth: { type: 'number', min: 0, max: 8, step: 0.25, label: 'Border width (px)', section: 'Edge' },
  borderColor: { type: 'string', label: 'Border colour', section: 'Edge' },
  borderOpacity: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Border opacity', section: 'Edge' },
  shadowColor: { type: 'string', label: 'Shadow colour', section: 'Edge' },
  shadowOpacity: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Shadow opacity', section: 'Edge' },
  shadowBlur: { type: 'number', min: 0, max: 80, step: 1, label: 'Shadow blur (px)', section: 'Edge' },
  shadowX: { type: 'number', min: -40, max: 40, step: 1, label: 'Shadow X (px)', section: 'Edge' },
  shadowY: { type: 'number', min: -40, max: 40, step: 1, label: 'Shadow Y (px)', section: 'Edge' },
  shadowSpread: { type: 'number', min: -20, max: 40, step: 1, label: 'Shadow spread (px)', section: 'Edge' },
  // Keep the element's own CSS border / box-shadow as well (off by default:
  // CSS can't follow a glass shape that differs from the element's box).
  keepBorder: { type: 'bool', label: 'Also keep the CSS border', section: 'Edge' },
  keepShadow: { type: 'bool', label: 'Also keep the CSS shadow', section: 'Edge' },
};

/** Layers, bottom to top. Each is its own transparent canvas in the page. */
// 'top' = in front of all page content, just under the floating UI (e.g. a
// draggable glass orb over the page); its canvas lives in its own container
// (<GlassLayerHost layer="top">, z-index 48).
export const LAYERS = ['base', 'float', 'modal', 'top'];
export const STATE_KEYS = ['hover', 'pressed', 'disabled'];
// Optional per-group fine-tuning for a style: "crystal": {…} / "frosted": {…}
// blocks, merged over that style's rules (like the hover block over normal).
export const STYLE_KEYS = ['crystal', 'frosted'];

/**
 * The styles, as rules applied to a group's own (resolved) values, so they
 * work on ANY group without writing each one out. The colour is never
 * changed — frosted glass keeps the tint set in the config.
 *   "solid" parts (tintOpacity ≥ 0.98: switch knobs, a radio's dot) are left
 *   alone — they're paint, not glass. "Accent" parts (≥ 0.8: a checked box,
 *   a primary button) stay coloured but turn see-through in crystal.
 */
const SOLID = 0.98;
const ACCENT = 0.8;
const STYLES = {
  // Clearer, thicker glass that bends what's behind it more strongly.
  crystal(p) {
    const o = Number(p.tintOpacity);
    if (o >= SOLID) return p;
    return {
      ...p,
      tintOpacity: o >= ACCENT ? o * 0.65 : o * 0.3,
      blur: Math.min(Number(p.blur), 1),
      thickness: Number(p.thickness) * 1.35,
      rimLight: Math.max(Number(p.rimLight), 0.75),
      chromaticAberration: 0,
    };
  },
  // Milky, heavily frosted glass (Apple Music's sidebar), in the group's own tint.
  frosted(p, dark) {
    const o = Number(p.tintOpacity);
    if (o >= ACCENT) return p;
    return { ...p, tintOpacity: Math.max(o, dark ? 0.7 : 0.62), blur: Math.max(Number(p.blur), 24) };
  },
};

// --- Config store (the JSON + runtime overrides) --------------------------------
let builtInConfig = rawConfig; // glass.config.json (hot-reloaded in dev)
// Preset packs (addGlassPresets): merged over glass.config.json, UNDER the
// site config — e.g. an app's own groups, which then survive every
// configureGlass() call the way the built-in groups do.
const presetPacks = [];
const presetsConfig = () => presetPacks.reduce((acc, pack) => mergeConfig(acc, pack), builtInConfig);
let userConfig = null; // configureGlass() / <GlassProvider config>
let fileConfig = builtInConfig; // what everything reads: built-in + userConfig (mergeConfig)
let overrides = {}; // { [group]: {...props} } — set by a live tuning panel, never saved
let version = 0;
const listeners = new Set();

// --- Theme (light / dark) ----------------------------------------------------------
/**
 * The page's theme, 'light' or 'dark'. First match wins:
 *   1. global.theme "light" / "dark" in the config (forced);
 *   2. data-theme / data-bs-theme="dark|light" on <html> or <body>
 *      (Bootstrap 5.3 and most theme switchers);
 *   3. a "dark" / "light" class on <html> or <body> (Tailwind and co.);
 *   4. the page's CSS color-scheme: "dark" alone → dark; "light dark" → the
 *      OS setting (prefers-color-scheme), because the page follows it too;
 *   5. otherwise light. (A site that never mentions dark mode stays light
 *      even when the OS is dark — its CSS doesn't change either.)
 */
const THEME_ATTRS = ['data-theme', 'data-bs-theme'];
function readTheme() {
  if (typeof document === 'undefined') return 'light';
  const forced = fileConfig.global?.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  const nodes = [document.documentElement, document.body].filter(Boolean);
  for (const n of nodes) {
    for (const a of THEME_ATTRS) {
      const v = n.getAttribute(a);
      if (v === 'dark' || v === 'light') return v;
    }
  }
  for (const n of nodes) {
    if (n.classList.contains('dark')) return 'dark';
    if (n.classList.contains('light')) return 'light';
  }
  try {
    const scheme = getComputedStyle(document.documentElement).colorScheme || '';
    const dark = /\bdark\b/.test(scheme);
    const light = /\blight\b/.test(scheme);
    if (dark && !light) return 'dark';
    if (dark && light) return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    // (no computed style yet — keep light)
  }
  return 'light';
}
let theme = readTheme();
/** 'light' | 'dark' — the theme the glass is currently drawn for. */
export const getGlassTheme = () => theme;
/** The "themes.<theme>" block of the config for the current theme (light = none). */
const themeBlock = () => (theme === 'light' ? null : fileConfig.themes?.[theme] || null);
/** Re-read the theme; re-resolve everything if it changed. */
function recheckTheme() {
  const next = readTheme();
  if (next === theme) return;
  theme = next;
  changed();
}
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  // Re-resolve every element (registry, live.js, useGlass and the canvases all
  // listen to config changes) when the page switches light ↔ dark.
  const themeObserver = new MutationObserver(recheckTheme);
  const watch = (n) => n && themeObserver.observe(n, { attributes: true, attributeFilter: [...THEME_ATTRS, 'class', 'style'] });
  watch(document.documentElement);
  // <body> may not exist yet (the library loaded from a script in <head>).
  if (document.body) watch(document.body);
  else document.addEventListener('DOMContentLoaded', () => {
    watch(document.body);
    recheckTheme();
  }, { once: true });
  // color-scheme "light dark" pages follow the OS setting live.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', recheckTheme);
}

export const getConfigVersion = () => version;
export const subscribeConfig = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
function changed() {
  version += 1;
  listeners.forEach((fn) => fn(version));
}

/** The phones / narrow-window layout that gets CSS glass only (no WebGL). */
export const DEFAULT_MOBILE_QUERY = '(max-width: 860px)';

/** Global switches (enabled, maxDpr, snapshot…), with safe defaults. */
export function getGlobal() {
  const g = fileConfig.global || {};
  const s = g.snapshot || {};
  const z = g.zIndex || {};
  return {
    enabled: g.enabled !== false,
    maxDpr: clamp(num(g.maxDpr, 1.5), 0.5, 3),
    bufferScale: clamp(num(g.bufferScale, 1), 0.25, 1),
    // "auto" = full quality, throttled only while animation is too slow
    // (quality.js); "high" / "medium" / "low" = always that level.
    quality: ['auto', 'high', 'medium', 'low'].includes(g.quality) ? g.quality : 'auto',
    debugOutlines: Boolean(g.debugOutlines),
    // CSS selector of the element whose changes move glass and whose picture
    // floating WebGL glass refracts ("body" = the whole page; a React app
    // might use "#root"). Missing on the page → <body>.
    root: typeof g.root === 'string' && g.root.trim() ? g.root.trim() : 'body',
    // What base glass refracts: "auto" = the page's own background colour
    // (read live), or { light: {base, glows}, dark: {…} } — see pageBackground.js.
    background: g.background && typeof g.background === 'object' ? g.background : 'auto',
    // A picture the page shows behind everything (CSS), as a URL — or null.
    // With background "auto", the WebGL background draws it (cover-fitted,
    // centred, fixed to the window, like CSS `background: center / cover`)
    // instead of the flat page colour, so WebGL glass (morph shapes,
    // floating glass over empty page) refracts the picture. Never painted on
    // screen. Needs CORS on the image (Access-Control-Allow-Origin); without
    // it the flat colour is used. See pageBackground.js.
    backgroundImage: typeof g.backgroundImage === 'string' && g.backgroundImage.trim() ? g.backgroundImage.trim() : null,
    // Media query of the layout that never starts WebGL (CSS glass only).
    // null / false / "" = always try WebGL.
    mobileQuery: g.mobileQuery === undefined ? DEFAULT_MOBILE_QUERY : typeof g.mobileQuery === 'string' && g.mobileQuery.trim() ? g.mobileQuery : null,
    // Exceptions to mobileQuery: layers whose glass still runs WebGL in the
    // mobile layout (everything else there stays CSS glass). Only the layers
    // listed get a canvas, and it draws only their own glass — so a single
    // piece of glass (e.g. a glass orb on layer "top") can be
    // real glass on phones without paying for the whole page.
    mobileLayers: Array.isArray(g.mobileLayers) ? g.mobileLayers.filter((l) => LAYERS.includes(l)) : [],
    // Stacking of the page-wide canvases: base glass sits behind the page
    // content, floating glass under the site's floating UI (HTML that floating
    // glass belongs to needs a HIGHER z-index than "float").
    zIndex: {
      base: Math.round(clamp(num(z.base, -1), -2147483647, 2147483647)),
      float: Math.round(clamp(num(z.float, 49), -2147483647, 2147483647)),
    },
    theme: g.theme === 'light' || g.theme === 'dark' ? g.theme : 'auto',
    // Where the page-wide canvases (base, float) sit:
    //   "viewport" (default) — fixed to the window, redrawn as the page scrolls.
    //   "page" — in the page itself, covering the visible part plus a margin,
    //     and moved on each redraw. Phones and tablets scroll on their own
    //     thread and only tell the page afterwards, so a window-fixed canvas
    //     draws its glass a frame or more behind the content; a canvas in the
    //     page scrolls WITH the content, so the glass stays glued to it.
    //     Glass on fixed / sticky elements can't scroll with the page: in this
    //     mode it keeps its CSS look (or is live, where live glass runs).
    anchor: g.anchor === 'page' ? 'page' : 'viewport',
    snapshot: {
      enabled: s.enabled !== false,
      debounceMs: clamp(num(s.debounceMs, 450), 50, 10000),
      minIntervalMs: clamp(num(s.minIntervalMs, 1200), 100, 60000),
      margin: clamp(num(s.margin, 480), 0, 4000),
      scale: clamp(num(s.scale, 1), 0.25, 2),
    },
  };
}

export const groupNames = () => Object.keys(fileConfig.groups || {});
/**
 * The group exactly as written in the JSON (plus any lab overrides). In dark
 * mode that is the light group with its "themes.dark" changes on top.
 */
export const rawGroup = (group) => ({
  ...(fileConfig.groups?.[group] || {}),
  ...(themeBlock()?.groups?.[group] || {}),
  ...(overrides[group] || {}),
});
export const rawDefaults = () => ({ ...(fileConfig.defaults || {}), ...(themeBlock()?.defaults || {}) });
/** The current theme's own block for a group (what dark mode changes), plus lab overrides. */
export const rawThemeGroup = (group) => ({ ...(themeBlock()?.groups?.[group] || {}), ...(overrides[group] || {}) });

/** Live tuning: change a group's props live (not saved to the file). */
export function setOverride(group, props) {
  overrides = { ...overrides, [group]: { ...(overrides[group] || {}), ...props } };
  changed();
}
export function clearOverride(group) {
  const { [group]: _drop, ...rest } = overrides;
  overrides = rest;
  changed();
}
export const getOverride = (group) => overrides[group] || {};

/**
 * Live tuning: change a group's hover / pressed / disabled block live. Starts
 * from the block in the JSON, so Copy JSON gives the complete block back.
 */
export function setStateOverride(group, stateKey, props) {
  const fileBlock = { ...(fileConfig.groups?.[group]?.[stateKey] || {}), ...(themeBlock()?.groups?.[group]?.[stateKey] || {}) };
  const current = overrides[group]?.[stateKey] || fileBlock;
  setOverride(group, { [stateKey]: { ...current, ...props } });
}

// Live tuning: show every element of a group in a state (e.g. "hover") without
// having to hover it, while that state is being edited.
let forcedStates = {}; // { [group]: 'hover' | 'pressed' | 'disabled' }
export function setForcedState(group, stateKey) {
  const { [group]: _drop, ...rest } = forcedStates;
  forcedStates = stateKey ? { ...rest, [group]: stateKey } : rest;
  changed();
}

// --- A site's own config (configureGlass / <GlassProvider config>) ----------------
/**
 * Deep-merge a site's config on top of the built-in one (glass.config.json):
 * a site lists only what it changes, e.g.
 *   configureGlass({ groups: { button: { tint: '#ff3b30' } }, global: { root: '#app' } })
 * Objects merge key by key; "tint" and "background" are replaced as a whole
 * (a gradient's stops belong together); null removes nothing (it's a value).
 * Pass null to go back to the built-in config.
 * @param {object|null} config
 * @param {{silent?: boolean}} [opts] silent: don't notify yet (GlassProvider
 *   applies its config prop while rendering and notifies in an effect).
 */
export function configureGlass(config, { silent = false } = {}) {
  userConfig = config && typeof config === 'object' ? config : null;
  fileConfig = mergeConfig(presetsConfig(), userConfig);
  warned.clear();
  theme = readTheme(); // global.theme may have changed
  if (!silent) changed();
}
/**
 * Add a preset pack: extra groups (and defaults / themes / global settings),
 * same format as glass.config.json, merged OVER the built-in presets and
 * UNDER the site config. configureGlass() replaces the site config each time
 * it's called; preset packs stay — so an app registers its own groups once at
 * startup and later configureGlass() calls (a background-image setting…)
 * never drop them.
 *   const remove = addGlassPresets({ groups: { promoCard: { tint: '#fde68a' } } });
 * @param {object} pack
 * @returns {() => void} remove the pack again (e.g. before hot-reloading it)
 */
export function addGlassPresets(pack) {
  if (!pack || typeof pack !== 'object') return () => {};
  presetPacks.push(pack);
  const apply = () => {
    fileConfig = mergeConfig(presetsConfig(), userConfig);
    warned.clear();
    theme = readTheme(); // a pack may set global.theme
    changed();
  };
  apply();
  return () => {
    const i = presetPacks.indexOf(pack);
    if (i < 0) return;
    presetPacks.splice(i, 1);
    apply();
  };
}
/** Tell everything that the config changed (after a silent configureGlass). */
export const notifyConfigChanged = () => changed();
/** The config in use: built-in + configureGlass() (a copy; for tools like a live tuning panel). */
export const getGlassConfig = () => JSON.parse(JSON.stringify(fileConfig));

const REPLACE_WHOLE = new Set(['tint', 'background']);
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function mergeConfig(base, extra) {
  if (!isPlainObject(extra)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) && !REPLACE_WHOLE.has(k) ? mergeConfig(base[k], v) : v;
  }
  return out;
}

// --- Resolving an element's final props --------------------------------------------
/**
 * @param {string} group   config group name ("button", "card"…)
 * @param {object} props   per-element props from useGlass()/<Glass>
 * @param {object} state   { hover, pressed, disabled } booleans
 * @returns validated, flattened props (no hover/pressed/disabled blocks)
 */
export function resolveGlass(group, props = {}, state = {}) {
  if (forcedStates[group]) state = { ...state, [forcedStates[group]]: true };
  const defaults = fileConfig.defaults || {};
  if (group && !fileConfig.groups?.[group]) warnOnce(`group:${group}`, `glass: unknown group "${group}" — using defaults`);
  const t = themeBlock(); // dark mode: "themes.dark" (null in light mode)
  const layers = [defaults, t?.defaults || {}, fileConfig.groups?.[group] || {}, t?.groups?.[group] || {}, props, overrides[group] || {}];

  let merged = {};
  for (const l of layers) merged = mergeProps(merged, l);
  // State blocks, in the same precedence order (defaults' hover, group's hover…).
  for (const key of STATE_KEYS) {
    if (!state[key]) continue;
    for (const l of layers) if (l[key]) merged = mergeProps(merged, l[key]);
  }
  // Style (crystal / frosted): its rules on the result, then any
  // "crystal" / "frosted" fine-tuning blocks the layers have for it.
  const style = merged.style;
  if (STYLES[style]) {
    merged = STYLES[style](merged, theme === 'dark');
    for (const l of layers) if (l[style]) merged = mergeProps(merged, l[style]);
  }
  return validate(merged, group);
}

/**
 * The keys a group sets ITSELF (group, its dark-mode block, the element's own
 * props and Glass-lab overrides — plus their hover/pressed/disabled blocks
 * while that state is on), i.e. NOT inherited from "defaults".
 * Used for glass that is switched off ("enabled": false): useGlass then
 * applies only these as plain CSS (background, text, border, shadow…), so a
 * disabled group with no colours of its own looks exactly like no glass.
 * @returns {Set<string>}
 */
export function explicitKeys(group, props = {}, state = {}) {
  if (forcedStates[group]) state = { ...state, [forcedStates[group]]: true };
  const t = themeBlock();
  const layers = [fileConfig.groups?.[group] || {}, t?.groups?.[group] || {}, props, overrides[group] || {}];
  const keys = new Set();
  const add = (o) => Object.keys(o || {}).forEach((k) => !STATE_KEYS.includes(k) && !STYLE_KEYS.includes(k) && !k.startsWith('$') && keys.add(k));
  layers.forEach(add);
  for (const key of STATE_KEYS) if (state[key]) for (const l of layers) add(l[key]);
  return keys;
}

function mergeProps(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    if (STATE_KEYS.includes(k) || STYLE_KEYS.includes(k) || k.startsWith('$')) continue;
    out[k] = (k === 'scale' || k === 'bleed' || k === 'padding') && v && typeof v === 'object' ? { ...(a[k] || {}), ...v } : v;
  }
  return out;
}

const DEFAULT_TINT = { from: '#ffffff', via: null, to: '#ffffff', angle: 180 };

function validate(p, group) {
  const out = {};
  for (const [key, rule] of Object.entries(SCHEMA)) {
    const v = p[key];
    const bad = (why) => warnOnce(`${group}.${key}`, `glass: ${group}.${key} ${why} — using a default`);
    switch (rule.type) {
      case 'bool':
        out[key] = v === undefined ? true : Boolean(v);
        break;
      case 'number': {
        if (v == null && rule.nullable) {
          out[key] = null;
          break;
        }
        let n = Number(v);
        if (!Number.isFinite(n)) {
          if (v !== undefined) bad(`should be a number (got ${JSON.stringify(v)})`);
          n = rule.min;
        }
        n = clamp(n, rule.min, rule.max);
        out[key] = rule.integer ? Math.round(n) : n;
        break;
      }
      case 'enum':
        if (rule.values.includes(v)) out[key] = v;
        else {
          if (v !== undefined) bad(`should be one of ${rule.values.join(', ')}`);
          out[key] = rule.default ?? rule.values[0];
        }
        break;
      case 'radius':
        if (v === 'auto' || v === undefined) out[key] = 'auto';
        else if (Number.isFinite(Number(v))) out[key] = clamp(Number(v), rule.min, rule.max);
        else {
          bad('should be a number or "auto"');
          out[key] = 'auto';
        }
        break;
      case 'size': {
        const x = Number(v?.x ?? 1);
        const y = Number(v?.y ?? 1);
        out[key] = {
          x: Number.isFinite(x) ? clamp(x, rule.min, rule.max) : 1,
          y: Number.isFinite(y) ? clamp(y, rule.min, rule.max) : 1,
        };
        break;
      }
      case 'sides': {
        const side = (k) => {
          const n = Number(v?.[k] ?? 0);
          return Number.isFinite(n) ? clamp(n, rule.min, rule.max) : 0;
        };
        out[key] = { top: side('top'), right: side('right'), bottom: side('bottom'), left: side('left') };
        break;
      }
      case 'color':
        out[key] = parseTint(v, () => bad('should be a CSS colour ("#rrggbb", "var(--name)", "rgb(…)"…) or { "from", "to", "angle" }'));
        break;
      case 'string':
        out[key] = v == null || v === '' ? null : String(v);
        break;
      case 'layer':
        out[key] = v === 'auto' || v === undefined ? 'auto' : LAYERS.includes(v) ? v : (bad(`should be auto, ${LAYERS.join(', ')}`), 'auto');
        break;
      case 'tier':
        out[key] = v === 'auto' || v === undefined ? 'auto' : Number.isInteger(v) && v >= 0 && v <= 5 ? v : (bad('should be auto or 0–5'), 'auto');
        break;
      default:
        out[key] = v;
    }
  }
  return out;
}

/**
 * Is this a colour the glass can use? "#rgb" / "#rrggbb" (the original
 * forms), "var(--name)" / "var(--name, fallback)" = read that CSS variable
 * from the element (e.g. a status colour set per card), or any
 * other CSS colour the browser understands (rgb(), hsl(), oklch(), "white"…).
 * A colour's own alpha is ignored: tintOpacity / borderOpacity /
 * shadowOpacity set how strong it is.
 */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const VAR = /^var\(\s*--[\w-]+\s*(,.*)?\)$/i;
export function isColor(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return false;
  if (HEX.test(s) || VAR.test(s)) return true;
  if (typeof CSS !== 'undefined' && CSS.supports) return CSS.supports('color', s);
  return /^[a-z-]+(\(.*\))?$/i.test(s); // (no browser: accept colour-looking words)
}
/** "#hex" or {from, via?, to, angle} → {from, via|null, to, angle} (always a gradient). */
function parseTint(v, onBad) {
  if (v === undefined || v === null) return DEFAULT_TINT;
  if (typeof v === 'string') {
    if (isColor(v)) return { from: v.trim(), via: null, to: v.trim(), angle: 180 };
    onBad();
    return DEFAULT_TINT;
  }
  if (typeof v === 'object' && isColor(v.from) && isColor(v.to)) {
    return {
      from: v.from.trim(),
      via: isColor(v.via) ? v.via.trim() : null,
      to: v.to,
      angle: Number.isFinite(Number(v.angle)) ? Number(v.angle) : 180,
    };
  }
  onBad();
  return DEFAULT_TINT;
}

// --- Small helpers -------------------------------------------------------------------
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * The page element the glass watches and photographs (global.root), or
 * <body> when the selector is missing / matches nothing / is invalid.
 * @returns {HTMLElement|null} (null only before <body> exists)
 */
export function glassRoot() {
  if (typeof document === 'undefined') return null;
  const sel = getGlobal().root;
  let el = null;
  if (sel !== 'body') {
    try {
      el = document.querySelector(sel);
    } catch {
      warnOnce(`root:${sel}`, `glass: global.root "${sel}" is not a valid CSS selector — using <body>`);
    }
  }
  return el || document.body;
}
const warned = new Set();
function warnOnce(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

// --- Hot reload of glass.config.json (dev only) -------------------------------------
if (import.meta.hot) {
  import.meta.hot.accept('./glass.config.json', (mod) => {
    if (!mod) return;
    builtInConfig = mod.default;
    fileConfig = mergeConfig(presetsConfig(), userConfig);
    warned.clear();
    changed();
  });
}
