<!--
  =============================================================================
  glassparency/svelte — <GlassSwitch>: Liquid Glass on/off switch
  =============================================================================
  <GlassSwitch bind:checked={wifi} aria-label="Wi-Fi" onchange={(on) => …} />
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassSwitch } from './actions.js';
  let { checked = $bindable(), disabled, onchange, look, lookColor, glassProps, groups, ...rest } = $props();
</script>

<button type="button" {...rest} use:glassSwitch={{ checked, disabled, onChange: (v) => { checked = v; onchange?.(v); }, look, lookColor, props: glassProps, groups }}></button>
