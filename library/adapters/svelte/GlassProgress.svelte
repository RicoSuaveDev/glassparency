<!--
  =============================================================================
  glassparency/svelte — <GlassProgress>: Liquid Glass progress bar
  =============================================================================
  <GlassProgress value={0.4} />   <GlassProgress value={null} />  (busy)
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassProgress } from './actions.js';
  let { value = null, bead, look, lookColor, glassProps, groups, ...rest } = $props();
</script>

<div {...rest} use:glassProgress={{ value, bead, look, lookColor, props: glassProps, groups }}></div>
