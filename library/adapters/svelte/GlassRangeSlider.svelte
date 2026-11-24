<!--
  =============================================================================
  glassparency/svelte — <GlassRangeSlider>: two knobs, or one standing up
  =============================================================================
  <GlassRangeSlider bind:value={range} />   (range = [20, 80])
  <GlassRangeSlider orientation="vertical" bind:value={level} />
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassRangeSlider } from './actions.js';
  let { value = $bindable(), min, max, step, orientation, disabled, onchange, onchangeend, look, lookColor, glassProps, groups, ...rest } = $props();
</script>

<div {...rest} use:glassRangeSlider={{ value, min, max, step, orientation, disabled, onChange: (v) => { value = v; onchange?.(v); }, onChangeEnd: (v) => onchangeend?.(v), look, lookColor, props: glassProps, groups }}></div>
