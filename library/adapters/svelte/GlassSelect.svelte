<!--
  =============================================================================
  glassparency/svelte — <GlassSelect>: Liquid Glass select (a pop-up button)
  =============================================================================
  <GlassSelect bind:value={sort} options={[{ value: 'a', label: 'A' }]} placeholder="Sort" />
  triggerGroup / triggerProps = the button's glass; group / glassProps = the panel's.
  A thin wrapper (Svelte 5, runes) round the action of the same name in
  ./actions.js, which hands the element to the plain-JS API. Extra
  attributes (class, style, aria-*, id…) go to the root element; size it
  with CSS. look / lookColor = this control's look; glassProps = the
  per-part glass props; groups = the glass groups of its parts.
  =============================================================================
-->
<script>
  import { glassSelect } from './actions.js';
  let { value = $bindable(), options = [], placeholder = 'Choose…', triggerClass, panelClass, ariaLabel, group, placement, align, triggerGroup, triggerProps, onchange, onopenchange, glassProps, ...rest } = $props();
  const picked = $derived(options.find((o) => String(o.value) === String(value)));
  // New options = a new panel: the action rebuilds the select (items is one of its fixed params).
  const items = $derived(options.map((o) => String(o.value)));
</script>

<span
  data-gp-anchor-wrap
  {...rest}
  use:glassSelect={{ value, items, group, placement, align, triggerGroup, triggerProps, props: glassProps, onChange: (v) => { value = v; onchange?.(v); }, onOpenChange: (o) => onopenchange?.(o) }}
>
  <button type="button" class={triggerClass} aria-label={ariaLabel} data-gp-select-trigger>
    <span data-gp-select-label>{picked ? picked.label : placeholder}</span>
    <svg data-gp-chevron viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
  </button>
  <div class={panelClass}>
    {#each options as o (String(o.value))}
      <button type="button" role="option" data-value={String(o.value)}>
        <svg data-gp-check-mark viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.25 4.25L18.5 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span>{o.label}</span>
      </button>
    {/each}
  </div>
</span>
