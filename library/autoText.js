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
 *     GPU is done: no pipeline stall), at most ~4 times a second, and only
 *     while frames are being drawn (an idle page costs nothing). The glass's
 *     own tint, tintOpacity and brightness are then mixed in on the CPU.
 *   - Live glass (Chromium floating glass) and the CSS fallback: there are
 *     no pixels to read (the browser draws them), so it's ESTIMATED from the
 *     tint and the page's background colour. Over a photo with a clear tint
 *     that estimate can be wrong — give such glass some tint, or a fixed
 *     textColor.
 * =============================================================================
 */

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
  if (el.style.getPropertyValue('--glass-text') !== color) {
    el.dataset.glassText = '';
    el.style.setProperty('--glass-text', color);
  }
  return color;
}

/** The colour last chosen for `el` (sampled or estimated), or null. */
export const autoTextOf = (el) => chosen.get(el)?.color ?? null;
/** Forget `el` (its glass went away or its textColor isn't "auto" any more). */
export function dropAutoText(el) {
  autoTextEls.delete(el);
  chosen.delete(el);
}

/**
 * No pixels to read (live glass, CSS fallback, before the first sample):
 * estimate the backdrop from the page's background colour (the first
 * opaque one up from the element), else the theme.
 */
export function estimateAutoText(el, p) {
  let bg = null;
  for (let n = el.parentElement; n && !bg; n = n.parentElement) {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(getComputedStyle(n).backgroundColor);
    if (m && (m[4] === undefined || Number(m[4]) > 0.5)) bg = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (!bg) {
    const dark = document.documentElement.dataset.theme === 'dark' || window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    bg = dark ? [0, 0, 0] : [255, 255, 255];
  }
  return applyAutoText(el, p, bg);
}

// --- GPU sampling (used by GlassCanvas) -----------------------------------------
const MAX_W = 96; // mip level read back: at most this many px wide
const INTERVAL_MS = 250; // at most ~4 samples a second per canvas

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
  const due = () => {
    if (!ok || disposed) return false;
    const now = performance.now();
    if (now - lastAt >= INTERVAL_MS) return true;
    if (!trailing) {
      trailing = setTimeout(() => {
        trailing = 0;
        if (!disposed) invalidate();
      }, INTERVAL_MS - (now - lastAt) + 5);
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
    if (gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
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
