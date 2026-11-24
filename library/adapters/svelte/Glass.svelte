<!--
  =============================================================================
  glassparency/svelte — <Glass>: glass on any element
  =============================================================================
  <Glass as="section" group="card" look="frosted" glass={{ tint: '#e0e7ff' }}>…</Glass>
  as = the element (default div), group = the glass group (default "panel"),
  glass = per-element glass props.
  A thin wrapper (Svelte 5, runes) round the glass action in ./actions.js.
  Extra attributes (class, style, aria-*, onclick…) go to the element.
  =============================================================================
-->
<script>
  import { glass } from './actions.js';
  let { as = 'div', group = 'panel', look, lookColor, glass: glassProps, children, ...rest } = $props();
</script>

<svelte:element this={as} {...rest} use:glass={{ group, look, lookColor, props: glassProps }}>{@render children?.()}</svelte:element>
