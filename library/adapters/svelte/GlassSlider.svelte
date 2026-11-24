<!--
  =============================================================================
  glassparency/svelte — <GlassSlider>: Liquid Glass slider
  =============================================================================
  <GlassSlider bind:value={volume} min={0} max={100} aria-label="Volume" onchangeend={save} />
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassSlider } from './actions.js';
  let { value = $bindable(), min, max, step, disabled, onchange, onchangeend, look, lookColor, glassProps, groups, ...rest } = $props();
</script>

<div {...rest} use:glassSlider={{ value, min, max, step, disabled, onChange: (v) => { value = v; onchange?.(v); }, onChangeEnd: (v) => onchangeend?.(v), look, lookColor, props: glassProps, groups }}></div>
