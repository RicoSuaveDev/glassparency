/**
 * =============================================================================
 * glass/useMotion.js — React hooks for shape springs and the liquid morph
 * =============================================================================
 *   // A card that springs between shapes whenever `shape` changes:
 *   const ref = useRef(null);
 *   useGlass(ref, 'card', { shape: 'roundedRectangle' });
 *   useShapeSpring(ref, expanded ? { width: 320, height: 200, radius: 28 }
 *                                : { width: 120, height: 120, radius: 60 });
 *
 *   // A panel that grows out of its button as liquid glass:
 *   const btn = useRef(null);
 *   const panel = useRef(null);
 *   useGlassMorph(btn, panel, open);       // open: true → morph in, false → out
 *   …
 *   <button ref={btn} onClick={() => setOpen((v) => !v)}>Menu</button>
 *   <div ref={panel} className="menu">…</div>   // rendered always; the hook hides it
 *
 * The engines are plain JS in motion.js (createShapeSpring, glassMorph).
 * =============================================================================
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createShapeSpring, glassMorph } from './motion';

/**
 * Spring the element to `shape` ({ width, height, radius } in px) whenever
 * it changes. The first shape is applied at once (no animation on mount).
 * @param {{ current: HTMLElement|null }} ref
 * @param {{ width?: number, height?: number, radius?: number }} shape
 * @param {{ stiffness?: number, damping?: number, radiusDamping?: number, onRest?: () => void }} [options]
 *        read when the element mounts
 */
export function useShapeSpring(ref, shape, options) {
  const springRef = useRef(null);
  const first = useRef(true);
  const optsRef = useRef(options);
  optsRef.current = options;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    springRef.current = createShapeSpring(el, { ...optsRef.current, onRest: () => optsRef.current?.onRest?.() });
    first.current = true;
    return () => {
      springRef.current?.destroy();
      springRef.current = null;
    };
  }, [ref]);
  const w = shape?.width;
  const h = shape?.height;
  const r = shape?.radius;
  useLayoutEffect(() => {
    springRef.current?.to({ width: w, height: h, radius: r }, { immediate: first.current });
    first.current = false;
  }, [w, h, r]);
  return springRef;
}

/**
 * Morph `toRef` out of `fromRef` when `open` turns true, and back into it
 * when it turns false. The hook owns the target's `hidden` attribute (don't
 * render `hidden` on it yourself): hidden while closed, shown while open.
 * @param {{ current: HTMLElement|null }} fromRef
 * @param {{ current: HTMLElement|null }} toRef
 * @param {boolean} open
 * @param {object} [options] glassMorph options (read on each open / close)
 */
export function useGlassMorph(fromRef, toRef, open, options) {
  const running = useRef(null);
  const optsRef = useRef(options);
  optsRef.current = options;
  const mounted = useRef(false);

  // Closed on mount: hide the target before the first paint.
  useLayoutEffect(() => {
    if (toRef.current && !open) toRef.current.hidden = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const from = fromRef.current;
    const to = toRef.current;
    if (!from || !to) return;
    if (!mounted.current) {
      mounted.current = true;
      if (open) to.hidden = false; // open from the start: no film
      return;
    }
    const track = (m) => {
      running.current = m;
      m.finished.then(() => {
        if (running.current === m) running.current = null;
      });
    };
    // A change mid-film: play the other way instead.
    if (running.current) {
      track(running.current.reverse());
      return;
    }
    if (open === !to.hidden) return; // already there
    track(glassMorph(from, to, { ...optsRef.current, direction: open ? 'in' : 'out' }));
  }, [open, fromRef, toRef]);

  // Unmount mid-film: stop it (its temporary shapes are removed).
  useEffect(() => () => running.current?.cancel(), []);
}
