/**
 * =============================================================================
 * glass/pageBackground.js — The page background, drawn in WebGL
 * =============================================================================
 * The glass needs something to refract. Behind base glass (sidebar, cards,
 * buttons) there is only the page background, so instead of photographing
 * the page we redraw that background in a shader: always sharp, always
 * current, zero cost per frame.
 *
 * What is drawn comes from glass.config.json "global.background":
 *
 *   "auto" (the default) — the page's own background COLOUR, read live from
 *       <body> (or <html> when the body is transparent). In this mode the
 *       canvas never paints the background on screen: the site's real
 *       background stays visible, the glass only refracts it. (Except a
 *       global.backgroundImage picture: once loaded, the base canvas paints
 *       it and base glass refracts it in WebGL — see setImageBackdrop below.)
 *       Other gradients and images can't be redrawn, so with "auto":
 *         • Chromium draws base glass LIVE (live.js), refracting the real
 *           background — gradients, images and all;
 *         • other browsers keep the element's own CSS look over a gradient /
 *           image background (refracting a flat colour there would hide the
 *           background behind an opaque-looking panel). A plain colour
 *           background is refracted exactly.
 *
 *   { "light": THEME, "dark": THEME }  (or one THEME for both) — an exact
 *       copy of a CSS background, drawn on screen under the base glass too.
 *       THEME = {
 *         "base":  { "top": "#hex", "bottom": "#hex" }   top → bottom gradient
 *         "glows": [ { "rx", "ry", "at": [x, y], "rgb": [r, g, b], "alpha", "stop" } … ]
 *       }  glows = soft radial colour glows over the base (the first listed
 *       is on top, like CSS): radii in px, position 0–1 of the window, rgb
 *       0–255, alpha, fade end 0–1.
 *
 * With the second form, KEEP IT IN SYNC with the page's own CSS background
 * (light and dark), e.g. a --page-bg variable in your global stylesheet.
 * Light, for example, is:
 *
 *   radial-gradient(900px 600px at 0% 0%,   rgba(99,102,241,.16), transparent 60%),
 *   radial-gradient(800px 520px at 100% 0%, rgba(34,211,238,.12), transparent 60%),
 *   radial-gradient(900px 700px at 60% 100%, rgba(139,92,246,.10), transparent 60%),
 *   linear-gradient(180deg, #f5f7fd 0%, #eef1fa 100%);   (fixed to the window)
 *
 * GlassCanvas rebuilds the shader when the theme or the background changes
 * (backgroundFor() returns a new key).
 * =============================================================================
 */

const HEX6 = /^#[0-9a-f]{6}$/i;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const f = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0).toFixed(4);
const v3 = (a) => `vec3(${a.map(f).join(', ')})`;
const clamp01 = (n, d) => (Number.isFinite(Number(n)) ? Math.min(1, Math.max(0, Number(n))) : d);

/** A configured THEME, checked (bad values → safe defaults, never a broken shader). */
function cleanTheme(t) {
  const base = t?.base || {};
  const top = HEX6.test(base.top || '') ? base.top : '#ffffff';
  const bottom = HEX6.test(base.bottom || '') ? base.bottom : top;
  const glows = (Array.isArray(t?.glows) ? t.glows : []).slice(0, 8).map((g) => ({
    rx: Math.max(1, Number(g?.rx) || 1),
    ry: Math.max(1, Number(g?.ry) || 1),
    at: [clamp01(g?.at?.[0], 0.5), clamp01(g?.at?.[1], 0.5)],
    rgb: [0, 1, 2].map((i) => Math.min(255, Math.max(0, Number(g?.rgb?.[i]) || 0))),
    alpha: clamp01(g?.alpha, 0),
    stop: Math.max(0.001, clamp01(g?.stop, 0.6)),
  }));
  return { base: { top, bottom }, glows };
}

/**
 * The background to draw for a theme.
 * @param {'auto'|object} background  global.background from the config
 * @param {'light'|'dark'} theme
 * @returns {{ key: string, spec: {base, glows}, paint: boolean, image: boolean }}
 *   key   — changes whenever the shader must be rebuilt
 *   paint — draw it on screen too (exact copies only; "auto" never paints)
 *   image — "auto" only: the page background has a gradient / image the
 *           shader can't redraw (WebGL base glass then stays CSS)
 */
export function backgroundFor(background, theme) {
  if (background && typeof background === 'object') {
    // { light, dark } or a single THEME used for both.
    const t = background.base || background.glows ? background : background[theme] || background.light || background.dark;
    const spec = cleanTheme(t);
    return { key: `cfg|${theme}|${JSON.stringify(spec)}`, spec, paint: true, image: false };
  }
  const colour = pageColour();
  return { key: `auto|${colour}`, spec: { base: { top: colour, bottom: colour }, glows: [] }, paint: false, image: pageHasImage() };
}

/** Is the background an exact copy (config object), not "auto"? */
export const isExactBackground = (background) => Boolean(background && typeof background === 'object');

/*
 * global.backgroundImage painted by the base WebGL canvas.
 * Once the base canvas has the picture as a texture (GlassCanvas
 * loadBackgroundImage), it paints it on screen — the same cover-fit as the
 * CSS layer, so nothing visibly changes — and the picture counts as an exact
 * background: base glass stays WebGL (live.js) and refracts it, in every
 * browser. That is far cheaper than Chromium's per-element SVG backdrop
 * filters (one shader pass for every slab instead of a filter chain per
 * element each frame). Until it has loaded (or if it can't be: no CORS, 404)
 * base glass goes live as before. GlassCanvas sets it; live.js listens.
 */
let imageBackdrop = null; // URL the base canvas is painting, or null
const imageBackdropListeners = new Set();
/** GlassCanvas (base layer only): the picture it now paints, or null. */
export function setImageBackdrop(url) {
  if (url === imageBackdrop) return;
  imageBackdrop = url;
  imageBackdropListeners.forEach((fn) => fn());
}
/** Is this picture (global.backgroundImage) painted by the base WebGL canvas? */
export const isImageBackdrop = (url) => Boolean(url && url === imageBackdrop);
export function subscribeImageBackdrop(fn) {
  imageBackdropListeners.add(fn);
  return () => imageBackdropListeners.delete(fn);
}

/** Does <body> / <html> paint a gradient or image (something "auto" can't redraw)? */
function pageHasImage() {
  if (typeof document === 'undefined') return false;
  return [document.body, document.documentElement].some((el) => el && getComputedStyle(el).backgroundImage !== 'none');
}

/** The page's background colour as #rrggbb (body, else html, else white). */
let probe = null;
function pageColour() {
  if (typeof document === 'undefined') return '#ffffff';
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const c = getComputedStyle(el).backgroundColor;
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (m) {
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      if (a > 0 && [r, g, b].every(Number.isFinite)) return toHex(r, g, b);
      continue;
    }
    // Modern colour syntaxes (oklch(), color(display-p3 …)) → let a canvas
    // turn them into sRGB bytes.
    if (c && c !== 'transparent') {
      probe ||= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      if (!probe) break;
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = c;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
      if (a > 0) return toHex(r, g, b);
    }
  }
  return '#ffffff';
}
const toHex = (r, g, b) => `#${[r, g, b].map((n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')).join('')}`;

/**
 * Fragment shader for a full-window quad (uv 0,0 = bottom-left) drawing
 * global.backgroundImage (see config.js): the texture uImage (uImageSize =
 * its size in px) cover-fitted and centred in the window, like CSS
 * `background: center / cover`. The texture is uploaded with flipY (three.js
 * default), so its v runs bottom → top.
 */
export const pageImageShader = /* glsl */ `
  uniform vec2 uSize;        // window size in CSS px
  uniform vec2 uImageSize;   // picture size in px
  uniform sampler2D uImage;
  varying vec2 vUv;
  void main() {
    vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uSize;            // y from the top, like CSS
    float s = max(uSize.x / uImageSize.x, uSize.y / uImageSize.y); // cover
    vec2 drawn = uImageSize * s;
    vec2 iuv = (px - (uSize - drawn) * 0.5) / drawn;        // 0–1 across the picture, y from the top
    gl_FragColor = vec4(texture2D(uImage, vec2(iuv.x, 1.0 - iuv.y)).rgb, 1.0);
  }
`;

/** Fragment shader for a full-window quad (uv 0,0 = bottom-left) drawing `spec`. */
export function pageBackgroundShader(spec) {
  const { glows: PAGE_GLOWS, base: PAGE_BASE } = spec;
  // CSS paints the first listed glow on top, so apply them last-to-first.
  const glows = [...PAGE_GLOWS]
    .reverse()
    .map(
      (g) => `
    {
      // ${f(g.rx)}x${f(g.ry)} ellipse at ${f(g.at[0] * 100)}% ${f(g.at[1] * 100)}%
      vec2 d = (px - vec2(${f(g.at[0])} * uSize.x, ${f(g.at[1])} * uSize.y)) / vec2(${f(g.rx)}, ${f(g.ry)});
      float a = ${f(g.alpha)} * (1.0 - clamp(length(d) / ${f(g.stop)}, 0.0, 1.0));
      col = mix(col, ${v3(g.rgb.map((c) => c / 255))}, a);
    }`
    )
    .join('');
  return /* glsl */ `
    uniform vec2 uSize;   // window size in CSS px
    varying vec2 vUv;
    void main() {
      // CSS pixel position, y measured from the top like CSS.
      vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uSize;
      vec3 col = mix(${v3(hex(PAGE_BASE.top))}, ${v3(hex(PAGE_BASE.bottom))}, px.y / max(uSize.y, 1.0));
      ${glows}
      gl_FragColor = vec4(col, 1.0);
    }
  `;
}

export const fullscreenVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); // a 1×1 plane → the whole screen
  }
`;
