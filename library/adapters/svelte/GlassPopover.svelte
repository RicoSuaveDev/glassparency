<!--
  =============================================================================
  glassparency/svelte — <GlassPopover>: a glass button whose panel grows out of it
  =============================================================================
  <GlassPopover label="Info">…content…</GlassPopover>
  label = the button's text (or a label snippet); triggerGroup / triggerProps
  = the button's glass; group / glassProps = the panel's; placement, align.
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassPopover } from './actions.js';
  let { label, labelSnippet, triggerClass, panelClass, ariaLabel, group, placement, align, triggerGroup, triggerProps, onopenchange, glassProps, children, ...rest } = $props();
</script>

<span data-gp-anchor-wrap {...rest} use:glassPopover={{ group, placement, align, triggerGroup, triggerProps, props: glassProps, onOpenChange: (o) => onopenchange?.(o) }}>
  <button type="button" class={triggerClass} aria-label={ariaLabel}>{#if labelSnippet}{@render labelSnippet()}{:else}{label}{/if}</button>
  <div class={panelClass}>{@render children?.()}</div>
</span>
