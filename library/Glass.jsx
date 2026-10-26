/**
 * =============================================================================
 * glass/Glass.jsx — <Glass>: an element with a glass background, in one line
 * =============================================================================
 *   <Glass as="button" group="button" icon="phone" onClick={call}>Call</Glass>
 *   <Glass group="card" glass={{ tint: '#e0e7ff', tintOpacity: 0.7 }}>…</Glass>
 *
 *   as        element or component to render (default "div")
 *   group     config group in glass.config.json (default "panel")
 *   glass     per-element overrides of any glass property
 *   icon      optional icon drawn before the children: a React element
 *             (<svg>…</svg>, <MyIcon/>), or an icon NAME — names are drawn by
 *             the renderIcon function given to <GlassProvider renderIcon>
 *             (e.g. your app's own <Icon name size /> component)
 *   iconSize  icon size in px for named icons (default 16; the config's
 *             iconSize wins when set)
 *   …rest     passed to the element (className, onClick, aria-*…)
 *
 * Text and icons are ordinary HTML on top of the glass, so they stay crisp,
 * selectable and accessible.
 * =============================================================================
 */
import { forwardRef, useCallback, useRef } from 'react';
import { useGlass } from './useGlass';
import { getIconRenderer } from './registry';

const Glass = forwardRef(function Glass({ as: Tag = 'div', group = 'panel', glass, icon, iconSize = 16, children, ...rest }, forwarded) {
  const ref = useRef(null);
  useGlass(ref, group, glass);
  // Keep our ref and the caller's ref both pointing at the element.
  const setRef = useCallback(
    (node) => {
      ref.current = node;
      if (typeof forwarded === 'function') forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [forwarded]
  );
  return (
    <Tag ref={setRef} {...rest}>
      {renderIcon(icon, iconSize)}
      {children}
    </Tag>
  );
});

/** icon prop → what to draw (see the header). */
let warnedNoRenderer = false;
function renderIcon(icon, size) {
  if (icon == null || icon === false || icon === '') return null;
  if (typeof icon !== 'string') return icon; // already an element
  const render = getIconRenderer();
  if (render) return render(icon, size);
  if (!warnedNoRenderer) {
    warnedNoRenderer = true;
    console.warn(`glass: <Glass icon="${icon}"> needs <GlassProvider renderIcon={(name, size) => …}> to draw named icons (or pass an element as icon)`);
  }
  return null;
}

export default Glass;
