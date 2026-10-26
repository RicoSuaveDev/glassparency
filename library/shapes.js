/**
 * =============================================================================
 * glass/shapes.js — Glass slab geometry, generated in code (no model files)
 * =============================================================================
 * Every glass element is a thin slab: a 2D outline (rectangle, rounded
 * rectangle, circle or capsule — all rounded rectangles with a different
 * corner radius) extruded a little, with a rounded bevel round the edge.
 *
 * Why a bevel: seen straight on, the flat top face bends nothing, so the page
 * behind it looks undistorted (it reads as 2D). Only the curved rim bends the
 * light — that edge refraction is what makes it look like liquid glass.
 *
 * Normals are calculated exactly (from the rounded-rectangle distance field)
 * rather than averaged, so the top face stays perfectly flat and the rim
 * curves smoothly with no facets. The rim's curve (rimTilt) is either:
 *   squircle — Apple-style lens edge, height (1 − x⁴)^¼: nearly flat across
 *              most of the rim, then curving away sharply at the very edge;
 *   classic  — a quarter circle, height √(1 − x²).
 * live.js uses the same rimTilt, so live and WebGL glass bend alike.
 *
 * Geometries are cached by size and shared, and freed when no longer used.
 * Units are CSS pixels; the slab is centred on (0,0) with its top face at
 * z = +depth/2 + bevel.
 * =============================================================================
 */
import * as THREE from 'three';
import { AUTO_FALLBACK_RADIUS, rimTilt } from './rim';

/**
 * Work out the outline for an element.
 * @param {string} shape   rectangle | roundedRectangle | circle | capsule
 * @param {number} w, h    size in px (already scaled)
 * @param {number|'auto'} radius   px; 'auto' uses cssRadius
 * @param {number} cssRadius       the element's CSS border-radius in px
 */
// AUTO_FALLBACK_RADIUS ("auto" corners on an element whose CSS corners are
// square) and rimTilt live in rim.js (no three.js) — re-exported here.
export { AUTO_FALLBACK_RADIUS, rimTilt };

export function outline(shape, w, h, radius, cssRadius) {
  let r;
  switch (shape) {
    case 'rectangle':
      r = 0;
      break;
    case 'circle': {
      const d = Math.min(w, h);
      return { w: d, h: d, r: d / 2 };
    }
    case 'capsule':
      r = Math.min(w, h) / 2;
      break;
    default:
      // auto = the element's CSS corner radius, or a 16px rounding when the
      // element's corners are square (otherwise it would look rectangular).
      r = radius === 'auto' ? (cssRadius > 0 ? cssRadius : AUTO_FALLBACK_RADIUS) : radius;
  }
  return { w, h, r: Math.max(0, Math.min(r, Math.min(w, h) / 2)) };
}

/**
 * Rounded rectangle path centred on 0,0.
 * The radius is clamped to half the short side, and straight edges shorter
 * than EDGE_EPS are left out: for a circle / capsule they have zero length,
 * and a zero-length (or, after rounding, slightly NEGATIVE) edge made the
 * outline double back on itself. three.js's bevel then folded the slab over
 * — the triangular "page-curl" flaps and the "+" seam seen on the orb and on
 * ~25% of capsule-button sizes (any size ending in .5 px).
 */
const EDGE_EPS = 0.01;
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r <= 0.01) {
    s.moveTo(x, y);
    s.lineTo(x + w, y);
    s.lineTo(x + w, y + h);
    s.lineTo(x, y + h);
    s.closePath();
    return s;
  }
  const flatW = w - 2 * r > EDGE_EPS; // has a straight top/bottom edge
  const flatH = h - 2 * r > EDGE_EPS; // has a straight left/right edge
  s.moveTo(x + r, y);
  if (flatW) s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  if (flatH) s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  if (flatW) s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  if (flatH) s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Signed distance to a rounded rectangle (half-size hx,hy, radius r) + its direction. */
function sdf(px, py, hx, hy, r) {
  const qx = Math.abs(px) - (hx - r);
  const qy = Math.abs(py) - (hy - r);
  const mx = Math.max(qx, 0);
  const my = Math.max(qy, 0);
  const outside = Math.hypot(mx, my);
  const d = outside + Math.min(Math.max(qx, qy), 0) - r;
  let gx;
  let gy;
  if (qx > 0 && qy > 0) {
    gx = (mx / outside) * Math.sign(px);
    gy = (my / outside) * Math.sign(py);
  } else if (qx > qy) {
    gx = Math.sign(px) || 1;
    gy = 0;
  } else {
    gx = 0;
    gy = Math.sign(py) || 1;
  }
  return { d, gx, gy };
}

// Smallest corner radius of a slab's core (px) — see buildSlab.
const CORE_RADIUS = 0.5;

// Curve detail: enough segments for smooth corners on big panels, few on chips.
const curveSegments = (r) => Math.max(4, Math.min(24, Math.round(r / 2)));

/**
 * Build the slab. The outer size is exactly w×h: the extruded core is inset by
 * the bevel and the bevel grows it back out.
 */
function buildSlab({ w, h, r, bevel, depth, segments, profile }) {
  // The bevel stops CORE_RADIUS short of the corner radius: three.js grows
  // the core out by the bevel along each vertex's normal, so a core with
  // sharp corners (bevel ≥ radius, e.g. a group with bevel 16 on a 16px
  // corner) grew into a SQUARE slab — a light square frame round the rounded
  // tint/border. A core corner of CORE_RADIUS keeps the outer corner round
  // (radius r) and the rim practically as wide as configured.
  const b = Math.max(0, Math.min(bevel, r > 0 ? Math.max(0, r - CORE_RADIUS) : bevel, w / 2 - 1, h / 2 - 1));
  const iw = Math.max(1, w - 2 * b);
  const ih = Math.max(1, h - 2 * b);
  // Clamped like the outline itself (see roundedRectShape) so the normals'
  // distance field matches the geometry exactly.
  const ir = Math.max(0, Math.min(r - b, iw / 2, ih / 2));
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(iw, ih, ir), {
    depth,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: 0,
    bevelSegments: segments,
    curveSegments: curveSegments(r),
  });
  // Centre in z: front face at depth/2 + b.
  geo.translate(0, 0, -depth / 2);
  geo.deleteAttribute('uv'); // not needed (no textures on the slab)

  // Exact normals: flat on the faces, a quarter-circle across the bevel.
  const pos = geo.attributes.position;
  const normals = new Float32Array(pos.count * 3);
  const hx = iw / 2;
  const hy = ih / 2;
  const halfDepth = depth / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const { d, gx, gy } = sdf(x, y, hx, hy, ir);
    let nx = 0;
    let ny = 0;
    let nz = 0;
    if (b <= 0) {
      // No bevel: faces straight up/down, walls straight out.
      if (Math.abs(z) >= halfDepth - 1e-3) nz = Math.sign(z);
      else {
        nx = gx;
        ny = gy;
      }
    } else {
      const t = Math.min(1, Math.max(0, d / b)); // 0 on the face, 1 on the wall
      const sinA = rimTilt(t, profile);
      const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));
      const onWall = Math.abs(z) < halfDepth - 1e-3;
      nx = gx * (onWall ? 1 : sinA);
      ny = gy * (onWall ? 1 : sinA);
      nz = onWall ? 0 : cosA * Math.sign(z);
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = ny / len;
    normals[i * 3 + 2] = nz / len;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** Flat outline (for the tint layer on top of the slab). */
function buildFlat({ w, h, r }) {
  const geo = new THREE.ShapeGeometry(roundedRectShape(w, h, r), curveSegments(r));
  // uv 0–1 across the box (ShapeGeometry's uvs are in shape units).
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / w + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / h + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// --- Shared cache ------------------------------------------------------------------------
const cache = new Map(); // key → { geo, users }
const q = (n) => Math.round(n * 2) / 2; // half-pixel steps (fewer rebuilds)

/**
 * Get (and hold) a geometry; call the returned release() when done.
 * @param {'slab'|'flat'} kind
 */
export function acquireGeometry(kind, spec) {
  const w = q(spec.w);
  const h = q(spec.h);
  // Clamp AFTER rounding: rounding w, h and r separately could make r larger
  // than w/2 (e.g. w 198.5 → r 99.25 → 99.5), which folded the slab.
  const s = { ...spec, w, h, r: Math.min(q(spec.r), w / 2, h / 2) };
  const key =
    kind === 'slab'
      ? `slab|${s.w}|${s.h}|${s.r}|${q(s.bevel)}|${q(s.depth)}|${s.segments}|${s.profile}`
      : `flat|${s.w}|${s.h}|${s.r}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = { geo: kind === 'slab' ? buildSlab(s) : buildFlat(s), users: 0 };
    cache.set(key, hit);
  }
  hit.users += 1;
  let released = false;
  return {
    geo: hit.geo,
    key,
    release() {
      if (released) return;
      released = true;
      hit.users -= 1;
      if (hit.users <= 0) {
        cache.delete(key);
        hit.geo.dispose();
      }
    },
  };
}

export const geometryCacheSize = () => cache.size;
