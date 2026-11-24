/**
 * =============================================================================
 * glass/power.js — Saving power: pause while hidden, calm down on low battery
 * =============================================================================
 *   global.powerSaving: true (default) | false
 *
 * Glass that nobody can see shouldn't cost anything, and a laptop about to
 * run flat shouldn't spend its last minutes on springy knobs. With
 * powerSaving on (the default):
 *
 *   hidden tab   document.hidden → no glass frames are drawn (registry.js
 *                requestRender keeps the request for later) and no page
 *                pictures are taken (snapshot.js). The moment the tab is
 *                shown again ONE redraw (and, if one was asked for, one
 *                picture) catches up — nothing is lost, nothing animates
 *                from a stale state. (Browsers already stop
 *                requestAnimationFrame in hidden tabs; this also stops the
 *                timer- and observer-driven work that would still run.)
 *   low battery  Battery Status API (Chromium: navigator.getBattery) says
 *                the battery is at or below LOW_BATTERY and NOT charging →
 *                glass animates as if "Reduce motion" were on: springs jump
 *                straight to where they're going, no press ripples, no
 *                liquid-morph films (reducedMotion() below, which every
 *                animation in the library asks). Plugging in, or the level
 *                rising again, brings the motion straight back.
 *
 * Always (with powerSaving on or off): the system "Reduce motion" setting
 * (prefers-reduced-motion: reduce) — that is an accessibility choice, not a
 * power one, so the switch below never turns it off.
 *
 * The battery is only a HINT: browsers without the API (Safari, Firefox)
 * simply never report "low", and a rejected getBattery() (permissions
 * policy) is ignored. getGlassPower() / subscribeGlassPower() report the
 * state for a status line / tuning panel.
 * =============================================================================
 */
import { getGlobal, subscribeConfig } from './config';

/** Battery fraction (0–1) at or below which an unplugged device counts as "low". */
export const LOW_BATTERY = 0.2;

const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';

// --- State ---------------------------------------------------------------------------------
let osReduced = false; // prefers-reduced-motion: reduce
let batteryLow = false; // the Battery Status API says: low and unplugged
let tabHidden = hasDocument ? Boolean(document.hidden) : false;
const listeners = new Set();

/** Is the powerSaving switch on? (Read live: configureGlass can flip it.) */
const savingOn = () => getGlobal().powerSaving !== false;

/**
 * Should animations skip straight to their end? The ONE place every animated
 * part of the library asks (controls, pickers, overlays, widgets, motion,
 * squish, ripple): the OS "Reduce motion" setting, or — with powerSaving on —
 * a low, unplugged battery.
 * (Reads matchMedia live as well, so a page that changes the setting while
 * no listener could be attached — very old Safari — still gets it.)
 */
export function reducedMotion() {
  if (!hasWindow) return false;
  if (osReduced) return true;
  if (savingOn() && batteryLow) return true;
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/** Is the tab hidden AND powerSaving on? (Then nothing should be drawn.) */
export const pausedWhileHidden = () => tabHidden && savingOn();

let snapshotCache = null;
/**
 * { enabled, hidden, reducedMotion, lowBattery } — stable between changes
 * (safe for useSyncExternalStore).
 *   enabled        global.powerSaving
 *   hidden         the tab is hidden (drawing is paused while enabled)
 *   reducedMotion  animations jump to their end right now (OS setting or low battery)
 *   lowBattery     the battery is low and unplugged (reported even when disabled)
 */
export function getGlassPower() {
  const next = { enabled: savingOn(), hidden: tabHidden, reducedMotion: reducedMotion(), lowBattery: batteryLow };
  if (
    !snapshotCache ||
    snapshotCache.enabled !== next.enabled ||
    snapshotCache.hidden !== next.hidden ||
    snapshotCache.reducedMotion !== next.reducedMotion ||
    snapshotCache.lowBattery !== next.lowBattery
  ) {
    snapshotCache = next;
  }
  return snapshotCache;
}
/** Called on every change (tab shown / hidden, battery, Reduce motion, the switch). */
export function subscribeGlassPower(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

// --- Watchers (set up once, when the module first loads in a browser) ----------------------------
if (hasDocument) {
  document.addEventListener('visibilitychange', () => {
    const h = Boolean(document.hidden);
    if (h === tabHidden) return;
    tabHidden = h;
    notify(); // (registry.js / snapshot.js catch up on "shown")
  });
}
if (hasWindow) {
  try {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq) {
      osReduced = Boolean(mq.matches);
      const onChange = () => {
        osReduced = Boolean(mq.matches);
        notify();
      };
      // (addListener: Safari < 14 has no addEventListener on MediaQueryList)
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else mq.addListener?.(onChange);
    }
  } catch {
    // (no matchMedia — never reduced)
  }
  // Battery Status API — Chromium only, and only in secure contexts. A hint:
  // nothing here may throw or block the page.
  try {
    const p = typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function' ? navigator.getBattery() : null;
    p?.then?.(
      (battery) => {
        const read = () => {
          const low = !battery.charging && Number.isFinite(battery.level) && battery.level <= LOW_BATTERY;
          if (low === batteryLow) return;
          batteryLow = low;
          notify();
        };
        battery.addEventListener?.('levelchange', read);
        battery.addEventListener?.('chargingchange', read);
        read();
      },
      () => {} // (blocked by a permissions policy: no battery hint)
    );
  } catch {
    // (getBattery threw: no battery hint)
  }
}
// The switch itself (configureGlass / hot reload) changes what's reported.
let lastSaving = null;
subscribeConfig(() => {
  const on = savingOn();
  if (on === lastSaving) return;
  lastSaving = on;
  notify();
});
