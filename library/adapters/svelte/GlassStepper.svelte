<!--
  =============================================================================
  glassparency/svelte — <GlassStepper>: Liquid Glass stepper (− value +)
  =============================================================================
  <GlassStepper bind:value={qty} min={0} max={10} />
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassStepper } from './actions.js';
  let { value = $bindable(), min, max, step, wrap, showValue, format, disabled, onchange, look, lookColor, glassProps, groups, ...rest } = $props();
</script>

<div {...rest} use:glassStepper={{ value, min, max, step, wrap, showValue, format, disabled, onChange: (v) => { value = v; onchange?.(v); }, look, lookColor, props: glassProps, groups }}></div>
