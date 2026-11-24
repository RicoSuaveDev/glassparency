/**
 * =============================================================================
 * glass/blendGroup.js — Glass that melts together: <GlassGroup spacing={…}>
 * =============================================================================
 *   const group = createGlassGroup(toolbar, { spacing: 24 });   // plain JS
 *   group.setSpacing(40);  group.destroy();
 *   <GlassGroup spacing={24}>…glass buttons…</GlassGroup>        // React
 *   <div data-glassparency-group="24">…</div>                    // script build
 *
 * Like Apple's GlassEffectContainer: every glass element INSIDE the group's
 * container element is drawn as one liquid surface — one smooth-minimum
 * blended distance field (the liquid shader the `morph` option already
 * uses, GlassCanvas.jsx makeLiquidMaterial) — so pieces that come within
 * `spacing` px of each other melt into one blob, and pull apart again as they
 * move away, in real time while they animate (CSS transitions, springs,
 * drags: the glass follows every frame).
 *
 * spacing → melt: the shader's smooth minimum with reach k joins two edges
 * that are g px apart once g ≤ k / 2 (at the midpoint both distances are
 * g/2 and the blend takes k/4 off), so k = 2 × spacing: a bridge forms
 * exactly when the gap closes to `spacing`, with a soft bulge starting
 * before that.
 *
 * Who belongs: glass elements whose NEAREST group container is this one
 * (nested groups are separate), drawn on the same layer and tier (glass on
 * a card and the card itself never melt — they're in different strata).
 * The container itself can have glass of its own; it is not a member.
 *
 * CAP: at most 16 members per group are melted together (the liquid
 * shader's uniform arrays — MAX_LIQUID in GlassCanvas.jsx — and its per-pixel
 * loop); members past that are drawn as separate liquid glass that doesn't
 * melt. Of those, at most 4 can have custom shapes (shape.path / svg /
 * text — one texture slot each); further custom shapes draw on their own.
 *
 * Fallbacks: where WebGL isn't drawing (CSS glass, no WebGL), every member
 * keeps its own CSS glass — separate pieces, no melting. Live (SVG) glass
 * can't melt, so group members are always drawn by WebGL.
 *
 * Cost: none for pages without groups (groupOf() returns at once); with
 * groups, one closest() per glass element per frame.
 * =============================================================================
 */
import { glassLayersChanged, requestRender } from './registry';
import { scheduleLiveSync } from './live';

/** The attribute on a group container: its spacing in px. */
export const GROUP_ATTR = 'data-glass-blend';
const DEFAULT_SPACING = 24;
const MAX_SPACING = 200;

let live = 0; // containers with a group right now (0 → groupOf is free)
const ids = new WeakMap(); // container → its group id
let nextId = 1;

/**
 * The group an element's glass belongs to, or null.
 * @param {HTMLElement} el  the glass element
 * @returns {{ id: number, spacing: number }|null}
 */
export function groupOf(el) {
  if (!live) return null;
  const host = el?.parentElement?.closest(`[${GROUP_ATTR}]`);
  if (!host) return null;
  const id = ids.get(host);
  if (!id) return null; // (marked by hand, not made by createGlassGroup)
  const n = Number(host.getAttribute(GROUP_ATTR));
  return { id, spacing: Number.isFinite(n) ? Math.min(MAX_SPACING, Math.max(0, n)) : DEFAULT_SPACING };
}

/**
 * Make `el` a glass group container: its glass children melt together.
 * @param {HTMLElement} el
 * @param {{ spacing?: number }} [opts]  spacing in px (default 24)
 * @returns {{ el: HTMLElement, setSpacing(px: number): void, destroy(): void }}
 */
export function createGlassGroup(el, opts = {}) {
  if (!el || el.nodeType !== 1) return { el: el || null, setSpacing() {}, destroy() {} };
  const set = (px) => {
    const n = Number(px);
    el.setAttribute(GROUP_ATTR, String(Number.isFinite(n) ? Math.min(MAX_SPACING, Math.max(0, n)) : DEFAULT_SPACING));
    requestRender();
  };
  if (!ids.has(el)) ids.set(el, nextId++);
  live += 1;
  set(opts.spacing ?? DEFAULT_SPACING);
  // Members can't be live (SVG) glass: re-pick every element's renderer —
  // and their layer (registry.js liquidNeedsFloat may move them to float).
  glassLayersChanged();
  scheduleLiveSync();
  let destroyed = false;
  return {
    el,
    /** Change the spacing (px) — e.g. animate it to pull pieces apart. */
    setSpacing(px) {
      if (!destroyed) set(px);
    },
    /** Stop melting: the members are separate glass again. */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      live -= 1;
      el.removeAttribute(GROUP_ATTR);
      glassLayersChanged(); // (back to their own layer)
      scheduleLiveSync();
      requestRender();
    },
  };
}
