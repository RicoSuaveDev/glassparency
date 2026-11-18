/**
 * =============================================================================
 * glass/GlassProvider.jsx — Turns the WebGL glass on (or leaves CSS glass)
 * =============================================================================
 * Wrap the app once (e.g. in main.jsx). Props (all optional):
 *     config      a site's own glass config, deep-merged over the built-in
 *                 glass.config.json (see config.js configureGlass)
 *     renderIcon  (name, size) => element, for <Glass icon="name">
 *     injectStyles  false = don't add glass.css to the page; import it
 *                 yourself instead (the npm package ships it as glass.css) —
 *                 e.g. for a strict Content-Security-Policy without a nonce
 *     nonce       CSP nonce for the <style> elements the glass adds
 * It:
 *   1. decides whether WebGL glass can run here: glass.config.json
 *      "global.enabled", the OS "Reduce transparency" setting, WebGL 2
 *      support (a software / blocklisted GPU counts as none), and the
 *      MOBILE layout (global.mobileQuery, ≤ 860px wide by default — phones
 *      get plain CSS glass, e.g. from a site's mobile stylesheet: no WebGL,
 *      no live SVG filters). If not, nothing changes: the CSS glass stays.
 *      Exception: layers listed in global.mobileLayers still get their own
 *      canvas in the mobile layout, drawing only their own glass (the rest
 *      of the page stays CSS; <html data-glass> is not set).
 *   2. downloads the three.js part (a separate chunk) after first paint.
 *   3. puts one full-window canvas per layer in the page (z-indexes from
 *      global.zIndex):
 *        base  — z-index −1: behind ALL page content (only the page
 *                background is further back)
 *        float — z-index 49: over page content, under the header (50),
 *                docks (90) and dialogs (100) — typical values
 *        modal — inside an open dialog (see <GlassLayerHost>)
 *        top   — z-index 48 (global.zIndex.top): in front of all page
 *                content, under the floating UI. Tab bars use it by default
 *                (the iOS look: WebGL glass everywhere, phones included —
 *                "top" is in the default global.mobileLayers). The provider
 *                mounts a window-fixed host for it by itself while any glass
 *                is on "top"; an app can host it elsewhere with
 *                <GlassLayerHost layer="top"> (e.g. a draggable glass orb's
 *                own container), which then wins.
 *      The canvases ignore the mouse (pointer-events: none).
 *   4. once the first frame is drawn, sets <html data-glass="on">, which
 *      (glass.css) makes glass elements' own CSS backgrounds transparent so
 *      the WebGL glass shows through. Text, icons, borders stay HTML.
 *   5. asks the canvases to redraw whenever something may have moved:
 *      scrolling, resizing, DOM changes (inside global.root), CSS animations.
 *   6. in Chromium, hands the floating glass to live.js, which bends the
 *      real page in real time (no snapshots).
 *
 * If WebGL ever fails (graphics reset), it switches back to the CSS glass.
 *
 * Server rendering (Next.js, Remix…): renders just its children on the
 * server and on the first client render, then starts in an effect — so
 * hydration always matches. Only one GlassProvider can run at a time (the
 * glass is page-wide); a second one renders its children and warns.
 * =============================================================================
 */
import { lazy, Suspense, useCallback, useEffect, useInsertionEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import glassCss from './glass.css?inline';
import { configureGlass, getGlobal, glassRoot, notifyConfigChanged, subscribeConfig } from './config';
import {
  allEntries,
  getHosts,
  getPinnedHosts,
  holdRender,
  pinnedLayers as getPinnedLayers,
  placement,
  registerFallbackHost,
  registerHost,
  registerPinnedHost,
  requestRender,
  setIconRenderer,
  setStatus,
  subscribeHosts,
  subscribePinned,
  subscribeProps,
  subscribeStructure,
} from './registry';
import { scheduleLiveSync, startLive } from './live';
import { setSnapshotNonce } from './snapshot';
import { defineGlassElement } from './element';
import { canvasBackdropWanted, startPage } from './pageCanvas';

const GlassCanvas = lazy(() => import('./GlassCanvas'));
// Canvas mode (global.backdrop "canvas"): the page canvas's glass engine.
const PageGlass = lazy(() => import('./GlassCanvas').then((m) => ({ default: m.PageGlass })));

/** Placeholder "problem" until the first effect has checked the browser. */
const STARTING = 'starting';

/**
 * Why WebGL glass can't run here (null = it can).
 * @param {boolean} [ignoreMobile] skip the mobile-layout check (asks: could
 *   WebGL run here at all? — for the global.mobileLayers exceptions)
 */
function blocker(ignoreMobile = false) {
  const g = getGlobal();
  if (!g.enabled) return 'switched off in the glass config (global.enabled)';
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'no window';
  // The mobile layout (global.mobileQuery — keep it the same breakpoint as
  // the site's own mobile CSS). On phones
  // the WebGL glass dropped frames and its slabs lagged behind their
  // elements while scrolling, so that layout uses CSS glass only.
  if (!ignoreMobile && g.mobileQuery && safeMatch(g.mobileQuery)) return `mobile layout (${g.mobileQuery}): CSS glass only`;
  if (safeMatch('(prefers-reduced-transparency: reduce)')) return 'the system "Reduce transparency" setting is on';
  try {
    const c = document.createElement('canvas');
    // failIfMajorPerformanceCaveat: no context when WebGL would run on the
    // CPU (software renderer, blocklisted GPU, some VMs / remote desktops) —
    // the glass would crawl there, so the CSS glass is kept instead.
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return 'this browser has no (hardware) WebGL 2';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    return 'WebGL could not start';
  }
  return null;
}
/**
 * The mobile layout, but WebGL could run and global.mobileLayers lists layers
 * that should get it anyway → those layers (only). Otherwise null.
 */
function mobileExceptions() {
  const g = getGlobal();
  if (!g.mobileLayers.length || !g.mobileQuery || !safeMatch(g.mobileQuery)) return null;
  return blocker(true) ? null : g.mobileLayers;
}
/** matchMedia that never throws (a bad query in the config = no match). */
function safeMatch(query) {
  try {
    return Boolean(window.matchMedia?.(query).matches);
  } catch {
    return false;
  }
}

// Only one provider runs the glass (it is page-wide: one canvas per layer).
let owner = null;
// glass.css added to the page once, however many times providers mount.
let styleEl = null;

/**
 * Put glass.css on the page now (once). The provider calls it from its
 * insertion effect; the script build (standalone.js start()) calls it BEFORE
 * it upgrades the page's controls, because React renders the provider
 * asynchronously — controls created first would be measured without our CSS
 * (cssGlass.js read a switch knob as position: static and pinned it
 * relative, which collapsed the knob to 0×0 in Safari / on phones).
 * The provider still owns removal (its users count), so stop() cleans up.
 * @param {string} [nonce] CSP nonce for the <style> element
 */
export function ensureGlassStyles(nonce) {
  if (styleEl || typeof document === 'undefined') return;
  styleEl = document.createElement('style');
  styleEl.setAttribute('data-glass-styles', '');
  if (nonce) styleEl.nonce = nonce;
  styleEl.textContent = glassCss;
  document.head.appendChild(styleEl);
}
let styleUsers = 0;

export default function GlassProvider({ children, config, renderIcon, injectStyles = true, nonce }) {
  // --- Props that feed the (module-level) stores, applied while rendering so
  // children rendering in this same pass already see them. Config changes are
  // announced in an effect (no other component is updated during render).
  const configKey = useRef(undefined);
  const announce = useRef(false);
  const nextKey = config === undefined ? undefined : stableKey(config);
  if (nextKey !== configKey.current) {
    configKey.current = nextKey;
    configureGlass(config ?? null, { silent: true });
    announce.current = true;
  }
  if (renderIcon !== undefined) setIconRenderer(renderIcon);
  if (nonce !== undefined) setSnapshotNonce(nonce);
  useLayoutEffect(() => {
    if (!announce.current) return;
    announce.current = false;
    notifyConfigChanged();
  });
  // <glass-ui> (element.js) works wherever the glass runs — React apps and
  // the script build alike. (Client only; once per page.)
  useLayoutEffect(() => {
    defineGlassElement();
  }, []);

  // --- Canvas mode (pageCanvas.js): decided ONCE, on the first render —
  // switching it moves the whole page into / out of a canvas, which would
  // remount the app (and lose its state). Needs the config to ask for it,
  // HTML-in-Canvas, and nothing that would stop the glass (mobile layout,
  // "Reduce transparency", no hardware WebGL 2).
  const [canvasMode] = useState(() => typeof window !== 'undefined' && canvasBackdropWanted() && blocker() === null);
  const pageCanvasRef = useRef(null);
  const pageRootRef = useRef(null);
  useLayoutEffect(() => {
    if (!canvasMode || !pageCanvasRef.current || !pageRootRef.current) return undefined;
    const html = document.documentElement;
    html.setAttribute('data-glass-canvas', '');
    const stop = startPage(pageCanvasRef.current, pageRootRef.current);
    return () => {
      stop();
      html.removeAttribute('data-glass-canvas');
    };
  }, [canvasMode]);

  // --- One provider at a time ---
  const token = useRef(null);
  if (!token.current) token.current = {};
  const [duplicate, setDuplicate] = useState(false);
  useEffect(() => {
    if (owner && owner !== token.current) {
      console.warn('glass: another <GlassProvider> is already running — this one only renders its children');
      setDuplicate(true);
      return undefined;
    }
    owner = token.current;
    return () => {
      if (owner === token.current) owner = null;
    };
  }, []);

  // --- glass.css ---
  useInsertionEffect(() => {
    if (!injectStyles || duplicate || typeof document === 'undefined') return undefined;
    styleUsers += 1;
    ensureGlassStyles(nonce); // (already there when the script build added it early)
    return () => {
      styleUsers -= 1;
      if (styleUsers <= 0) {
        styleUsers = 0;
        styleEl?.remove();
        styleEl = null;
      }
    };
  }, [injectStyles, duplicate, nonce]);

  // --- Can WebGL glass run? (checked after mounting: same HTML as the server) ---
  const [problem, setProblem] = useState(STARTING);
  const [lost, setLost] = useState(null); // WebGL context lost → CSS glass for this session
  const [layout, setLayout] = useState(() => layoutOf());
  const active = !duplicate && !problem && !lost;
  // Mobile layout: the rest of the page stays CSS glass (no <html data-glass>,
  // no base / float canvases, no live glass), but the layers listed in
  // global.mobileLayers still get their own WebGL canvas.
  const [mobileLayers, setMobileLayers] = useState(null);
  const mobileOnly = !duplicate && !active && !lost && problem !== STARTING && Boolean(mobileLayers);
  const drawing = active || mobileOnly; // some canvas may be up (redraw triggers)

  // Re-check when the config (hot reload, configureGlass), the OS setting or
  // the layout (rotating a tablet, resizing past the mobile breakpoint)
  // changes.
  useEffect(() => {
    const recheck = () => {
      setProblem(blocker());
      setMobileLayers(mobileExceptions());
      setLayout((prev) => {
        const next = layoutOf();
        return next.key === prev.key ? prev : next;
      });
    };
    recheck();
    return subscribeConfig(recheck);
  }, []);
  useEffect(() => {
    const recheck = () => {
      setProblem(blocker());
      setMobileLayers(mobileExceptions());
    };
    const queries = ['(prefers-reduced-transparency: reduce)', layout.mobileQuery].filter(Boolean);
    const lists = [];
    for (const q of queries) {
      try {
        const mq = window.matchMedia?.(q);
        mq?.addEventListener?.('change', recheck);
        if (mq) lists.push(mq);
      } catch {
        // (bad query — blocker() ignores it too)
      }
    }
    return () => lists.forEach((mq) => mq.removeEventListener?.('change', recheck));
  }, [layout.mobileQuery]);

  // Status for a live tuning panel + the <html> switch.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (duplicate) return;
    if (problem === STARTING) setStatus('loading', 'starting');
    else if (!active) {
      setReady(false);
      setStatus('fallback', lost || problem);
    } else if (!ready) setStatus('loading', 'downloading the 3D engine');
    else setStatus('on', '');
  }, [active, ready, lost, problem, duplicate]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (active && ready) {
      root.dataset.glass = 'on';
      // Live glass started before this (startLive below runs while still
      // loading); CSS keyed on data-glass='on' can change its elements'
      // layout (position, display), so look at them again.
      scheduleLiveSync();
    } else if (!duplicate) delete root.dataset.glass;
    return () => {
      if (!duplicate) delete root.dataset.glass;
    };
  }, [active, ready, duplicate]);

  // Live (real-time) floating glass in Chromium browsers.
  // (Not in canvas mode: the page is drawn by the canvas, where an SVG
  // backdrop filter can't see anything — all glass is WebGL there.)
  useEffect(() => (active && !canvasMode ? startLive() : undefined), [active, canvasMode]);

  // Redraw triggers (also for the mobile-layout exception canvases).
  useEffect(() => {
    if (!drawing) return undefined;
    let raf = 0;
    const soon = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        requestRender();
      });
    };
    // Keep drawing while CSS animates — but not for a transition that can't
    // move or restyle any glass (see touchesGlass / PAINT_ONLY below): a link
    // or table row fading its colour on hover used to keep EVERY glass canvas
    // redrawing for 800 ms.
    const onTransition = (ev) => {
      if (PAINT_ONLY.has(ev.propertyName) && !touchesGlass(ev.target)) return;
      holdRender(800);
    };
    const onAnim = () => holdRender(800);
    // Scrolling the window, or a box with glass in it (or around it), moves
    // glass; scrolling a box with no glass anywhere in or around it doesn't.
    const onScroll = (ev) => {
      if (touchesGlass(ev.target)) requestRender();
    };
    // DOM changes can move glass elements. (Text rewritten with the same
    // value — snapDOM does that while capturing — moves nothing, and neither
    // do the glass's own canvases and filters.)
    const mo = new MutationObserver((records) => {
      if (records.some((r) => !ownNode(r.target) && (r.type !== 'characterData' || r.oldValue !== r.target.data))) soon();
    });
    const root = glassRoot();
    if (root) mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true, characterDataOldValue: true });
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', requestRender, { passive: true });
    document.addEventListener('transitionrun', onTransition, true);
    document.addEventListener('animationstart', onAnim, true);
    document.fonts?.ready?.then(soon);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', requestRender);
      document.removeEventListener('transitionrun', onTransition, true);
      document.removeEventListener('animationstart', onAnim, true);
    };
  }, [drawing, layout.root]);

  // Layer hosts: base + float live here; "modal" comes from <GlassLayerHost>.
  const [hosts, setHosts] = useState(() => getHosts());
  const [pinHosts, setPinHosts] = useState(() => getPinnedHosts());
  useEffect(() => {
    const sync = () => {
      setHosts(getHosts());
      setPinHosts(getPinnedHosts());
    };
    const off = subscribeHosts(sync);
    sync(); // hosts may have registered (layout effects) before we subscribed
    return off;
  }, []);

  const onLost = useCallback((why) => setLost(why), []);
  const onReady = useCallback(() => setReady(true), []);

  // Is any glass on layer "top"? (Then the provider mounts its own fallback
  // host for it — see TopHost. No "top" glass → no extra canvas.)
  const [usesTop, setUsesTop] = useState(false);
  useEffect(() => {
    const check = () => setUsesTop(allEntries().some((e) => placement(e.id).layer === 'top'));
    const offS = subscribeStructure(check);
    const offP = subscribeProps(check);
    check();
    return () => {
      offS();
      offP();
    };
  }, []);

  // anchor "page": layers with glass on fixed / sticky elements get a second,
  // window-fixed "pinned" canvas for that glass (registry.js setPinned).
  const [pinned, setPinnedLayers] = useState(() => getPinnedLayers());
  useEffect(() => {
    const sync = () => setPinnedLayers(getPinnedLayers());
    sync();
    return subscribePinned(sync);
  }, []);
  const zOf = (layer) => (layer === 'base' ? layout.zBase : layer === 'top' ? layout.zTop : layout.zFloat);
  // Only for layers whose canvas really sits in the page (an app's own
  // window-fixed host — a dialog, an orb's container — needs no twin).
  const pinnedWanted = layout.anchor === 'page' ? pinned.filter((l) => hosts.get(l)?.dataset.glassAnchor === 'page') : [];
  const pinnedDrawn = mobileOnly ? pinnedWanted.filter((l) => mobileLayers.includes(l)) : active ? pinnedWanted : [];

  // Canvas mode: the page itself is rendered inside the page canvas (its
  // drawable root scrolls instead of the window); the canvas draws it and
  // every glass layer in it, so there are no base / float / top canvases.
  const content = canvasMode ? (
    <canvas ref={pageCanvasRef} data-glass-page="" layoutsubtree="" content="drawable" style={PAGE_CANVAS_STYLE}>
      <div ref={pageRootRef} data-glass-page-root="" drawable="" style={PAGE_ROOT_STYLE}>
        {children}
      </div>
    </canvas>
  ) : (
    children
  );

  return (
    <>
      {content}
      {canvasMode && active && (
        <Suspense fallback={null}>
          <PageGlass onLost={onLost} onReady={onReady} />
        </Suspense>
      )}
      {active &&
        !canvasMode &&
        createPortal(
          <>
            <BodyHost layer="base" z={layout.zBase} anchor={layout.anchor} />
            <BodyHost layer="float" z={layout.zFloat} anchor={layout.anchor} />
          </>,
          document.body
        )}
      {drawing && usesTop && !canvasMode && createPortal(<TopHost z={layout.zTop} anchor={layout.anchor} />, document.body)}
      {pinnedDrawn.length > 0 &&
        createPortal(
          <>
            {pinnedDrawn.map((l) => (
              <PinnedHost key={l} layer={l} z={zOf(l)} />
            ))}
          </>,
          document.body
        )}
      {[...pinHosts.entries()]
        .filter(([layer]) => pinnedDrawn.includes(layer))
        .map(([layer, el]) =>
          createPortal(
            <Suspense fallback={null}>
              <GlassCanvas layer={layer} layers={mobileOnly ? mobileLayers : undefined} pinned onLost={onLost} />
            </Suspense>,
            el,
            `glass-pinned-${layer}`
          )
        )}
      {active &&
        [...hosts.entries()]
          .filter(([layer]) => !canvasMode || !['base', 'float', 'top'].includes(layer))
          .map(([layer, el]) =>
          createPortal(
            <Suspense fallback={null}>
              <GlassCanvas layer={layer} onLost={onLost} onReady={layer === 'base' ? onReady : undefined} />
            </Suspense>,
            el,
            `glass-${layer}`
          )
        )}
      {mobileOnly &&
        [...hosts.entries()]
          .filter(([layer]) => mobileLayers.includes(layer))
          .map(([layer, el]) =>
            createPortal(
              <Suspense fallback={null}>
                <GlassCanvas layer={layer} layers={mobileLayers} onLost={onLost} />
              </Suspense>,
              el,
              `glass-${layer}`
            )
          )}
    </>
  );
}

// Canvas mode: the page canvas fills the window; its drawable root is the
// page's scroll box (the window itself no longer scrolls).
const PAGE_CANVAS_STYLE = { position: 'fixed', inset: 0, width: '100vw', height: '100vh', display: 'block' };
const PAGE_ROOT_STYLE = { width: '100%', height: '100%', overflow: 'auto', position: 'relative' };

/** The config settings the provider lays the page out with (+ a change key). */
function layoutOf() {
  const g = getGlobal();
  const out = { zBase: g.zIndex.base, zFloat: g.zIndex.float, zTop: g.zIndex.top, mobileQuery: g.mobileQuery, root: g.root, anchor: g.anchor };
  return { ...out, key: JSON.stringify(out) };
}

/** A stable key for a config object passed as a prop (often a new object each render). */
function stableKey(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return v; // (not JSON-able: compare by identity)
  }
}

/** Is this node part of the glass itself (a layer canvas host, the live filters)? */
/**
 * CSS properties whose transition only repaints the element itself — it
 * can't move, resize or reveal anything else on the page. (Layout ones —
 * width, margin, transform, top… — can push glass elsewhere around, so
 * those always keep frames coming.)
 */
const PAINT_ONLY = new Set([
  'color',
  'background-color',
  'background',
  'background-image',
  'background-position',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline',
  'outline-color',
  'outline-offset',
  'box-shadow',
  'text-shadow',
  'text-decoration-color',
  'caret-color',
  'fill',
  'stroke',
  'opacity',
  'filter',
]);

/**
 * Could something happening on this node affect glass? True for the
 * document / window, a glass element, anything inside glass, and anything
 * that has glass inside it.
 */
function touchesGlass(n) {
  if (!n || n.nodeType !== 1) return true; // document / window: always
  if (n.closest('[data-glass-id]')) return true;
  return Boolean(n.querySelector('[data-glass-id]'));
}

function ownNode(n) {
  const el = n?.nodeType === 1 ? n : n?.parentElement;
  return Boolean(el?.closest?.('[data-glass-host]'));
}

/**
 * Click-through container for one layer's canvas: fixed to the window, or —
 * global.anchor "page" — positioned in the page (GlassCanvas sets its top and
 * height on every frame, so it covers the visible part plus a margin).
 */
function BodyHost({ layer, z, anchor }) {
  const ref = useRef(null);
  useLayoutEffect(() => registerHost(layer, ref.current), [layer, anchor]);
  const style =
    anchor === 'page'
      ? { position: 'absolute', left: 0, top: 0, width: '100%', height: '100vh', zIndex: z, pointerEvents: 'none' }
      : { position: 'fixed', inset: 0, zIndex: z, pointerEvents: 'none' };
  return <div ref={ref} data-glass-host={layer} data-glass-anchor={anchor} data-glass-ignore="" aria-hidden="true" style={style} />;
}

/**
 * The provider's own host for layer "top": fixed to the window (never
 * page-anchored — "top" glass is pinned UI like a tab bar, which a canvas
 * scrolling with the page would skip). A FALLBACK: a <GlassLayerHost
 * layer="top"> the app mounts itself takes over while it's there.
 */
function TopHost({ z, anchor }) {
  const ref = useRef(null);
  useLayoutEffect(() => registerFallbackHost('top', ref.current), [anchor]);
  // anchor "page": in the page like BodyHost (a tab bar that scrolls with
  // the page no longer trails it); a PINNED tab bar (fixed to the window,
  // like iOS) gets the layer's window-fixed pinned canvas instead.
  const style =
    anchor === 'page'
      ? { position: 'absolute', left: 0, top: 0, width: '100%', height: '100vh', zIndex: z, pointerEvents: 'none' }
      : { position: 'fixed', inset: 0, zIndex: z, pointerEvents: 'none' };
  return <div ref={ref} data-glass-host="top" data-glass-anchor={anchor} data-glass-ignore="" aria-hidden="true" style={style} />;
}

/**
 * Window-fixed container for a layer's PINNED canvas (anchor "page"): the
 * glass on that layer's fixed / sticky elements. Same z-index as the layer,
 * and later in the page, so it stacks just above the layer's in-page canvas.
 */
function PinnedHost({ layer, z }) {
  const ref = useRef(null);
  useLayoutEffect(() => registerPinnedHost(layer, ref.current), [layer]);
  return <div ref={ref} data-glass-host={layer} data-glass-pinned="" data-glass-ignore="" aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: z, pointerEvents: 'none' }} />;
}

/**
 * Put this inside a positioned container (a dialog's backdrop) to give the
 * glass inside it its own canvas, stacked with that container. Its parent's
 * background colour is used as the dimmer the glass sits on.
 */
export function GlassLayerHost({ layer = 'modal' }) {
  const ref = useRef(null);
  useLayoutEffect(() => registerHost(layer, ref.current), [layer]);
  return <div ref={ref} data-glass-host={layer} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />;
}
