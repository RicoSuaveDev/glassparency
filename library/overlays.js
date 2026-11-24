/**
 * =============================================================================
 * glass/overlays.js — Popover, menu, select, tooltip, sheet and toasts
 * =============================================================================
 * Liquid Glass things that appear OVER the page (no React needed):
 *
 * POPOVER   ONE glass panel that grows out of its button: it starts as the
 *           button (its box and look), springs out over it to full size,
 *           and shrinks back into it — no copies, no film. It stays inside
 *           the window and closes on Escape or a press outside it.
 * MENU      a popover of items: hover / arrow keys move a soft highlight
 *           that SLIDES between items (spring), Enter / click picks, letters
 *           jump to an item, Escape / Tab close.
 * SELECT    a menu that remembers its value (a ✓ on the picked option) and
 *           opens with the highlight on it.
 * TOOLTIP   a small glass capsule above the element after a short hover (or
 *           keyboard focus), popping in with a bounce. Once one has shown,
 *           the next shows at once (like macOS) for a moment.
 * SHEET     an iOS bottom sheet: rises from the bottom edge, rests at
 *           "detents" (fractions of the window height), drag its top to
 *           move it — a flick carries it to the next detent. The glass gets
 *           thicker / frostier and the page dims as it rises; drag it down
 *           (or tap the dimmed page, or Escape) to close.
 * TOASTS    banners that drop in from the top with a springy stretch, stack,
 *           and leave after a few seconds (paused while pressed / hovered);
 *           swipe one up to dismiss it.
 *
 * Layers: everything here must be above EVERYTHING on the page, so it lives
 * in one shared overlay on <body> that has its own glass canvas (layer
 * "modal", see <GlassLayerHost>) — registered only while something is
 * showing in it. Popover / menu panels are moved into it while open (and
 * back after). (On the page's "float" canvas, under the page's HTML, a
 * growing panel was hidden behind the page.) The overlay's background
 * colour is the sheet's dimmer, which the modal glass also refracts.
 *
 * Every create* function returns { open(), close(), …, destroy() }.
 * =============================================================================
 */
import { resolveGlass } from './config';
import { attachGlass } from './useGlass';
import { getEntry, registerHost, requestRender, update } from './registry';
import { stretchFor } from './squish';
import { blendLooks, capture, damp, makeLoop, propSetter, reducedMotion } from './controls';
import { spring } from './widgets';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const clamp01 = (n) => clamp(n, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const EDGE = 8; // px kept between an overlay and the window edge
let uid = 0;
const newId = (p) => `gp-${p}-${++uid}`;

// =============================================================================
// Shared overlay (tooltips, sheets, toasts)
// =============================================================================
let overlayEl = null;
let hostEl = null;
let users = 0;
let offHost = null;
/** The overlay element (made on first use). */
function overlay() {
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.setAttribute('data-gp-overlay', '');
    // The glass's own node (like its canvases' hosts): page pictures leave it
    // out and its changes don't start new ones. Needed where the glass root is
    // <body> (the script build's default): the overlay's moving panels would
    // otherwise be pictured — and refracted by themselves — and retaken
    // every frame they move. (They call requestRender() themselves.)
    overlayEl.setAttribute('data-glass-host', 'overlay');
    overlayEl.setAttribute('data-glass-ignore', '');
    // The modal glass canvas goes in here (its parent's background = the dimmer).
    hostEl = document.createElement('div');
    hostEl.setAttribute('data-glass-host', 'modal');
    hostEl.setAttribute('aria-hidden', 'true');
    Object.assign(hostEl.style, { position: 'fixed', inset: '0', zIndex: '0', pointerEvents: 'none' });
    overlayEl.appendChild(hostEl);
    document.body.appendChild(overlayEl);
  }
  return overlayEl;
}
/**
 * The shared overlay element (on <body>), e.g. for a React portal: a sheet
 * rendered straight into it is never moved by createSheet.
 */
export const getGlassOverlay = () => overlay();

// A new glass canvas takes ~0.7 s to start on a busy page (WebGL context,
// shaders, first size) and BLOCKS the page meanwhile — longer than a menu's
// whole morph, which then played on nothing and the panel just popped in.
// So the overlay's canvas is started ONCE, while the page is idle after the
// first overlay control appears (prewarm), and then kept. (LINGER_MS only
// matters if prewarm never ran.)
const LINGER_MS = 2500;
const READY_WAIT_MS = 300; // longest wait for the canvas before a film starts anyway
let lingerTimer = 0;
/** Something is showing (or about to) in the overlay: give it its glass canvas. */
function acquire() {
  overlay();
  clearTimeout(lingerTimer);
  users += 1;
  if (!offHost) offHost = registerHost('modal', hostEl);
}
/** …and nothing is any more (the canvas goes a little later). */
function release() {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  clearTimeout(lingerTimer);
  lingerTimer = setTimeout(() => {
    if (users === 0 && offHost) {
      offHost();
      offHost = null;
    }
  }, LINGER_MS);
}
let prewarmed = false;
/** Start the overlay's glass canvas when the page is idle, and keep it. */
function prewarm() {
  if (prewarmed || typeof window === 'undefined') return;
  prewarmed = true;
  const go = () => acquire(); // (never released: the canvas stays ready)
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(go, { timeout: 2500 });
  else setTimeout(go, 1200);
}

/**
 * cb() once the overlay's WebGL canvas is up and sized (r3f sets its CSS
 * size once it has measured), or after READY_WAIT_MS. At once where the
 * WebGL glass isn't running (CSS glass: nothing to wait for).
 */
function whenOverlayReady(cb) {
  if (document.documentElement.dataset.glass !== 'on') return cb();
  const t0 = performance.now();
  let raf = 0;
  const tick = () => {
    const c = hostEl?.querySelector('canvas');
    if ((c && c.style.width) || performance.now() - t0 > READY_WAIT_MS) cb();
    else raf = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(raf);
}

// =============================================================================
// Placement
// =============================================================================
/** Size of an element that may be hidden (shown invisibly for a moment). */
function measure(el) {
  const wasHidden = el.hidden;
  const vis = el.style.visibility;
  if (wasHidden) {
    el.style.visibility = 'hidden';
    el.hidden = false;
  }
  const size = { w: el.offsetWidth, h: el.offsetHeight };
  if (wasHidden) {
    el.hidden = true;
    el.style.visibility = vis;
  }
  return size;
}
/**
 * Window position for a box of size w × h next to rect r.
 * placement: 'bottom' | 'top' | 'auto' (below, unless only above fits);
 * align: 'start' | 'center' | 'end'.
 */
function placeBox(r, w, h, { placement = 'auto', align = 'start', offset = 8 } = {}) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = r.bottom + offset;
  const above = r.top - offset - h;
  let side = placement;
  if (side === 'auto') side = below + h <= vh - EDGE || above < EDGE ? 'bottom' : 'top';
  const top = side === 'bottom' ? below : above;
  let left = align === 'center' ? r.left + r.width / 2 - w / 2 : align === 'end' ? r.right - w : r.left;
  left = clamp(left, EDGE, Math.max(EDGE, vw - w - EDGE));
  return { left, top: clamp(top, EDGE, Math.max(EDGE, vh - h - EDGE)), side };
}

// =============================================================================
// Popover
// =============================================================================
/**
 * Liquid Glass popover: `pop` grows out of `anchor` (its button) — ONE glass.
 *
 * There is no film and no copy: the panel itself is the only glass that
 * moves. It starts exactly ON the button (the button's box and the button's
 * look — tint, frost, thickness…) and springs out to its own box and look,
 * covering the button the way iOS 26 menus do; its content fades in at the
 * end. The button's own glass is paused (and its label faded) for as long as
 * the panel stands in for it, so there are never two glasses or two labels
 * on screen. Closing plays it backwards: the panel lands exactly on the
 * button, and the button takes over again in that same frame.
 *
 * Moved with CSS `translate` + `scale` (every glass renderer follows the
 * element's on-screen box, as with squish): no layout per frame, and nothing
 * in the PAGE changes while it moves (the panel lives in the overlay, the
 * button is paused with data-glass-* / --gp-* only) — so no new page picture
 * is started mid-animation (on a big page that froze it for ~250 ms).
 *
 * @param {HTMLElement} anchor  the button that opens it (clicks toggle it)
 * @param {HTMLElement} pop     the panel (any content); glass is attached to it
 * @param {{ group?: string, props?: object, placement?: 'auto'|'bottom'|'top',
 *           align?: 'start'|'center'|'end', morph?: boolean,
 *           onOpenChange?: (open: boolean) => void, onShown?: () => void,
 *           focus?: 'first'|'panel'|'none', bindAnchor?: boolean }} [opts]
 *   placement  "bottom": opens downwards from the button's top edge; "top":
 *              upwards from its bottom edge; "auto" (default): down unless
 *              only up fits.
 */
export function createPopover(anchor, pop, opts = {}) {
  prewarm();
  const group = opts.group || 'popover';
  let onOpenChange = opts.onOpenChange;
  let isOpen = false;
  let home = null; // where the panel lives in the page while closed
  let held = false; // holding the overlay's glass canvas

  pop.setAttribute('data-gp-popover', '');
  if (!pop.id) pop.id = newId('pop');
  if (!pop.hasAttribute('role')) pop.setAttribute('role', 'dialog');
  if (!pop.hasAttribute('tabindex')) pop.tabIndex = -1;
  pop.hidden = true;
  anchor.setAttribute('aria-haspopup', pop.getAttribute('role') === 'dialog' ? 'dialog' : pop.getAttribute('role'));
  anchor.setAttribute('aria-expanded', 'false');
  anchor.setAttribute('aria-controls', pop.id);

  // The panel's glass: on the overlay's canvas (above the page), WebGL (it
  // blends from the button's look every frame).
  let props = opts.props || {};
  const fixedOf = () => ({ layer: 'modal', sampler: 'webgl', ...props });
  let glass = null;
  let setGlass = null;
  let looks = null; // { from: the button's resolved look, to: the panel's }
  const readLooks = () => {
    const to = resolveGlass(group, props);
    const id = Number(anchor.dataset.glassId);
    const e = id ? getEntry(id) : null;
    looks = { from: e ? resolveGlass(e.group, e.props) : to, to };
  };

  /** Into the overlay (open) / back into the page (closed). */
  const toOverlay = () => {
    if (!held) {
      acquire();
      held = true;
    }
    const ov = overlay();
    if (pop.parentNode !== ov) {
      home = { parent: pop.parentNode, next: pop.nextSibling };
      ov.appendChild(pop);
    }
  };
  const backHome = () => {
    if (home?.parent) home.parent.insertBefore(pop, home.next && home.next.parentNode === home.parent ? home.next : null);
    home = null;
    if (held) {
      release();
      held = false;
    }
  };

  // --- Boxes ------------------------------------------------------------------------------
  let F = null; // the button's box (window px, without its squish)
  let T = null; // the panel's open box
  /** The button's box without its squish (scale / translate round its centre). */
  const anchorBox = () => {
    const r = anchor.getBoundingClientRect();
    const num = (v, i, d) => {
      const parts = String(v || '').trim().split(/\s+/).filter((x) => x && x !== 'none');
      const n = parseFloat(parts[i] ?? parts[0]);
      return Number.isFinite(n) ? n : d;
    };
    const sx = num(anchor.style.scale, 0, 1) || 1;
    const sy = num(anchor.style.scale, 1, sx) || 1;
    const w = r.width / sx;
    const h = r.height / sy;
    const cx = r.left + r.width / 2 - num(anchor.style.translate, 0, 0);
    const cy = r.top + r.height / 2 - num(anchor.style.translate, 1, 0);
    return { left: cx - w / 2, top: cy - h / 2, width: w, height: h, right: cx + w / 2, bottom: cy + h / 2 };
  };
  /** Where the panel opens: over the button, growing down (or up) from it. */
  const place = () => {
    F = anchorBox();
    const { w, h } = measure(pop);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pl = opts.placement || 'auto';
    const down = pl === 'bottom' || (pl !== 'top' && (F.top + h <= vh - EDGE || F.bottom - h < EDGE));
    const align = opts.align || 'start';
    let left = align === 'center' ? F.left + F.width / 2 - w / 2 : align === 'end' ? F.right - w : F.left;
    left = clamp(left, EDGE, Math.max(EDGE, vw - w - EDGE));
    const top = clamp(down ? F.top : F.bottom - h, EDGE, Math.max(EDGE, vh - h - EDGE));
    T = { left, top, width: w || 1, height: h || 1 };
    Object.assign(pop.style, { position: 'fixed', left: `${left}px`, top: `${top}px`, transformOrigin: '0 0' });
    pop.setAttribute('data-gp-side', down ? 'bottom' : 'top');
  };

  // --- The button steps aside while the panel stands in for it ------------------------------
  let paused = false;
  const pauseAnchor = (on) => {
    if (on === paused) return;
    paused = on;
    const id = Number(anchor.dataset.glassId);
    if (id && getEntry(id)) update(id, { suspended: on });
    // (data-glass-* only: the page picture ignores it — see snapshot.js)
    if (on) anchor.setAttribute('data-glass-morphed', '');
    else anchor.removeAttribute('data-glass-morphed');
  };

  // --- The motion -------------------------------------------------------------------------
  // t: 0 = on the button (button look), 1 = open (panel look). Opening
  // springs past 1 a little (a liquid swell); closing lands without a bounce.
  const cur = { t: 0, v: 0 };
  let goal = 0;
  const smooth = (e0, e1, x) => {
    const u = clamp01((x - e0) / (e1 - e0));
    return u * u * (3 - 2 * u);
  };
  const render = () => {
    if (!F || !T) return;
    const t = Math.max(0, cur.t);
    const sx = Math.max(0.01, lerp(F.width / T.width, 1, t));
    const sy = Math.max(0.01, lerp(F.height / T.height, 1, t));
    const tx = lerp(F.left - T.left, 0, t);
    const ty = lerp(F.top - T.top, 0, t);
    pop.style.translate = `${tx.toFixed(2)}px ${ty.toFixed(2)}px`;
    pop.style.scale = `${sx.toFixed(4)} ${sy.toFixed(4)}`;
    // The look turns from the button's into the panel's early; the content
    // shows once it's nearly full size (and goes first when closing).
    if (setGlass && looks) setGlass(blendLooks(looks.from, looks.to, smooth(0, 0.55, t), pop));
    pop.style.setProperty('--gp-pop-content', smooth(0.6, 0.95, Math.min(1, t)).toFixed(3));
    requestRender();
  };
  const settle = () => {
    if (goal === 1) {
      anchor.setAttribute('aria-expanded', 'true');
      shown();
      return;
    }
    // Closed: the button is back (same frame), the panel goes.
    pauseAnchor(false);
    pop.hidden = true;
    pop.style.removeProperty('translate');
    pop.style.removeProperty('scale');
    // (Its glass stays attached — hidden, it isn't drawn: attaching a new
    // one on every open made every canvas re-pick its elements, a ~0.1 s
    // hitch right as the panel started to grow.)
    anchor.setAttribute('aria-expanded', 'false');
    backHome();
  };
  const loop = makeLoop((dt) => {
    if (reducedMotion() || opts.morph === false) {
      cur.t = goal;
      cur.v = 0;
    } else if (goal === 1) [cur.t, cur.v] = spring(cur.t, cur.v, 1, 340, 0.72, dt);
    else [cur.t, cur.v] = spring(cur.t, cur.v, 0, 520, 1, dt);
    const done = Math.abs(cur.t - goal) < 0.0015 && Math.abs(cur.v) < 0.02;
    if (done) {
      cur.t = goal;
      cur.v = 0;
    }
    render();
    if (done) settle();
    return !done;
  });

  /** Fully open: focus inside, tell the owner. */
  const shown = () => {
    if (!isOpen) return;
    if (opts.focus !== 'none') {
      const first = opts.focus === 'panel' ? null : pop.querySelector('[data-gp-autofocus], button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      (first || pop).focus({ preventScroll: true });
    }
    opts.onShown?.();
  };

  // Close on a press outside (the button itself toggles), Escape; follow scrolling.
  const outside = (e) => {
    if (!isOpen) return;
    if (pop.contains(e.target) || anchor.contains(e.target)) return;
    self.close(false);
  };
  const keys = (e) => {
    if (isOpen && e.key === 'Escape') {
      e.stopPropagation();
      self.close(true);
    }
  };
  const follow = () => {
    if (!isOpen) return;
    place();
    render();
  };
  const listen = (on) => {
    const f = on ? 'addEventListener' : 'removeEventListener';
    document[f]('pointerdown', outside, true);
    document[f]('keydown', keys, true);
    window[f]('scroll', follow, true);
    window[f]('resize', follow);
  };
  const toggle = (e) => {
    if (e?.defaultPrevented) return;
    if (isOpen) self.close(true);
    else self.open();
  };
  if (opts.bindAnchor !== false) anchor.addEventListener('click', toggle);

  let stopWait = null;
  const self = {
    get isOpen() {
      return isOpen;
    },
    open() {
      if (isOpen) return;
      isOpen = true;
      toOverlay();
      listen(true);
      onOpenChange?.(true);
      const start = () => {
        stopWait = null;
        if (!isOpen) return;
        readLooks();
        if (!glass) {
          glass = attachGlass(pop, group, { ...fixedOf(), ...blendLooks(looks.from, looks.to, 0, pop) });
          setGlass = propSetter(glass, fixedOf());
        }
        // From where it is now (a close cut short), or from the button.
        if (pop.hidden) {
          place();
          cur.t = 0;
          cur.v = 0;
          render();
          pop.hidden = false;
        } else place();
        // The panel now covers the button exactly: the button steps aside.
        pauseAnchor(true);
        goal = 1;
        loop.kick();
      };
      // A cold overlay canvas: wait for it (at most a moment), or the
      // panel's first frames would be drawn on nothing.
      stopWait?.();
      stopWait = whenOverlayReady(start);
    },
    /** refocus: give the focus back to the button (keyboard close). */
    close(refocus = false) {
      if (!isOpen) return;
      isOpen = false;
      stopWait?.();
      stopWait = null;
      listen(false);
      onOpenChange?.(false);
      if (refocus) anchor.focus({ preventScroll: true });
      if (pop.hidden) {
        backHome(); // (closed before it ever showed)
        return;
      }
      F = anchorBox(); // (land where the button is now)
      goal = 0;
      loop.kick();
    },
    toggle,
    /** Re-place it (after its content changed size). */
    reposition: follow,
    update(next = {}) {
      if (next.onOpenChange !== undefined) onOpenChange = next.onOpenChange;
      if (next.props) {
        props = next.props;
        if (glass) {
          readLooks();
          setGlass = propSetter(glass, fixedOf());
          render();
        }
      }
    },
    destroy() {
      loop.stop();
      stopWait?.();
      listen(false);
      isOpen = false;
      pauseAnchor(false);
      glass?.destroy();
      glass = null;
      pop.hidden = true;
      backHome();
      if (opts.bindAnchor !== false) anchor.removeEventListener('click', toggle);
      pop.removeAttribute('data-gp-popover');
      anchor.removeAttribute('aria-expanded');
    },
  };
  return self;
}

// =============================================================================
// Menu + select
// =============================================================================
const ITEM_SEL = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [data-gp-item]';

/**
 * Liquid Glass menu: a popover of items ([role=menuitem] buttons, or any
 * [data-gp-item]). An item with data-gp-keep-open doesn't close the menu.
 * @param {HTMLElement} anchor
 * @param {HTMLElement} menu
 * @param {{ onSelect?: (index: number, item: HTMLElement) => void, selected?: number,
 *           group?: string, props?: object, placement?: string, align?: string,
 *           onOpenChange?: (open: boolean) => void }} [opts]
 */
export function createMenu(anchor, menu, opts = {}) {
  let onSelect = opts.onSelect;
  let selected = Number.isInteger(opts.selected) ? opts.selected : -1;
  const listbox = menu.getAttribute('role') === 'listbox';
  if (!menu.hasAttribute('role')) menu.setAttribute('role', 'menu');
  menu.setAttribute('data-gp-menu', '');
  const items = () => [...menu.querySelectorAll(ITEM_SEL)].filter((n) => !n.hidden);

  // The sliding highlight (plain CSS: a soft pill under the items).
  const hl = document.createElement('span');
  hl.setAttribute('data-gp-menu-hl', '');
  hl.setAttribute('aria-hidden', 'true');
  menu.insertBefore(hl, menu.firstChild);
  let active = -1;
  const cur = { y: 0, vy: 0, h: 0, vh: 0, on: 0, x: 0, w: 0 };
  let jump = true; // first position: no slide in from nowhere

  const render = () => {
    Object.assign(hl.style, { top: `${cur.y}px`, height: `${Math.max(0, cur.h)}px`, left: `${cur.x}px`, width: `${cur.w}px` });
    hl.style.setProperty('--gp-on', cur.on.toFixed(3));
  };
  const loop = makeLoop((dt) => {
    const it = items()[active];
    const goalOn = it ? 1 : 0;
    if (it) {
      const gy = it.offsetTop;
      const gh = it.offsetHeight;
      cur.x = it.offsetLeft;
      cur.w = it.offsetWidth;
      if (jump || reducedMotion()) {
        Object.assign(cur, { y: gy, h: gh, vy: 0, vh: 0 });
        jump = false;
      } else {
        [cur.y, cur.vy] = spring(cur.y, cur.vy, gy, 900, 0.86, dt);
        [cur.h, cur.vh] = spring(cur.h, cur.vh, gh, 900, 0.86, dt);
      }
    }
    cur.on = damp(cur.on, goalOn, goalOn ? 0.03 : 0.06, dt);
    if (Math.abs(cur.on - goalOn) < 0.01) cur.on = goalOn;
    render();
    const g = it ? { y: it.offsetTop, h: it.offsetHeight } : null;
    return cur.on !== goalOn || (g && (Math.abs(cur.y - g.y) > 0.2 || Math.abs(cur.h - g.h) > 0.2 || Math.abs(cur.vy) > 1));
  });
  const setActive = (i, viaKeys) => {
    const its = items();
    active = i >= 0 && i < its.length ? i : -1;
    if (active < 0) jump = true;
    its.forEach((n, j) => (j === active ? n.setAttribute('data-gp-active', '') : n.removeAttribute('data-gp-active')));
    if (viaKeys && its[active]) its[active].focus({ preventScroll: false });
    loop.kick();
  };
  // Roving focus (WAI-ARIA menu / listbox): the items are reached with the
  // arrow keys, not Tab, so none of them is a Tab stop (tabindex −1; the
  // keys focus them by hand). Items that already have a tabindex keep it.
  const roved = new Set();
  const roveItems = () => {
    for (const n of items()) {
      if (n.hasAttribute('tabindex') && !roved.has(n)) continue;
      if (n.tabIndex !== -1) n.tabIndex = -1;
      roved.add(n);
    }
  };
  roveItems();
  const markSelected = () => {
    roveItems(); // (items may have been added since)
    items().forEach((n, j) => {
      const on = j === selected;
      if (listbox || n.getAttribute('role') === 'option') n.setAttribute('aria-selected', String(on));
      else if (n.getAttribute('role') === 'menuitemradio') n.setAttribute('aria-checked', String(on));
      if (on) n.setAttribute('data-gp-selected', '');
      else n.removeAttribute('data-gp-selected');
    });
  };
  markSelected();

  const pop = createPopover(anchor, menu, {
    group: 'menu',
    focus: 'none',
    ...opts,
    // (focus the item / menu once it's shown, so the keys work)
    onShown: () => (items()[active] || menu).focus({ preventScroll: true }),
    onOpenChange: (open) => {
      if (open) {
        markSelected();
        jump = true;
        setActive(selected >= 0 ? selected : keyOpen ? 0 : -1, false);
      } else setActive(-1);
      keyOpen = false;
      opts.onOpenChange?.(open);
    },
  });
  let keyOpen = false;

  const choose = (i) => {
    const it = items()[i];
    if (!it || it.getAttribute('aria-disabled') === 'true' || it.disabled) return;
    if (listbox || it.getAttribute('role') === 'option' || it.getAttribute('role') === 'menuitemradio') {
      selected = i;
      markSelected();
    }
    onSelect?.(i, it);
    if (!it.hasAttribute('data-gp-keep-open')) pop.close(true);
  };
  const hover = (e) => {
    if (e.pointerType === 'touch') return;
    const it = e.target.closest?.(ITEM_SEL);
    const i = items().indexOf(it);
    if (i !== active) setActive(i, false);
  };
  const leave = () => setActive(-1, false);
  const click = (e) => {
    const it = e.target.closest?.(ITEM_SEL);
    const i = items().indexOf(it);
    if (i >= 0) {
      e.preventDefault();
      choose(i);
    }
  };
  let typed = '';
  let typedAt = 0;
  const key = (e) => {
    const n = items().length;
    if (!n) return;
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (step) {
      e.preventDefault();
      setActive(active < 0 ? (step > 0 ? 0 : n - 1) : (active + step + n) % n, true);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : n - 1, true);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (active >= 0) choose(active);
    } else if (e.key === 'Tab') {
      // Close and give the focus back to the button first, so the browser's
      // own Tab move continues from there (the next control after the menu
      // button) — not from an item in the overlay at the end of <body>.
      // (Not when the focus is still ON the button: it moves on by itself.)
      pop.close(menu.contains(document.activeElement));
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Type-ahead: the next item starting with the letters typed (1 s window).
      const now = Date.now();
      typed = now - typedAt > 1000 ? e.key.toLowerCase() : typed + e.key.toLowerCase();
      typedAt = now;
      const its = items();
      for (let k = 1; k <= n; k++) {
        const j = (Math.max(active, 0) + (typed.length > 1 ? k - 1 : k)) % n;
        if (its[j].textContent.trim().toLowerCase().startsWith(typed)) {
          setActive(j, true);
          break;
        }
      }
    }
  };
  // On the button: ↓ / ↑ open it with the first (selected) item highlighted.
  const anchorKey = (e) => {
    // Open but the focus is still on the button (the film is playing): the keys still work.
    if (pop.isOpen) {
      if (e.key !== 'Escape') key(e);
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !pop.isOpen) {
      e.preventDefault();
      keyOpen = true;
      pop.open();
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Opened from the keyboard (the button's own click follows): start
      // with an item highlighted, so ↓ / ↑ / Enter work straight away.
      keyOpen = true;
    }
  };
  menu.addEventListener('pointermove', hover);
  menu.addEventListener('pointerleave', leave);
  menu.addEventListener('click', click);
  menu.addEventListener('keydown', key);
  anchor.addEventListener('keydown', anchorKey);

  return {
    get isOpen() {
      return pop.isOpen;
    },
    get selected() {
      return selected;
    },
    open: () => pop.open(),
    close: (refocus) => pop.close(refocus),
    toggle: () => pop.toggle(),
    update(next = {}) {
      if (next.onSelect !== undefined) onSelect = next.onSelect;
      if (Number.isInteger(next.selected) && next.selected !== selected) {
        selected = next.selected;
        markSelected();
      }
      pop.update(next);
    },
    destroy() {
      loop.stop();
      menu.removeEventListener('pointermove', hover);
      menu.removeEventListener('pointerleave', leave);
      menu.removeEventListener('click', click);
      menu.removeEventListener('keydown', key);
      anchor.removeEventListener('keydown', anchorKey);
      pop.destroy();
      hl.remove();
      for (const n of roved) if (n.isConnected) n.removeAttribute('tabindex');
      roved.clear();
      menu.removeAttribute('data-gp-menu');
    },
  };
}

/**
 * Liquid Glass select: a menu (role listbox) of options with data-value.
 * @param {HTMLElement} anchor
 * @param {HTMLElement} list
 * @param {{ value?: string, onChange?: (value: string, index: number) => void } & object} [opts]
 */
export function createSelect(anchor, list, opts = {}) {
  list.setAttribute('role', 'listbox');
  list.setAttribute('data-gp-select', '');
  let onChange = opts.onChange;
  const options = () => [...list.querySelectorAll(ITEM_SEL)];
  const indexOf = (v) => options().findIndex((o) => o.getAttribute('data-value') === String(v));
  for (const o of options()) if (!o.hasAttribute('role')) o.setAttribute('role', 'option');
  const menu = createMenu(anchor, list, {
    ...opts,
    selected: indexOf(opts.value),
    onSelect: (i, it) => onChange?.(it.getAttribute('data-value'), i),
  });
  return {
    get isOpen() {
      return menu.isOpen;
    },
    open: menu.open,
    close: menu.close,
    update(next = {}) {
      if (next.onChange !== undefined) onChange = next.onChange;
      menu.update({ ...next, onSelect: undefined, selected: next.value !== undefined ? indexOf(next.value) : undefined });
    },
    destroy() {
      menu.destroy();
      list.removeAttribute('data-gp-select');
    },
  };
}

// =============================================================================
// Tooltip
// =============================================================================
let warmUntil = 0; // a tooltip just closed: the next one shows at once

/**
 * Liquid Glass tooltip on `anchor`.
 * @param {HTMLElement} anchor
 * @param {{ text?: string, placement?: 'top'|'bottom', delay?: number, group?: string, props?: object }} [opts]
 */
export function createTooltip(anchor, opts = {}) {
  prewarm();
  const group = opts.group || 'tooltip';
  let text = opts.text ?? anchor.getAttribute('aria-label') ?? '';
  let props = opts.props || {};
  const delay = opts.delay ?? 500;
  const tip = document.createElement('div');
  tip.setAttribute('data-gp-tooltip', '');
  tip.setAttribute('role', 'tooltip');
  tip.id = newId('tip');
  tip.hidden = true;
  tip.textContent = text;
  const describedBy = () => anchor.setAttribute('aria-describedby', [anchor.getAttribute('aria-describedby'), tip.id].filter(Boolean).join(' '));
  describedBy();

  let glass = null;
  let showing = false;
  let timer = 0;
  const cur = { s: 0, v: 0 };
  const place = () => {
    const { w, h } = measure(tip);
    const p = placeBox(anchor.getBoundingClientRect(), w, h, { placement: opts.placement === 'bottom' ? 'bottom' : 'top', align: 'center', offset: 8 });
    // (if "top" doesn't fit, placeBox clamps it — flip instead)
    const r = anchor.getBoundingClientRect();
    const flip = opts.placement !== 'bottom' && r.top - 8 - h < EDGE;
    const top = flip ? r.bottom + 8 : p.top;
    Object.assign(tip.style, { left: `${p.left}px`, top: `${top}px`, transformOrigin: flip || opts.placement === 'bottom' ? '50% 0' : '50% 100%' });
  };
  const loop = makeLoop((dt) => {
    const goal = showing ? 1 : 0;
    if (reducedMotion()) cur.s = goal;
    else {
      // (not `[cur.s, cur.v] = spring(…)`: Next.js's minifier (SWC, Turbopack
      // build) turned that line into `[0,0]=…` — a syntax error that broke
      // `next build` for any page using the tooltip)
      const [s, v] = spring(cur.s, cur.v, goal, showing ? 520 : 900, showing ? 0.55 : 1, dt);
      cur.s = s;
      cur.v = v;
    }
    const s = 0.45 + 0.55 * Math.max(0, cur.s);
    tip.style.scale = `${s.toFixed(4)}`;
    tip.style.setProperty('--gp-on', clamp01(cur.s).toFixed(3));
    requestRender();
    const settled = Math.abs(cur.s - goal) < 0.002 && Math.abs(cur.v) < 0.01;
    if (settled && !showing) {
      // Gone: remove it and its glass, and hand back the overlay.
      tip.hidden = true;
      glass?.destroy();
      glass = null;
      tip.remove();
      release();
      return false;
    }
    return !settled;
  });
  const show = () => {
    clearTimeout(timer);
    if (showing || !text) return;
    showing = true;
    if (!tip.isConnected) {
      acquire();
      overlay().appendChild(tip);
    }
    tip.hidden = false;
    place();
    glass ||= attachGlass(tip, group, props);
    loop.kick();
  };
  const hide = () => {
    clearTimeout(timer);
    if (!showing) return;
    showing = false;
    warmUntil = Date.now() + 600;
    loop.kick();
  };
  const enter = (e) => {
    if (e.pointerType === 'touch') return;
    clearTimeout(timer);
    timer = setTimeout(show, Date.now() < warmUntil ? 0 : delay);
  };
  const focus = () => {
    // Keyboard focus only (a click focuses too, and shouldn't pop a tip).
    // (focusin: the anchor may be a wrapper round the focused element)
    if (anchor.matches(':focus-visible') || anchor.querySelector(':focus-visible')) show();
  };
  const esc = (e) => e.key === 'Escape' && hide();
  anchor.addEventListener('pointerenter', enter);
  anchor.addEventListener('pointerleave', hide);
  anchor.addEventListener('pointerdown', hide);
  anchor.addEventListener('focusin', focus);
  anchor.addEventListener('focusout', hide);
  anchor.addEventListener('keydown', esc);

  return {
    show,
    hide,
    update(next = {}) {
      if (next.text !== undefined) {
        text = next.text;
        tip.textContent = text;
      }
      if (next.props) {
        props = next.props;
        glass?.setProps(props);
      }
    },
    destroy() {
      clearTimeout(timer);
      loop.stop();
      anchor.removeEventListener('pointerenter', enter);
      anchor.removeEventListener('pointerleave', hide);
      anchor.removeEventListener('pointerdown', hide);
      anchor.removeEventListener('focusin', focus);
      anchor.removeEventListener('focusout', hide);
      anchor.removeEventListener('keydown', esc);
      anchor.setAttribute('aria-describedby', (anchor.getAttribute('aria-describedby') || '').split(' ').filter((t) => t && t !== tip.id).join(' '));
      if (tip.isConnected) {
        glass?.destroy();
        tip.remove();
        release();
      }
    },
  };
}

// =============================================================================
// Sheet
// =============================================================================
/**
 * iOS-style Liquid Glass bottom sheet. `sheet` is the panel with your
 * content; it is moved into the overlay while open (and back when closed).
 * The top 44 px (and anything marked [data-gp-sheet-handle]) drags it.
 * @param {HTMLElement} sheet
 * @param {{ detents?: number[], onClose?: () => void, onDetentChange?: (index: number) => void,
 *           dim?: number, groups?: { rest?: string, full?: string }, props?: object }} [opts]
 */
export function createSheet(sheet, opts = {}) {
  prewarm();
  const groups = { rest: 'sheet', full: 'sheetFull', ...(opts.groups || {}) };
  let props = opts.props || {};
  let detents = [...(opts.detents || [0.45, 0.92])].map((d) => clamp(d, 0.1, 1)).sort((a, b) => a - b);
  let onClose = opts.onClose;
  let onDetentChange = opts.onDetentChange;
  const dim = opts.dim ?? 0.32;
  const home = { parent: sheet.parentNode, next: sheet.nextSibling };

  sheet.setAttribute('data-gp-sheet', '');
  if (!sheet.hasAttribute('role')) sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  if (!sheet.hasAttribute('tabindex')) sheet.tabIndex = -1;
  sheet.hidden = true;
  const grabber = document.createElement('span');
  grabber.setAttribute('data-gp-sheet-grabber', '');
  grabber.setAttribute('aria-hidden', 'true');
  sheet.insertBefore(grabber, sheet.firstChild);
  // Taps on the dimmed page close it.
  const scrim = document.createElement('div');
  scrim.setAttribute('data-gp-sheet-scrim', '');

  let glass = null;
  let setGlass = null;
  let looks = null;
  const readLooks = () => {
    looks = { rest: resolveGlass(groups.rest, props), full: resolveGlass(groups.full, { style: resolveGlass(groups.rest, props).style, ...props }) };
  };
  let isOpen = false;
  let detent = 0; // index the sheet is resting at / heading to
  const cur = { y: 0, v: 0 }; // y = visible height (px), v = its speed (px/s)
  let goal = 0; // px
  let press = null; // { id, start, startY, samples: [{t, y}] }
  let lastFocus = null;
  let held = false; // holding the overlay's glass canvas

  const vh = () => window.innerHeight;
  const maxH = () => detents[detents.length - 1] * vh();
  const render = () => {
    const H = vh();
    const top = detents[detents.length - 1];
    const lo = detents[0];
    const frac = cur.y / H; // shown fraction of the window
    // t: 0 at the lowest detent … 1 at the highest (look, dimmer, side inset).
    const t = detents.length > 1 ? clamp01((frac - lo) / (top - lo)) : 1;
    const inset = lerp(10, 0, t);
    Object.assign(sheet.style, { height: `${maxH()}px`, top: `${H - cur.y}px`, left: `${inset}px`, right: `${inset}px` });
    // Below its lowest detent (closing) the dimmer fades with it.
    const k = Math.min(1, frac / lo);
    overlayEl.style.backgroundColor = `rgba(0, 0, 0, ${(dim * lerp(0.35, 1, t) * k).toFixed(3)})`;
    if (looks && setGlass) setGlass(blendLooks(looks.rest, looks.full, t, sheet));
    sheet.style.setProperty('--gp-sheet-t', t.toFixed(3));
    requestRender();
  };
  const loop = makeLoop((dt) => {
    if (press) return true; // (the finger moves it: see move)
    if (reducedMotion()) {
      cur.y = goal;
      cur.v = 0;
    } else [cur.y, cur.v] = spring(cur.y, cur.v, goal, 260, 0.86, dt);
    const settled = Math.abs(cur.y - goal) < 0.4 && Math.abs(cur.v) < 4;
    if (settled) {
      cur.y = goal;
      cur.v = 0;
    }
    render();
    if (settled && !isOpen) finishClose();
    return !settled;
  });

  const keys = (e) => {
    if (isOpen && e.key === 'Escape') {
      e.stopPropagation();
      self.close();
    } else if (isOpen && e.key === 'Tab') trapTab(e);
  };
  // aria-modal: the page behind is out of reach while the sheet is open, so
  // Tab / Shift+Tab cycle through the sheet's own controls (and land back
  // in it if the focus was somewhere else) instead of walking off into the
  // dimmed page.
  const TABBABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
  const trapTab = (e) => {
    const all = [...sheet.querySelectorAll(TABBABLE)].filter((n) => !n.hidden && n.getClientRects().length > 0);
    const first = all[0];
    const last = all[all.length - 1];
    const at = document.activeElement;
    if (!first) {
      e.preventDefault(); // (nothing to tab to: stay on the sheet)
      sheet.focus({ preventScroll: true });
    } else if (!sheet.contains(at)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus({ preventScroll: true });
    } else if (e.shiftKey && (at === first || at === sheet)) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  };
  const finishClose = () => {
    sheet.hidden = true;
    scrim.remove();
    glass?.destroy();
    glass = null;
    setGlass = null;
    overlayEl.style.backgroundColor = '';
    // Back where it came from (React keeps owning it there).
    if (home.parent && home.parent !== overlayEl) home.parent.insertBefore(sheet, home.next && home.next.parentNode === home.parent ? home.next : null);
    if (held) {
      release();
      held = false;
    }
    lastFocus?.focus?.({ preventScroll: true });
  };

  // --- Drag -----------------------------------------------------------------------------
  const onHandle = (e) => {
    if (e.target.closest?.('[data-gp-sheet-handle]')) return true;
    if (e.target.closest?.('button, a, input, textarea, select, [role="slider"], [contenteditable]')) return false;
    return e.clientY - sheet.getBoundingClientRect().top <= 44;
  };
  const down = (e) => {
    if (!isOpen || (e.pointerType === 'mouse' && e.button !== 0) || !onHandle(e)) return;
    capture(sheet, e.pointerId);
    press = { id: e.pointerId, start: e.clientY, startY: cur.y, samples: [{ t: performance.now(), y: cur.y }] };
    e.preventDefault();
  };
  const move = (e) => {
    if (!press || e.pointerId !== press.id) return;
    let y = press.startY - (e.clientY - press.start);
    // Above the highest detent: rubber band.
    const hi = maxH();
    if (y > hi) y = hi + 40 * Math.tanh((y - hi) / 120);
    cur.y = Math.max(0, y);
    press.samples.push({ t: performance.now(), y: cur.y });
    if (press.samples.length > 6) press.samples.shift();
    render();
  };
  const up = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const s = press.samples;
    const a = s[0];
    const b = s[s.length - 1];
    const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0; // px/s (up = +)
    press = null;
    cur.v = v;
    // Where the flick would carry it (~0.18 s of travel), then the nearest detent.
    const H = vh();
    const aim = cur.y + v * 0.18;
    if (aim < detents[0] * H * 0.55 || (v < -900 && detent === 0)) {
      self.close();
      return;
    }
    let best = 0;
    detents.forEach((d, i) => {
      if (Math.abs(d * H - aim) < Math.abs(detents[best] * H - aim)) best = i;
    });
    snapTo(best);
  };
  const snapTo = (i) => {
    const changed = i !== detent;
    detent = clamp(i, 0, detents.length - 1);
    goal = detents[detent] * vh();
    loop.kick();
    if (changed) onDetentChange?.(detent);
  };
  const resize = () => {
    if (!isOpen) return;
    goal = detents[detent] * vh();
    loop.kick();
  };
  sheet.addEventListener('pointerdown', down);
  sheet.addEventListener('pointermove', move);
  sheet.addEventListener('pointerup', up);
  sheet.addEventListener('pointercancel', up);
  sheet.addEventListener('lostpointercapture', up);
  const scrimTap = () => self.close();
  scrim.addEventListener('click', scrimTap);

  const self = {
    get isOpen() {
      return isOpen;
    },
    get detent() {
      return detent;
    },
    /** Open it (at detent index i, default the lowest). */
    open(i = 0) {
      if (isOpen) {
        snapTo(i);
        return;
      }
      if (!held) {
        acquire();
        held = true;
      }
      isOpen = true;
      lastFocus = document.activeElement;
      const ov = overlay();
      if (!scrim.isConnected) ov.appendChild(scrim);
      if (sheet.parentNode !== ov) ov.appendChild(sheet);
      sheet.hidden = false;
      readLooks();
      if (!glass) {
        glass = attachGlass(sheet, groups.rest, { ...props, ...blendLooks(looks.rest, looks.full, 0, sheet) });
        setGlass = propSetter(glass, props);
      }
      document.addEventListener('keydown', keys, true);
      window.addEventListener('resize', resize);
      detent = clamp(i, 0, detents.length - 1);
      goal = detents[detent] * vh();
      if (cur.y <= 0) cur.y = 0;
      render();
      loop.kick();
      requestAnimationFrame(() => sheet.focus({ preventScroll: true }));
    },
    /** Slide it away (calls onClose). */
    close() {
      if (!isOpen) return;
      isOpen = false;
      document.removeEventListener('keydown', keys, true);
      window.removeEventListener('resize', resize);
      goal = 0;
      loop.kick();
      onClose?.();
    },
    snapTo,
    update(next = {}) {
      if (next.onClose !== undefined) onClose = next.onClose;
      if (next.onDetentChange !== undefined) onDetentChange = next.onDetentChange;
      if (Array.isArray(next.detents) && next.detents.length) detents = [...next.detents].sort((a, b) => a - b);
      if (next.props) {
        props = next.props;
        readLooks();
        setGlass = glass ? propSetter(glass, props) : null;
        if (isOpen) render();
      }
    },
    destroy() {
      loop.stop();
      document.removeEventListener('keydown', keys, true);
      window.removeEventListener('resize', resize);
      sheet.removeEventListener('pointerdown', down);
      sheet.removeEventListener('pointermove', move);
      sheet.removeEventListener('pointerup', up);
      sheet.removeEventListener('pointercancel', up);
      sheet.removeEventListener('lostpointercapture', up);
      scrim.removeEventListener('click', scrimTap);
      if (held) {
        isOpen = false;
        finishClose();
      }
      grabber.remove();
      sheet.removeAttribute('data-gp-sheet');
    },
  };
  return self;
}

// =============================================================================
// Toasts
// =============================================================================
/**
 * A stack of Liquid Glass toasts (banners) at the top of the window.
 * @param {{ group?: string, max?: number, duration?: number }} [opts]
 * Screen readers: each toast's title + body is read out through a live
 * region — politely (role "status", the default) or straight away
 * (`role: "alert"`, for errors). The regions are visually hidden and stay in
 * the page for the toaster's whole life: a live region that is added
 * together with its text is often not read at all (the visible stack comes
 * and goes with its toasts, so it can't be the live region itself).
 * @returns {{ show(t: { title?: string, body?: string, icon?: Element|string, duration?: number,
 *           role?: 'status'|'alert', props?: object }): () => void, clear(): void, destroy(): void }}
 */
export function createToaster(opts = {}) {
  prewarm();
  const group = opts.group || 'toast';
  const max = opts.max ?? 3;
  const stack = document.createElement('div');
  stack.setAttribute('data-gp-toasts', '');
  // The announcers (see above): one polite, one assertive.
  const SR_ONLY = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
  const announcer = (role) => {
    const n = document.createElement('div');
    n.setAttribute('data-gp-toast-announcer', role);
    n.setAttribute('role', role);
    n.setAttribute('aria-live', role === 'alert' ? 'assertive' : 'polite');
    n.setAttribute('aria-atomic', 'true');
    n.style.cssText = SR_ONLY;
    document.body.appendChild(n);
    return n;
  };
  const live = { status: announcer('status'), alert: announcer('alert') };
  let clearLive = 0;
  /** Read a toast out: swap the region's text (cleared again later, so the same text twice is still read). */
  const announce = (role, text) => {
    if (!text) return;
    const n = role === 'alert' ? live.alert : live.status;
    n.textContent = '';
    // (A beat after clearing: a region whose text is replaced in the same
    // task is sometimes not re-read.)
    setTimeout(() => {
      n.textContent = text;
    }, 50);
    clearTimeout(clearLive);
    clearLive = setTimeout(() => {
      live.status.textContent = '';
      live.alert.textContent = '';
    }, 7000);
  };
  const toasts = []; // { el, glass, y, vy, goal, gone, timer, left, press, dx }
  let mounted = false;

  const layout = () => {
    let y = 0;
    for (const t of toasts) {
      if (t.gone) continue;
      t.goal = y;
      y += t.el.offsetHeight + 8;
    }
  };
  const loop = makeLoop((dt) => {
    let busy = false;
    for (const t of [...toasts]) {
      const goal = t.gone ? -(t.el.offsetHeight + 40) : t.press ? t.drag : t.goal;
      if (reducedMotion()) {
        t.y = goal;
        t.vy = 0;
      } else if (!t.press) [t.y, t.vy] = spring(t.y, t.vy, goal, t.gone ? 380 : 300, t.gone ? 1 : 0.62, dt);
      else t.y = goal;
      // Stretched along its fall by its speed (a liquid drop), never squashed flat.
      const st = stretchFor(0, t.vy, Math.min(0.12, Math.abs(t.vy) * 0.00018));
      Object.assign(t.el.style, { translate: `-50% ${t.y.toFixed(2)}px`, scale: `${st.sx.toFixed(4)} ${st.sy.toFixed(4)}` });
      const settled = !t.press && Math.abs(t.y - goal) < 0.3 && Math.abs(t.vy) < 3;
      if (t.gone && (settled || t.y < -(t.el.offsetHeight + 20))) {
        toasts.splice(toasts.indexOf(t), 1);
        t.glass.destroy();
        t.el.remove();
        continue;
      }
      if (!settled) busy = true;
    }
    requestRender();
    if (!toasts.length && mounted) {
      stack.remove();
      mounted = false;
      release();
    }
    return busy;
  });
  const dismiss = (t) => {
    if (t.gone) return;
    t.gone = true;
    clearTimeout(t.timer);
    layout();
    loop.kick();
  };
  const arm = (t) => {
    clearTimeout(t.timer);
    if (t.duration > 0) t.timer = setTimeout(() => dismiss(t), t.duration);
  };

  const self = {
    show({ title = '', body = '', icon = null, duration, role = 'status', props = {} } = {}) {
      if (!mounted) {
        acquire();
        overlay().appendChild(stack);
        mounted = true;
      }
      const el = document.createElement('div');
      el.setAttribute('data-gp-toast', '');
      if (icon) {
        const ic = document.createElement('span');
        ic.setAttribute('data-gp-toast-icon', '');
        if (typeof icon === 'string') ic.innerHTML = icon;
        else ic.appendChild(icon.cloneNode(true));
        el.appendChild(ic);
      }
      const txt = document.createElement('span');
      txt.setAttribute('data-gp-toast-text', '');
      if (title) {
        const b = document.createElement('strong');
        b.textContent = title;
        txt.appendChild(b);
      }
      if (body) {
        const s = document.createElement('span');
        s.textContent = body;
        txt.appendChild(s);
      }
      el.appendChild(txt);
      // (Read out by the announcer — the visible copy is skipped, or it'd be read twice.)
      el.setAttribute('aria-hidden', 'true');
      announce(role, [title, body].filter(Boolean).join('. '));
      stack.insertBefore(el, stack.firstChild);
      const t = { el, glass: attachGlass(el, group, props), y: -120, vy: 0, goal: 0, gone: false, timer: 0, duration: duration ?? opts.duration ?? 4000, press: null, drag: 0 };
      toasts.unshift(t);
      // Too many: the oldest leave.
      toasts.filter((x) => !x.gone).slice(max).forEach(dismiss);
      layout();
      arm(t);
      // Hold to keep it; swipe it up to send it away.
      el.addEventListener('pointerenter', () => clearTimeout(t.timer));
      el.addEventListener('pointerleave', () => !t.press && !t.gone && arm(t));
      el.addEventListener('pointerdown', (e) => {
        capture(el, e.pointerId);
        clearTimeout(t.timer);
        t.press = { id: e.pointerId, start: e.clientY, y0: t.y };
        t.drag = t.y;
      });
      el.addEventListener('pointermove', (e) => {
        if (!t.press || e.pointerId !== t.press.id) return;
        const d = e.clientY - t.press.start;
        // Up: follows the finger; down: only a little (rubber band).
        t.drag = t.press.y0 + (d < 0 ? d : 18 * Math.tanh(d / 60));
        loop.kick();
      });
      const lift = (e) => {
        if (!t.press || e.pointerId !== t.press.id) return;
        const d = e.clientY - t.press.start;
        t.press = null;
        if (d < -24) dismiss(t);
        else {
          arm(t);
          loop.kick();
        }
      };
      el.addEventListener('pointerup', lift);
      el.addEventListener('pointercancel', lift);
      loop.kick();
      return () => dismiss(t);
    },
    clear() {
      toasts.forEach(dismiss);
    },
    destroy() {
      loop.stop();
      clearTimeout(clearLive);
      live.status.remove();
      live.alert.remove();
      for (const t of toasts) {
        clearTimeout(t.timer);
        t.glass.destroy();
        t.el.remove();
      }
      toasts.length = 0;
      if (mounted) {
        stack.remove();
        mounted = false;
        release();
      }
    },
  };
  return self;
}
