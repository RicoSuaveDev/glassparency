/**
 * =============================================================================
 * glass/live.js — Real-time refraction of the live page (Chromium browsers)
 * =============================================================================
 * The floating glass (header, docks, floating panels) sits over page
 * CONTENT. WebGL can't read HTML, so the WebGL route needs a picture of the
 * page (snapshot.js) that is up to ~0.5 s old. Chromium browsers (Chrome,
 * Edge, Arc, Brave…) can do better: `backdrop-filter: url(#svg-filter)` lets
 * the browser itself bend whatever is behind an element, every frame — text,
 * scroll boxes, animations, all live.
 *
 * So in Chromium, floating glass elements are drawn "live":
 *   • an SVG filter per element: a displacement map generated in code from
 *     the same rounded-rim profile as the WebGL slabs (shapes.js) bends the
 *     backdrop at the rim; R/G/B are bent by slightly different amounts for
 *     chromatic aberration; then the backdrop is frosted (blur);
 *   • the tint is the element's background (a CSS gradient at tintOpacity).
 * Settings come from the same glass.config.json properties:
 *   thickness + ior → how far the rim bends · bevel + profile → rim width and
 *   curve · chromaticAberration · blur · saturation · brightness ·
 *   tint/tintOpacity · shape/radius · rimLight/rimWidth/lightAngle/innerGlow
 *   (as inset highlights) · pressGlow · hover/pressed/disabled tints ·
 *   ripple* (water rings on hover — ripple.js; extra filter stages below).
 *   (scale, anisotropy, roughness, distortion, samples, reflection and morph
 *   only apply to WebGL glass — morph groups always use WebGL.)
 *
 * Which elements go live (per group "sampler": "auto" | "webgl" | "live"):
 *   auto  → live when the browser supports it AND the element is the
 *           outermost glass on the "float" layer (header, dock card, a
 *           floating panel). Dialogs stay WebGL (their dimmer stops a live
 *           backdrop from seeing the page). Base glass stays WebGL when the
 *           config has an exact copy of the page background (it refracts
 *           that live WebGL background), or once the base
 *           canvas paints global.backgroundImage (pageBackground.js
 *           setImageBackdrop); otherwise, with background "auto", it goes
 *           live too, so it refracts the site's real background (gradients,
 *           images) instead of a flat colour.
 *   live  → always live where supported.
 *   webgl → never live.
 * Glass INSIDE a live element (buttons on a dock card, chips in the header)
 * is live too, with its own filter sized to its own shape (it bends the
 * parent's glass + the page). Only "webgl"/morph glass in there is drawn
 * "tint" — its tint, border and shadow without refraction.
 *
 * The glass is drawn on the element's ::before layer (see glass.css) with its
 * own corner radius, border and drop shadow, so all of them follow the glass
 * shape rather than the element's CSS.
 * =============================================================================
 */
import { getGlobal, resolveGlass, subscribeConfig } from './config';
import { isExactBackground, isImageBackdrop, subscribeImageBackdrop } from './pageBackground';
import { allEntries, getEntry, placement, requestRender, subscribeProps, subscribeStructure } from './registry';
import { AUTO_FALLBACK_RADIUS, rimTilt } from './rim'; // (not shapes.js: that imports three.js)
import { MAX_RIPPLES, activeRipples, subscribeRipples } from './ripple';

/** Can this browser bend the live backdrop with an SVG filter? (Chromium only) */
export const LIVE_SUPPORTED = (() => {
  if (typeof window === 'undefined' || !window.CSS?.supports) return false;
  if (!CSS.supports('backdrop-filter', 'url(#x)')) return false;
  // Safari/Firefox accept the syntax but don't render SVG backdrop filters.
  const brands = navigator.userAgentData?.brands;
  if (brands) return brands.some((b) => /Chromium/i.test(b.brand));
  return /Chrome\/\d+/.test(navigator.userAgent) && !/Firefox|FxiOS|CriOS/.test(navigator.userAgent);
})();

const SVG_NS = 'http://www.w3.org/2000/svg';
let svgRoot = null; // hidden <svg> holding every live filter
const filters = new Map(); // entry id → { el (<filter>), key }
let running = false;
let raf = 0;
const offs = [];

/** Start keeping live glass in sync (GlassProvider calls this while active). */
export function startLive() {
  if (running) return stopLive;
  running = true;
  offs.push(
    subscribeStructure(syncAll),
    // One element's props / state changed (an animated knob or lens does that
    // every frame): re-sync just that one.
    subscribeProps((id) => scheduleLiveSync(id)),
    subscribeConfig(syncAll),
    subscribeImageBackdrop(syncAll), // the base canvas now paints the picture (or stopped)
    subscribeRipples(drawRipples) // rings spreading through a live element: redraw just its filter
  );
  window.addEventListener('resize', syncAll, { passive: true });
  scheduleLiveSync();
  return stopLive;
}
const syncAll = () => scheduleLiveSync();

export function stopLive() {
  running = false;
  cancelAnimationFrame(raf);
  raf = 0;
  offs.splice(0).forEach((off) => off());
  window.removeEventListener('resize', syncAll);
  for (const e of allEntries()) clearLive(e);
  filters.clear();
  svgRoot?.remove();
  svgRoot = null;
}

/**
 * Re-check live glass soon (batched into one animation frame):
 *   scheduleLiveSync()          every element
 *   scheduleLiveSync(el | id)   only that element (it resized, or its props /
 *                               state changed)
 * Before, every change re-synced EVERY element: an animated control (a
 * busy progress bar, a moving tab lens) re-wrote the attributes of all ~50
 * live elements on the showcase page each frame. That flood of page changes
 * kept the page picture from ever being taken, so WebGL glass (the hero
 * lens…) only appeared after switching tabs.
 */
let syncEverything = false;
const dirty = new Set(); // entry ids to re-sync
export function scheduleLiveSync(target) {
  if (!running) return;
  const id = typeof target === 'number' ? target : target?.nodeType === 1 ? Number(target.dataset.glassId) : NaN;
  if (target == null) syncEverything = true;
  else if (id) dirty.add(id);
  else return;
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const all = syncEverything;
    const ids = [...dirty];
    syncEverything = false;
    dirty.clear();
    if (all) sync();
    else syncSome(ids);
  });
}

/**
 * Re-sync a few elements. If one of them changed mode (live / tint / WebGL),
 * the glass inside it may change too — then everything is re-synced.
 */
function syncSome(ids) {
  const cache = new Map();
  for (const id of ids) {
    const e = getEntry(id);
    if (!e) continue;
    const mode = modeOf(e, cache);
    if (e.liveMode !== mode) {
      sync();
      return;
    }
    if (mode) apply(e, mode);
  }
}

/** 'live' | 'tint' | null for an element (see the header comment). */
function modeOf(e, cache) {
  if (cache.has(e.id)) return cache.get(e.id);
  cache.set(e.id, null); // cycle guard
  let mode = null;
  if (LIVE_SUPPORTED) {
    const p = resolveGlass(e.group, e.props);
    const parentEl = e.el.parentElement?.closest('[data-glass-id]');
    const parent = parentEl ? getEntry(Number(parentEl.dataset.glassId)) : null;
    const parentMode = parent ? modeOf(parent, cache) : null;
    if (p.morph) mode = parentMode ? 'tint' : null; // melting shapes need the WebGL liquid shader
    // Glass inside live glass (chips in the header, buttons on a dock card):
    // live too, with its OWN filter sized to it. Chromium layers nested
    // backdrop-filters fine — the child bends the parent's frosted glass +
    // the page under it. Only "webgl" glass can't be drawn there (its canvas
    // sits behind the parent), so it falls back to its tint.
    else if (parentMode) mode = p.sampler === 'webgl' ? 'tint' : 'live';
    else if (p.sampler === 'live') mode = 'live';
    else if (p.sampler === 'auto') {
      const layer = placement(e.id).layer;
      // Base glass over an exact background — a config copy, or the
      // background picture once the base canvas paints it (pageBackground.js
      // setImageBackdrop) — stays WebGL: one shader pass, far cheaper than a
      // live SVG filter per element.
      const g = getGlobal();
      const exact = isExactBackground(g.background) || isImageBackdrop(g.backgroundImage);
      if (layer === 'float' || (layer === 'base' && !exact)) mode = 'live';
    }
  }
  cache.set(e.id, mode);
  return mode;
}

function sync() {
  const cache = new Map();
  const seen = new Set();
  let changed = false;
  for (const e of allEntries()) {
    const mode = modeOf(e, cache);
    if (e.liveMode !== mode) {
      e.liveMode = mode; // GlassCanvas skips live/tint elements; snapshot.js too
      changed = true;
    }
    if (!mode) {
      clearLive(e);
      continue;
    }
    seen.add(e.id);
    apply(e, mode);
  }
  // Drop filters of elements that went away.
  for (const [id, f] of filters) {
    if (!seen.has(id) || getEntry(id)?.liveMode !== 'live') {
      f.el.remove();
      filters.delete(id);
    }
  }
  if (changed) requestRender();
}

/** Write the element's live look: tint background (+ the SVG filter if live). */
function apply(e, mode) {
  const el = e.el;
  const p = resolveGlass(e.group, e.props, e.state);
  // (Only real changes are written: each write is a page change that makes
  // the page picture and the redraw watchers start over.)
  if (el.dataset.glassLive !== mode) el.dataset.glassLive = mode;
  // The glass is a ::before layer (glass.css) with its own shape, border and
  // shadow, so they can differ from the element's CSS. It needs a positioned
  // element to sit in. (padding moves the whole element in — see useGlass.)
  // Re-checked on every sync, without our own flag in the way: the site's
  // CSS may position the element only once glass is on (html[data-glass='on']
  // — e.g. a sliding sidebar lens that is static + hidden until then).
  // A flag set before that would stick and force it to position: relative.
  delete el.dataset.glassPos;
  if (getComputedStyle(el).position === 'static') el.dataset.glassPos = '';
  const r = el.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  const radius = shapeRadius(p, w, h, el);
  setVar(el, '--glass-live-radius', `${radius}px`);
  setVar(el, '--glass-live-bg', (p.pressGlow > 0 ? glowCss(p) + ', ' : '') + tintCss(p));
  setVar(el, 
    '--glass-live-border',
    p.borderWidth > 0 && p.borderOpacity > 0 ? `${p.borderWidth}px solid ${colorCss(p.borderColor || '#ffffff', p.borderOpacity)}` : '0 solid transparent'
  );
  // Drop shadow + specular rim + inner glow, all on the glass layer.
  const shadows = [];
  if (p.shadowOpacity > 0) {
    shadows.push(`${p.shadowX}px ${p.shadowY}px ${p.shadowBlur}px ${p.shadowSpread}px ${colorCss(p.shadowColor || '#1e1b4b', p.shadowOpacity)}`);
  }
  if (mode === 'live' && (p.rimLight > 0 || p.innerGlow > 0)) shadows.push(rimShadow(p));
  setVar(el, '--glass-live-shadow', shadows.join(', ') || 'none');
  if (mode !== 'live') {
    // 'none', not removeProperty: custom properties INHERIT, so a removed
    // value would pick up the live parent's filter (e.g. the header's) and
    // apply ITS displacement map — sized for the header — anchored at this
    // chip's top-left corner (the stray refractive corner on header buttons).
    setVar(el, '--glass-live-filter', 'none');
    return;
  }
  // classic: the original live look (rim ~3× the bevel, gentle t² bend);
  // squircle: the same rim width and curve as the WebGL slabs.
  const rim = Math.max(1, Math.min(p.profile === 'classic' ? p.bevel * 3 : p.bevel, Math.min(w, h) / 2));
  const strength = p.thickness * (p.ior - 1) * 8; // px the rim can bend the backdrop
  const ca = p.chromaticAberration * 3;
  const id = `dp-live-${e.id}`;
  // Ripples (ripple.js): only groups with ripple > 0 get the extra stages.
  const ripple = p.ripple > 0 ? { amp: p.ripple, wave: p.rippleWavelength } : null;
  const key = `${w}|${h}|${radius}|${rim}|${strength.toFixed(1)}|${ca.toFixed(3)}|${p.profile}|${p.minify.toFixed(3)}|${ripple ? `${ripple.amp}/${ripple.wave}` : '-'}`;
  let f = filters.get(e.id);
  if (!f || f.key !== key) {
    if (!f) {
      const node = document.createElementNS(SVG_NS, 'filter');
      node.id = id;
      root().appendChild(node);
      f = { el: node, key: '' };
      filters.set(e.id, f);
    }
    f.ripple = buildFilter(f.el, { w, h, radius, rim, strength, ca, profile: p.profile, minify: p.minify, ripple });
    f.key = key;
    if (f.ripple) drawRipples(e.id); // rings already spreading (the element resized mid-ripple)
  }
  // Frost: CSS blur radius ≈ a third of the WebGL "blur" (they then look alike).
  const blur = p.blur > 0 ? `blur(${(p.blur / 3).toFixed(1)}px) ` : '';
  const bright = Math.abs(p.brightness - 1) > 0.001 ? ` brightness(${p.brightness})` : '';
  setVar(el, '--glass-live-filter', `${blur}url(#${id}) saturate(${Math.round(p.saturation * 100)}%)${bright}`);
}

const LIVE_VARS = ['--glass-live-radius', '--glass-live-bg', '--glass-live-border', '--glass-live-shadow', '--glass-live-filter'];

function clearLive(e) {
  if (e.liveMode) e.liveMode = null;
  const el = e.el;
  if (!el?.dataset?.glassLive) return;
  delete el.dataset.glassLive;
  delete el.dataset.glassPos;
  for (const v of LIVE_VARS) el.style.removeProperty(v);
}

function root() {
  // A site that swaps <body> (Turbo, some page-transition libraries) takes
  // our <svg> with it: put it back, with every filter still inside.
  if (svgRoot && !svgRoot.isConnected) document.body.appendChild(svgRoot);
  if (!svgRoot) {
    svgRoot = document.createElementNS(SVG_NS, 'svg');
    svgRoot.setAttribute('aria-hidden', 'true');
    svgRoot.setAttribute('width', '0');
    svgRoot.setAttribute('height', '0');
    svgRoot.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    svgRoot.dataset.glassIgnore = '';
    svgRoot.dataset.glassHost = 'filters'; // the glass's own node: page watchers skip its changes
    document.body.appendChild(svgRoot);
  }
  return svgRoot;
}

/** Corner radius for the displacement map (matches the CSS / WebGL shape). */
function shapeRadius(p, w, h, el) {
  const half = Math.min(w, h) / 2;
  if (p.shape === 'rectangle') return 0;
  if (p.shape === 'capsule' || p.shape === 'circle') return half;
  if (p.radius !== 'auto') return Math.min(p.radius, half);
  // auto: the element's CSS corner, or 16px when its corners are square.
  const css = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return Math.min(css > 0 ? css : AUTO_FALLBACK_RADIUS, half);
}

/**
 * The filter: displacement map (generated) → bend R, G, B by slightly
 * different amounts (chromatic aberration) → recombine.
 *
 * With `ripple` ({ amp, wave }) the map gets MAX_RIPPLES ring stages added
 * before it bends anything (see rippleStages) — then this returns the nodes
 * drawRipples() animates; otherwise null.
 */
function buildFilter(node, { w, h, radius, rim, strength, ca, profile, minify, ripple }) {
  // (strength is now baked into the map; `scale` turns it back into px)
  const { url: map, scale: strength2 } = displacementMap(w, h, radius, rim, profile, strength, minify);
  // Ripples need room in the same map: the bend scale grows by 2 × the ring
  // strength, and the rim map is scaled down to match (same px as before).
  strength = ripple ? strength2 + 2 * ripple.amp : strength2;
  node.setAttribute('x', '0');
  node.setAttribute('y', '0');
  node.setAttribute('width', String(w));
  node.setAttribute('height', String(h));
  node.setAttribute('filterUnits', 'userSpaceOnUse');
  node.setAttribute('primitiveUnits', 'userSpaceOnUse');
  node.setAttribute('color-interpolation-filters', 'sRGB');
  const disp = (scale, result) =>
    `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale.toFixed(2)}" xChannelSelector="R" yChannelSelector="G" result="${result}"/>`;
  const only = (input, row, result) => {
    const m = ['0 0 0 0 0', '0 0 0 0 0', '0 0 0 0 0', '0 0 0 1 0'];
    m[row] = ['1 0 0 0 0', '0 1 0 0 0', '0 0 1 0 0'][row];
    return `<feColorMatrix in="${input}" type="matrix" values="${m.join('  ')}" result="${result}"/>`;
  };
  node.innerHTML =
    (ripple
      ? `<feImage href="${map}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="rim"/>` + rippleStages(w, h, strength2, strength)
      : `<feImage href="${map}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>`) +
    (ca > 0.001
      ? disp(strength * (1 + 2 * ca), 'dr') +
        only('dr', 0, 'r') +
        disp(strength * (1 + ca), 'dg') +
        only('dg', 1, 'g') +
        disp(strength, 'db') +
        only('db', 2, 'b') +
        '<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen" result="out"/>'
      : disp(strength, 'out')) +
    // Ripples: a soft light on each ring's crest, over the bent backdrop —
    // that's what makes water rings visible even over a plain background.
    (ripple ? `<feMerge><feMergeNode in="out"/>${Array.from({ length: MAX_RIPPLES }, (_, i) => `<feMergeNode in="hl${i}"/>`).join('')}</feMerge>` : '');
  if (!ripple) return null;
  const q = (sel) => [...node.querySelectorAll(sel)];
  return {
    w,
    h,
    scale: strength, // px per map unit (feDisplacementMap scale)
    maxDist: Math.hypot(w, h),
    wave: ripple.wave,
    amp: ripple.amp, // the group's full ring strength (px) — crest light scales with amp / this
    slots: q('[data-ripple-img]').map((img, i) => ({ img, func: q('[data-ripple-func]')[i], add: q('[data-ripple-add]')[i], hl: q('[data-ripple-hl]')[i], at: '' })),
  };
}

// =============================================================================
// Ripples (ripple.js) in the live filter
// =============================================================================
// The displacement map is built in stages:
//   rim   the usual rim-bend map (generated image)
//   map0  rim scaled to the new, bigger bend scale (feColorMatrix — keeps
//         alpha at 1, so the composites below work on plain colours)
//   per ring slot i (MAX_RIPPLES of them):
//     rad_i   ONE radial picture (made once per size, 2w × 2h): R/G = the
//             direction away from its centre, B = the distance. It's placed
//             with its centre on the ring's centre (feImage x / y — moving
//             it re-decodes nothing).
//     prof_i  feComponentTransfer: a table over the DISTANCE (B) that draws
//             the ring's profile (a sine wave in a soft envelope at the
//             ring's radius) — rewritten every frame;
//     rip_i   direction × profile (feComposite arithmetic) = how far and
//             which way each pixel is pushed by that ring;
//     acc_i   added to the map at the ring's strength (k3, per frame;
//             0 = this slot is idle).
//   map   the last sum → bends R, G, B as usual.
//   hl_i  crest light: the ring profile as a soft white ring (its alpha set
//         per frame by the ring's strength), merged OVER the bent backdrop —
//         on a plain background a bend alone would show nothing.
// Per frame only a few attributes change (tableValues, k3/k4, x/y, hl values).

const RING_SAMPLES = 96; // table entries across the distance range
const CREST_LIGHT = 0.55; // brightest crest highlight (alpha) of a fresh full-strength ring
/** Crest-light matrix: white, alpha = 2k·profile − k (only the crest's top half lights up). */
const hlMatrix = (k) => `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${(2 * k).toFixed(4)} 0 0 0 ${(-k).toFixed(4)}`;
const HL_OFF = hlMatrix(0);
const radialMaps = new Map(); // "w×h" → data URL (one per size)
const MAX_RADIAL_PIXELS = 400_000; // big panels get a smaller (stretched) picture

function radialMap(w, h) {
  const key = `${w}x${h}`;
  if (radialMaps.has(key)) return radialMaps.get(key);
  const k = Math.min(1, Math.sqrt(MAX_RADIAL_PIXELS / (4 * w * h)));
  const W = Math.max(2, Math.round(2 * w * k));
  const H = Math.max(2, Math.round(2 * h * k));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const max = Math.hypot(W / 2, H / 2);
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i += 4) {
      const dx = x + 0.5 - W / 2;
      const dy = y + 0.5 - H / 2;
      const d = Math.hypot(dx, dy) || 1;
      img.data[i] = Math.round(127.5 + 127.5 * (dx / d));
      img.data[i + 1] = Math.round(127.5 + 127.5 * (dy / d));
      img.data[i + 2] = Math.round(255 * Math.min(1, d / max));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL();
  radialMaps.set(key, url);
  if (radialMaps.size > 40) radialMaps.delete(radialMaps.keys().next().value); // (old sizes)
  return url;
}

/** The ring stages (see above), ending in result="map". */
function rippleStages(w, h, rimScale, scale) {
  const a = scale > 0 ? rimScale / scale : 0;
  const c = (0.5 - 0.5 * a).toFixed(5);
  let out = `<feColorMatrix in="rim" type="matrix" values="${a.toFixed(5)} 0 0 0 ${c}  0 ${a.toFixed(5)} 0 0 ${c}  0 0 1 0 0  0 0 0 0 1" result="map0"/>`;
  const url = radialMap(w, h);
  const flat = Array(RING_SAMPLES).fill('0.5').join(' ');
  for (let i = 0; i < MAX_RIPPLES; i++) {
    const last = i === MAX_RIPPLES - 1;
    out +=
      `<feImage data-ripple-img="${i}" href="${url}" x="${-w}" y="${-h}" width="${2 * w}" height="${2 * h}" preserveAspectRatio="none" result="rad${i}"/>` +
      `<feComponentTransfer in="rad${i}" result="t${i}"><feFuncB data-ripple-func="${i}" type="table" tableValues="${flat}"/></feComponentTransfer>` +
      `<feColorMatrix in="t${i}" type="matrix" values="0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 0 1" result="prof${i}"/>` +
      `<feComposite in="rad${i}" in2="prof${i}" operator="arithmetic" k1="2" k2="-1" k3="-1" k4="1" result="rip${i}"/>` +
      // Crest light: white where the ring's profile is above its middle (alpha set per frame).
      `<feColorMatrix data-ripple-hl="${i}" in="prof${i}" type="matrix" values="${HL_OFF}" result="hl${i}"/>` +
      `<feComposite data-ripple-add="${i}" in="${i === 0 ? 'map0' : `acc${i - 1}`}" in2="rip${i}" operator="arithmetic" k1="0" k2="1" k3="0" k4="0" result="${last ? 'map' : `acc${i}`}"/>`;
  }
  return out;
}

/** Redraw one element's rings (called every frame while it has any). */
function drawRipples(id) {
  const f = filters.get(id);
  const rp = f?.ripple;
  if (!rp) return;
  const rings = activeRipples(getEntry(id));
  rp.slots.forEach((slot, i) => {
    const ring = rings[i];
    if (!ring || ring.amp <= 0.01) {
      if (slot.at !== 'idle') {
        slot.add.setAttribute('k3', '0');
        slot.add.setAttribute('k4', '0');
        slot.hl.setAttribute('values', HL_OFF);
        slot.at = 'idle';
      }
      return;
    }
    // Centre the radial picture on the ring.
    const at = `${ring.x.toFixed(1)},${ring.y.toFixed(1)}`;
    if (slot.at !== at) {
      slot.img.setAttribute('x', (ring.x - rp.w).toFixed(1));
      slot.img.setAttribute('y', (ring.y - rp.h).toFixed(1));
      slot.at = at;
    }
    // The ring's profile over distance: a sine wave in a soft envelope.
    const vals = new Array(RING_SAMPLES);
    for (let n = 0; n < RING_SAMPLES; n++) {
      const d = (n / (RING_SAMPLES - 1)) * rp.maxDist;
      const x = d - ring.radius;
      const env = Math.exp(-((x / (0.9 * rp.wave)) ** 2));
      vals[n] = (0.5 + 0.5 * env * Math.sin((2 * Math.PI * x) / rp.wave)).toFixed(3);
    }
    slot.func.setAttribute('tableValues', vals.join(' '));
    // Strength: ±amp px at the crest (map units = px / scale, ×2 for the −0.5…0.5 range).
    const k3 = rp.scale > 0 ? (2 * ring.amp) / rp.scale : 0;
    slot.add.setAttribute('k3', k3.toFixed(5));
    slot.add.setAttribute('k4', (-0.5 * k3).toFixed(5));
    slot.hl.setAttribute('values', hlMatrix(CREST_LIGHT * Math.min(1, ring.amp / (rp.amp || 1))));
  });
}

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
 * Returns the map and the feDisplacementMap scale that turns it back into px.
 *
 * Very large live elements (a full-screen panel) are mapped at a lower
 * resolution — at most MAX_MAP_PIXELS — and the filter stretches the map
 * back over the element (feImage preserveAspectRatio="none"). Without the
 * cap a 4K-sized panel meant ~8 M pixels of JS maths and a huge data URL on
 * every resize. Normal UI (headers, docks, menus) stays at full resolution.
 */
const MAX_MAP_PIXELS = 1_000_000;
function displacementMap(fullW, fullH, fullRadius, fullRim, profile, strength, minify = 0) {
  const k = Math.min(1, Math.sqrt(MAX_MAP_PIXELS / (fullW * fullH)));
  const w = Math.max(1, Math.round(fullW * k));
  const h = Math.max(1, Math.round(fullH * k));
  const radius = fullRadius * k;
  const rim = Math.max(0.5, fullRim * k);
  const hx = w / 2 - rim;
  const hy = h / 2 - rim;
  const ir = Math.max(0, radius - rim);
  const half = Math.min(w, h) / 2; // deepest point inside the shape (map px)
  // minify: content scale (< 1 shrinks; > 1 — negative minify — magnifies)
  const scaleIn = 1 - Math.min(0.5, Math.max(-0.5, minify));
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
  /** Signed distance to a rounded rect (half sizes bx, by, radius rr) + outward normal. */
  const sdf = (px, py, bx, by, rr) => {
    const qx = Math.abs(px) - (bx - rr);
    const qy = Math.abs(py) - (by - rr);
    const mx = Math.max(qx, 0);
    const my = Math.max(qy, 0);
    const out = Math.hypot(mx, my);
    const d = out + Math.min(Math.max(qx, qy), 0) - rr;
    let gx = 0;
    let gy = 0;
    if (qx > 0 && qy > 0) {
      gx = (mx / out) * Math.sign(px);
      gy = (my / out) * Math.sign(py);
    } else if (qx > qy) gx = Math.sign(px);
    else gy = Math.sign(py);
    return { d, gx, gy };
  };
  const offs = new Float32Array(w * h * 2);
  let maxAbs = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - w / 2;
      const py = y + 0.5 - h / 2;
      // Rim bend (inner rim shape).
      const a = sdf(px, py, hx, hy, ir);
      const t = Math.min(1, Math.max(0, a.d / rim));
      // classic: gentle at the inner edge, strongest outside (original look);
      // squircle: the WebGL slab's rim curve (shapes.js rimTilt).
      const s = profile === 'classic' ? t * t : rimTilt(t, profile);
      let dx = (-a.gx * s * strength) / 2;
      let dy = (-a.gy * s * strength) / 2;
      // Minify (outer shape): read further out, by how deep the pixel is.
      if (scaleIn !== 1) {
        const o = sdf(px, py, w / 2, h / 2, Math.min(radius, half));
        const r = Math.min(1, Math.max(0, 1 + o.d / half)); // 0 = deepest, 1 = edge
        const push = ((bend(r) - r) * half) / k; // px (full size)
        dx += o.gx * push;
        dy += o.gy * push;
      }
      const i = (y * w + x) * 2;
      offs[i] = dx;
      offs[i + 1] = dy;
      maxAbs = Math.max(maxAbs, Math.abs(dx), Math.abs(dy));
    }
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const norm = maxAbs > 0 ? 127 / maxAbs : 0;
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    img.data[i] = 128 + offs[p * 2] * norm;
    img.data[i + 1] = 128 + offs[p * 2 + 1] * norm;
    img.data[i + 2] = 128;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // feDisplacementMap: offset = scale × (C − 0.5), C = byte / 255.
  return { url: c.toDataURL(), scale: maxAbs > 0 ? (maxAbs * 2 * 255) / 254 : 0 };
}

/** Rim light + inner glow as inset box-shadows (light from lightAngle). */
function rimShadow(p) {
  const a = (p.lightAngle * Math.PI) / 180;
  const lx = Math.sin(a); // towards the light, CSS axes (y down)
  const ly = -Math.cos(a);
  const w = p.rimWidth;
  const out = [];
  if (p.rimLight > 0) {
    // An inset shadow offset AWAY from the light shows on the lit edges.
    out.push(`inset ${(-lx * w).toFixed(2)}px ${(-ly * w).toFixed(2)}px ${(w * 0.6).toFixed(2)}px rgba(255,255,255,${(p.rimLight * 0.95).toFixed(3)})`);
    out.push(`inset ${(lx * w * 0.8).toFixed(2)}px ${(ly * w * 0.8).toFixed(2)}px ${(w * 0.6).toFixed(2)}px rgba(255,255,255,${(p.rimLight * 0.45).toFixed(3)})`);
    out.push(`inset 0 0 0 0.5px rgba(255,255,255,${(p.rimLight * 0.35).toFixed(3)})`);
  }
  if (p.innerGlow > 0) out.push(`inset 0 0 ${Math.round(10 + p.bevel)}px rgba(255,255,255,${(p.innerGlow * 0.45).toFixed(3)})`);
  return out.join(', ');
}

/** Press glow: a light spot under the pointer, faded by --glass-glow (0–1). */
function glowCss(p) {
  const a = (p.pressGlow * 0.9).toFixed(3);
  return `radial-gradient(circle at var(--glass-px, 50%) var(--glass-py, 50%), rgba(255,255,255,calc(${a} * var(--glass-glow, 0))), transparent 65%)`;
}

/** A config colour ("#hex" or "var(--x)") at an opacity, as CSS. */
function colorCss(c, opacity) {
  return `color-mix(in srgb, ${c} ${Math.round(opacity * 100)}%, transparent)`;
}

/** Tint as a CSS background: the configured gradient at tintOpacity. */
function tintCss(p) {
  const pct = Math.round(p.tintOpacity * 100);
  const col = (c) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  const t = p.tint;
  const stops = t.via ? [t.from, t.via, t.to] : [t.from, t.to];
  return `linear-gradient(${t.angle}deg, ${stops.map(col).join(', ')})`;
}

/** For a live tuning panel: how many elements are refracting the live page. */
export const liveCount = () => allEntries().filter((e) => e.liveMode === 'live').length;

/** Set a CSS variable on an element only if its value changes (no needless page changes). */
function setVar(el, name, value) {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}
