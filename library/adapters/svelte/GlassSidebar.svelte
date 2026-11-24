<!--
  =============================================================================
  glassparency/svelte — <GlassSidebar>: glass sidebar with a sliding selection lens
  =============================================================================
  <GlassSidebar bind:value={index}><button data-gp-item>Home</button>…</GlassSidebar>
  The children are the items (or only those marked data-gp-item).
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassSidebar } from './actions.js';
  let { value = $bindable(), lensScale, inset, onchange, look, lookColor, glassProps, groups, children, ...rest } = $props();
</script>

<div {...rest} use:glassSidebar={{ value, lensScale, inset, onChange: (i) => { value = i; onchange?.(i); }, look, lookColor, props: glassProps, groups }}>{@render children?.()}</div>
