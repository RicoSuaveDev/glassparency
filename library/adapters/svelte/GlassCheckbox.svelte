<!--
  =============================================================================
  glassparency/svelte — <GlassCheckbox>: Liquid Glass checkbox (children = its label)
  =============================================================================
  <GlassCheckbox bind:checked={on}>On Desktop</GlassCheckbox>
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassCheckbox } from './actions.js';
  let { checked = $bindable(), disabled, name, onchange, look, lookColor, glassProps, groups, children, ...rest } = $props();
</script>

<button type="button" {...rest} use:glassCheckbox={{ checked, disabled, name, onChange: (v) => { checked = v; onchange?.(v); }, look, lookColor, props: glassProps, groups }}>{@render children?.()}</button>
