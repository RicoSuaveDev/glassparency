<!--
  =============================================================================
  glassparency/svelte — <GlassTextField>: Liquid Glass text field
  =============================================================================
  <GlassTextField bind:value={q} clearable placeholder="Search">{#snippet icon()}<svg…/>{/snippet}</GlassTextField>
  The attributes go to the <input> (placeholder, type…); class / style to
  the glass wrapper. icon = a snippet drawn before the input.
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassTextField } from './actions.js';
  let { value = $bindable(''), clearable, onclear, icon, class: cls, style, look, lookColor, glassProps, groups, ...inputAttrs } = $props();
</script>

<div class={cls} {style} use:glassTextField={{ clearable, look, lookColor, props: glassProps, groups, onClear: () => { value = ''; onclear?.(); } }}>
  {@render icon?.()}
  <input bind:value {...inputAttrs} />
</div>
