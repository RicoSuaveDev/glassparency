<!--
  =============================================================================
  glassparency/svelte — <GlassTooltip>: a glass tooltip round its children
  =============================================================================
  <GlassTooltip text="Share"><button aria-label="Share">…</button></GlassTooltip>
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassTooltip } from './actions.js';
  let { text, placement, delay, group, look, lookColor, glassProps, groups, children, ...rest } = $props();
</script>

<span data-gp-tooltip-anchor {...rest} use:glassTooltip={{ text, placement, delay, group, look, lookColor, props: glassProps, groups }}>{@render children?.()}</span>
