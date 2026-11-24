/**
 * =============================================================================
 * glass/adapters/tailwind.js — Tailwind CSS plugin ("glassparency/tailwind")
 * =============================================================================
 * Classes that mark elements for glass. The glass itself is drawn by the
 * library's auto-attach (the script build, or start() from
 * "glassparency/vanilla" / "/vue" / "/svelte"), which finds these classes
 * the same way it finds data-glassparency attributes (../standalone.js):
 *
 *   glass                     glass, group "panel"
 *   glass-clear               glass with the "clear" look   (config.js "Looks")
 *   glass-frosted             … "frosted"
 *   glass-tinted              … "tinted" (colour: glass-tint-<colour>)
 *   glass-smoke               … "smoke" (dark smoke)
 *   glass-group-card          the glass group (built-in names autocomplete;
 *                             glass-group-[myGroup] for your own)
 *   glass-tint-rose-500       the tinted look's colour (any theme colour, or
 *                             glass-tint-[#ff2d55]) — sets --glassparency-look-color
 *
 * Until the library has attached (and wherever it doesn't run), each class
 * also gives a plain CSS stand-in — a translucent background with a
 * backdrop blur in that look — so the page never shows bare boxes while the
 * script loads. It applies only to elements without glass yet
 * (:not([data-glass-id])), so it never fights the real glass.
 *
 * Tailwind v4 (CSS-first):
 *   @import "tailwindcss";
 *   @plugin "glassparency/tailwind";
 *   @plugin "glassparency/tailwind" { fallback: false; }   ← options
 * Tailwind v3 (tailwind.config.js):
 *   plugins: [require('glassparency/tailwind')]   or   [require('glassparency/tailwind')({ fallback: false })]
 *
 * Options: fallback (default true) — the CSS stand-in above; groups — the
 * group names offered by glass-group-* (default: the built-in ones).
 *
 * No import of tailwindcss here: the plugin has the shape Tailwind's own
 * plugin.withOptions() makes ({ handler, config } from a function marked
 * __isOptionsFunction), which v3 and v4 both load — so this file works with
 * whichever Tailwind the site has (or none, at no cost).
 * =============================================================================
 */

/** The built-in glass groups (glass-group-<name> autocompletes these). */
const GROUPS = [
  'panel', 'card', 'tile', 'button', 'buttonPrimary', 'buttonGhost', 'iconButton', 'chip', 'alert', 'topbar',
  'sidebar', 'sidebarPanel', 'dock', 'menu', 'modal', 'popover', 'tooltip', 'sheet', 'toast', 'textField', 'tabBar',
];

/** The default tinted colour (config.js DEFAULT_LOOK_COLOR). */
const TINT = '#5b7cfa';

/**
 * The CSS stand-in of each look (only until the glass is attached): close
 * to each look's character, using only what plain CSS can do. A 1px inset
 * ring, not a border, so nothing shifts when the real glass takes over.
 */
const STAND_IN = {
  glass: { bg: 'rgb(255 255 255 / 0.3)', filter: 'blur(10px) saturate(1.6)', ring: 'rgb(255 255 255 / 0.45)' },
  'glass-clear': { bg: 'rgb(255 255 255 / 0.08)', filter: 'blur(1px) saturate(1.2)', ring: 'rgb(255 255 255 / 0.6)' },
  'glass-frosted': { bg: 'rgb(255 255 255 / 0.56)', filter: 'blur(28px) saturate(1.8)', ring: 'rgb(255 255 255 / 0.5)' },
  'glass-tinted': { bg: `color-mix(in srgb, var(--glassparency-look-color, ${TINT}) 26%, transparent)`, filter: 'blur(12px) saturate(1.9)', ring: 'rgb(255 255 255 / 0.5)' },
  'glass-smoke': { bg: 'rgb(27 27 33 / 0.56)', filter: 'blur(14px) brightness(0.82) saturate(1.2)', ring: 'rgb(255 255 255 / 0.25)', color: '#fff' },
};

/** Tailwind's colour palette ({ rose: { 500: '…' } }) → { 'rose-500': '…' } (as Tailwind's own flattenColorPalette). */
function flattenColors(colors, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(colors || {})) {
    if (v && typeof v === 'object') {
      for (const [sub, val] of Object.entries(flattenColors(v, ''))) out[sub === 'DEFAULT' ? `${prefix}${k}` : `${prefix}${k}-${sub}`] = val;
    } else if (typeof v === 'string') out[`${prefix}${k}`] = v;
  }
  return out;
}

/**
 * The plugin (options → { handler, config }), Tailwind's withOptions shape.
 * @param {{ fallback?: boolean, groups?: string[] }} [options]
 */
function glassparency(options = {}) {
  const fallback = options.fallback !== false && options.fallback !== 'false';
  const groups = Array.isArray(options.groups) && options.groups.length ? options.groups : GROUPS;
  return {
    handler({ addUtilities, matchUtilities, theme }) {
      // glass, glass-clear, glass-frosted, glass-tinted, glass-smoke
      const utilities = {};
      for (const [cls, s] of Object.entries(STAND_IN)) {
        utilities[`.${cls}`] = fallback
          ? {
              // (a marker the auto-attach doesn't need — it reads the class — but
              // it keeps the utility from being empty when there's no stand-in)
              '--glassparency': cls === 'glass' ? 'glass' : cls.slice(6),
              '&:not([data-glass-id])': {
                'background-color': s.bg,
                '-webkit-backdrop-filter': s.filter,
                'backdrop-filter': s.filter,
                'box-shadow': `inset 0 0 0 1px ${s.ring}`,
                ...(s.color ? { color: s.color } : {}),
              },
            }
          : { '--glassparency': cls === 'glass' ? 'glass' : cls.slice(6) };
      }
      addUtilities(utilities);

      // glass-group-card / glass-group-[myGroup]: the group (the auto-attach
      // reads the class name; the property just keeps the rule non-empty).
      matchUtilities({ 'glass-group': (value) => ({ '--glassparency-group': value }) }, { values: Object.fromEntries(groups.map((g) => [g, g])) });

      // glass-tint-rose-500 / glass-tint-[#ff2d55]: the tinted look's colour.
      let colors = {};
      try {
        colors = flattenColors(typeof theme === 'function' ? theme('colors') : {});
      } catch {
        colors = {}; // (no theme colours: arbitrary values still work)
      }
      matchUtilities({ 'glass-tint': (value) => ({ '--glassparency-look-color': value }) }, { values: colors, type: ['color', 'any'] });
    },
    config: undefined,
  };
}
// Tailwind calls it with the options (v4: from the @plugin block; v3: the call in the config).
glassparency.__isOptionsFunction = true;

export default glassparency;
