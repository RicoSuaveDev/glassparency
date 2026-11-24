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

// --- Squircle corners (config "corners": "squircle") -----------------------------------
/**
 * "corners": "squircle" swaps the outline's quarter-circle corners for
 * Apple-style CONTINUOUS-CURVATURE corners: each corner is a superellipse
 *   |x / R|ⁿ + |y / R|ⁿ = 1   (n = SQUIRCLE_N = 4)
 * spanning R = SQUIRCLE_EXTENT × the corner radius (capped at half the short
 * side). A circle's curvature jumps from 0 (the straight edge) to 1/r where
 * the corner starts — the visible "kink" of a CSS rounded rectangle. The
 * superellipse's curvature starts at 0 and grows smoothly, so the edge
 * flows into the corner. The bigger extent keeps the corner looking about
 * as round as the same radius would (a 24px radius bends over ~38px).
 *
 * n = 4 is exactly CSS `corner-shape: squircle` (superellipse(2): exponent
 * 2² = 4), so live / CSS glass in browsers with corner-shape draw the very
 * same curve as the WebGL slab (border-radius R + corner-shape: squircle).
 * Every renderer takes these numbers from here, so they can't drift apart.
 * "round" (the default) leaves everything exactly as before.
 */
export const SQUIRCLE_N = 4;
export const SQUIRCLE_EXTENT = 1.6;

/**
 * The corner exponent the renderers use for an outline (shader uniform
 * glassCornerN): 0 = the plain rounded rectangle (the old path, untouched),
 * SQUIRCLE_N = squircle. Only rounded rectangles get squircle corners: a
 * circle / capsule is round by definition, a rectangle has no corners.
 * @param {{ corners?: string, shape?: string }} p   resolved config
 * @param {number} r   the outline's corner radius (px)
 */
export function cornerN(p, r) {
  return p && p.corners === 'squircle' && p.shape === 'roundedRectangle' && r > 0.5 ? SQUIRCLE_N : 0;
}

/** The squircle corner's extent R for corner radius r on a w×h box (px). */
export function squircleExtent(r, w, h) {
  return Math.max(0, Math.min(r * SQUIRCLE_EXTENT, w / 2, h / 2));
}

/**
 * The outline of a w×h squircle-cornered box, centred on 0,0 (y up), as
 * [x, y] points going counter-clockwise, starting at the bottom edge's right
 * end — for three.js Shapes (shapes.js) and CSS clip paths (cssGlass.js).
 * Points are spread evenly by ANGLE round each corner (a plain parameter
 * sweep bunches them in the middle and leaves the ends coarse).
 * @param {number} w, h      size (px)
 * @param {number} R         corner extent (squircleExtent)
 * @param {number} [steps]   segments per corner
 * @returns {Array<[number, number]>}
 */
export function squirclePoints(w, h, R, steps = 24) {
  const n = SQUIRCLE_N;
  const cx = w / 2 - R;
  const cy = h / 2 - R;
  const out = [];
  // Corner centres (±cx, ±cy), each swept over its own quarter turn.
  const corners = [
    [cx, -cy, -Math.PI / 2], // bottom-right
    [cx, cy, 0], // top-right
    [-cx, cy, Math.PI / 2], // top-left
    [-cx, -cy, Math.PI], // bottom-left
  ];
  for (const [ox, oy, a0] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2);
      const c = Math.cos(a);
      const s = Math.sin(a);
      // The ray at angle a meets the superellipse at distance R / ‖(c, s)‖ₙ.
      const k = R / Math.pow(Math.abs(c) ** n + Math.abs(s) ** n, 1 / n);
      const x = ox + c * k;
      const y = oy + s * k;
      // No zero-length edges: where a side has no straight run (R = half the
      // side) two corners meet in the same point, and a doubled point folds
      // three.js's bevel over (see shapes.js roundedRectShape).
      const last = out[out.length - 1];
      if (!last || Math.hypot(x - last[0], y - last[1]) > 0.01) out.push([x, y]);
    }
  }
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 0.01) out.pop();
  return out;
}

/**
 * The same outline as a CSS path() string in CSS axes (origin at the box's
 * top-left, y DOWN) — for `clip-path: path('…')` where the browser has no
 * `corner-shape` (cssGlass.js).
 */
export function squirclePath(w, h, R, steps = 16) {
  const pts = squirclePoints(w, h, R, steps);
  const f = (v) => Math.round(v * 100) / 100;
  return `M${pts.map(([x, y]) => `${f(x + w / 2)} ${f(h / 2 - y)}`).join('L')}Z`;
}
