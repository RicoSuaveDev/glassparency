/**
 * =============================================================================
 * glass/autoText.js — textColor: "auto": readable text on any backdrop
 * =============================================================================
 *   "button": { "textColor": "auto" }                  // light or dark, picked live
 *   "button": { "textColor": "auto", "textLight": "#fff", "textDark": "#0b1b3a" }
 *
 * Glass with textColor "auto" gets whichever of its two text colours
 * (textLight / textDark) contrasts more with what is actually behind its
 * content — WCAG contrast ratio, with hysteresis so it doesn't flicker over
 * a busy picture. The colour goes into the same --glass-text CSS variable a
 * fixed textColor uses (glass.css), so icons drawn in currentColor follow.
 *
 * What "behind" means, per renderer:
 *   - WebGL glass: the very buffer the glass refracts (the page background,
 *     the glass below it, or the page picture for floating glass) — sampled
 *     on the GPU. Cheap: one tiny mip level of that buffer (≤ 96 px wide —
 *     the buffer already has mipmaps for the frost) is copied into a pixel
 *     buffer ASYNCHRONOUSLY (WebGL2 PIXEL_PACK_BUFFER + fence, read when the
 *     GPU is done), at most once a second per canvas, and only
 *     while frames are being drawn (an idle page costs nothing). The glass's
 *     own tint, tintOpacity and brightness are then mixed in on the CPU.
 *   - Live glass (Chromium floating glass) and the CSS fallback: there are
 *     no pixels to read (the browser draws them), so it's ESTIMATED from the
 *     tint and the page's background colour. Over a photo with a clear tint
 *     that estimate can be wrong — give such glass some tint, or a fixed
 *     textColor.
 * =============================================================================
 */

import { getGlobal } from './config';

/** Elements whose resolved textColor is "auto" (useGlass.js keeps it). */
export const autoTextEls = new Set();
/** Element → { color, contrast } last chosen (for hysteresis). */
const chosen = new WeakMap();

const DEFAULT_LIGHT = '#ffffff';
const DEFAULT_DARK = '#1d1d1f';
/** Switch colours only when the other one is this much better (no flicker). */
const HYSTERESIS = 1.15;

// --- Colours ------------------------------------------------------------------
const rgbCache = new Map();
let probe = null;
/**
 * Any CSS colour → [r, g, b] (0–255). "var(--x)" is read from `el`.
 * Uses the browser's own parser (a hidden probe element), cached.
 */
export function toRgb(color, el) {
  if (!color || typeof document === 'undefined') return null;
  let c = String(color).trim();
  const v = /^var\(\s*(--[\w-]+)\s*(?:,(.*))?\)$/i.exec(c);
  if (v) c = (el ? getComputedStyle(el).getPropertyValue(v[1]).trim() : '') || (v[2] || '').trim();
  if (!c) return null;
  if (rgbCache.has(c)) return rgbCache.get(c);
  if (!probe) {
    probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
    document.body.appendChild(probe);
  }
  probe.style.color = '';
  probe.style.color = c;
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(getComputedStyle(probe).color);
  const rgb = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  if (rgbCache.size > 200) rgbCache.clear();
  rgbCache.set(c, rgb);
  return rgb;
}
const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
/** Relative luminance (WCAG) of [r, g, b] 0–255. */
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The tint as one colour (a gradient → the average of its stops). */
function tintRgb(p, el) {
  const t = p.tint;
  if (!t) return [255, 255, 255];
  const stops = [t.from, t.via, t.to].filter(Boolean).map((c) => toRgb(c, el)).filter(Boolean);
  if (!stops.length) return [255, 255, 255];
  return [0, 1, 2].map((i) => stops.reduce((s, c) => s + c[i], 0) / stops.length);
}

/**
 * What the content of glass `p` sits on, as one colour: the backdrop
 * (brightened like the glass does), with the tint over it at tintOpacity.
 */
function composite(backdrop, p, el) {
  const b = Math.max(0, p.brightness ?? 1);
  const tint = tintRgb(p, el);
  const a = Math.max(0, Math.min(1, p.tintOpacity ?? 0));
  return [0, 1, 2].map((i) => Math.min(255, backdrop[i] * b) * (1 - a) + tint[i] * a);
}

/**
 * Pick and apply the text colour for `el` over `backdrop` ([r, g, b]).
 * @returns {string} the colour now in --glass-text
 */
export function applyAutoText(el, p, backdrop) {
  const light = p.textLight || DEFAULT_LIGHT;
  const dark = p.textDark || DEFAULT_DARK;
  const L = luminance(composite(backdrop, p, el));
  const cl = contrast(L, luminance(toRgb(light, el) || [255, 255, 255]));
  const cd = contrast(L, luminance(toRgb(dark, el) || [0, 0, 0]));
  const prev = chosen.get(el);
  let color = cl >= cd ? light : dark;
  // Hysteresis: keep the current colour unless the other is clearly better.
  if (prev && (prev.color === light || prev.color === dark) && prev.color !== color) {
    const keep = prev.color === light ? cl : cd;
    const other = prev.color === light ? cd : cl;
    if (other < keep * HYSTERESIS) color = prev.color;
  }
  chosen.set(el, { color });
  if (chosenShown.get(el) !== color) {
    chosenShown.set(el, color);
    el.dataset.glassText = '';
    fadeText(el, color);
  }
  return color;
}

/**
 * Fade --glass-text into `color` over FADE_MS (stepped in JS, so no CSS
 * transition is set on the element — a `transition: color` rule replaced
 * the element's OWN transitions, e.g. a morph toolbar's sliding items).
 * The first colour an element gets is set at once.
 */
const FADE_MS = 350;
const chosenShown = new WeakMap(); // el → the colour it is showing / fading to
const fading = new WeakMap(); // el → its fade's animation frame
function fadeText(el, color) {
  cancelAnimationFrame(fading.get(el) || 0);
  const from = toRgb(el.style.getPropertyValue('--glass-text'), el);
  const to = toRgb(color, el);
  if (!from || !to || typeof requestAnimationFrame !== 'function') {
    el.style.setProperty('--glass-text', color);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / FADE_MS);
    const k = t * t * (3 - 2 * t); // ease in-out
    if (t >= 1) {
      el.style.setProperty('--glass-text', color);
      fading.delete(el);
      return;
    }
    const c = from.map((v, i) => Math.round(v + (to[i] - v) * k));
    el.style.setProperty('--glass-text', `rgb(${c[0]}, ${c[1]}, ${c[2]})`);
    fading.set(el, requestAnimationFrame(step));
  };
  fading.set(el, requestAnimationFrame(step));
}

/** The colour last chosen for `el` (sampled or estimated), or null. */
export const autoTextOf = (el) => chosen.get(el)?.color ?? null;
/** Forget `el` (its glass went away or its textColor isn't "auto" any more). */
export function dropAutoText(el) {
  autoTextEls.delete(el);
  chosenShown.delete(el);
  cancelAnimationFrame(fading.get(el) || 0);
  fading.delete(el);
  chosen.delete(el);
}

/**
 * No pixels to read (live glass, CSS fallback, before the first sample):
 * estimate the backdrop from the page's background colour (the first
 * opaque one up from the element), else the theme.
 */
export function estimateAutoText(el, p) {
  estimated.set(el, p); // (re-estimated when the backdrop picture loads / the page scrolls)
  let bg = null;
  for (let n = el.parentElement; n && !bg; n = n.parentElement) bg = opaqueColor(n);
  // (1.5.3) The backdrop PICTURE (global.backgroundImage) showing behind the
  // glass — on an ancestor, or on an element laid out behind it (a photo
  // "window" like the showcase's stage: a sibling holding the picture) —
  // with nothing opaque in between: the picture under the element is what
  // the glass sits on, not the page's background colour. (Segmented labels
  // stayed dark over a dark photo.)
  if (pictureShowsBehind(el)) {
    const pc = pictureColorBehind(el);
    if (pc) bg = pc;
  }
  if (!bg) {
    const dark = document.documentElement.dataset.theme === 'dark' || window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    bg = dark ? [0, 0, 0] : [255, 255, 255];
  }
  return applyAutoText(el, p, bg);
}

// --- The backdrop picture's colour under an element (estimates) ------------------
/**
 * global.backgroundImage fills the window like CSS `background-size: cover`
 * centred, fixed to the window (the base canvas's copy, GlassCanvas
 * fitToScreen — and a site's own on-screen copy of it is laid out the same
 * way, as the showcase's stage does). Live glass / CSS glass can't read pixels,
 * so the picture is loaded once more here, shrunk to SMALL px on its longer
 * side, and the average colour of the part under the element is read from
 * that copy (a few hundred pixels at most — cheap).
 * A picture that can't be read (no CORS headers: a tainted canvas) gives
 * null, and the page-colour estimate stays.
 */
const SMALL = 96;
const pic = { url: null, data: null, w: 0, h: 0, failed: false };
/** Elements estimated (not GPU-sampled) → their resolved props, for re-estimates. */
const estimated = new WeakMap();
function loadPicture(url) {
  if (pic.url === url || typeof Image === 'undefined') return;
  Object.assign(pic, { url, data: null, w: 0, h: 0, failed: false });
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im.onload = () => {
    if (pic.url !== url) return;
    try {
      const k = SMALL / Math.max(im.naturalWidth, im.naturalHeight);
      const w = Math.max(1, Math.round(im.naturalWidth * k));
      const h = Math.max(1, Math.round(im.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(im, 0, 0, w, h);
      Object.assign(pic, { data: ctx.getImageData(0, 0, w, h).data, w, h });
      reestimateAll();
    } catch {
      pic.failed = true; // (tainted: no CORS)
    }
  };
  im.onerror = () => {
    if (pic.url === url) pic.failed = true;
  };
  im.src = url;
}
/** An element's own background colour if it's (nearly) opaque, else null. */
function opaqueColor(n) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(getComputedStyle(n).backgroundColor);
  return m && (m[4] === undefined || Number(m[4]) > 0.5) ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
/** Does this element paint the backdrop picture (its computed background-image)? */
function paintsPicture(n, href) {
  const bi = getComputedStyle(n).backgroundImage;
  return bi !== 'none' && bi.includes(href);
}
/**
 * Is the backdrop picture what's behind `el`? Walking up from it: an
 * ancestor that paints the picture → yes; an ancestor with an opaque
 * background first → no (the glass sits on that). At each level, a CHILD
 * laid out under `el`'s centre (not the branch `el` is in) that paints the
 * picture — itself or its first level of children — counts too: that's a
 * photo window behind the glass (the picture is fixed to the window and
 * clipped to it). Cheap: it only runs for estimated (live / CSS) glass.
 */
function pictureShowsBehind(el) {
  if (typeof window === 'undefined') return false;
  const url = getGlobal().backgroundImage;
  if (!url) return false;
  let href;
  try {
    href = new URL(url, location.href).href;
  } catch {
    return false;
  }
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const under = (c) => {
    const cr = c.getBoundingClientRect();
    return cr.width > 0 && cx >= cr.left && cx <= cr.right && cy >= cr.top && cy <= cr.bottom;
  };
  for (let n = el.parentElement; n; n = n.parentElement) {
    if (paintsPicture(n, href)) return true;
    for (const c of n.children) {
      if (c.contains(el) || !under(c)) continue;
      if (paintsPicture(c, href)) return true;
      for (const g of c.children) if (paintsPicture(g, href)) return true;
    }
    if (opaqueColor(n)) return false;
  }
  return false;
}
/** Average [r, g, b] of the backdrop picture under `el`, or null. */
function pictureColorBehind(el) {
  if (typeof window === 'undefined') return null;
  const url = getGlobal().backgroundImage;
  if (!url) return null;
  loadPicture(url);
  if (!pic.data) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  // Window px → picture px ("cover", centred).
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.max(vw / pic.w, vh / pic.h);
  const ox = (vw - pic.w * scale) / 2;
  const oy = (vh - pic.h * scale) / 2;
  const x0 = Math.max(0, Math.floor((r.left - ox) / scale));
  const x1 = Math.min(pic.w - 1, Math.ceil((r.right - ox) / scale));
  const y0 = Math.max(0, Math.floor((r.top - oy) / scale));
  const y1 = Math.min(pic.h - 1, Math.ceil((r.bottom - oy) / scale));
  if (x1 < x0 || y1 < y0) return null;
  let R = 0;
  let G = 0;
  let B = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * pic.w + x) * 4;
      R += pic.data[i];
      G += pic.data[i + 1];
      B += pic.data[i + 2];
      n++;
    }
  }
  return n ? [R / n, G / n, B / n] : null;
}
/**
 * Estimate again for every estimated element: once the picture has loaded,
 * and after a scroll settles (the picture is fixed to the window, so what's
 * under an element changes as the page scrolls).
 */
function reestimateAll() {
  for (const el of autoTextEls) {
    const p = estimated.get(el);
    // Only elements whose colour is still an estimate (WebGL glass samples
    // its real buffer — see createTextSampler).
    if (p && el.isConnected && (el.dataset.glassDrawn === undefined || el.dataset.glassLive !== undefined)) estimateAutoText(el, p);
  }
}
let picScrollTimer = 0;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'scroll',
    () => {
      if (!pic.data) return;
      clearTimeout(picScrollTimer);
      picScrollTimer = setTimeout(reestimateAll, 150);
    },
    { capture: true, passive: true }
  );
}

// --- GPU sampling (used by GlassCanvas) -----------------------------------------
const MAX_W = 96; // mip level read back: at most this many px wide
// At most one sample a second per canvas. (Was 4: each sample's readback
// blocks Chrome's main thread 15–35 ms while the GPU is busy — ~20% of the
// main thread around scrolling in the UI lab. The text colour has
// hysteresis and only flips between two colours, so once a second is plenty.)
const INTERVAL_MS = 1000;

// --- No samples while the page scrolls ----------------------------------------------
// Reading pixels back (getBufferSubData) is a SYNCHRONOUS round trip to the
// GPU process in Chrome — it waits behind everything the GPU has queued.
// While scrolling, the GPU is busy re-running every live SVG glass filter, so
// each read blocked the main thread ~20 ms (measured in the UI lab, Chrome:
// 676 ms of a 1.5 s scroll); with checkFramebufferStatus (below) the WebGL
// glass got only 7–8 frames per scroll and looked frozen until it ended.
// So no samples while scrolling (+ SCROLL_QUIET_MS after); the trailing
// timer takes one as soon as it settles. The text colour holds meanwhile
// (it has hysteresis anyway).
const SCROLL_QUIET_MS = 200;
let lastScrollAt = 0;
let scrollWatching = false;
function watchScroll() {
  if (scrollWatching || typeof window === 'undefined') return;
  scrollWatching = true;
  window.addEventListener(
    'scroll',
    () => {
      lastScrollAt = performance.now();
    },
    { capture: true, passive: true }
  );
}

// Framebuffer completeness, checked once per (texture, mip level).
// checkFramebufferStatus is ALSO a synchronous GPU round trip in Chrome
// (~23 ms each mid-scroll, measured) and it was called on every sample; a
// texture's level doesn't change format, so the answer can't change.
const fbChecked = new WeakMap(); // WebGLTexture → Map(level → complete?)

/**
 * One per canvas. In the frame loop, for each stratum that has auto-text
 * glass: sampler.read(renderTarget, controllers) right after setBuffer —
 * the copy is queued at that point in the GPU's command stream, so it sees
 * exactly what that stratum refracts even though the buffer is reused later
 * in the frame.
 * @param {import('three').WebGLRenderer} renderer
 * @param {() => void} invalidate  ask for one more frame (trailing sample)
 */
export function createTextSampler(renderer, invalidate) {
  const gl = renderer.getContext();
  const ok = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const fb = ok ? gl.createFramebuffer() : null;
  let lastAt = 0;
  let trailing = 0;
  let disposed = false;

  /** Is a sample due this frame? (Else one more frame is asked for later.) */
  watchScroll();
  const due = () => {
    if (!ok || disposed) return false;
    const now = performance.now();
    const quietIn = lastScrollAt + SCROLL_QUIET_MS - now; // > 0 = still scrolling
    if (now - lastAt >= INTERVAL_MS && quietIn <= 0) return true;
    if (!trailing) {
      trailing = setTimeout(
        () => {
          trailing = 0;
          if (!disposed) invalidate();
        },
        Math.max(INTERVAL_MS - (now - lastAt), quietIn) + 5
      );
    }
    return false;
  };

  /**
   * Queue the readback of `rt` for these controllers' elements.
   * @param {import('three').WebGLRenderTarget} rt
   * @param {Array<{ el: HTMLElement, p: object }>} items
   */
  const read = (rt, items) => {
    const tex = renderer.properties.get(rt.texture)?.__webglTexture;
    if (!tex) return;
    // The smallest mip level that is still ≥ ~MAX_W/2 wide.
    let level = 0;
    let w = rt.width;
    let h = rt.height;
    while (w > MAX_W && level < 14) {
      level += 1;
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
    const prevRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, level);
    // (cached per texture + level — see fbChecked)
    let levels = fbChecked.get(tex);
    if (!levels) fbChecked.set(tex, (levels = new Map()));
    // Only "complete" is remembered: a level the mipmaps haven't filled yet
    // is incomplete now but fine later, so that one is asked again next time.
    if (!levels.get(level) && gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) levels.set(level, true);
    if (!levels.get(level)) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevRead);
      return;
    }
    const pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevRead);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    // Where each element is in the buffer: the buffer covers the canvas.
    const cr = renderer.domElement.getBoundingClientRect();
    const boxes = items.map(({ el, p }) => ({ el, p, r: el.getBoundingClientRect() }));
    const poll = () => {
      if (disposed || gl.isContextLost()) {
        gl.deleteSync(sync);
        gl.deleteBuffer(pbo);
        return;
      }
      // A read queued just before a scroll started: collect it only once the
      // scroll has settled (getBufferSubData blocks behind the GPU's queue —
      // 50–100 ms each mid-scroll in Chrome; see SCROLL_QUIET_MS).
      const quietIn = lastScrollAt + SCROLL_QUIET_MS - performance.now();
      if (quietIn > 0) {
        setTimeout(poll, quietIn + 5);
        return;
      }
      const s = gl.clientWaitSync(sync, 0, 0);
      if (s === gl.TIMEOUT_EXPIRED) {
        setTimeout(poll, 4);
        return;
      }
      gl.deleteSync(sync);
      const px = new Uint8Array(w * h * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, px);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.deleteBuffer(pbo);
      for (const { el, p, r } of boxes) {
        const avg = averageUnder(px, w, h, cr, r);
        if (avg) applyAutoText(el, p, avg);
      }
    };
    setTimeout(poll, 0);
  };

  return {
    /** Call once per frame before the strata; true = sample this frame. */
    begin() {
      const go = autoTextEls.size > 0 && due();
      if (go) lastAt = performance.now();
      return go;
    },
    read,
    dispose() {
      disposed = true;
      clearTimeout(trailing);
      if (fb) gl.deleteFramebuffer(fb);
    },
  };
}

/**
 * Average colour of the buffer under the middle of an element's box (where
 * its text is): the inner 60% × 60%, clamped to the canvas.
 * The buffer's rows run bottom-up (GL).
 */
function averageUnder(px, w, h, cr, r) {
  if (!cr.width || !cr.height || r.width < 1 || r.height < 1) return null;
  const ix = r.width * 0.2;
  const iy = r.height * 0.2;
  const x0 = Math.floor(((r.left + ix - cr.left) / cr.width) * w);
  const x1 = Math.ceil(((r.right - ix - cr.left) / cr.width) * w);
  const yTop = ((r.top + iy - cr.top) / cr.height) * h;
  const yBot = ((r.bottom - iy - cr.top) / cr.height) * h;
  const y0 = Math.floor(h - yBot);
  const y1 = Math.ceil(h - yTop);
  // Weighted by alpha: with background "auto" the buffer can be see-through
  // where the page's own background shows; mostly see-through → no answer
  // (the estimate from the page colour stays).
  let n = 0;
  let a = 0;
  const sum = [0, 0, 0];
  for (let y = Math.max(0, y0); y < Math.min(h, Math.max(y0 + 1, y1)); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(w, Math.max(x0 + 1, x1)); x += 1) {
      const i = (y * w + x) * 4;
      const al = px[i + 3] / 255;
      sum[0] += px[i] * al;
      sum[1] += px[i + 1] * al;
      sum[2] += px[i + 2] * al;
      a += al;
      n += 1;
    }
  }
  if (!n || a / n < 0.5) return null;
  return sum.map((s) => s / a);
}
