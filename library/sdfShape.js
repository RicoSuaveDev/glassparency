/**
 * =============================================================================
 * glass/sdfShape.js — Custom glass shapes: any SVG path, icon or text
 * =============================================================================
 * Most glass is a rounded rectangle, which the shaders describe exactly with
 * a formula (sdRoundRect). A custom shape — `shape: { path: 'M…' }`, an
 * <svg> icon, or headline text (<GlassText>) — has no formula, so it is
 * turned into a SIGNED DISTANCE FIELD (SDF) picture instead:
 *
 *   1. RASTERIZE  the shape is drawn in black into a 2D canvas the size of the
 *                 element (plus PAD px of empty margin all round), at up to
 *                 MAX_SCALE texels per CSS px and at most MAX_SIDE texels a
 *                 side. Paths are filled with Path2D, <svg> markup is drawn as
 *                 an image (so stroked icons — Lucide, Feather… — work too),
 *                 text with the element's own computed font, line height,
 *                 letter spacing and alignment, at the same place the
 *                 browser lays the (transparent) DOM text out.
 *   2. DISTANCE   an exact Euclidean distance transform (Felzenszwalb &
 *                 Huttenlocher, "Distance Transforms of Sampled Functions",
 *                 2012 — two 1-D passes, linear time) runs twice: distance
 *                 from every texel to the shape and to the outside. Their
 *                 difference is the signed distance (≤ 0 inside), with the
 *                 canvas's anti-aliased edge used for sub-texel accuracy
 *                 (the same trick Mapbox's TinySDF uses for glyphs).
 *   3. RESULT     a Float32Array of distances IN CSS PX, handed to the WebGL
 *                 side (sdfTexture.js makes a half-float texture of it) — the
 *                 liquid shader then reads it instead of sdRoundRect, so the
 *                 rim, refraction, light, border, shadow and the smooth-min
 *                 melting of glass groups all follow the real outline.
 *
 * Caching: one field per shape + size (+ font), shared by every element that
 * draws the same thing (an icon used ten times is rasterized once), kept in a
 * small LRU. While an element's size keeps changing (a spring, a resize drag)
 * its last field is stretched to fit (cheap: it's just a scale in the shader)
 * and a fresh one is made once the size has held still for REGEN_MS. Web
 * fonts loading later (document.fonts "loadingdone") throw text fields away
 * so headlines re-rasterize in their real font.
 *
 * The CSS / no-WebGL tier uses the same shapes as a MASK (shapeMaskCss): the
 * library's CSS glass pane is masked to the outline (an SVG data URL for
 * paths / icons — crisp at any size — or the text raster as a PNG).
 *
 * No three.js here (the CSS tier imports this without the WebGL chunk), and
 * no other glass modules (config.js imports it).
 * =============================================================================
 */
// (No imports: config.js reads isCustomShape / normalizeShape from here, and
// registry.js imports config.js — callers pass their own redraw callback.)

// --- Tuning ---------------------------------------------------------------------------
/** Empty margin round the shape (CSS px): room for the outside distances that
 *  melting (smooth-min), the drop shadow and the rim light read. Past it the
 *  shader extends the field by the straight-line distance to the margin. */
export const PAD = 24;
/** Texels per CSS px, at most (small icons get 2× for clean curves). */
const MAX_SCALE = 2;
/** Longest texture side (texels): keeps the distance transform ≲ 15 ms. */
const MAX_SIDE = 1024;
/** A new field is made once the element's size has held for this long (ms). */
const REGEN_MS = 140;
/** Fields kept in memory (shape × size × font). */
const CACHE_MAX = 32;

// --- Shape descriptors -----------------------------------------------------------------
/**
 * Is `v` a custom shape (rather than one of the named shapes)?
 *   { path: 'M…', viewBox?: '0 0 24 24', fillRule?: 'nonzero'|'evenodd', fit?: 'contain'|'fill' }
 *   { svg: '<svg …>…</svg>' }   (useGlass turns { svg: element | 'child' } into this)
 *   { text: 'Hello' | true }    (true = the element's own text)
 */
export function isCustomShape(v) {
  return Boolean(v && typeof v === 'object' && (typeof v.path === 'string' || typeof v.svg === 'string' || v.text === true || typeof v.text === 'string'));
}

/** The shape as a plain, validated object (what resolveGlass hands out as customShape). */
export function normalizeShape(v) {
  if (!isCustomShape(v)) return null;
  const fit = v.fit === 'fill' ? 'fill' : 'contain';
  if (typeof v.path === 'string') {
    return {
      kind: 'path',
      path: v.path,
      viewBox: typeof v.viewBox === 'string' ? v.viewBox : null,
      fillRule: v.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
      fit,
    };
  }
  if (typeof v.svg === 'string') return { kind: 'svg', svg: v.svg, fit };
  return { kind: 'text', text: v.text === true ? true : String(v.text) };
}

/** A short stable key for a normalized shape (cache + change detection). */
const keyMemo = new WeakMap(); // normalized shape → key (resolveGlass hands out the same object while nothing changes)
export function shapeKeyOf(s) {
  if (!s) return '';
  let k = keyMemo.get(s);
  if (k) return k;
  if (s.kind === 'path') k = `p|${s.fit}|${s.fillRule}|${s.viewBox || ''}|${hash(s.path)}`;
  else if (s.kind === 'svg') k = `s|${s.fit}|${hash(s.svg)}`;
  else k = `t|${s.text === true ? '@' : hash(s.text)}`;
  keyMemo.set(s, k);
  return k;
}

/** FNV-1a string hash (keys only — collisions just share a cache slot's name). */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}${str.length.toString(36)}`;
}

// --- Fonts: re-rasterize text once web fonts arrive -------------------------------------
let fontVersion = 0;
let fontsHooked = false;
function hookFonts() {
  if (fontsHooked || typeof document === 'undefined' || !document.fonts) return;
  fontsHooked = true;
  const bump = () => {
    fontVersion += 1;
    // Text fields were drawn in a fallback font: drop them (paths/icons stay).
    for (const k of [...cache.keys()]) if (k.startsWith('t|')) cache.delete(k);
    for (const k of [...masks.keys()]) if (k.startsWith('t|')) masks.delete(k);
    staleListeners.forEach((fn) => fn());
  };
  document.fonts.addEventListener?.('loadingdone', bump);
  document.fonts.ready?.then(bump).catch(() => {});
}

// --- The text an element shows, and how it's laid out ----------------------------------
/** The element's text + font for a text shape (read from its computed style). */
function textLayout(el, shape) {
  const cs = getComputedStyle(el);
  const text = shape.text === true ? el.textContent || '' : shape.text;
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const px = (v) => parseFloat(v) || 0;
  return {
    text,
    font,
    size: px(cs.fontSize),
    lineHeight: cs.lineHeight === 'normal' ? null : px(cs.lineHeight),
    letterSpacing: cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing,
    align: cs.textAlign,
    // Content box inside the border box (getBoundingClientRect size).
    left: px(cs.paddingLeft) + px(cs.borderLeftWidth),
    right: px(cs.paddingRight) + px(cs.borderRightWidth),
    top: px(cs.paddingTop) + px(cs.borderTopWidth),
    key: `${font}|${cs.lineHeight}|${cs.letterSpacing}|${cs.textAlign}|${cs.padding}|${fontVersion}`,
  };
}

// --- Rasterizing -----------------------------------------------------------------------
/** viewBox "x y w h" → numbers (or null). */
function parseViewBox(vb) {
  const n = String(vb || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0 ? n : null;
}

/** A path's own bounds (no viewBox given): measured by a hidden <svg> once. */
const boundsCache = new Map();
function pathBounds(d) {
  if (boundsCache.has(d)) return boundsCache.get(d);
  let vb = [0, 0, 24, 24];
  try {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
    document.body.append(svg);
    const b = p.getBBox();
    svg.remove();
    if (b.width > 0 && b.height > 0) vb = [b.x, b.y, b.width, b.height];
  } catch {
    // (no DOM / bad path: the 24×24 icon box)
  }
  boundsCache.set(d, vb);
  return vb;
}

/** The transform that fits a viewBox into the w×h box (centred; contain or fill). */
function fitBox(vb, w, h, fit) {
  const [vx, vy, vw, vh] = vb;
  let sx = w / vw;
  let sy = h / vh;
  if (fit !== 'fill') sx = sy = Math.min(sx, sy);
  return { sx, sy, tx: (w - vw * sx) / 2 - vx * sx, ty: (h - vh * sy) / 2 - vy * sy };
}

/** <svg> markup prepared for drawing as an image: sized, black, namespaced. */
function svgForImage(markup, w, h, fit) {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
  if (!root.getAttribute('viewBox')) {
    const vw = parseFloat(root.getAttribute('width')) || 24;
    const vh = parseFloat(root.getAttribute('height')) || 24;
    root.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  }
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('width', String(w));
  root.setAttribute('height', String(h));
  root.setAttribute('preserveAspectRatio', fit === 'fill' ? 'none' : 'xMidYMid meet');
  // currentColor (icon libraries) → black: only the alpha matters.
  root.setAttribute('color', '#000');
  root.removeAttribute('style');
  root.removeAttribute('class');
  return new XMLSerializer().serializeToString(root);
}

/**
 * Draw the shape into a canvas (black on transparent).
 * @returns {Promise<{canvas, scale}>|{canvas, scale}|null}
 */
function rasterize(el, shape, w, h, text) {
  const scale = Math.min(MAX_SCALE, MAX_SIDE / (Math.max(w, h) + 2 * PAD));
  const cw = Math.max(1, Math.round((w + 2 * PAD) * scale));
  const ch = Math.max(1, Math.round((h + 2 * PAD) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(cw / (w + 2 * PAD), ch / (h + 2 * PAD));
  ctx.translate(PAD, PAD); // (0,0) = the element's top-left corner
  ctx.fillStyle = '#000';
  const out = { canvas, scale: cw / (w + 2 * PAD) };

  if (shape.kind === 'path') {
    const vb = parseViewBox(shape.viewBox) || pathBounds(shape.path);
    const f = fitBox(vb, w, h, shape.fit);
    ctx.transform(f.sx, 0, 0, f.sy, f.tx, f.ty);
    try {
      ctx.fill(new Path2D(shape.path), shape.fillRule);
    } catch {
      return null; // (not a valid path)
    }
    return out;
  }

  if (shape.kind === 'text') {
    const t = text;
    ctx.font = t.font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = t.letterSpacing;
    ctx.textBaseline = 'alphabetic';
    const lines = String(t.text).replace(/\s+$/, '').split('\n');
    const m0 = ctx.measureText('Hg');
    const asc = m0.fontBoundingBoxAscent ?? t.size * 0.8;
    const desc = m0.fontBoundingBoxDescent ?? t.size * 0.2;
    // CSS line box: the glyphs sit centred in the line height ("half-leading").
    const lh = t.lineHeight ?? asc + desc;
    const contentW = w - t.left - t.right;
    lines.forEach((line, i) => {
      const lw = ctx.measureText(line).width;
      let x = t.left;
      if (t.align === 'center') x = t.left + (contentW - lw) / 2;
      else if (t.align === 'right' || t.align === 'end') x = t.left + contentW - lw;
      const base = t.top + i * lh + (lh - (asc + desc)) / 2 + asc;
      ctx.fillText(line, x, base);
    });
    return out;
  }

  // <svg> markup: drawn as an image (async). Strokes, circles, groups,
  // transforms… whatever the browser can draw.
  const src = svgForImage(shape.svg, w, h, shape.fit);
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, w, h);
        resolve(out);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
  });
}

// --- Euclidean distance transform -------------------------------------------------------
const INF = 1e20;
/** 1-D squared distance transform of grid[offset + i·stride], in place (Felzenszwalb). */
function edt1d(grid, offset, stride, length, f, v, z) {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    // Lower envelope of parabolas: drop those the new one hides.
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}
/** 2-D: columns, then rows. */
function edt2d(grid, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const v = new Uint16Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}

/**
 * Canvas → signed distances in CSS px (≤ 0 inside), row 0 = TOP.
 * Grids start at 0 where the "target" is and INF elsewhere; anti-aliased
 * edge texels start at their sub-texel distance to the edge (½ − coverage).
 */
function distanceField(canvas, scale) {
  const w = canvas.width;
  const h = canvas.height;
  let px;
  try {
    px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  } catch {
    return null; // (tainted canvas — e.g. an <svg> with outside images)
  }
  const n = w * h;
  const outer = new Float64Array(n); // squared distance to the shape
  const inner = new Float64Array(n); // squared distance to the outside
  let any = false;
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3] / 255;
    if (a >= 1) {
      outer[i] = 0;
      inner[i] = INF;
      any = true;
    } else if (a <= 0) {
      outer[i] = INF;
      inner[i] = 0;
    } else {
      const d = 0.5 - a;
      outer[i] = d > 0 ? d * d : 0;
      inner[i] = d < 0 ? d * d : 0;
      any = true;
    }
  }
  if (!any) return null; // (nothing drawn: no shape)
  edt2d(outer, w, h);
  edt2d(inner, w, h);
  const out = new Float32Array(n);
  const k = 1 / scale; // texels → CSS px
  for (let i = 0; i < n; i++) out[i] = (Math.sqrt(outer[i]) - Math.sqrt(inner[i])) * k;
  return out;
}

// --- Per-element fields (with the shared cache) ------------------------------------------
const cache = new Map(); // key → field (LRU: re-inserted on use)
const pending = new Map(); // key → Promise (an <svg> image still loading)
const perEl = new WeakMap(); // element → { field, wantKey, timer }
let fieldVersion = 0;

function remember(key, field) {
  cache.delete(key);
  cache.set(key, field);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/**
 * Build the field for (shape, w, h) — synchronously for paths and text, or
 * via a Promise for <svg> markup (resolves to the field or null).
 * A field: { data: Float32Array (CSS px, ≤0 inside, row 0 = top), tw, th
 * (texels), halfW, halfH (CSS px half-extent of the whole texture, pad
 * included), boxW, boxH (the element box it was made for), key, shapeId,
 * version }.
 */
function build(el, shape, w, h, key, text, shapeId) {
  const finish = (r) => {
    if (!r) return null;
    const data = distanceField(r.canvas, r.scale);
    if (!data) return null;
    fieldVersion += 1;
    const field = {
      data,
      tw: r.canvas.width,
      th: r.canvas.height,
      halfW: w / 2 + PAD,
      halfH: h / 2 + PAD,
      boxW: w,
      boxH: h,
      key,
      shapeId,
      version: fieldVersion,
    };
    remember(key, field);
    return field;
  };
  const r = rasterize(el, shape, w, h, text);
  if (r && typeof r.then === 'function') return r.then(finish);
  return finish(r);
}

/**
 * The distance field to draw an element's custom shape with, at (about) its
 * current size w×h — or null while there is none yet (the element then keeps
 * its CSS look). May return a field made for another size (the shader
 * stretches it); a fresh one is scheduled and onReady() is called once
 * it's ready.
 * @param {HTMLElement} el
 * @param {object} shape  normalized (resolveGlass's customShape)
 * @param {number} w, h   the glass box in CSS px
 * @param {() => void} onReady  called when a field made LATER is ready (redraw)
 */
export function shapeFieldFor(el, shape, w, h, onReady) {
  hookFonts();
  let s = perEl.get(el);
  if (!s) {
    s = { field: null, wantKey: '', timer: 0, text: null, textFor: '' };
    perEl.set(el, s);
  }
  const rw = Math.max(1, Math.round(w));
  const rh = Math.max(1, Math.round(h));
  // Text: its layout (computed font, padding…) is only re-read when the
  // size, the text or the loaded fonts change — not every frame.
  let text = null;
  if (shape.kind === 'text') {
    const raw = shape.text === true ? el.textContent || '' : shape.text;
    const textFor = `${rw}x${rh}|${fontVersion}|${raw}`;
    if (s.textFor !== textFor) {
      s.textFor = textFor;
      s.text = textLayout(el, shape);
    }
    text = s.text;
    if (!text.text.trim()) return null; // (no text: nothing to draw)
  }
  // shapeId = what is drawn (shape + font); key = that at this size.
  const shapeId = shapeKeyOf(shape) + (text ? `|${text.key}|${hash(text.text)}` : '');
  const key = `${shapeId}#${rw}x${rh}`;
  if (s.field?.key === key) return s.field;
  const hit = cache.get(key);
  if (hit) {
    remember(key, hit);
    s.field = hit;
    return hit;
  }
  // Same shape, new size: keep stretching the old field while it changes,
  // make the new one once the size has held still. No field yet: now.
  let now = true;
  const make = () => {
    s.timer = 0;
    const want = s.wantKey;
    if (pending.has(want)) return;
    const res = build(el, shape, rw, rh, want, text, shapeId);
    if (res && typeof res.then === 'function') {
      pending.set(want, res);
      res.then((f) => {
        pending.delete(want);
        if (f && s.wantKey === want) s.field = f;
        onReady?.();
      });
    } else if (res) {
      s.field = res;
      // (Made inside this frame, the caller uses it right away; a redraw is
      // only needed when the timer made it later.)
      if (!now) onReady?.();
    }
  };
  if (s.wantKey !== key) {
    s.wantKey = key;
    clearTimeout(s.timer);
    // (Only a SIZE change waits — a different shape or font is made now.)
    if (s.field && s.field.shapeId === shapeId) {
      s.timer = setTimeout(() => {
        now = false;
        make();
      }, REGEN_MS);
    } else {
      s.field = null;
      make();
    }
  }
  return s.field;
}

/** Forget an element's field (its glass went away). */
export function dropShapeField(el) {
  const s = perEl.get(el);
  if (!s) return;
  clearTimeout(s.timer);
  perEl.delete(el);
}

// --- CSS tier: the shape as a mask ------------------------------------------------------
const masks = new Map(); // key → CSS url(…) value
const staleListeners = new Set();
/**
 * fn() runs when web fonts finish loading: text shapes (fields and masks)
 * must be drawn again in the real font. Returns an unsubscribe function.
 */
export function onShapesStale(fn) {
  hookFonts();
  staleListeners.add(fn);
  return () => staleListeners.delete(fn);
}

/**
 * A CSS `mask-image` value for the element's custom shape (sized 100% 100%
 * over the element), or null. Paths and icons are SVG data URLs (they scale
 * crisply); text is rasterized at the element's current size.
 * @param {HTMLElement} el
 * @param {object} shape  normalized
 */
export function shapeMaskCss(el, shape) {
  if (!shape || typeof document === 'undefined') return null;
  const r = el.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  if (shape.kind === 'path') {
    const vb = parseViewBox(shape.viewBox) || pathBounds(shape.path);
    const par = shape.fit === 'fill' ? 'none' : 'xMidYMid meet';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" preserveAspectRatio="${par}"><path fill-rule="${shape.fillRule}" d="${escapeAttr(shape.path)}"/></svg>`;
    return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  }
  if (shape.kind === 'svg') {
    // (Drawn at the element's size so the mask's aspect matches the box.)
    const src = svgForImage(shape.svg, w, h, shape.fit);
    return src ? `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}")` : null;
  }
  const t = textLayout(el, shape);
  if (!t.text.trim()) return null;
  const key = `t|${w}x${h}|${t.key}|${hash(t.text)}`;
  if (masks.has(key)) return masks.get(key);
  const out = rasterizeTextMask(t, w, h);
  if (out) {
    masks.set(key, out);
    while (masks.size > CACHE_MAX) masks.delete(masks.keys().next().value);
  }
  return out;
}

/** Text drawn at 1× device pixels into a PNG data URL (for the CSS mask). */
function rasterizeTextMask(t, w, h) {
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  // (Same layout as the SDF raster — rasterize() with no pad.)
  ctx.font = t.font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = t.letterSpacing;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  const m0 = ctx.measureText('Hg');
  const asc = m0.fontBoundingBoxAscent ?? t.size * 0.8;
  const desc = m0.fontBoundingBoxDescent ?? t.size * 0.2;
  const lh = t.lineHeight ?? asc + desc;
  const contentW = w - t.left - t.right;
  String(t.text)
    .replace(/\s+$/, '')
    .split('\n')
    .forEach((line, i) => {
      const lw = ctx.measureText(line).width;
      let x = t.left;
      if (t.align === 'center') x = t.left + (contentW - lw) / 2;
      else if (t.align === 'right' || t.align === 'end') x = t.left + contentW - lw;
      ctx.fillText(line, x, t.top + i * lh + (lh - (asc + desc)) / 2 + asc);
    });
  try {
    return `url("${canvas.toDataURL('image/png')}")`;
  } catch {
    return null;
  }
}

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
