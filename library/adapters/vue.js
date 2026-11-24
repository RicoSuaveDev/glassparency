/**
 * =============================================================================
 * glass/adapters/vue.js — Vue 3 wrappers ("glassparency/vue")
 * =============================================================================
 * Thin wrappers over the plain-JS API (../standalone.js, via ./actions.js):
 * Vue never renders the glass, it only tells the library which elements
 * get it. Works in Vue 3.3+ and Nuxt (SSR-safe: nothing touches the page
 * until a component is mounted in the browser).
 *
 *   import { createApp } from 'vue';
 *   import { GlassparencyPlugin } from 'glassparency/vue';
 *   createApp(App).use(GlassparencyPlugin, { look: 'frosted' }).mount('#app');
 *
 *   <div v-glass="'card'">…</div>                        glass, group "card"
 *   <div v-glass:card.smoke>…</div>                       group as the arg, look as a modifier
 *   <div v-glass="{ group: 'card', look: 'tinted', lookColor: '#ff2d55', props: { tintOpacity: 0.3 } }">
 *   <div v-glass:card="{ tint: '#e0e7ff' }">              (an object without group / look / props = glass props)
 *
 *   <Glass as="section" group="card" look="frosted">…</Glass>
 *   <GlassSwitch v-model="wifi" aria-label="Wi-Fi" />
 *   <GlassSlider v-model="volume" :min="0" :max="100" @change-end="save" />
 *   <GlassCheckbox v-model="desktop">On Desktop</GlassCheckbox>
 *   <GlassRadio name="size" :model-value="size === 's'" @change="size = 's'">Small</GlassRadio>
 *   <GlassTextField v-model="q" clearable placeholder="Search"><template #icon>…</template></GlassTextField>
 *   <GlassTabBar v-model="tab"><button data-gp-item>Home</button>…</GlassTabBar>   (GlassSidebar the same)
 *   <GlassProgress :value="0.4" />   <GlassProgress :value="null" /> (busy)
 *   <GlassSegmented v-model="range"><button data-gp-item>Day</button>…</GlassSegmented>
 *   <GlassStepper v-model="qty" :min="0" :max="10" />
 *   <GlassRangeSlider v-model="[lo, hi]" />  <GlassBlockSlider v-model="vol">…icon…</GlassBlockSlider>
 *   <GlassPopover label="Info">…</GlassPopover>   <GlassMenu label="Actions" @select="…">…</GlassMenu>
 *   <GlassSelect v-model="sort" :options="[{ value: 'a', label: 'A' }]" />
 *   <GlassTooltip text="Share"><button>…</button></GlassTooltip>
 *   <GlassSheet v-model:open="open" :detents="[0.45, 0.92]">…</GlassSheet>
 *
 * Every control takes the create… function's options as props (see the
 * README / index.d.ts), plus `look` / `lookColor` and `glass-props` (the
 * per-part glass props). Events: update:modelValue, change (and change-end,
 * clear, select, open-change, close, detent-change where the control has them).
 * Size the controls with CSS, as everywhere else.
 * =============================================================================
 */
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ensureGlass,
  glass,
  glassSwitch,
  glassSlider,
  glassCheckbox,
  glassRadio,
  glassTextField,
  glassTabBar,
  glassSidebar,
  glassProgress,
  glassSegmented,
  glassStepper,
  glassRangeSlider,
  glassBlockSlider,
  glassTooltip,
  glassSheet,
  glassPopover,
  glassMenu,
  glassSelect,
} from './actions';
import { start } from '../standalone';

// The plain-JS API under the module's names (the same functions as "glassparency/vanilla").
export {
  start as startGlass,
  stop as stopGlass,
  applyLook as applyGlassLook,
  getLook as getGlassLook,
  LOOKS as GLASS_LOOKS,
  configure as configureGlass,
  addPresets as addGlassPresets,
  toast as glassToast,
} from '../standalone';
export { ensureGlass };

// --- v-glass ------------------------------------------------------------------------------

const PARAM_KEYS = ['group', 'look', 'lookColor', 'props'];
/**
 * The directive's binding → the glass action's params.
 *   value: 'group' | { group?, look?, lookColor?, props? } | glass props
 *   arg: the group (v-glass:card), modifiers: the look (v-glass.frosted)
 */
function directiveParams(binding) {
  const v = binding.value;
  let p;
  if (typeof v === 'string') p = { group: v };
  else if (v && typeof v === 'object' && PARAM_KEYS.some((k) => k in v)) p = { ...v };
  else p = { props: v && typeof v === 'object' ? v : {} };
  if (binding.arg) p.group = binding.arg;
  const look = Object.keys(binding.modifiers || {})[0];
  if (look && p.look === undefined) p.look = look;
  return p;
}
const HANDLE = Symbol('glassparency');
/** v-glass: glass on any element (see the header). */
export const vGlass = {
  mounted(el, binding) {
    el[HANDLE] = glass(el, directiveParams(binding));
  },
  updated(el, binding) {
    el[HANDLE]?.update(directiveParams(binding));
  },
  beforeUnmount(el) {
    el[HANDLE]?.destroy();
    delete el[HANDLE];
  },
  // (server rendering: no attributes of its own)
  getSSRProps: () => ({}),
};

// --- Components ---------------------------------------------------------------------------

/** "Any value" props that stay undefined when not given (Vue would make missing Booleans false). */
const anyProps = (names) => Object.fromEntries(names.map((n) => [n, { type: null, default: undefined }]));
// Bare boolean attributes (<GlassSwitch disabled>) arrive as '' — that means true.
const FLAGS = new Set(['disabled', 'clearable', 'bead', 'wrap', 'showValue', 'open']);
const norm = (k, v) => (FLAGS.has(k) && v === '' ? true : v);

/**
 * A component round an action.
 *   tag       the root element (a <button> for switches / checkboxes)
 *   action    from ./actions.js
 *   options   the action's params taken as props
 *   model     the param v-model drives ('checked' | 'value' | null)
 *   events    action callback → Vue event name(s) (onChange → change + update:modelValue)
 *   attrs     fixed attributes for the root (type="button"…)
 *   render    custom children (default: the default slot)
 */
function controlComponent(name, { tag = 'div', action, options, model = null, events = {}, attrs = {}, render, extra }) {
  const emitNames = new Set(['update:modelValue']);
  for (const evs of Object.values(events)) for (const e of [].concat(evs)) emitNames.add(e);
  return defineComponent({
    name,
    props: { ...anyProps([...options, 'modelValue', 'look', 'lookColor', 'glassProps', 'groups']), ...(extra?.props || {}) },
    emits: [...emitNames],
    setup(props, { slots, emit, attrs: fallthrough }) {
      const root = ref(null);
      let handle = null;
      const params = () => {
        const p = {};
        for (const k of options) if (props[k] !== undefined) p[k] = norm(k, props[k]);
        if (model && props.modelValue !== undefined) p[model] = props.modelValue;
        if (props.look !== undefined) p.look = props.look;
        if (props.lookColor !== undefined) p.lookColor = props.lookColor;
        if (props.glassProps !== undefined) p.props = props.glassProps;
        if (props.groups !== undefined) p.groups = props.groups;
        for (const [cb, evs] of Object.entries(events)) {
          p[cb] = (...args) => {
            for (const e of [].concat(evs)) emit(e, ...args);
          };
        }
        extra?.params?.(p, props, emit);
        return p;
      };
      onMounted(() => {
        handle = action(root.value, params());
      });
      // Props → update() (the action rebuilds the control only when it must).
      watch(
        () => ({ ...props }),
        () => handle?.update(params()),
        { deep: true, flush: 'post' }
      );
      onBeforeUnmount(() => {
        handle?.destroy();
        handle = null;
      });
      return () => h(tag, { ref: root, ...attrs }, render ? render(props, slots, emit, fallthrough) : slots.default?.());
    },
  });
}

/** <Glass as="section" group="card" look="frosted" :glass="{ … }">: glass on any element. */
export const Glass = defineComponent({
  name: 'Glass',
  props: { as: { type: [String, Object], default: 'div' }, group: { type: String, default: 'panel' }, ...anyProps(['glass', 'look', 'lookColor']) },
  setup(props, { slots }) {
    const root = ref(null);
    let handle = null;
    const params = () => ({ group: props.group, look: props.look, lookColor: props.lookColor, props: props.glass || {} });
    onMounted(() => {
      handle = glass(root.value, params());
    });
    watch(() => [props.group, props.look, props.lookColor, props.glass], () => handle?.update(params()), { deep: true, flush: 'post' });
    onBeforeUnmount(() => handle?.destroy());
    return () => h(props.as, { ref: root }, slots.default?.());
  },
});

const change = ['update:modelValue', 'change'];
export const GlassSwitch = controlComponent('GlassSwitch', { tag: 'button', attrs: { type: 'button' }, action: glassSwitch, options: ['checked', 'disabled'], model: 'checked', events: { onChange: change } });
export const GlassSlider = controlComponent('GlassSlider', {
  action: glassSlider,
  options: ['value', 'min', 'max', 'step', 'disabled'],
  model: 'value',
  events: { onChange: change, onChangeEnd: 'change-end' },
});
export const GlassCheckbox = controlComponent('GlassCheckbox', { tag: 'button', attrs: { type: 'button' }, action: glassCheckbox, options: ['checked', 'disabled', 'name'], model: 'checked', events: { onChange: change } });
export const GlassRadio = controlComponent('GlassRadio', { tag: 'button', attrs: { type: 'button' }, action: glassRadio, options: ['checked', 'disabled', 'name'], model: 'checked', events: { onChange: change } });
/**
 * Text field: a glass wrapper round an <input>. v-model is the input's
 * value; other attributes (placeholder, type…) go to the <input>,
 * class / style to the wrapper. #icon slot: drawn before the input.
 */
export const GlassTextField = defineComponent({
  name: 'GlassTextField',
  inheritAttrs: false,
  props: { ...anyProps(['modelValue', 'clearable', 'look', 'lookColor', 'glassProps', 'groups']) },
  emits: ['update:modelValue', 'clear'],
  setup(props, { slots, emit, attrs }) {
    const root = ref(null);
    let handle = null;
    const params = () => ({
      clearable: norm('clearable', props.clearable),
      look: props.look,
      lookColor: props.lookColor,
      props: props.glassProps,
      groups: props.groups,
      onClear: () => {
        emit('update:modelValue', '');
        emit('clear');
      },
    });
    onMounted(() => {
      handle = glassTextField(root.value, params());
    });
    watch(() => [props.clearable, props.look, props.lookColor, props.glassProps, props.groups], () => handle?.update(params()), { deep: true, flush: 'post' });
    onBeforeUnmount(() => handle?.destroy());
    return () => {
      const { class: cls, style, ...inputAttrs } = attrs;
      return h('div', { ref: root, class: cls, style }, [
        slots.icon?.(),
        h('input', {
          ...inputAttrs,
          value: props.modelValue,
          onInput: (e) => emit('update:modelValue', e.target.value),
        }),
      ]);
    };
  },
});
export const GlassTabBar = controlComponent('GlassTabBar', { action: glassTabBar, options: ['value', 'lensScale', 'inset'], model: 'value', events: { onChange: change } });
export const GlassSidebar = controlComponent('GlassSidebar', { action: glassSidebar, options: ['value', 'lensScale', 'inset'], model: 'value', events: { onChange: change } });
export const GlassProgress = controlComponent('GlassProgress', { action: glassProgress, options: ['value', 'bead'] });
export const GlassSegmented = controlComponent('GlassSegmented', { action: glassSegmented, options: ['value', 'lensScale', 'inset'], model: 'value', events: { onChange: change } });
export const GlassStepper = controlComponent('GlassStepper', {
  action: glassStepper,
  options: ['value', 'min', 'max', 'step', 'wrap', 'showValue', 'format', 'disabled'],
  model: 'value',
  events: { onChange: change },
});
export const GlassRangeSlider = controlComponent('GlassRangeSlider', {
  action: glassRangeSlider,
  options: ['value', 'min', 'max', 'step', 'orientation', 'disabled'],
  model: 'value',
  events: { onChange: change, onChangeEnd: 'change-end' },
});
export const GlassBlockSlider = controlComponent('GlassBlockSlider', {
  action: glassBlockSlider,
  options: ['value', 'min', 'max', 'step', 'orientation', 'disabled'],
  model: 'value',
  events: { onChange: change, onChangeEnd: 'change-end' },
});
/** Tooltip round the default slot (a <span> wrapper). */
export const GlassTooltip = controlComponent('GlassTooltip', {
  tag: 'span',
  attrs: { 'data-gp-tooltip-anchor': '' },
  action: glassTooltip,
  options: ['text', 'placement', 'delay', 'group'],
});
/** Bottom sheet: v-model:open; the default slot is its content. */
export const GlassSheet = controlComponent('GlassSheet', {
  action: glassSheet,
  options: ['open', 'detent', 'detents', 'dim'],
  events: { onClose: ['update:open', 'close'], onDetentChange: 'detent-change' },
  extra: {
    // onClose → update:open with false
    params(p, props, emit) {
      p.onClose = () => {
        emit('update:open', false);
        emit('close');
      };
    },
  },
});

/** The button + panel the popover / menu / select share (the button is a glass button). */
const pairRender = (panelAttrs, panelChildren) => (props, slots) => [
  h('button', { type: 'button', class: props.triggerClass, 'aria-label': props.ariaLabel }, slots.label ? slots.label() : props.label),
  h('div', { class: props.panelClass, ...panelAttrs }, panelChildren(props, slots)),
];
const pairProps = ['group', 'placement', 'align', 'triggerGroup', 'triggerProps'];
const pairExtra = { props: anyProps(['label', 'triggerClass', 'panelClass', 'ariaLabel']) };
/** <GlassPopover label="Info">content</GlassPopover> (#label slot for a richer button). */
export const GlassPopover = controlComponent('GlassPopover', {
  tag: 'span',
  attrs: { 'data-gp-anchor-wrap': '' },
  action: glassPopover,
  options: pairProps,
  events: { onOpenChange: 'open-change' },
  render: pairRender({}, (props, slots) => slots.default?.()),
  extra: pairExtra,
});
/** <GlassMenu label="Actions" @select="(index, item) => …"><button role="menuitem">Copy</button>…</GlassMenu> */
export const GlassMenu = controlComponent('GlassMenu', {
  tag: 'span',
  attrs: { 'data-gp-anchor-wrap': '' },
  action: glassMenu,
  options: pairProps,
  events: { onOpenChange: 'open-change', onSelect: 'select' },
  render: pairRender({ role: 'menu' }, (props, slots) => slots.default?.()),
  extra: pairExtra,
});
const CHEVRON = () =>
  h('svg', { 'data-gp-chevron': '', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
    h('path', { d: 'M7 10l5 5 5-5', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ]);
const CHECK = () =>
  h('svg', { 'data-gp-check-mark': '', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
    h('path', { d: 'M5.5 12.5l4.25 4.25L18.5 7.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ]);
/** <GlassSelect v-model="sort" :options="[{ value: 'a', label: 'A' }]" placeholder="Sort" /> */
export const GlassSelect = controlComponent('GlassSelect', {
  tag: 'span',
  attrs: { 'data-gp-anchor-wrap': '' },
  action: glassSelect,
  options: pairProps,
  model: 'value',
  events: { onChange: change, onOpenChange: 'open-change' },
  render: (props) => {
    const opts = props.options || [];
    const picked = opts.find((o) => String(o.value) === String(props.modelValue));
    return [
      h('button', { type: 'button', class: props.triggerClass, 'aria-label': props.ariaLabel, 'data-gp-select-trigger': '' }, [
        h('span', { 'data-gp-select-label': '' }, picked ? picked.label : props.placeholder ?? 'Choose…'),
        CHEVRON(),
      ]),
      h(
        'div',
        { class: props.panelClass },
        opts.map((o) => h('button', { key: String(o.value), type: 'button', role: 'option', 'data-value': String(o.value) }, [CHECK(), h('span', o.label)]))
      ),
    ];
  },
  extra: {
    props: anyProps(['options', 'placeholder', 'triggerClass', 'panelClass', 'ariaLabel']),
    // New options = a new panel: rebuild the select (items is one of its fixed params).
    params(p, props) {
      p.items = (props.options || []).map((o) => String(o.value));
    },
  },
});

const COMPONENTS = {
  Glass,
  GlassSwitch,
  GlassSlider,
  GlassCheckbox,
  GlassRadio,
  GlassTextField,
  GlassTabBar,
  GlassSidebar,
  GlassProgress,
  GlassSegmented,
  GlassStepper,
  GlassRangeSlider,
  GlassBlockSlider,
  GlassPopover,
  GlassMenu,
  GlassSelect,
  GlassTooltip,
  GlassSheet,
};

/**
 * app.use(GlassparencyPlugin, options): registers v-glass and the
 * components (components: false = only the directive), and starts the glass
 * in the browser with start(options) — config, look, auto (scan the page for
 * data-glassparency attributes / glass classes; default false here), classes.
 */
export const GlassparencyPlugin = {
  install(app, options = {}) {
    app.directive('glass', vGlass);
    if (options.components !== false) for (const [n, c] of Object.entries(COMPONENTS)) app.component(n, c);
    if (typeof document !== 'undefined') {
      const { components: _c, ...startOptions } = options;
      start({ auto: false, ...startOptions });
    }
  },
};
// (no default export: CommonJS users get the same named exports as ESM)
