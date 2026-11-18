/**
 * =============================================================================
 * glass/pageCanvas.js — "Canvas backdrop" mode: the page lives in one canvas
 * =============================================================================
 * Opt-in: global.backdrop "canvas" (Chromium 157+ — HTML-in-Canvas).
 *
 * The other modes can't SEE the page: WebGL glass refracts a picture of it
 * (snapshot.js) that is retaken a moment after the page changes. Here the
 * page is rendered INSIDE a <canvas content="drawable"> (GlassProvider wraps
 * its children in it), and the canvas draws everything itself, every time
 * something changes (the canvas "paint" event): the background, base glass,
 * the live page (texElementSubImage2D — always current, scrolling included),
 * floating glass refracting it, then each floating glass element's own HTML
 * on top. One canvas, because an element image can only be drawn by the
 * canvas that captured it (tested: "captured from a different canvas").
 *
 *   • The page root is `drawable`; every FLOATING glass element in it
 *     (layer float / top) is a nested `drawable` too, which keeps it — label
 *     and all — out of the page's picture (so glass never refracts its own
 *     text) and lets the renderer draw it on top of its glass.
 *   • Drawable elements are only clickable where the canvas says it drew
 *     them: syncGeometry() works out where each one is laid out and tells
 *     the canvas (updateElementGeometry) before every draw. Their CSS
 *     transforms are baked into their pictures by Chromium, so each one is
 *     captured over its transformed bounds (captureRect).
 *   • Until the WebGL glass engine has loaded (and if it ever can't run) a
 *     small built-in painter draws just the page, so the page never blanks.
 *
 * Limits (HTML-in-Canvas privacy rules): images / iframes from other origins
 * without CORS are drawn blank; the page scrolls inside the root box, not
 * the window. Plain JS (no three.js): this is in the main bundle.
 * =============================================================================
 */
import { getGlobal } from './config';
import { allEntries, placement, stats } from './registry';

/** Can this browser run canvas mode? (HTML-in-Canvas with WebGL 2 uploads.) */
export const CANVAS_BACKDROP_SUPPORTED = (() => {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof CanvasRenderingContext2D !== 'undefined' &&
      'drawElementImage' in CanvasRenderingContext2D.prototype &&
      typeof WebGL2RenderingContext !== 'undefined' &&
      'texElementSubImage2D' in WebGL2RenderingContext.prototype &&
      typeof HTMLCanvasElement.prototype.requestPaint === 'function' &&
      typeof HTMLCanvasElement.prototype.updateElementGeometry === 'function'
    );
  } catch {
    return false;
  }
})();

/** Does the config ask for canvas mode, and can it run here? */
export const canvasBackdropWanted = () => getGlobal().backdrop === 'canvas' && CANVAS_BACKDROP_SUPPORTED;

let page = null; // { canvas, root, gl, painter, renderer, ro, off }
/** The page canvas while canvas mode runs (else null). */
export const getPage = () => page;
/** Is canvas mode running? (live.js keeps all glass WebGL then.) */
export const isCanvasMode = () => Boolean(page);

/** Ask for a redraw (the next rendering update fires the canvas paint event). */
export function requestPagePaint() {
  page?.canvas.requestPaint();
}

/**
 * GlassProvider: the canvas and its drawable root are in the page — start.
 * @returns {() => void} stop
 */
export function startPage(canvas, root) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) return () => {};
  page = { canvas, root, gl, painter: null, renderer: null, ro: null, info: new Map() };
  const p = page;
  sizeCanvas(p);
  p.ro = new ResizeObserver(() => {
    if (p.renderer) p.renderer.resize?.();
    else sizeCanvas(p);
    canvas.requestPaint();
  });
  p.ro.observe(canvas);
  // A lost WebGL context can't draw — not even the page. Keep it restorable
  // (preventDefault) and rebuild the painter once it's back.
  const onLost = (e) => e.preventDefault();
  const onRestored = () => {
    p.painter = null;
    canvas.requestPaint();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  // Scrolling can bring parts of a floating element into view that Chromium
  // never painted (see checkCull) — check before each frame is drawn.
  let cullRaf = 0;
  const onScroll = () => {
    if (cullRaf) return;
    cullRaf = requestAnimationFrame(() => {
      cullRaf = 0;
      if (checkCull(p)) canvas.requestPaint();
    });
  };
  root.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  canvas.onpaint = (ev) => {
    const t0 = performance.now();
    syncGeometry(p);
    // (Moved for another reason — layout, animation: repaint it for the NEXT frame.)
    if (checkCull(p)) canvas.requestPaint();
    const t1 = performance.now();
    try {
      if (p.renderer) p.renderer.paint(ev);
      else paintPageOnly(p);
    } catch (err) {
      console.warn('glass: canvas backdrop frame failed', err);
    }
    stats.canvasSyncMs = Math.round((t1 - t0) * 10) / 10;
    stats.canvasPaintMs = Math.round((performance.now() - t1) * 10) / 10;
  };
  canvas.requestPaint();
  return () => {
    canvas.onpaint = null;
    p.ro.disconnect();
    canvas.removeEventListener('webglcontextlost', onLost);
    root.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('resize', onScroll);
    cancelAnimationFrame(cullRaf);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    p.painter?.dispose();
    for (const el of p.root.querySelectorAll('[data-glass-drawable]')) {
      el.removeAttribute('drawable');
      el.removeAttribute('data-glass-drawable');
    }
    if (page === p) page = null;
  };
}

/** The WebGL glass engine takes over drawing (null = give it back). */
export function setPageRenderer(renderer) {
  if (!page) return;
  page.renderer = renderer;
  if (!renderer) sizeCanvas(page);
  page.canvas.requestPaint();
}

/** Backing store = the canvas's CSS size × the FULL pixel density (crisp text). */
function sizeCanvas(p) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(p.canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(p.canvas.clientHeight * dpr));
  if (p.canvas.width !== w) p.canvas.width = w;
  if (p.canvas.height !== h) p.canvas.height = h;
}

// --- Painting of parts that scroll into view ------------------------------------------------
/**
 * Chromium (157) paints a drawable element only where it is in view at the
 * time, and doesn't paint the rest when scrolling brings it into view later
 * (the element itself didn't change). A sidebar that was half below the
 * window, scrolled up, showed only its first row. Any change INSIDE it
 * repaints all of it — style changes on it don't (tested). So the part of
 * each floating element that is painted is tracked (in its own px), and
 * when more of it comes into view, an empty child is added and removed
 * (invisible; React never sees it), which repaints it in full. Run before the
 * frame is drawn (scroll → requestAnimationFrame), and in the paint as a
 * safety net. @returns whether any element was repainted.
 */
const painted = new WeakMap(); // element → { x0, y0, x1, y1 } (its own px)
// Elements just repainted that way: their picture must be copied again
// even if the paint event doesn't list them as changed (it sometimes
// doesn't) — for a few frames, in case the repaint lands a frame late.
const recopy = new WeakMap(); // element → frames left
/** Should this element's picture be copied again this frame? (GlassCanvas) */
export function needsRecopy(el) {
  const n = recopy.get(el);
  if (!n) return false;
  if (n <= 1) recopy.delete(el);
  else recopy.set(el, n - 1);
  return true;
}
function checkCull(p) {
  const W = p.canvas.clientWidth;
  const H = p.canvas.clientHeight;
  let any = false;
  for (const [el, info] of p.info) {
    // Where it is NOW, from its layout (its reported box is only what the
    // last paint placed — stale before this frame's paint, and at the canvas
    // origin before the element became drawable).
    const pos = layoutPosition(el, p.info);
    const r = { left: pos.x + info.sx, top: pos.y + info.sy, width: info.sw, height: info.sh };
    const vis = { x0: Math.max(0, -r.left), y0: Math.max(0, -r.top), x1: Math.min(r.width, W - r.left), y1: Math.min(r.height, H - r.top) };
    if (vis.x1 <= vis.x0 || vis.y1 <= vis.y0) continue; // (not in view)
    const done = painted.get(el);
    if (done && vis.x0 >= done.x0 - 1 && vis.y0 >= done.y0 - 1 && vis.x1 <= done.x1 + 1 && vis.y1 <= done.y1 + 1) continue;
    painted.set(el, vis);
    // (Also the first time it is seen: it may have become drawable while
    // out of view, painted then — i.e. not at all.)
    // Chromium works out the part to paint from where the element was a
    // frame AGO: a nudge in the very frame it scrolled into view repainted
    // the old part again (tested — a jump scroll left the sidebar empty). So
    // it is nudged now and on the next two frames.
    nudge(el);
    renudge.set(el, 2);
    any = true;
  }
  if (any) scheduleRenudge(p);
  return any;
}
const renudge = new Map(); // element → nudges still to do (one per frame)
let renudgeRaf = 0;
function scheduleRenudge(p) {
  if (renudgeRaf) return;
  renudgeRaf = requestAnimationFrame(() => {
    renudgeRaf = 0;
    for (const [el, n] of renudge) {
      if (el.isConnected) nudge(el);
      if (n <= 1) renudge.delete(el);
      else renudge.set(el, n - 1);
    }
    p.canvas.requestPaint();
    if (renudge.size) scheduleRenudge(p);
  });
}
/** Repaint all of a drawable element: add + remove an empty child (invisible). */
function nudge(el) {
  const probe = document.createElement('span');
  probe.setAttribute('data-glass-repaint', '');
  el.appendChild(probe);
  probe.remove();
  recopy.set(el, 3);
  stats.canvasRepaints = (stats.canvasRepaints || 0) + 1;
}

// --- Which elements are drawn on their own, and where --------------------------------------
/**
 * Floating glass (layer float / top) inside the page root is `drawable`:
 * left out of the page's picture and drawn on top of its glass. Then each
 * one's layout position is worked out (outer elements first — an inner
 * one's offset parent may be an outer drawable) and given to the canvas
 * for hit testing. Runs at the start of every paint, before the glass reads
 * any element's box (a drawable's box IS this geometry + its CSS transform).
 */
function syncGeometry(p) {
  const { canvas, root } = p;
  canvas.updateElementGeometry(root, { canvasTransform: new DOMMatrix() });
  // Only the OUTERMOST floating glass is drawn on its own. Glass inside it
  // (a tab bar's lens, a switch's knob, chips in a header) stays in its
  // picture: all of a layer's HTML is drawn over all of that layer's glass
  // anyway (as in the normal mode, where the HTML sits over the layer's
  // canvas). Making inner glass a nested drawable too ran into a Chromium
  // (157) problem: everything painted after it in its parent went missing
  // from the parent's picture — a sidebar lost every menu item below its lens.
  const floating = new Set();
  for (const e of allEntries()) {
    if (!root.contains(e.el) || e.el === root) continue;
    if (placement(e.id).layer === 'base') continue;
    floating.add(e.el);
  }
  const want = new Set();
  for (const el of floating) {
    let inner = false;
    for (let n = el.parentElement; n && n !== root; n = n.parentElement) {
      if (floating.has(n)) {
        inner = true;
        break;
      }
    }
    if (!inner) want.add(el);
  }
  for (const el of root.querySelectorAll('[data-glass-drawable]')) {
    if (want.has(el)) continue;
    el.removeAttribute('drawable');
    el.removeAttribute('data-glass-drawable');
    p.info.delete(el);
  }
  // Outer before inner (document order does that).
  const els = [...want].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  for (const el of els) {
    if (!el.hasAttribute('drawable')) {
      el.setAttribute('drawable', '');
      el.setAttribute('data-glass-drawable', '');
    }
    const pos = layoutPosition(el, p.info);
    const box = captureRect(el);
    p.info.set(el, { x: pos.x, y: pos.y, ...box });
    canvas.updateElementGeometry(el, { canvasTransform: new DOMMatrix().translate(pos.x, pos.y) });
  }
}

/**
 * Where an element's border box is laid out, in canvas CSS px, BEFORE its
 * own CSS transform (what updateElementGeometry wants): its offset parent's
 * box (an ordinary element reports it; a drawable one is what we placed
 * it at) + border + offsetLeft/Top − any scrolling in between.
 */
function layoutPosition(el, info) {
  const op = el.offsetParent;
  let x = el.offsetLeft;
  let y = el.offsetTop;
  if (op) {
    const placed = info.get(op);
    if (placed) {
      x += placed.x;
      y += placed.y;
    } else {
      const r = op.getBoundingClientRect();
      x += r.left;
      y += r.top;
    }
    x += op.clientLeft - op.scrollLeft;
    y += op.clientTop - op.scrollTop;
  }
  // Scroll boxes between the element and its offset parent.
  for (let n = el.parentElement; n && n !== op; n = n.parentElement) {
    x -= n.scrollLeft;
    y -= n.scrollTop;
  }
  return { x, y };
}

/**
 * The part of an element's own picture to capture, in its own CSS px: its
 * border box moved / scaled by its CSS transform (Chromium bakes the
 * transform INTO the picture — capturing only the box clipped a
 * translateX(-50%) bar in half). sx/sy may be negative.
 */
function captureRect(el) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const cs = getComputedStyle(el);
  let m = new DOMMatrix();
  const [ox, oy] = (cs.transformOrigin || '0 0').split(' ').map((v) => parseFloat(v) || 0);
  m = m.translate(ox, oy);
  if (cs.translate && cs.translate !== 'none') {
    const [tx = 0, ty = 0] = cs.translate.split(' ').map((v) => parseFloat(v) || 0);
    m = m.translate(tx, ty);
  }
  if (cs.rotate && cs.rotate !== 'none') m = m.rotate(parseFloat(cs.rotate) || 0);
  if (cs.scale && cs.scale !== 'none') {
    const [sx = 1, sy = sx] = cs.scale.split(' ').map(Number);
    m = m.scale(sx, sy);
  }
  if (cs.transform && cs.transform !== 'none') m = m.multiply(new DOMMatrix(cs.transform));
  m = m.translate(-ox, -oy);
  const pts = [new DOMPoint(0, 0), new DOMPoint(w, 0), new DOMPoint(0, h), new DOMPoint(w, h)].map((pt) => m.transformPoint(pt));
  const x0 = Math.floor(Math.min(...pts.map((pt) => pt.x)));
  const y0 = Math.floor(Math.min(...pts.map((pt) => pt.y)));
  const x1 = Math.ceil(Math.max(...pts.map((pt) => pt.x)));
  const y1 = Math.ceil(Math.max(...pts.map((pt) => pt.y)));
  return { sx: x0, sy: y0, sw: Math.max(1, x1 - x0), sh: Math.max(1, y1 - y0) };
}

/** Where to draw a drawable's picture (canvas CSS px) and what to capture — or null. */
export const drawInfo = (el) => page?.info.get(el) || null;
/** Every floating glass element drawn on its own (outer first). */
export const drawableElements = () => (page ? [...page.info.keys()] : []);

// --- The built-in painter (until the glass engine has loaded) -------------------------------
/** Just the page, as one textured rectangle (plain WebGL 2, no three.js). */
function paintPageOnly(p) {
  const { gl, canvas, root } = p;
  if (!p.painter) p.painter = makePainter(gl);
  const pt = p.painter;
  const W = canvas.width;
  const H = canvas.height;
  pt.ensure(W, H);
  gl.bindTexture(gl.TEXTURE_2D, pt.tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // (three.js may have left these on)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); // (the canvas is premultiplied)
  gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, root, { width: W, height: H });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.disable(gl.STENCIL_TEST);
  gl.disable(gl.CULL_FACE);
  gl.colorMask(true, true, true, true);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(pt.prog);
  gl.bindVertexArray(pt.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pt.tex);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.bindVertexArray(null);
}

function makePainter(gl) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 a; out vec2 v; void main(){ v = a; gl_Position = vec4(a.x * 2.0 - 1.0, 1.0 - a.y * 2.0, 0.0, 1.0); }'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision mediump float; in vec2 v; uniform sampler2D t; out vec4 o; void main(){ o = texture(t, v); }'));
  gl.bindAttribLocation(prog, 0, 'a');
  gl.linkProgram(prog);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  let tex = null;
  let tw = 0;
  let th = 0;
  return {
    prog,
    vao,
    get tex() {
      return tex;
    },
    ensure(w, h) {
      if (tex && tw === w && th === h) return;
      if (tex) gl.deleteTexture(tex);
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      tw = w;
      th = h;
    },
    dispose() {
      if (tex) gl.deleteTexture(tex);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
    },
  };
}
