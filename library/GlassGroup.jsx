/**
 * =============================================================================
 * glass/GlassGroup.jsx — <GlassGroup> (glass that melts together) and
 *                        <GlassText> (big headline text made of glass)
 * =============================================================================
 *   <GlassGroup spacing={24} className="toolbar">
 *     <Glass as="button" group="iconButton">…</Glass>
 *     <Glass as="button" group="iconButton">…</Glass>
 *   </GlassGroup>
 *
 *   <GlassText as="h1" group="panel" style={{ fontSize: 120, fontWeight: 800 }}>
 *     Liquid
 *   </GlassText>
 *
 * GlassGroup renders a container element (`as`, default "div"; every other
 * prop goes to it) and makes it a glass group (blendGroup.js): the glass
 * inside melts into one liquid surface where pieces come within `spacing` px
 * of each other — and pulls apart again as they move away, live while they
 * animate. Like Apple's GlassEffectContainer. Up to 16 pieces melt per group
 * (see blendGroup.js for the cap and the fallbacks).
 *
 * GlassText renders its text with glass IN THE SHAPE OF THE LETTERS
 * (shape: { text }, sdfShape.js): the text is rasterized in the element's
 * own computed font into a distance field the glass shader draws, so the
 * rim bends the page through every glyph. The DOM text stays (selectable,
 * accessible) but is see-through while glass draws it. Big, bold type works
 * best — thin strokes are all rim. It's inline-block + white-space: pre by
 * default (one box the size of the text; "\n" starts a new line).
 * =============================================================================
 */
import { forwardRef, useCallback, useLayoutEffect, useRef } from 'react';
import { useGlass } from './useGlass';
import { createGlassGroup } from './blendGroup';

/** Keep our ref and the caller's ref both pointing at the element. */
function useMergedRef(ref, forwarded) {
  return useCallback(
    (node) => {
      ref.current = node;
      if (typeof forwarded === 'function') forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [ref, forwarded]
  );
}

export const GlassGroup = forwardRef(function GlassGroup({ as: Tag = 'div', spacing = 24, children, ...rest }, forwarded) {
  const ref = useRef(null);
  const group = useRef(null);
  // Made once per container (the children's glass attached in their own,
  // earlier, layout effects — they join as soon as the group exists).
  useLayoutEffect(() => {
    const g = createGlassGroup(ref.current, { spacing });
    group.current = g;
    return () => {
      g.destroy();
      if (group.current === g) group.current = null;
    };
    // (spacing changes go through setSpacing below — no re-create)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    group.current?.setSpacing(spacing);
  }, [spacing]);
  return (
    <Tag ref={useMergedRef(ref, forwarded)} {...rest}>
      {children}
    </Tag>
  );
});

const TEXT_STYLE = { display: 'inline-block', whiteSpace: 'pre' };

export const GlassText = forwardRef(function GlassText({ as: Tag = 'span', group = 'panel', glass, style, children, ...rest }, forwarded) {
  const ref = useRef(null);
  // A plain string goes into the props (a change re-draws the shape at once);
  // anything else (elements, numbers in fragments…) = the element's own text.
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : true;
  useGlass(ref, group, { ...(glass || {}), shape: { text } });
  return (
    <Tag ref={useMergedRef(ref, forwarded)} style={style ? { ...TEXT_STYLE, ...style } : TEXT_STYLE} {...rest}>
      {children}
    </Tag>
  );
});
