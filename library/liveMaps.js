/**
 * =============================================================================
 * glass/liveMaps.js — Displacement maps for live (SVG) glass, off the main thread
 * =============================================================================
 * Every live glass element (live.js) bends the backdrop with a displacement
 * map: a picture whose R/G channels say how far each pixel is pushed. It is
 * worked out pixel by pixel (the rounded-rim curve + the lens minify) and
 * encoded as a PNG data URL. For a header that's ~20k pixels; for a big
 * floating panel up to 1M — tens of ms of maths + PNG encoding, on every size
 * change, on the main thread (a dropped frame or several).
 *
 * Here:
 *   • CACHE — one map per shape + size (+ rim / strength / profile / minify):
 *     the same knob, chip or header size is never worked out twice. Dragging
 *     a lens back and forth, or 30 identical buttons, cost one map each.
 *   • SMALL maps (≤ SYNC_MAX_PIXELS: knobs, buttons, a header) are made at
 *     once on the main thread (~1–2 ms) — pressed glass refracts that frame.
 *   • WORKER — BIG maps that aren't cached yet are worked out AND encoded in a
 *     Web Worker (OffscreenCanvas → PNG → data URL). The caller keeps
 *     showing its previous map (stretched to the new size) until the new one
 *     arrives, a frame or two later.
 *   • FALLBACK — no Worker / OffscreenCanvas, or a Content-Security-Policy
 *     that blocks a worker made from a blob: URL (worker-src): the map is
 *     worked out on the main thread, synchronously, exactly as before.
 *
 * The maths lives in ONE self-contained function (computeMap) used in both
 * places — the worker gets its source text, so the two can never differ.
 * It must therefore only use its arguments and Math (no module imports).
 * =============================================================================
 */
import { rimTilt } from './rim';

/** Very large live elements are mapped at a lower resolution (stretched back by the filter). */
const MAX_MAP_PIXELS = 1_000_000;
// Map steps (of 255) the lens map's G middle is raised by — see computeMap.
// Measured in desktop Chrome: the lens picture sat 0.0625 × scale too low = 16 steps.
const MINIFY_Y_NUDGE = 16;
/** Maps up to this many px are made on the main thread at once (see requestMap). */
const SYNC_MAX_PIXELS = 80_000; // e.g. 1200 × 64 header, 280 × 280 card
/** How many maps to keep (each is a small PNG data URL; LRU). */
const CACHE_MAX = 96;

/**
 * Displacement map for a rounded rectangle, as px offsets (R = x, G = y):
 *   • the rim bend — flat (no bend) inside, bending more and more towards
 *     the edge across the rim: the same distance-field maths as the WebGL
 *     slab normals (shapes.js), up to `strength` px;
 *   • minify (−0.5–0.5) — the whole lens shows what's behind it bigger
 *     (negative: magnify — read closer to the centre) or smaller
 *     (Apple's switch knob). A live backdrop only covers the element itself,
 *     so the middle is shrunk by 1 − minify and the outer band is squeezed
 *     to reach exactly the element's edge (never past it: past it there is
 *     nothing to read, which showed as jagged edges).
 * Very large elements (a full-screen panel) are mapped at most `maxPixels`
 * and stretched back over the element (feImage preserveAspectRatio="none").
 *
 * SELF-CONTAINED (runs in the worker from its source text): only arguments + Math.
 * @returns {{ w: number, h: number, data: Uint8ClampedArray, scale: number }}
 *   RGBA pixels and the feDisplacementMap scale that turns them back into px
 */
function computeMap(a, tilt) {
  const { fullW, fullH, fullRadius, fullRim, profile, strength, minify, maxPixels, yNudge } = a;
  // "corners": "squircle": n > 2 = superellipse corners of extent fullRadius
  // (live.js passes the squircle's extent R — rim.js); 0 = round (as before).
  const cn = a.cornerN || 0;
  const k = Math.min(1, Math.sqrt(maxPixels / (fullW * fullH)));
  const w = Math.max(1, Math.round(fullW * k));
  const h = Math.max(1, Math.round(fullH * k));
  const radius = fullRadius * k;
  const rim = Math.max(0.5, fullRim * k);
  const hx = w / 2 - rim;
  const hy = h / 2 - rim;
  const ir = Math.max(0, radius - rim);
  const half = Math.min(w, h) / 2; // deepest point inside the shape (map px)
  // minify: content scale (< 1 shrinks; > 1 — negative minify — magnifies)
  const scaleIn = 1 - Math.min(0.5, Math.max(-0.5, minify || 0));
  const knee = 0.88 * scaleIn; // up to here: plain r / scaleIn
  const bend = (r) => {
    // Magnify: read closer to the centre everywhere (never past the edge, so
    // nothing outside the element is needed).
    if (scaleIn > 1) return r / scaleIn;
    if (scaleIn === 1) return r;
    if (r < knee) return r / scaleIn;
    const t = (r - knee) / (1 - knee);
    return 0.88 + 0.12 * (1 - (1 - t) * (1 - t)); // reaches the edge (1) exactly at the edge
  };
  // Signed distance to a rounded rect (half sizes bx, by, radius rr) + outward normal.
  const sdf = (px, py, bx, by, rr, out) => {
    const qx = Math.abs(px) - (bx - rr);
    const qy = Math.abs(py) - (by - rr);
    const mx = Math.max(qx, 0);
    const my = Math.max(qy, 0);
    const len = Math.hypot(mx, my);
    out.d = len + Math.min(Math.max(qx, qy), 0) - rr;
    out.gx = 0;
    out.gy = 0;
    if (cn > 2 && qx > 0 && qy > 0 && rr > 0.01) {
      // Squircle corner: the n-norm distance, divided by its gradient's
      // length (≈ px near the edge) — the WebGL shaders' glassSdSquircle.
      const ux = qx / rr + 1e-6;
      const uy = qy / rr + 1e-6;
      const L = Math.pow(ux ** cn + uy ** cn, 1 / cn);
      const g1 = (ux / L) ** (cn - 1);
      const g2 = (uy / L) ** (cn - 1);
      const gl = Math.hypot(g1, g2) || 1;
      out.d = (rr * (L - 1)) / gl;
      out.gx = (g1 / gl) * Math.sign(px);
      out.gy = (g2 / gl) * Math.sign(py);
      return out;
    }
    if (qx > 0 && qy > 0) {
      out.gx = (mx / len) * Math.sign(px);
      out.gy = (my / len) * Math.sign(py);
    } else if (qx > qy) out.gx = Math.sign(px);
    else out.gy = Math.sign(py);
    return out;
  };
  const A = { d: 0, gx: 0, gy: 0 };
  const O = { d: 0, gx: 0, gy: 0 };
  const offs = new Float32Array(w * h * 2);
  let maxAbs = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - w / 2;
      const py = y + 0.5 - h / 2;
      // Rim bend (inner rim shape).
      sdf(px, py, hx, hy, ir, A);
      const t = Math.min(1, Math.max(0, A.d / rim));
      // classic: gentle at the inner edge, strongest outside (original look);
      // squircle: the WebGL slab's rim curve (rim.js rimTilt).
      const s = profile === 'classic' ? t * t : tilt(t, profile);
      let dx = (-A.gx * s * strength) / 2;
      let dy = (-A.gy * s * strength) / 2;
      // Minify (outer shape): read further out, by how deep the pixel is.
      if (scaleIn !== 1) {
        sdf(px, py, w / 2, h / 2, Math.min(radius, half), O);
        const r = Math.min(1, Math.max(0, 1 + O.d / half)); // 0 = deepest, 1 = edge
        const push = ((bend(r) - r) * half) / k; // px (full size)
        dx += O.gx * push;
        dy += O.gy * push;
      }
      const i = (y * w + x) * 2;
      offs[i] = dx;
      offs[i + 1] = dy;
      maxAbs = Math.max(maxAbs, Math.abs(dx), Math.abs(dy));
    }
  }
  // Lens glass (minify ≠ 0, e.g. the pressed switch knob): Chrome on a real
  // screen reads the map's G "middle" as slightly below 0.5, so the picture
  // inside the lens sat ~6% of the bend scale too LOW (≈1.25 px on the knob:
  // a thick band on top, a thin one below). Raising the G middle by yNudge
  // map steps moves it back up. The range shrinks by the same steps so the
  // biggest offsets still fit in 0–255.
  const nudge = scaleIn !== 1 ? yNudge : 0;
  const norm = maxAbs > 0 ? (127 - nudge) / maxAbs : 0;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    data[i] = 128 + offs[p * 2] * norm;
    data[i + 1] = 128 + nudge + offs[p * 2 + 1] * norm;
    data[i + 2] = 128;
    data[i + 3] = 255;
  }
  // feDisplacementMap: offset = scale × (C − 0.5), C = byte / 255.
  return { w, h, data, scale: maxAbs > 0 ? (maxAbs * 255) / (127 - nudge) : 0 };
}

// --- Cache ----------------------------------------------------------------------------------
/** key → { url, scale } (insertion order = LRU order) */
const cache = new Map();
/** key → [callbacks] — maps the worker is working on */
const pending = new Map();

/** The cache key for a map's inputs (rounded like live.js's own filter key). */
export function mapKey({ w, h, radius, rim, profile, strength, minify, cornerN }) {
  return `${w}|${h}|${radius}|${rim}|${profile}|${strength.toFixed(1)}|${(minify || 0).toFixed(3)}${cornerN ? `|sq${cornerN}` : ''}`;
}

function remember(key, map) {
  cache.delete(key);
  cache.set(key, map);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); // the least recently used
}

/** A cached map (marks it recently used), or null. */
export function cachedMap(key) {
  const hit = cache.get(key);
  if (hit) remember(key, hit);
  return hit || null;
}

const argsOf = ({ w, h, radius, rim, profile, strength, minify, cornerN }) => ({
  fullW: w,
  fullH: h,
  fullRadius: radius,
  fullRim: rim,
  profile,
  strength,
  minify: minify || 0,
  cornerN: cornerN || 0, // squircle corners (0 = round)
  maxPixels: MAX_MAP_PIXELS,
  yNudge: MINIFY_Y_NUDGE,
});

/** Work a map out right here, synchronously (cached). */
export function mapNow(params) {
  const key = mapKey(params);
  const hit = cachedMap(key);
  if (hit) return hit;
  const m = computeMap(argsOf(params), rimTilt);
  const c = document.createElement('canvas');
  c.width = m.w;
  c.height = m.h;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(m.data, m.w, m.h), 0, 0);
  const map = { url: c.toDataURL(), scale: m.scale };
  remember(key, map);
  return map;
}

/**
 * Get a map: from the cache at once (returns it), or later from the worker
 * (returns null and calls done(map) when it's ready — not if it failed and
 * was then made on the main thread: done still gets it). Without a working
 * worker it's made right here and returned.
 */
export function requestMap(params, done) {
  const key = mapKey(params);
  const hit = cachedMap(key);
  if (hit) return hit;
  // Small maps (knobs, buttons, chips, a header) are made right here: they
  // cost ~1–2 ms, and the glass must refract on the very frame it's pressed.
  // From the worker they arrived a frame or two late — a pressed switch knob
  // showed 1–3 frames of flat green (the old, rest-state map stretched)
  // before its lens appeared. Only big maps (panels) go to the worker.
  if (params.w * params.h <= SYNC_MAX_PIXELS) return mapNow(params);
  const w = worker();
  if (!w) return mapNow(params);
  const waiting = pending.get(key);
  if (waiting) {
    waiting.push(done);
    return null;
  }
  pending.set(key, [done]);
  jobs.set(key, params);
  w.postMessage({ key, args: argsOf(params) });
  // Until the worker has answered once, don't trust it: a CSP-blocked worker
  // doesn't always fire 'error' — after WORKER_TRIAL_MS without a word, the
  // maps are made on the main thread instead (so glass never waits forever).
  if (!workerAnswered && !trialTimer) {
    trialTimer = setTimeout(() => {
      trialTimer = 0;
      if (!workerAnswered) giveUp();
    }, WORKER_TRIAL_MS);
  }
  return null;
}

// --- Worker -----------------------------------------------------------------------------------
const WORKER_TRIAL_MS = 1500;
let workerAnswered = false;
let trialTimer = 0;
let theWorker; // undefined = not tried yet; null = unavailable (main thread from now on)
const jobs = new Map(); // key → params (to redo on the main thread if the worker dies)

function worker() {
  if (theWorker !== undefined) return theWorker;
  theWorker = null;
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
    const src =
      `const tilt = (${rimTilt.toString()});\n` +
      `const computeMap = (${computeMap.toString()});\n` +
      `self.onmessage = async (e) => {\n` +
      `  const { key, args } = e.data;\n` +
      `  try {\n` +
      `    const m = computeMap(args, tilt);\n` +
      `    const c = new OffscreenCanvas(m.w, m.h);\n` +
      `    c.getContext('2d').putImageData(new ImageData(m.data, m.w, m.h), 0, 0);\n` +
      `    const blob = await c.convertToBlob({ type: 'image/png' });\n` +
      `    const url = new FileReaderSync().readAsDataURL(blob);\n` +
      `    self.postMessage({ key, url, scale: m.scale });\n` +
      `  } catch (err) {\n` +
      `    self.postMessage({ key, error: String(err) });\n` +
      `  }\n` +
      `};\n`;
    const blobUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(blobUrl); // a CSP without worker-src blob: throws here or fires 'error'
    URL.revokeObjectURL(blobUrl);
    w.onmessage = (e) => {
      workerAnswered = true;
      const { key, url, scale, error } = e.data;
      const params = jobs.get(key);
      jobs.delete(key);
      const map = error || !url ? (params ? mapNow(params) : null) : { url, scale };
      if (!error && map) remember(key, map);
      const cbs = pending.get(key) || [];
      pending.delete(key);
      if (map) cbs.forEach((cb) => cb(map));
    };
    // The worker couldn't start (blocked by CSP) or crashed: main thread from
    // now on, and finish whatever it was working on right here.
    w.onerror = (e) => {
      e.preventDefault?.();
      giveUp();
    };
    theWorker = w;
  } catch {
    theWorker = null;
  }
  return theWorker;
}

function giveUp() {
  try {
    theWorker?.terminate();
  } catch {
    /* ignore */
  }
  theWorker = null;
  const todo = [...jobs.entries()];
  jobs.clear();
  for (const [key, params] of todo) {
    const map = mapNow(params);
    const cbs = pending.get(key) || [];
    pending.delete(key);
    cbs.forEach((cb) => cb(map));
  }
}
