<!--
  =============================================================================
  glassparency/svelte — <GlassBlockSlider>: Control Center block slider
  =============================================================================
  <GlassBlockSlider bind:value={brightness}><svg…/></GlassBlockSlider>   (children = its icon)
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassBlockSlider } from './actions.js';
  let { value = $bindable(), min, max, step, orientation, disabled, onchange, onchangeend, look, lookColor, glassProps, groups, children, ...rest } = $props();
</script>

<div {...rest} use:glassBlockSlider={{ value, min, max, step, orientation, disabled, onChange: (v) => { value = v; onchange?.(v); }, onChangeEnd: (v) => onchangeend?.(v), look, lookColor, props: glassProps, groups }}>{@render children?.()}</div>
