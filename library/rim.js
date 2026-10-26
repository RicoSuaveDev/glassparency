/**
 * =============================================================================
 * glass/rim.js — The glass rim's curve, without three.js
 * =============================================================================
 * Shared by shapes.js (the WebGL slabs) and live.js (the Chromium live glass).
 * It lives in its own file so live.js — which is in the main bundle — does
 * not import three.js. Before, live.js → shapes.js → three pulled the whole
 * 3D engine into the first download, even on phones that never run WebGL.
 * =============================================================================
 */

/** "auto" corners on an element whose CSS corners are square (e.g. the header). */
export const AUTO_FALLBACK_RADIUS = 16;

/**
 * How far the rim surface tilts (sin of the tilt angle, 0 = flat, 1 = vertical)
 * at x across the rim (0 = where the flat top ends, 1 = the outer edge).
 *   squircle — Apple-style lens edge, height (1 − x⁴)^¼: nearly flat across
 *              most of the rim, then curving away sharply at the very edge;
 *   classic  — a quarter circle, height √(1 − x²).
 * @param {number} x
 * @param {'squircle'|'classic'} profile
 */
export function rimTilt(x, profile) {
  const t = Math.min(1, Math.max(0, x));
  if (profile === 'classic') return t; // quarter circle: sin = x
  // squircle height h = (1 − x⁴)^¼ → slope = x³ (1 − x⁴)^(−¾)
  const base = 1 - t ** 4;
  if (base <= 1e-6) return 1;
  const slope = t ** 3 / base ** 0.75;
  return slope / Math.sqrt(1 + slope * slope);
}
