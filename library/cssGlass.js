/**
 * =============================================================================
 * glass/cssGlass.js — Liquid Glass in plain CSS (the fallback renderer)
 * =============================================================================
 * Wherever a glass element is NOT drawn by WebGL (data-glass-drawn) or live
 * SVG glass (data-glass-live) — Safari / Firefox / phones in the CSS-only
 * mobile layout, while the WebGL glass is still starting, "Reduce
 * transparency" aside — it used to show only the site's own CSS. Now the
 * library draws a CSS Liquid Glass of its own, from the same config group:
 *
 *   shadow   a blurred OUTLINE (not a filled box) pushed down, behind the
 *            glass, so the pane frosts it like the page
 *   caustic  light bundled under the glass: a blurred ring, two soft spots
 *            (light theme only — on dark it reads as grey haze)
 *   pane     backdrop blur + saturate + brightness, the group's tint
 *   veil     a milky white wash (frosted style only)
 *   fold     the rim's folding band, a little brighter and more saturated
 *   glint    the LIT part of the edge (top-right / bottom-left): brightness
 *            and saturation up, masked to a thin ring × a conic arc
 *   rim      the UNLIT part of the edge: brightness down, saturation up
 *   spec     additive white on the lit part, so the edge still shows on black
 *
 * The group's STYLE gives each its own character (on top of the values the
 * style already changes — crystal: clear, little tint; frosted: heavy blur,
 * milky tint), with the edge widths scaled by the group's thickness:
 *   default  thin lit / unlit rim, a soft fold
 *   crystal  thick glass: a wider, brighter rim and fold, a stronger spec
 *            line and the caustic glow under it (CSS can't bend the page —
 *            the bright, deep rim is what reads as thickness)
 *   frosted  milky: a soft, wide, dimmer edge and a white veil
 *
 * Edge layers only change EXPOSURE (backdrop brightness / saturate), which
 * every engine runs — no SVG filters — so this works in Safari and Firefox
 * too. Refraction itself stays WebGL / live-glass only.
 *
 * The layers live in ONE <span data-gp-css> inserted as the element's first
 * child, at z-index −1 inside the element (made `isolation: isolate`), so the
 * element's own content — bare text included — always stays on top and its
 * children are never touched. (Checked in Safari: a z-index −1 backdrop
 * layer inside an isolated element still frosts the page behind it.)
 * Void elements (<input>, <img>…) can't hold it and keep their own CSS.
 *
 * COST: every backdrop-filter layer re-filters the page under the element on
 * every frame it scrolls (measured on DashboardPro's phone home page, 19
 * glass elements on screen: four backdrop layers each + filter blurs took
 * scrolling from 120 to 60 fps). So global.cssGlass picks a budget:
 *   true (default)  2 backdrop layers: pane + lit edge (glint). The unlit
 *                   edge, fold and spec are plain overlays; the shadow is a
 *                   box-shadow; no caustic.
 *   "full"          the whole technique: pane, fold, glint and rim all
 *                   backdrop layers, blurred-outline shadow, caustic.
 *   "lite"          1 backdrop layer (the pane); every edge an overlay.
 *   false           the site's own CSS only (as before 1.3.6).
 *
 * The edge-lighting technique (outline shadow, caustic ring, exposure-only
 * edge layers, the aspect-warped conic arcs in bevelArcs below) follows
 * nordify/css-liquid-glass — MIT License, Copyright (c) 2026 Nordify —
 * https://github.com/nordify/css-liquid-glass
 * =============================================================================
 */
import { getGlassTheme, getGlobal } from './config';

/** Elements that can't hold children: they keep their own CSS. */
const VOID = new Set(['INPUT', 'IMG', 'TEXTAREA', 'SELECT', 'BR', 'HR', 'VIDEO', 'CANVAS', 'IFRAME', 'svg', 'SVG']);
const LAYERS = ['shadow', 'caustic', 'pane', 'veil', 'fold', 'glint', 'rim', 'spec'];
/** Per budget (global.cssGlass): which layers are backdrop filters (the rest of the edge layers are overlays). */
const BACKDROP_LAYERS = { full: ['pane', 'fold', 'glint', 'rim'], balanced: ['pane', 'glint'], lite: ['pane'] };

const state = new WeakMap(); // el → { box, vars: Map, size: 'wxh' }

// Layout + backdrop filters are set INLINE: a site's own `.btn span {…}` rules
// can't move or hide the layers, and CSS minifiers can't drop one of the
// prefixed / unprefixed backdrop-filter pair.
const BOX_STYLE = 'position:absolute;inset:0;z-index:-1;display:block;margin:0;padding:0;border:0;border-radius:inherit;pointer-events:none;overflow:visible;';
const LAYER_STYLE = 'position:absolute;inset:0;display:block;margin:0;padding:0;border-radius:inherit;pointer-events:none;';
const BACKDROPS = {
  pane: 'blur(var(--gp-css-blur, 0px)) saturate(var(--gp-css-sat, 1)) brightness(var(--gp-css-bright, 1))',
  fold: 'brightness(var(--gp-css-fold-exp, 1.08)) saturate(var(--gp-css-fold-sat, 1.3))',
  glint: 'brightness(var(--gp-css-glint-exp, 1.35)) saturate(var(--gp-css-glint-sat, 3.1))',
  rim: 'brightness(var(--gp-css-rim-exp, 0.84)) saturate(var(--gp-css-rim-sat, 2.2))',
};
// Overlay stand-ins for edge layers that aren't backdrop filters in this budget.
const OVERLAYS = {
  fold: 'rgb(255 255 255 / var(--gp-css-fold-ov, 0.05))',
  glint: 'rgb(255 255 255 / var(--gp-css-glint-ov, 0.22))',
  rim: 'var(--gp-css-rim-ov, rgb(0 0 0 / 0.1))',
};
// The CSS look of each glass style (see the header): edge strength, spec
// line, ring width / fade (px at a 60px pill), fold depth (× corner radius),
// milky veil, caustic.
const STYLE_LOOKS = {
  default: { edge: 1, sat: 1, spec: 1, w: 1, d: 2.5, fold: 0.43, veil: 0, caustic: 0.7 },
  // (crystal: bright, NOT more saturated — a saturated wide rim turned the
  // page behind it into a neon outline)
  crystal: { edge: 1.3, sat: 0.35, spec: 1.6, w: 1.6, d: 5, fold: 0.6, veil: 0, caustic: 0.85 },
  frosted: { edge: 0.7, sat: 0.8, spec: 0.6, w: 1.2, d: 7, fold: 0.3, veil: 0.16, caustic: 0.4 },
};
/** "Reduce transparency" on: the site's own CSS (no frosted layers). */
const reduced = () => {
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches);
  } catch {
    return false;
  }
};

// --- Edge lighting arcs (nordify/css-liquid-glass, MIT) ------------------------------------
// Two complementary conic gradients (glint + rim = 1 everywhere) that pick
// which part of the edge is lit. Lighting follows the surface NORMAL, so the
// angles are warped by the aspect ratio: on a wide pill the long edges take a
// wider angular range. 0.4 is a compromise between following the shape (2)
// and keeping all four transitions equally soft (0).
const ARC_PEAK = 45; // lit at top-right (45°) and bottom-left (225°)
const ARC_SHAPE = 0.4;
const ARC_STEP = 3;
const arcCache = new Map();
function bevelArcs(width, height) {
  const w = Math.round(width);
  const h = Math.round(height);
  const key = `${w}:${h}`;
  const hit = arcCache.get(key);
  if (hit) return hit;
  const ax = 1 / Math.pow(Math.max(1, w) / 2, ARC_SHAPE);
  const by = 1 / Math.pow(Math.max(1, h) / 2, ARC_SHAPE);
  const glint = (deg) => {
    const r = (deg * Math.PI) / 180;
    const n = ((Math.atan2(Math.sin(r) * ax, Math.cos(r) * by) * 180) / Math.PI + 360) % 360;
    return (1 + Math.cos((2 * (n - ARC_PEAK) * Math.PI) / 180)) / 2;
  };
  const stop = (v, deg) => `${v >= 0.9995 ? '#000' : v <= 0.0005 ? 'transparent' : `rgba(0,0,0,${+v.toFixed(3)})`} ${deg}deg`;
  const build = (fn) => {
    const parts = ['from 0deg'];
    for (let deg = 0; deg <= 360; deg += ARC_STEP) parts.push(stop(fn(deg), deg));
    return `conic-gradient(${parts.join(',')})`;
  };
  const res = { glint: build(glint), rim: build((deg) => 1 - glint(deg)) };
  if (arcCache.size >= 64) arcCache.delete(arcCache.keys().next().value);
  arcCache.set(key, res);
  return res;
}

// --- Size: one shared ResizeObserver (arcs, corner radius, size factor) --------------------
const ro =
  typeof ResizeObserver === 'function'
    ? new ResizeObserver((records) => {
        for (const r of records) sizeChanged(r.target);
      })
    : null;

/** The element's size changed (or the layers were just made): arcs, radius, scale. */
function sizeChanged(el) {
  const s = state.get(el);
  if (!s) return;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (!w || !h) return;
  // Quantised to 4px: a size animation (a squishing knob) doesn't rebuild
  // the arcs every frame — they're soft, a few px make no difference.
  const qw = Math.round(w / 4) * 4;
  const qh = Math.round(h / 4) * 4;
  const short = Math.min(w, h);
  const cs = getComputedStyle(el);
  const r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, short / 2);
  setVars(el, s, {
    '--gp-css-r': `${r.toFixed(1)}px`,
    // Size factor for the edge widths / shadow (1 = a 60px pill), capped so
    // a big card doesn't get a huge offset shadow or a wide blurry rim.
    '--gp-css-s': Math.min(1.6, Math.max(0.5, short / 60)).toFixed(2),
  });
  const key = `${qw}x${qh}`;
  if (s.size !== key) {
    s.size = key;
    const arcs = bevelArcs(qw, qh);
    setVars(el, s, { '--gp-css-arc-glint': arcs.glint, '--gp-css-arc-rim': arcs.rim });
  }
}

/** Write CSS variables, only the ones that changed (each write restyles). */
function setVars(el, s, vars) {
  for (const k in vars) {
    const v = vars[k];
    if (s.vars.get(k) === v) continue;
    s.vars.set(k, v);
    if (v == null) el.style.removeProperty(k);
    else el.style.setProperty(k, v);
  }
}

/** A config colour at an opacity, as CSS. */
const withAlpha = (color, opacity) =>
  opacity >= 1 ? color : `color-mix(in srgb, ${color} ${Math.round(Math.max(0, opacity) * 1000) / 10}%, transparent)`;

/** The group's tint as a CSS background (colour or gradient) at tintOpacity. */
function tintCss(cfg) {
  const t = cfg.tint;
  const op = cfg.tintOpacity;
  const stops = [t.from, t.via, t.to].filter(Boolean).map((c) => withAlpha(c, op));
  if (stops.length === 1 || (t.from === t.to && !t.via)) return withAlpha(t.from, op);
  return `linear-gradient(${t.angle}deg, ${stops.join(', ')})`;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Give an element the CSS glass (cfg = its resolved config), update it, or
 * remove it (cfg = null). Cheap to call every frame (an animated lens calls it
 * through setProps): it only writes what changed.
 * @param {HTMLElement} el
 * @param {object|null} cfg
 */
export function applyCssGlass(el, cfg) {
  const g = getGlobal();
  const mode = g.enabled && g.cssGlass;
  // (Morph glass is drawn by its group's liquid mesh — never marked drawn —
  // and motion.js has its own fallback: no CSS layers on it.)
  if (!cfg || cfg.morph || !mode || VOID.has(el.tagName) || typeof document === 'undefined' || reduced()) {
    removeCssGlass(el);
    return;
  }
  let s = state.get(el);
  if (!s) {
    const box = document.createElement('span');
    box.setAttribute('data-gp-css', '');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = BOX_STYLE;
    for (const name of LAYERS) {
      const l = document.createElement('span');
      l.setAttribute('data-gp-css-layer', name);
      l.style.cssText = LAYER_STYLE;
      if (name === 'caustic') l.append(document.createElement('span'));
      box.append(l);
    }
    s = { box, vars: new Map(), size: '', mode: null };
    state.set(el, s);
    // A static element can't hold the absolutely placed layers: flag it so
    // glass.css makes it relative (only while the CSS glass shows). Read
    // before any of our rules apply; absolute / fixed / sticky keep theirs.
    if (getComputedStyle(el).position === 'static') el.setAttribute('data-gp-css-static', '');
    el.prepend(box);
    el.setAttribute('data-gp-css-on', '');
    ro?.observe(el);
  } else if (s.box.parentNode !== el) el.prepend(s.box); // (a framework re-render dropped it)
  const budget = mode === 'full' ? 'full' : mode === 'lite' ? 'lite' : 'balanced';
  if (s.mode !== budget) {
    s.mode = budget;
    s.box.setAttribute('data-gp-css', budget);
    const bd = BACKDROP_LAYERS[budget];
    for (const l of s.box.children) {
      const name = l.getAttribute('data-gp-css-layer');
      l.hidden = name === 'caustic' && budget === 'lite';
      const on = bd.includes(name);
      l.style.setProperty('-webkit-backdrop-filter', on ? BACKDROPS[name] : '');
      l.style.setProperty('backdrop-filter', on ? BACKDROPS[name] : '');
      // Not a backdrop layer: a plain overlay in the same ring (cheap).
      if (OVERLAYS[name]) l.style.background = on ? '' : OVERLAYS[name];
    }
  }

  const dark = getGlassTheme() === 'dark' ? 1 : 0;
  const look = STYLE_LOOKS[cfg.style] || STYLE_LOOKS.default;
  // Edge strength from the group's rim light (0.55 = the reference look).
  const k = clamp((cfg.rimLight ?? 0.5) / 0.55, 0, 1.6) * look.edge;
  // Edge widths follow the glass's thickness (32 = the reference).
  const thick = clamp((cfg.thickness ?? 32) / 32, 0.6, 2);
  // Caustic: crystal only (or every element in the "full" budget).
  const causticOn = s.mode === 'full' || (s.mode === 'balanced' && cfg.style === 'crystal');
  s.box.querySelector("[data-gp-css-layer='caustic']").hidden = !causticOn;
  setVars(el, s, {
    '--gp-css-tint': tintCss(cfg),
    '--gp-css-blur': `${clamp(cfg.blur ?? 0, 0, 60)}px`,
    '--gp-css-sat': String(clamp(cfg.saturation ?? 1, 0, 4)),
    '--gp-css-bright': String(clamp(cfg.brightness ?? 1, 0.2, 3)),
    '--gp-css-dark': String(dark),
    // Lit edge: exposure + saturation up; unlit edge: exposure down.
    '--gp-css-glint-exp': (1 + (0.35 + 0.1 * dark) * k).toFixed(3),
    '--gp-css-glint-sat': (1 + (2.1 - 1.1 * dark) * k * look.sat).toFixed(3),
    '--gp-css-rim-exp': (1 - (0.16 - 0.41 * dark) * k).toFixed(3),
    '--gp-css-rim-sat': (1 + (1.2 - 0.9 * dark) * k * look.sat).toFixed(3),
    '--gp-css-spec': ((0.13 + 0.25 * dark) * k * look.spec).toFixed(3),
    '--gp-css-edge-w': `${(look.w * thick).toFixed(2)}px`,
    '--gp-css-edge-d': `${(look.d * thick).toFixed(2)}px`,
    '--gp-css-fold-k': look.fold.toFixed(2),
    '--gp-css-veil': (look.veil * (dark ? 0.35 : 1)).toFixed(3),
    '--gp-css-fold-exp': (1 + 0.08 * k).toFixed(3),
    '--gp-css-fold-ov': (0.05 * k).toFixed(3),
    '--gp-css-glint-ov': (0.22 * k).toFixed(3),
    // Unlit edge as an overlay: a little darker on light, a little lighter on dark.
    '--gp-css-rim-ov': dark ? `rgb(255 255 255 / ${(0.08 * k).toFixed(3)})` : `rgb(0 0 0 / ${(0.1 * k).toFixed(3)})`,
    '--gp-css-fold-sat': (1 + 0.3 * k * look.sat).toFixed(3),
    '--gp-css-shadow-o': (clamp((cfg.shadowOpacity ?? 0.1) * 2.2, 0, 0.5) * (1 - dark)).toFixed(3),
    '--gp-css-caustic-o': (look.caustic * (1 - 0.6 * dark) * clamp(k, 0, 1)).toFixed(3),
  });
  if (!s.size) sizeChanged(el);
}

/** Remove the CSS glass from an element (its own CSS is back). */
export function removeCssGlass(el) {
  const s = state.get(el);
  if (!s) return;
  state.delete(el);
  ro?.unobserve(el);
  s.box.remove();
  el.removeAttribute('data-gp-css-on');
  el.removeAttribute('data-gp-css-static');
  for (const k of s.vars.keys()) el.style.removeProperty(k);
}
