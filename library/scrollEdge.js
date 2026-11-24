/**
 * =============================================================================
 * glass/scrollEdge.js — Scroll edge effect (like iOS 26), plain JS
 * =============================================================================
 * Content scrolling under a pinned glass bar doesn't stop at a hard cut: over
 * the last few dozen px before the bar (and under it) it is progressively
 * blurred and faded into the background.
 *
 *   const edge = createScrollEdge(scroller, { edges: 'top', effect: 'soft', size: 32, inset: 56 });
 *   edge.update({ edges: 'both' });   edge.destroy();
 *
 * Options:
 *   edges   'top' | 'bottom' | 'both'      (default 'top')
 *   effect  'soft' — a gradual blur + fade (default);
 *           'hard' — a more opaque backing that ends in a crisp line
 *   size    px of the fade beyond the bar (default 32)
 *   inset   px fully covered at the edge — the bar's height (default 0);
 *           a number, or { top, bottom }
 *   color   what the content fades into: 'auto' (default — the nearest
 *           opaque background of the scroller or its ancestors) or any CSS colour
 *
 * HOW (cheap: no script runs while scrolling):
 *   • One "host" element goes in as the scroller's FIRST child, position:
 *     sticky at the top of the scrollport, with negative margins so it
 *     takes no room and spans the scroller's padding box. Inside it, the
 *     top layer sits at the top and the bottom layer is placed a scrollport
 *     height lower (--gp-se-vh, from a ResizeObserver) — so both stay at the
 *     visible edges whatever the content's length or the scroll position.
 *     (A short host: a tall sticky box would be stopped by the content box
 *     at the end of the scroll whenever the scroller has bottom padding.)
 *   • Each layer = a few backdrop-filter slices with growing blur, each
 *     masked to a shorter band (a progressive blur), over a colour gradient
 *     (the fade). All of it is CSS in glass.css ([data-gp-scroll-edge]).
 *   • The page itself (scroller = window / document / <html> / <body>): the
 *     host is position: fixed over the viewport instead.
 * The host paints at z-index 1 over the content: a pinned bar INSIDE the
 * scroller needs z-index ≥ 2 to stay above it (one outside needs nothing).
 * Works on block and flex-column scroll containers. prefers-reduced-
 * transparency: no blur, a stronger plain fade.
 * =============================================================================
 */
import { subscribeConfig } from './config';

const EDGES = ['top', 'bottom', 'both'];
const EFFECTS = ['soft', 'hard'];
const SLICES = 3; // backdrop-filter slices per soft edge (hard uses one)

/** Options with defaults + validation. */
function normalize(o = {}) {
  const inset = typeof o.inset === 'object' && o.inset ? o.inset : { top: o.inset, bottom: o.inset };
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Math.max(0, Number(v)) : d);
  return {
    edges: EDGES.includes(o.edges) ? o.edges : 'top',
    effect: EFFECTS.includes(o.effect) ? o.effect : 'soft',
    size: num(o.size, 32),
    insetTop: num(inset.top, 0),
    insetBottom: num(inset.bottom, 0),
    color: typeof o.color === 'string' && o.color.trim() && o.color !== 'auto' ? o.color.trim() : 'auto',
  };
}

/** Is this the page's own scroller (window / document / html / body)? */
const isPage = (el) =>
  typeof window !== 'undefined' && (el === window || el === document || el === document.documentElement || el === document.body || el === document.scrollingElement);

/** The nearest (mostly) opaque background colour from el up, for "auto". */
function backgroundOf(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) continue;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    const alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
    if (alpha > 0.5) return `rgb(${parts.slice(0, 3).join(' ')})`;
  }
  // Nothing opaque: the page's colour scheme decides.
  const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return dark ? 'rgb(0 0 0)' : 'rgb(255 255 255)';
}

/** One edge layer (top or bottom) with its blur slices. */
function makeLayer(side) {
  const l = document.createElement('div');
  l.setAttribute('data-gp-se-layer', side);
  for (let i = 0; i < SLICES; i++) l.append(document.createElement('i'));
  return l;
}

/**
 * Give a scroll container (or the page: window / document) a scroll edge effect.
 * @param {HTMLElement|Window|Document} target
 * @param {object} [options]   see the header
 * @returns {{ update(options: object): void, destroy(): void, host: HTMLElement|null }}
 */
export function createScrollEdge(target, options = {}) {
  const none = { update() {}, destroy() {}, host: null };
  if (typeof document === 'undefined' || !target) return none;
  const page = isPage(target);
  const scroller = page ? document.scrollingElement || document.documentElement : target;
  if (!page && scroller.nodeType !== 1) return none;
  let o = normalize(options);

  // The host (React passes its own, already rendered — options.host).
  const own = !options.host;
  const host = options.host || document.createElement('div');
  host.setAttribute('data-gp-scroll-edge', page ? 'page' : 'box');
  host.setAttribute('aria-hidden', 'true');
  const top = makeLayer('top');
  const bottom = makeLayer('bottom');
  host.replaceChildren(top, bottom);
  if (own) {
    if (page) document.body.append(host);
    else scroller.prepend(host);
  }

  // Scrollport size + padding (the host's negative margins) — only on resize.
  const measure = () => {
    if (page) return;
    const cs = getComputedStyle(scroller);
    host.style.setProperty('--gp-se-vh', `${scroller.clientHeight}px`);
    host.style.setProperty('--gp-se-pt', cs.paddingTop);
    host.style.setProperty('--gp-se-pl', cs.paddingLeft);
    host.style.setProperty('--gp-se-pr', cs.paddingRight);
  };
  const ro = !page && typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  ro?.observe(scroller);

  const paint = () => {
    host.setAttribute('data-gp-se-effect', o.effect);
    top.hidden = o.edges === 'bottom';
    bottom.hidden = o.edges === 'top';
    host.style.setProperty('--gp-se-size', `${o.size}px`);
    host.style.setProperty('--gp-se-inset-top', `${o.insetTop}px`);
    host.style.setProperty('--gp-se-inset-bottom', `${o.insetBottom}px`);
    // The host's own height = the top layer's (0 without a top edge).
    host.style.setProperty('--gp-se-h', o.edges === 'bottom' ? '0px' : `${o.insetTop + o.size}px`);
    host.style.setProperty('--gp-se-color', o.color === 'auto' ? backgroundOf(page ? document.body : scroller) : o.color);
    measure();
  };
  paint();
  // Theme switches (config re-resolves) change the "auto" colour.
  const offConfig = subscribeConfig(() => o.color === 'auto' && paint());

  return {
    host,
    update(next = {}) {
      o = normalize({ ...options, ...next });
      options = { ...options, ...next };
      paint();
    },
    destroy() {
      offConfig();
      ro?.disconnect();
      if (own) host.remove();
      else host.replaceChildren();
    },
  };
}
