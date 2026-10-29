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
import { allEntries, isFloatingGlass, placement, requestRender, stats } from './registry';

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
  scheduleSnapshot(0);
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

/** Left out of the picture: floating glass (it's what looks AT the picture), the glass canvases and [data-glass-ignore]. */
const leftOut = (el) => el.matches('[data-glass-ignore], [data-glass-host]') || isFloatingGlass(el);
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
 * ctx.nodeMap (copy → original element) is snapDOM-internal (3.2.0); if a
 * future version drops it, nothing is hidden and we warn once.
 */
const hideLeftOut = {
  name: 'dp-glass-hide-left-out',
  afterClone(ctx) {
    const map = ctx.nodeMap;
    if (!(map instanceof Map)) {
      if (!warnedNodeMap) console.warn('glass: snapDOM nodeMap missing (snapDOM changed?) — floating glass is not hidden in page pictures');
      warnedNodeMap = true;
      return;
    }
    for (const [copy, original] of map) {
      if (original?.nodeType === 1 && copy?.style && leftOut(original)) copy.style.setProperty('opacity', '0', 'important');
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

async function take() {
  const g = getGlobal().snapshot;
  if (!g.enabled || !started) return;
  // Never mid-scroll (the picture would be torn): wait for scrolling to settle.
  if (performance.now() - lastScrollAt < 180) return scheduleSnapshot(200);
  if (busy) {
    again = true;
    return;
  }
  const root = glassRoot();
  const rect = captureRect();
  if (!root || !rect || rect.w < 1 || rect.h < 1) return;
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
      if (r.type === 'attributes') return !r.attributeName?.startsWith('data-glass'); // our own bookkeeping
      return true;
    });
    if (real) scheduleSnapshot();
  });
  if (root) observer.observe(root, { subtree: true, childList: true, characterData: true, characterDataOldValue: true, attributes: true });
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
    if (isFloatingGlass(el)) return true;
  }
  return false;
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

function onScroll() {
  lastScrollAt = performance.now();
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
    if (!covered || moved === 0) scheduleSnapshot(250);
    return;
  }
  if (moved > g.margin / 2 || moved === 0) scheduleSnapshot(250);
}
function onResize() {
  scheduleSnapshot(250);
}
