/**
 * =============================================================================
 * glass/GlassScrollEdge.jsx — <GlassScrollEdge>: a scroll container with the
 * iOS 26 scroll edge effect (React; the plain-JS version is scrollEdge.js)
 * =============================================================================
 *   <GlassScrollEdge edges="top" effect="soft" inset={56} style={{ height: 400 }}>
 *     <header className="bar" style={{ position: 'sticky', top: 0, zIndex: 2 }}>…</header>
 *     …long content…
 *   </GlassScrollEdge>
 *
 * It renders the scroll container itself (a <div> unless `as` says
 * otherwise, overflow-y auto unless its style says otherwise) with the edge
 * layers' host as its first child — React owns that node, so re-renders never
 * fight over it. Props: edges, effect, size, inset, color (see scrollEdge.js);
 * every other prop goes to the container; the ref is the container.
 * A pinned bar INSIDE it needs z-index ≥ 2 to stay above the effect.
 * =============================================================================
 */
import { createElement, forwardRef, useEffect, useLayoutEffect, useRef } from 'react';
import { createScrollEdge } from './scrollEdge';

// (no layout effects on the server)
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const GlassScrollEdge = forwardRef(function GlassScrollEdge(
  { as = 'div', edges = 'top', effect = 'soft', size = 32, inset = 0, color = 'auto', style, children, ...rest },
  ref
) {
  const box = useRef(null);
  const host = useRef(null);
  const edge = useRef(null);
  const setBox = (node) => {
    box.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };
  // inset may be an object: compare by value so a literal doesn't re-paint every render.
  const insetKey = typeof inset === 'object' && inset ? `${inset.top ?? 0}|${inset.bottom ?? 0}` : String(inset);
  useIsoLayoutEffect(() => {
    if (!box.current || !host.current) return undefined;
    edge.current = createScrollEdge(box.current, { host: host.current, edges, effect, size, inset, color });
    return () => {
      edge.current?.destroy();
      edge.current = null;
    };
    // (made once per container; option changes go through update below)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useIsoLayoutEffect(() => {
    edge.current?.update({ edges, effect, size, inset, color });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, effect, size, insetKey, color]);
  return createElement(
    as,
    { ...rest, ref: setBox, style: { overflowY: 'auto', ...style } },
    createElement('div', { ref: host, 'data-gp-scroll-edge': 'box', 'aria-hidden': 'true' }),
    children
  );
});
