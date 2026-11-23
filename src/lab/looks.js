/**
 * =============================================================================
 * src/lab/looks.js — The looks and squish presets compared in the lab
 * =============================================================================
 * The columns compare the config's three styles ("style": default /
 * crystal / frosted). Only the macOS window buttons and the round × button
 * are lab-only groups (merged in with <GlassProvider config>).
 * =============================================================================
 */
/** Lab-only groups for the macOS window buttons (all looks share them). */
const TRAFFIC = {
  trafficRed: { shape: 'circle', chromaticAberration: 0, tint: '#ff5f57', tintOpacity: 0.95, thickness: 8, bevel: 6, ior: 1.3, blur: 0, rimLight: 0.7, innerGlow: 0.25, borderOpacity: 0.3, shadowColor: '#000000', shadowOpacity: 0.25, shadowBlur: 4, shadowY: 1, pressScale: 1, squish: 1, squishGrow: 1.12, squishPull: 16, squishBounce: 0.6 },
  trafficYellow: { shape: 'circle', chromaticAberration: 0, tint: '#febc2e', tintOpacity: 0.95, thickness: 8, bevel: 6, ior: 1.3, blur: 0, rimLight: 0.7, innerGlow: 0.25, borderOpacity: 0.3, shadowColor: '#000000', shadowOpacity: 0.25, shadowBlur: 4, shadowY: 1, pressScale: 1, squish: 1, squishGrow: 1.12, squishPull: 16, squishBounce: 0.6 },
  trafficGreen: { shape: 'circle', chromaticAberration: 0, tint: '#28c840', tintOpacity: 0.95, thickness: 8, bevel: 6, ior: 1.3, blur: 0, rimLight: 0.7, innerGlow: 0.25, borderOpacity: 0.3, shadowColor: '#000000', shadowOpacity: 0.25, shadowBlur: 4, shadowY: 1, pressScale: 1, squish: 1, squishGrow: 1.12, squishPull: 16, squishBounce: 0.6 },
  // A round glass "×" button like iOS's (swells a lot when pressed).
  roundButton: { shape: 'circle', chromaticAberration: 0, tint: '#ffffff', tintOpacity: 0.3, thickness: 8, bevel: 12, ior: 1.35, blur: 10, rimLight: 0.7, innerGlow: 0.2, borderOpacity: 0.35, shadowOpacity: 0.14, shadowBlur: 10, shadowY: 3, pressScale: 1, pressGlow: 0.4, squish: 1, squishGrow: 1.3, squishPull: 14, squishBounce: 0.55 },
};
const TRAFFIC_DARK = { roundButton: { tint: '#2c2c2e', tintOpacity: 0.45, borderOpacity: 0.2 } };

/**
 * The three columns are the config's "style" setting (config.js STYLES):
 * every part gets the column's style as a per-element prop, over the real
 * built-in groups. Frosted keeps each group's own tint colour.
 */
export const LOOKS = [
  { id: 'default', name: 'Default (Apple)', blurb: 'style: "default" — the built-in groups exactly as the library ships them.' },
  { id: 'crystal', name: 'Crystal', blurb: 'style: "crystal" — clearer, thicker glass that bends what is behind it more; accent parts turn see-through.' },
  { id: 'frosted', name: 'Frosted', blurb: 'style: "frosted" — milky, heavily frosted glass in each group’s own tint colour.' },
];

/**
 * The lab's own groups (window buttons, round button), merged into the
 * page's <GlassProvider config> by main.jsx.
 */
export function labConfig() {
  return {
    groups: { ...TRAFFIC },
    themes: { dark: { groups: { ...TRAFFIC_DARK } } },
  };
}

/** Squish & stretch presets (per-element props on every squishing part). */
export const SQUISH = {
  off: { label: 'Off', props: { squish: 0 } },
  subtle: { label: 'Subtle', props: { squish: 0.5, squishGrow: 1.08, squishPull: 5, squishBounce: 0.25 } },
  apple: { label: 'Apple', props: { squish: 0.8, squishGrow: 1.18, squishPull: 12, squishBounce: 0.55 } },
  jelly: { label: 'Jelly', props: { squish: 1, squishGrow: 1.3, squishPull: 24, squishBounce: 0.85 } },
};
