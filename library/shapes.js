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
import { AUTO_FALLBACK_RADIUS, rimTilt, squircleExtent, squirclePoints } from './rim';

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
function buildSlab({ w, h, r, bevel, depth, segments, profile, cornerN }) {
  if (cornerN) return buildSquircleSlab({ w, h, r, bevel, depth, segments, profile }); // ("corners": "squircle")
  // The bevel stops CORE_RADIUS short of the corner radius: three.js grows
  // the core out by the bevel along each vertex's normal, so a core with
  // sharp corners (bevel ≥ radius, e.g. a group with bevel 16 on a 16px
  // corner) grew into a SQUARE slab — a light square frame round the rounded
  // tint/border. A core corner of CORE_RADIUS keeps the outer corner round
  // (radius r) and the rim practically as wide as configured.
  const b = bevelFor(w, h, r, bevel);
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

// --- Squircle corners ("corners": "squircle" — see rim.js) -------------------------------
/**
 * Squircle slabs. The outline is the superellipse-cornered box of rim.js
 * (corner extent R = squircleExtent). three.js grows an extruded core OUT
 * by the bevel along each outline vertex's normal, so the core is the
 * outline moved IN by the bevel along its own normals: grown back, it lands
 * on the outline again. A curve can only be moved in by less than its
 * tightest radius of curvature before it folds over itself — for the
 * superellipse (n = 4) that is 0.396 R, at the diagonal (a circle's is r) —
 * so the bevel is capped at SQUIRCLE_BEVEL × R. Wider bevels on small
 * squircle corners are therefore a little narrower than on round ones.
 */
const SQUIRCLE_BEVEL = 0.38;
// Segments per squircle corner: smooth on big panels, few on chips.
const squircleSteps = (R) => Math.max(8, Math.min(40, Math.round(R / 1.5)));
/** The bevel clamp for a squircle outline (like bevelFor for round corners). */
const bevelForSquircle = (w, h, R, bevel) => Math.max(0, Math.min(bevel, Math.max(0, SQUIRCLE_BEVEL * R - 0.25), w / 2 - 1, h / 2 - 1));

/**
 * The squircle outline as points + outward unit normals (y up). The normal
 * of |x|ⁿ + |y|ⁿ = Rⁿ is (sign x·|x|ⁿ⁻¹, sign y·|y|ⁿ⁻¹), normalised; on a
 * straight run between corners it is simply the side's direction.
 */
function squircleRing(w, h, R, steps) {
  const pts = squirclePoints(w, h, R, steps);
  const cx = w / 2 - R;
  const cy = h / 2 - R;
  return pts.map(([x, y]) => {
    // Position relative to the corner centre this point belongs to.
    const qx = Math.max(0, Math.abs(x) - cx);
    const qy = Math.max(0, Math.abs(y) - cy);
    let nx = Math.sign(x) * qx ** 3;
    let ny = Math.sign(y) * qy ** 3;
    const len = Math.hypot(nx, ny);
    if (len < 1e-9) {
      // (exactly where a corner meets a straight run)
      nx = Math.abs(x) > Math.abs(y) ? Math.sign(x) : 0;
      ny = nx ? 0 : Math.sign(y);
    } else {
      nx /= len;
      ny /= len;
    }
    return { x, y, nx, ny };
  });
}

/**
 * Signed distance to the squircle outline (≤ 0 inside) + the outward
 * direction, for the slab's exact normals. On the straight runs it's the
 * distance to that side; in a corner's square it's the distance along the
 * nearest outline sample's normal (`corner` = one corner's dense samples,
 * relative to its centre, in the + + quadrant).
 */
function squircleSdf(px, py, hx, hy, R, corner) {
  const qx = Math.abs(px) - (hx - R);
  const qy = Math.abs(py) - (hy - R);
  if (qx > 0 && qy > 0) {
    let best = Infinity;
    let hit = corner[0];
    for (const s of corner) {
      const dd = (qx - s.x) ** 2 + (qy - s.y) ** 2;
      if (dd < best) {
        best = dd;
        hit = s;
      }
    }
    return { d: (qx - hit.x) * hit.nx + (qy - hit.y) * hit.ny, gx: hit.nx * (Math.sign(px) || 1), gy: hit.ny * (Math.sign(py) || 1) };
  }
  if (qx > qy) return { d: Math.abs(px) - hx, gx: Math.sign(px) || 1, gy: 0 };
  return { d: Math.abs(py) - hy, gx: 0, gy: Math.sign(py) || 1 };
}

/** One squircle corner's dense samples (+ + quadrant, relative to its centre). */
function cornerSamples(R) {
  const out = [];
  const N = 256;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const k = R / Math.pow(c ** 4 + s ** 4, 0.25);
    const x = c * k;
    const y = s * k;
    const nx = x ** 3;
    const ny = y ** 3;
    const len = Math.hypot(nx, ny) || 1;
    out.push({ x, y, nx: nx / len, ny: ny / len });
  }
  return out;
}

/** A three.js Shape from outline points. */
const shapeFrom = (pts) => {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y)));
  s.closePath();
  return s;
};

function buildSquircleSlab({ w, h, r, bevel, depth, segments, profile }) {
  const R = squircleExtent(r, w, h);
  const b = bevelForSquircle(w, h, R, bevel);
  const ring = squircleRing(w, h, R, squircleSteps(R));
  // The core: the outline moved in by the bevel (three.js grows it back out).
  const core = ring.map((p) => ({ x: p.x - p.nx * b, y: p.y - p.ny * b }));
  const geo = new THREE.ExtrudeGeometry(shapeFrom(b > 0 ? core : ring), {
    depth,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: 0,
    bevelSegments: segments,
  });
  geo.translate(0, 0, -depth / 2);
  geo.deleteAttribute('uv');
  // Exact normals, as buildSlab: flat on the faces, the rim curve
  // (rimTilt) across the bevel — measured from the OUTER outline (t = 1 at
  // the edge, 0 a bevel in).
  const corner = cornerSamples(R);
  const pos = geo.attributes.position;
  const normals = new Float32Array(pos.count * 3);
  const halfDepth = depth / 2;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const { d, gx, gy } = squircleSdf(pos.getX(i), pos.getY(i), w / 2, h / 2, R, corner);
    let nx = 0;
    let ny = 0;
    let nz = 0;
    const onWall = Math.abs(z) < halfDepth - 1e-3;
    if (b <= 0) {
      if (!onWall) nz = Math.sign(z);
      else {
        nx = gx;
        ny = gy;
      }
    } else {
      const t = Math.min(1, Math.max(0, 1 + d / b));
      const sinA = rimTilt(t, profile);
      const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));
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

/**
 * Squircle slab of any size from a template (like stretchedSlab): the
 * corners only move rigidly when R doesn't change with the size, i.e. when
 * it isn't capped by half a side — or, if it is capped by one side, only the
 * OTHER side may stretch (the template keeps that side's exact size).
 */
function stretchedSquircleSlab({ w, h, r, bevel, depth, segments, profile }) {
  const R = squircleExtent(r, w, h);
  const b = bevelForSquircle(w, h, R, bevel);
  const free = 2 * Math.max(R, b + 1) + 2; // template side with a 2px straight run
  const capW = R >= w / 2 - 1e-6; // R is set by the width
  const capH = R >= h / 2 - 1e-6;
  if (capW && capH) return null;
  const w0 = capW ? w : free;
  const h0 = capH ? h : free;
  if ((!capW && w < w0 - 2) || (!capH && h < h0 - 2)) return null;
  if (squircleExtent(r, w0, h0) !== R || bevelForSquircle(w0, h0, R, bevel) !== b) return null;
  const key = `sq|${w0}|${h0}|${r}|${b}|${depth}|${segments}|${profile}`;
  let t = templates.get(key);
  if (!t) {
    t = { geo: buildSquircleSlab({ w: w0, h: h0, r, bevel: b, depth, segments, profile }), w: w0, h: h0 };
    templates.set(key, t);
  }
  // Slide every vertex out by half the size change (as stretchedSlab).
  const dx = (w - t.w) / 2;
  const dy = (h - t.h) / 2;
  const src = t.geo.attributes.position.array;
  const pos = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i];
    const y = src[i + 1];
    pos[i] = x + (x > 1e-4 ? dx : x < -1e-4 ? -dx : 0);
    pos[i + 1] = y + (y > 1e-4 ? dy : y < -1e-4 ? -dy : 0);
    pos[i + 2] = src[i + 2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(t.geo.attributes.normal.array.slice(), 3));
  if (t.geo.index) geo.setIndex(new THREE.BufferAttribute(t.geo.index.array.slice(), 1));
  for (const g of t.geo.groups) geo.addGroup(g.start, g.count, g.materialIndex);
  geo.computeBoundingSphere();
  return geo;
}

/** Flat outline (for the tint layer on top of the slab). */
function buildFlat({ w, h, r, cornerN }) {
  const R = cornerN ? squircleExtent(r, w, h) : 0; // ("corners": "squircle")
  const geo = new THREE.ShapeGeometry(cornerN ? shapeFrom(squircleRing(w, h, R, squircleSteps(R))) : roundedRectShape(w, h, r), curveSegments(r));
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

// --- Stretched slabs (one template per corner shape) -------------------------------------
/**
 * The bevel's clamp for an outline of this size (see buildSlab) — the same
 * expression, so a template and a fresh build agree on it.
 */
const bevelFor = (w, h, r, bevel) => Math.max(0, Math.min(bevel, r > 0 ? Math.max(0, r - CORE_RADIUS) : bevel, w / 2 - 1, h / 2 - 1));
const templates = new Map(); // corner-shape key → { geo, w, h } (kept: a handful per page)
/**
 * A slab of any size WITHOUT re-extruding it: every outline ring of a slab
 * (the cap, the bevel rings, the core) is a rounded rectangle with its corner
 * arcs centred on the SAME four corner centres, joined by straight edges. So
 * a slab built once at a small size (a 2 px straight edge on each side) turns
 * into any bigger — or up to 2 px smaller — slab by sliding every vertex
 * outward by half the size change (x by sign(x)·dx, y by sign(y)·dy): the
 * corners move rigidly, only the straight edges and the flat cap stretch.
 * The corners and their normals are exactly what a fresh ExtrudeGeometry
 * of that size would make (normals are only flat or rotated with the
 * corner); only the flat cap's triangulation differs, which can't be seen.
 * Building a bevelled slab took ~3 ms (far more on a phone) per new size —
 * the reason for GlassCanvas's old stretch-and-wait workaround; this is a
 * copy of the vertex array.
 * @returns {THREE.BufferGeometry|null} null → this size needs a fresh build
 */
function stretchedSlab({ w, h, r, bevel, depth, segments, profile, cornerN }) {
  if (cornerN) return stretchedSquircleSlab({ w, h, r, bevel, depth, segments, profile }); // ("corners": "squircle")
  const b = bevelFor(w, h, r, bevel);
  // The template: straight edges of 2 px on every side (so the corner centres
  // sit 1 px from the middle) — big enough for the same bevel clamp.
  const w0 = 2 * Math.max(r, b + 1) + 2;
  const h0 = w0;
  if (w < w0 - 2 || h < h0 - 2) return null; // (smaller than the template can shrink to)
  if (bevelFor(w0, h0, r, bevel) !== b) return null; // (the template would clamp the bevel differently)
  const key = `${r}|${b}|${depth}|${segments}|${profile}`;
  let t = templates.get(key);
  if (!t) {
    t = { geo: buildSlab({ w: w0, h: h0, r, bevel: b, depth, segments, profile }), w: w0, h: h0 };
    templates.set(key, t);
  }
  const dx = (w - t.w) / 2;
  const dy = (h - t.h) / 2;
  const src = t.geo.attributes.position.array;
  const pos = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i];
    const y = src[i + 1];
    pos[i] = x + (x > 1e-4 ? dx : x < -1e-4 ? -dx : 0);
    pos[i + 1] = y + (y > 1e-4 ? dy : y < -1e-4 ? -dy : 0);
    pos[i + 2] = src[i + 2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // (Own copies: three.js frees a geometry's GPU buffers attribute by
  // attribute when it is disposed, so shared ones would vanish under others.)
  geo.setAttribute('normal', new THREE.BufferAttribute(t.geo.attributes.normal.array.slice(), 3));
  if (t.geo.index) geo.setIndex(new THREE.BufferAttribute(t.geo.index.array.slice(), 1));
  for (const g of t.geo.groups) geo.addGroup(g.start, g.count, g.materialIndex);
  geo.computeBoundingSphere();
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
  let key =
    kind === 'slab'
      ? `slab|${s.w}|${s.h}|${s.r}|${q(s.bevel)}|${q(s.depth)}|${s.segments}|${s.profile}`
      : `flat|${s.w}|${s.h}|${s.r}`;
  // Squircle corners ("corners": "squircle"): their own geometries (round
  // ones keep exactly the keys — and meshes — they always had).
  if (s.cornerN) key += `|sq${s.cornerN}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = { geo: kind === 'slab' ? stretchedSlab(s) || buildSlab(s) : buildFlat(s), users: 0 };
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
