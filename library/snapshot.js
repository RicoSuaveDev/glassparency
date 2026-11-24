/**
 * =============================================================================
 * glass/snapshot.js — A picture of the page for the floating glass to refract
 * =============================================================================
 * Headers, docks, menus and dialogs float over page CONTENT (text,
 * tables, cards), not just the background. WebGL can't see HTML, so we take a
 * picture of the part of the page under those elements with snapDOM and hand
 * it to the floating layer as a texture.
 *
 * A picture takes 10–300 ms, so it is only retaken when the page actually
 * changes (MutationObserver), debounced, never while scrolling, and at most
 * every `minIntervalMs`. Between pictures the renderer slides the old one by
 * however far the page has scrolled, so scrolling still looks right.
 *
 * FULL PAGE (global.snapshot.fullPage true / "mobile"): the picture covers
 * the whole page (capped at MAX_PICTURE_PX tall, centred on the window), not
 * just the glass ± margin. For glass PINNED over a scrolling page — a
 * phone's header and tab bar — the area under it changes on every scroll,
 * and a margin-sized picture ran out on the first flick: the glass showed
 * stale blobs of buttons that had already scrolled past until scrolling
 * stopped and a new picture came. With the whole page in the picture,
 * scrolling only slides it. (In the mobile layout `mobileScale` sets the
 * picture's resolution — phones have 2–3× screens.) On
 * Chromium builds with the experimental HTML-in-Canvas API, snapDOM uses it
 * automatically (faster, native).
 *
 * What is photographed: the config's global.root element (default:
 * <body>; e.g. "#root"). What's left out of the picture: the glass
 * canvases ([data-glass-host]), every floating glass element (they are what's
 * looking at the picture) and anything marked data-glass-ignore (e.g. the
 * dialog dimmer).
 * =============================================================================
 */
import { getGlassTheme, getGlobal, glassRoot, subscribeConfig } from './config';
import { allEntries, getEntry, isFloatingGlass, placement, requestRender, stats } from './registry';
import { pausedWhileHidden, subscribeGlassPower } from './power';

/**
 * Latest picture:
 *   canvas   — the image
 *   x, y, w, h — where it was, in window px at the time
 *   scrollX, scrollY — window scroll when taken (to slide it while scrolling)
 *   version — bumps each new picture (renderer re-uploads the texture)
 */
export const snapshot = { canvas: null, x: 0, y: 0, w: 0, h: 0, scrollX: 0, scrollY: 0, version: 0 };
const listeners = new Set();
export function subscribeSnapshot(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let timer = null;
let busy = false;
let again = false;
let lastScrollAt = 0;
let lastTakenAt = 0;
let started = false;
let observer = null;
let offTheme = null; // unsubscribe from theme (config) changes

/**
 * Ask for a new picture soon (debounced). A page that never stops changing
 * (an endless animation) still gets one: at most debounceMs + minIntervalMs
 * after the first change asked for it. Without that cap the debounce started
 * over on every change, and WebGL floating glass on the showcase page waited
 * for its first picture until the tab was hidden (animations paused).
 */
let pendingSince = 0; // when the oldest unanswered request was made (0 = none)
export function scheduleSnapshot(delay) {
  const g = getGlobal().snapshot;
  if (!g.enabled || !started) return;
  clearTimeout(timer);
  const now = performance.now();
  if (!pendingSince) pendingSince = now;
  // After failed captures wait longer each time (up to ~30 s between tries).
  const backoff = failures ? Math.min(30000, g.minIntervalMs * 2 ** Math.min(failures, 5)) : g.minIntervalMs;
  const earliest = lastTakenAt + backoff - now; // never sooner than this
  const latest = pendingSince + g.debounceMs + g.minIntervalMs - now; // never later than this
  // (An explicit delay — "wait for scrolling to settle" — is kept as it is.)
  const wait = Math.max(earliest, delay ?? Math.min(g.debounceMs, latest));
  timer = setTimeout(take, wait);
}

// Areas reserved for floating WebGL glass that is ABOUT to appear (key →
// window-px rect). Glass that animates in from a small shape (the chat
// panel's liquid morph) would otherwise get a picture covering only its
// first, tiny frame — and show the bare background where it grows.
const reserved = new Map();

/**
 * Make the next page pictures cover `rect` (window px) as well, and take one
 * now (as soon as minIntervalMs allows). Pass rect = null to release.
 * @param {string} key - who reserves (several can at once)
 * @param {{left:number, top:number, right:number, bottom:number}|null} rect
 */
export function reserveSnapshotArea(key, rect) {
  if (!rect) {
    reserved.delete(key);
    return;
  }
  reserved.set(key, rect);
  // The picture we have already covers it: no new one. Taking one anyway
  // blocked the page for as long as a capture takes (~0.25–1 s on a big
  // page) right as a menu / popover started its morph — it opened late and
  // stuttered. (Changes to the page still ask for new pictures as before.)
  if (pictureCoversRect(rect)) return;
  scheduleSnapshot(0);
}

/** Does the current picture cover rect (window px) at today's scroll? */
function pictureCoversRect(r) {
  if (!snapshot.canvas) return false;
  const x = snapshot.x - (window.scrollX - snapshot.scrollX);
  const y = snapshot.y - (window.scrollY - snapshot.scrollY);
  return x <= r.left && y <= r.top && x + snapshot.w >= r.right && y + snapshot.h >= r.bottom;
}

/**
 * Tallest picture (device px) — a texture every phone GPU takes (iOS: 8192+)
 * and well under Safari's canvas memory limit at phone widths.
 */
const MAX_PICTURE_PX = 8192;

/** In the layout that has no page-wide WebGL (phones)? */
function mobileLayout() {
  const q = getGlobal().mobileQuery;
  return Boolean(q && typeof matchMedia === 'function' && matchMedia(q).matches);
}

/** Picture the whole page this time? (global.snapshot.fullPage) */
function fullPageOn() {
  const f = getGlobal().snapshot.fullPage;
  return f === true || (f === 'mobile' && mobileLayout());
}

/** Picture resolution (device px per CSS px). */
const pictureScale = () => {
  const g = getGlobal().snapshot;
  return mobileLayout() ? g.mobileScale : g.scale;
};

/**
 * Full-page area (window px): the whole page width, and the page's full
 * height up to MAX_PICTURE_PX — centred on the window when it's taller.
 */
function fullPageRect() {
  const doc = document.documentElement;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const docH = Math.max(doc.scrollHeight, doc.clientHeight);
  const span = Math.min(docH, Math.floor(MAX_PICTURE_PX / pictureScale()));
  const pageTop = Math.max(0, Math.min(window.scrollY + vh / 2 - span / 2, docH - span));
  return { x: 0, y: pageTop - window.scrollY, w: vw, h: span };
}

/** Where the floating glass is (window px), grown by the margin — or null. */
function captureRect() {
  const g = getGlobal().snapshot;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of reserved.values()) {
    x0 = Math.min(x0, r.left);
    y0 = Math.min(y0, r.top);
    x1 = Math.max(x1, r.right);
    y1 = Math.max(y1, r.bottom);
  }
  for (const e of allEntries()) {
    // Only floating glass drawn by WebGL needs the picture (live glass reads
    // the real page itself — see live.js).
    if (placement(e.id).layer === 'base' || e.liveMode) continue;
    const r = e.el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    x0 = Math.min(x0, r.left);
    y0 = Math.min(y0, r.top);
    x1 = Math.max(x1, r.right);
    y1 = Math.max(y1, r.bottom);
  }
  if (x0 === Infinity) return null;
  if (fullPageOn()) return fullPageRect();
  // Margin: room for refraction and for sliding while the page scrolls.
  // Clamped to the document: a clip outside the page is cut off by the capture
  // and the picture would then be drawn shifted.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const doc = document.documentElement;
  const m = g.margin;
  const top = -window.scrollY; // page top, in window px
  const bottom = Math.max(doc.scrollHeight, doc.clientHeight) - window.scrollY;
  const x = Math.max(0, x0 - 40);
  const y = Math.max(top, Math.max(-m, y0 - m));
  const w = Math.min(vw, x1 + 40) - x;
  const h = Math.min(bottom, Math.min(vh + m, y1 + m)) - y;
  return { x, y, w, h };
}

/**
 * Floating glass that a glass canvas really draws (so it looks AT the picture
 * and must not be IN it). In the phone layout only global.mobileLayers get a
 * canvas; glass on any other floating layer (switches, checkboxes, text
 * fields — layer "float") is plain CSS there, i.e. ordinary page content.
 * It used to be hidden anyway, so the tech tab bar (layer "top") refracted
 * the page with every switch / field missing.
 */
function drawnFloatingGlass(el) {
  if (!isFloatingGlass(el)) return false;
  // (1.5.3) Live glass (Chromium: the browser draws it on the element with
  // an SVG backdrop filter — live.js) never looks at the picture; to glass
  // ABOVE it (a toast, a sheet over the nav) it's ordinary page content. Left
  // out, the nav was simply missing and the toast showed what's under it.
  if (getEntry(Number(el.dataset.glassId))?.liveMode) return false;
  if (!mobileLayout()) return true;
  return getGlobal().mobileLayers.includes(placement(Number(el.dataset.glassId)).layer);
}

/** Left out of the picture: floating glass that's drawn as glass (it's what looks AT the picture), the glass canvases and [data-glass-ignore]. */
const leftOut = (el) => el.matches('[data-glass-ignore], [data-glass-host]') || drawnFloatingGlass(el);
let warnedNodeMap = false;

/**
 * snapDOM plugin: hides the left-out elements in the page COPY, in place
 * (opacity 0), so they still take up exactly the space they do on the page.
 *
 * Why not snapDOM's own `exclude` + excludeMode 'hide': that swaps each
 * element for a spacer div with the same width/height but NO margins. The
 * floating header has a 20 px top margin (its glass `padding`, glass.css), so
 * everything under it moved 20 px up in the picture — the glass orb (and every
 * floating glass) showed the page's text ~20 px above where it really is,
 * e.g. button labels sitting on the top edge of their (WebGL-drawn) pills.
 *
 * ctx.nodeMap (copy → original element) is snapDOM-internal (3.2.0+); if a
 * future version drops it, nothing is hidden and we warn once.
 *
 * It also leaves window-fixed backgrounds and backdrop-filter frost out of
 * the picture (see the loop below for why).
 */
// Copies whose window-fixed background was stripped in afterClone (this capture).
let fixedBgCopies = [];
const hideLeftOut = {
  name: 'dp-glass-hide-left-out',
  // snapDOM 3.7 inlines every background image AFTER afterClone (its
  // background pass reads the ORIGINAL's computed style and writes
  // background-image onto the copy, which replaces our "none !important").
  // So the window-fixed page photo was back in every picture: floating /
  // tab-bar WebGL glass refracted the photo from the picture, which slides
  // with the page — the photo seen through a tab bar moved WITH the bar while
  // scrolling and only jumped right once a new picture came after the scroll
  // (measured in Chrome 157: the UI lab's picture was 85% the lake photo).
  // beforeRender runs after that pass, so the strip is done again there.
  beforeRender() {
    for (const copy of fixedBgCopies) {
      copy.style.setProperty('background', 'none', 'important');
      copy.style.setProperty('background-image', 'none', 'important');
    }
    fixedBgCopies = [];
  },
  afterClone(ctx) {
    fixedBgCopies = [];
    const map = ctx.nodeMap;
    if (!(map instanceof Map)) {
      if (!warnedNodeMap) console.warn('glass: snapDOM nodeMap missing (snapDOM changed?) — floating glass is not hidden in page pictures');
      warnedNodeMap = true;
      return;
    }
    for (const [copy, original] of map) {
      if (original?.nodeType !== 1 || !copy?.style) continue;
      if (leftOut(original)) {
        copy.style.setProperty('opacity', '0', 'important');
        continue;
      }
      // A WINDOW-FIXED background (background-attachment: fixed — a page
      // backdrop photo or gradient) can't be photographed: snapDOM paints it
      // once, at some spot of the picture, which then slides with the page.
      // Floating glass refracted the backdrop at the wrong place (the lake
      // where the mountains are) with flat colour around it. The WebGL
      // background pass already draws the window-fixed backdrop exactly
      // (global.background / backgroundImage), so it's left out of the
      // picture and the picture stays transparent there.
      const cs = getComputedStyle(original);
      if (/\bfixed\b/.test(cs.backgroundAttachment)) {
        copy.style.setProperty('background', 'none', 'important');
        fixedBgCopies.push(copy); // stripped AGAIN in beforeRender (see there)
      }
      // backdrop-filter: snapDOM (3.7+) imitates it by copying EVERYTHING
      // behind the element into the picture once per element that has one —
      // and every CSS-glass pane (cssGlass.js) has one. Measured in Safari on
      // the UI lab: one column (551 elements) became 10,755 (44 extra copies
      // of the column); the whole page became a 400 MB SVG that took 11–16 s
      // to build (the page frozen) and that Safari then failed to decode —
      // so floating WebGL glass never got its picture and kept retrying.
      // The picture is only ever seen THROUGH glass (blurred, bent), so the
      // frost of these panes isn't needed in it: switch it off in the copy
      // and drop the copy from ctx.nodeMap — snapDOM finds the elements to
      // imitate through that map (by their original's computed style), so it
      // skips them. (Their styles are already inlined by this point.)
      const bf = cs.backdropFilter || cs.webkitBackdropFilter;
      if (bf && bf !== 'none') {
        copy.style.setProperty('backdrop-filter', 'none', 'important');
        copy.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
        map.delete(copy);
      }
    }
  },
};

/**
 * Keep the LIVE page from reflowing while snapDOM copies it.
 *
 * snapDOM (3.2.0) bakes the "…" of every `text-overflow: ellipsis` line into
 * the copy by binary-searching the cut-off text IN THE REAL PAGE: it writes
 * each guess into the live text node, measures, and leaves the shortened text
 * there until the copy is done (~10–300 ms). Shorter text = a narrower column:
 * the Jobs table's address / description lines (.sub, ellipsis) shrank on
 * every picture, the table got narrower for a moment, and the browser clamped
 * the table's sideways scroll to the smaller width. Text came back, scroll
 * didn't — the "table jumps back every second" bug. (The 250 ms retake after
 * scrolling inside a box, onScroll below, made it hit right after each drag.)
 *
 * snapDOM only does this for elements whose computed text-overflow is
 * `ellipsis`, and text-overflow changes PAINTING only, never layout. So for
 * the moment of the copy we switch it to `clip` page-wide: snapDOM skips those
 * elements and nothing on the page moves. Cost: for those few frames a
 * cut-off line ends in clipped letters instead of "…" (and the picture has no
 * "…" — invisible through the frost anyway).
 *
 * Added in beforeClone (runs just before snapDOM's ellipsis pass), removed in
 * afterClone (the live page isn't read after that); take() also removes it in
 * `finally` in case the capture throws in between.
 */
let clipStyle = null;
let styleNonce = ''; // CSP nonce for the <style> (GlassProvider's nonce prop)
export const setSnapshotNonce = (n) => {
  styleNonce = n || '';
};
function holdEllipsis(on) {
  if (on && !clipStyle) {
    clipStyle = document.createElement('style');
    clipStyle.setAttribute('data-glass-snapshot', ''); // ours (in <head>, so the page observer never sees it)
    if (styleNonce) clipStyle.nonce = styleNonce;
    // [data-glass-root] = the photographed element (set by take()).
    clipStyle.textContent = '[data-glass-root], [data-glass-root] * { text-overflow: clip !important; }';
    document.head.appendChild(clipStyle);
  } else if (!on && clipStyle) {
    clipStyle.remove();
    clipStyle = null;
  }
}
const keepLiveLayout = {
  name: 'dp-glass-keep-live-layout',
  beforeClone() {
    holdEllipsis(true);
  },
  afterClone() {
    holdEllipsis(false);
  },
};

/**
 * snapDOM is downloaded the first time a picture is needed (only floating
 * WebGL glass needs one: Safari / Firefox, dialogs), not with the page.
 */
let snapdomPromise = null;
function loadSnapdom() {
  snapdomPromise ||= import('@zumer/snapdom').then((m) => m.snapdom);
  // A failed download (offline, blocked) may be retried by the next picture.
  snapdomPromise.catch(() => {
    snapdomPromise = null;
  });
  return snapdomPromise;
}

let dueWhileHidden = false; // a picture was due while the tab was hidden
subscribeGlassPower(() => {
  if (!dueWhileHidden || pausedWhileHidden()) return;
  dueWhileHidden = false;
  scheduleSnapshot();
});
async function take() {
  const g = getGlobal().snapshot;
  if (!g.enabled || !started) return;
  // Hidden tab (global.powerSaving, power.js): a capture is the most
  // expensive thing the glass does and nobody would see it. Remember that
  // one was due; it's taken as soon as the tab is shown again.
  if (pausedWhileHidden()) {
    dueWhileHidden = true;
    return;
  }
  // Never mid-scroll (the picture would be torn): wait for scrolling to settle.
  if (performance.now() - lastScrollAt < 180) return scheduleSnapshot(200);
  if (busy) {
    again = true;
    return;
  }
  const root = glassRoot();
  const rect = captureRect();
  // Nothing to picture (yet): this answers the requests so far too — a
  // request left "pending" here (pendingSince set) made needPicture() think a
  // picture was on its way, forever.
  if (!root || !rect || rect.w < 1 || rect.h < 1) {
    pendingSince = 0;
    return;
  }
  root.setAttribute('data-glass-root', ''); // (the ellipsis hold's selector — see holdEllipsis)

  pendingSince = 0; // this capture answers every request so far
  busy = true;
  const t0 = performance.now();
  const sx = window.scrollX;
  const sy = window.scrollY;
  try {
    const snapdom = await loadSnapdom();
    const canvas = await snapdom.toCanvas(root, {
      // Page coordinates (window px + scroll).
      clip: { x: rect.x + sx, y: rect.y + sy, width: rect.w, height: rect.h },
      dpr: pictureScale(),
      backgroundColor: null, // transparent: the WebGL background shows through
      // Floating glass + [data-glass-ignore] are made invisible in the copy
      // (hideLeftOut), NOT with snapDOM's exclude option — see hideLeftOut.
      // keepLiveLayout stops snapDOM shortening ellipsis text on the live page.
      plugins: [keepLiveLayout, hideLeftOut],
      embedFonts: false, // system fonts only; skips a slow font pass
      fast: false, // let the page keep painting during big captures
      // Images snapDOM can't read (cross-origin without CORS) are left out
      // instead of drawn as grey boxes: through frosted glass a missing image
      // looks like the page behind it, a grey box looks like a bug.
      placeholders: false,
    });
    // The page may have scrolled while we worked; record where it was taken.
    Object.assign(snapshot, { canvas, x: rect.x, y: rect.y, w: rect.w, h: rect.h, scrollX: sx, scrollY: sy });
    snapshot.version += 1;
    stats.snapshots += 1;
    stats.lastSnapshotMs = Math.round(performance.now() - t0);
    stats.lastSnapshotAt = Date.now();
    listeners.forEach((fn) => fn());
    requestRender();
    failures = 0;
  } catch (err) {
    // Warn once (not on every retake), and back off: a page that can't be
    // photographed (e.g. a cross-origin stylesheet snapDOM can't read) would
    // otherwise retry — and fail — after every change on the page.
    failures += 1;
    if (failures === 1 || failures === 10) console.warn('glass: page snapshot failed (floating WebGL glass will show the background only)', err);
  } finally {
    holdEllipsis(false); // normally already gone (afterClone); here if the capture threw
    busy = false;
    lastTakenAt = performance.now();
    if (again) {
      again = false;
      scheduleSnapshot();
    }
  }
}

// How many floating canvases (float / modal / top) are using the pictures.
// Each gets its OWN stop function: before this was counted, a dialog's canvas
// closing stopped the pictures for the float layer too (it was handed the
// global stop function).
let users = 0;
let failures = 0; // captures that failed in a row (take() backs off)

/**
 * Start watching the page (called by each floating canvas when it mounts).
 * @returns {() => void} call when that canvas unmounts (stops when the last one does)
 */
export function startSnapshots() {
  users += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    users -= 1;
    if (users <= 0) {
      users = 0;
      stopSnapshots();
    }
  };
  if (started) return release;
  started = true;
  const root = glassRoot();
  observer = new MutationObserver((records) => {
    // snapDOM briefly touches the live page's text while it captures; those
    // changes aren't real (and would make every picture trigger the next).
    // It also rewrites text nodes with the same text at the end of a capture,
    // so text "changes" whose value is unchanged are ignored too.
    if (busy) return;
    const real = records.some((r) => {
      if (ownNode(r.target)) return false; // the glass's own canvases / filters
      // Inside floating glass: it's left out of the picture, so nothing in
      // it (an animated lens, knob, progress fill…) changes the picture.
      if (insideFloatingGlass(r.target)) return false;
      if (r.type === 'characterData') return r.oldValue !== r.target.data;
      if (r.type === 'attributes') {
        if (r.attributeName?.startsWith('data-glass')) return false; // our own bookkeeping
        // Only the glass's own CSS variables changed (--glass-text eased by
        // auto text after each scroll, --gp-css-* of the CSS glass): nothing
        // visible through refracted glass. Each such step used to start a new
        // ~300 ms picture — 13 pictures over 8 scrolls in the UI lab.
        if (r.attributeName === 'style' && onlyGlassVarsChanged(r.oldValue, r.target.getAttribute?.('style'))) return false;
        return true;
      }
      return true;
    });
    if (real) scheduleSnapshot();
  });
  if (root) observer.observe(root, { subtree: true, childList: true, characterData: true, characterDataOldValue: true, attributes: true, attributeOldValue: true });
  // Light ↔ dark mode re-colours every element without touching the root's DOM,
  // so the observer above can't see it: retake the picture straight away.
  let shotTheme = getGlassTheme();
  offTheme = subscribeConfig(() => {
    if (getGlassTheme() === shotTheme) return;
    shotTheme = getGlassTheme();
    lastTakenAt = 0; // skip the minIntervalMs wait: the old picture has the wrong colours
    scheduleSnapshot(30);
  });
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  scheduleSnapshot(60);
  return release;
}

/**
 * Is this node part of the glass itself (a layer canvas host, the live
 * filters' <svg>)? Those change on every frame / hover and never move the
 * page. ([data-glass-ignore] content still counts: it is hidden in the
 * picture, but its size changes can move what's around it.)
 */
function insideFloatingGlass(n) {
  for (let el = n?.nodeType === 1 ? n : n?.parentElement; el; el = el.parentElement?.closest('[data-glass-id]')) {
    el = el.closest('[data-glass-id]');
    if (!el) return false;
    if (drawnFloatingGlass(el)) return true; // (CSS-only glass on a phone is page content: its changes count)
  }
  return false;
}
/** Did a style attribute change only in --glass-* / --gp-* custom properties? */
function onlyGlassVarsChanged(before, after) {
  const decls = (s) => {
    const m = new Map();
    for (const part of String(s || '').split(';')) {
      const i = part.indexOf(':');
      if (i > 0) m.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
    }
    return m;
  };
  const a = decls(before);
  const b = decls(after);
  const glassVar = (k) => k.startsWith('--glass-') || k.startsWith('--gp-');
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(k) !== b.get(k) && !glassVar(k)) return false;
  }
  return true;
}
function ownNode(n) {
  const el = n?.nodeType === 1 ? n : n?.parentElement;
  return Boolean(el?.closest?.('[data-glass-host]'));
}

export function stopSnapshots() {
  started = false;
  failures = 0;
  // Forget the old picture: the page may look different by the time floating
  // WebGL glass (e.g. the next dialog) needs one again, so that glass keeps its
  // CSS look until a fresh picture is taken (data-glass-drawn, GlassCanvas).
  snapshot.canvas = null;
  snapshot.version += 1;
  clearTimeout(timer);
  observer?.disconnect();
  observer = null;
  offTheme?.();
  offTheme = null;
  window.removeEventListener('scroll', onScroll, { capture: true });
  window.removeEventListener('resize', onResize);
}

function onScroll(ev) {
  lastScrollAt = performance.now();
  // A scroll BOX moved (its content slid inside the picture) — not the window.
  // (This used to be "the window is back where the picture was taken",
  // which is also true after scrolling away and back: a pointless retake.)
  const boxScrolled = Boolean(ev?.target && ev.target.nodeType === 1 && ev.target !== document.documentElement && ev.target !== document.body);
  // After scrolling stops: retake if we slid far enough to run out of picture,
  // or if something inside a scroll box (not the window) moved.
  const moved = Math.abs(window.scrollY - snapshot.scrollY) + Math.abs(window.scrollX - snapshot.scrollX);
  const g = getGlobal().snapshot;
  if (fullPageOn()) {
    // Whole-page picture: only when the window (± margin) has slid past its
    // ends — a page taller than the picture — or a scroll box moved.
    const top = snapshot.y + snapshot.scrollY; // picture's page y
    const bottom = top + snapshot.h;
    // What should be in it: the window ± margin, within the page.
    const doc = document.documentElement;
    const docH = Math.max(doc.scrollHeight, doc.clientHeight);
    const needTop = Math.max(0, window.scrollY - g.margin);
    const needBottom = Math.min(docH, window.scrollY + window.innerHeight + g.margin);
    const covered = snapshot.canvas && needTop >= top - 1 && needBottom <= bottom + 1;
    if (!covered || boxScrolled) scheduleSnapshot(250);
    return;
  }
  // Only when it's needed: glass that scrolls WITH the page (tab bars in a
  // page, panels) keeps the same page area under it, which the picture
  // already has. A retake (~300 ms of snapDOM work, in pieces) after every
  // scroll stalled the glass whenever the next scroll began during it. Glass
  // pinned to the window, or glass that scrolled in from outside the picture,
  // still gets one.
  if (boxScrolled || (moved > g.margin / 2 && !pictureCoversGlass())) scheduleSnapshot(250);
}

/**
 * (1.5.3) A floating canvas just drew glass that refracts the page picture:
 * make sure there is one that covers it. Pictures are otherwise only asked
 * for by changes inside the glass root, scrolling and resizing — glass that
 * APPEARS in the shared overlay (a bottom sheet, a toast, a tooltip: outside
 * the root, data-glass-ignore) changes none of those. On a page whose other
 * floating glass is all live (Chromium) no picture was ever taken, and the
 * sheet / toasts refracted only the page background (or backdrop photo),
 * never the HTML behind them. Cheap: nothing while a picture is already on
 * its way or being taken, and only a box check when one exists.
 */
export function needPicture() {
  if (!started || pendingSince || busy) return;
  if (snapshot.canvas && pictureCoversGlass()) return;
  scheduleSnapshot();
}

/** Does the current picture (slid by the scroll since it was taken) cover all floating WebGL glass now on screen? */
function pictureCoversGlass() {
  if (!snapshot.canvas) return false;
  const dx = window.scrollX - snapshot.scrollX;
  const dy = window.scrollY - snapshot.scrollY;
  const left = snapshot.x - dx;
  const top = snapshot.y - dy;
  const right = left + snapshot.w;
  const bottom = top + snapshot.h;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const pad = 24; // room for the rim to bend in a little page from round the glass
  for (const e of allEntries()) {
    if (placement(e.id).layer === 'base' || e.liveMode) continue;
    const r = e.el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue; // off screen: not needed now
    // (clamped to what a picture can hold: the window's width, the page's height)
    const docBottom = Math.max(document.documentElement.scrollHeight, document.documentElement.clientHeight) - window.scrollY;
    const nl = Math.max(0, r.left - pad);
    const nr = Math.min(vw, r.right + pad);
    const nt = Math.max(-window.scrollY, r.top - pad);
    const nb = Math.min(docBottom, r.bottom + pad);
    if (nl < left - 1 || nt < top - 1 || nr > right + 1 || nb > bottom + 1) return false;
  }
  return true;
}
function onResize() {
  scheduleSnapshot(250);
}
