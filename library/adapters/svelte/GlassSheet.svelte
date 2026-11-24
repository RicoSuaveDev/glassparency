<!--
  =============================================================================
  glassparency/svelte — <GlassSheet>: iOS-style bottom sheet
  =============================================================================
  <GlassSheet bind:open detents={[0.45, 0.92]}>…</GlassSheet>
  Moved into the glass overlay while open (and back when closed).
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassSheet } from './actions.js';
  let { open = $bindable(false), detent, detents, dim, onclose, ondetentchange, look, lookColor, glassProps, groups, children, ...rest } = $props();
</script>

<div {...rest} use:glassSheet={{ open, detent, detents, dim, onClose: () => { open = false; onclose?.(); }, onDetentChange: (i) => ondetentchange?.(i), look, lookColor, props: glassProps, groups }}>{@render children?.()}</div>
