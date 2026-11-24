# Glassparency

[![npm](https://img.shields.io/npm/v/glassparency?color=0a84ff&label=npm)](https://www.npmjs.com/package/glassparency)
[![License: MIT](https://img.shields.io/badge/license-MIT-0a84ff)](https://github.com/RicoSuaveDev/glassparency/blob/main/library/npm/LICENSE)
[![Live demo](https://img.shields.io/badge/demo-live-0a84ff)](https://ricosuavedev.github.io/glassparency/)
[![Source on GitHub](https://img.shields.io/badge/source-GitHub-0a84ff?logo=github)](https://github.com/RicoSuaveDev/glassparency/tree/main/library)

![A glass lens bending the headline “Glass that bends the page.”](https://cdn.jsdelivr.net/npm/glassparency@1.5.2/media/hero-light.webp)

**[See it live →](https://ricosuavedev.github.io/glassparency/)** Drag the lens, flip the settings, melt the drops.

Apple‑style **Liquid Glass** for the web. The glass really bends what is behind it:
- clear, saturated glass with a wide squircle rim that refracts the page, plus colour fringing;
- a specular rim lit from the top‑left, and a soft inner glow;
- controls that grow and light up from the touch point when pressed;
- **liquid morphing**: shapes melt together and split apart;
- light and dark themes;
- an automatic CSS fallback wherever WebGL can't run.

It only changes the **look**. Layout, text, icons, focus, clicks and accessibility stay plain HTML.
The glass is drawn behind your elements. When it can't run, your own CSS shows instead.

Under the hood:
- WebGL ([three.js](https://threejs.org) through [react-three-fiber](https://r3f.docs.pmnd.rs) and drei's `MeshTransmissionMaterial`).
- In Chromium browsers, floating glass refracts the **live page in real time** with SVG backdrop filters.

## Contents

- [What it looks like](#what-it-looks-like)
- [Three ways to use it](#three-ways-to-use-it) — React, one `<script>` on any site, or the `<glass-ui>` element
- [Looks: clear, frosted, tinted, dark smoke](#looks-clear-frosted-tinted-dark-smoke) — a theme in one line
- [Vue](#vue) · [Svelte](#svelte) · [Tailwind CSS](#tailwind-css) · [Next.js and server rendering](#nextjs-and-server-rendering)
- [Switches and sliders](#switches-and-sliders) · [More controls](#checkboxes-radios-text-fields-tab-bars-sidebars-and-progress-bars) · [Segmented, stepper, range & block sliders](#segmented-control-stepper-range-and-block-sliders) · [Popovers, menus, tooltips, sheets & toasts](#popovers-menus-selects-tooltips-sheets-and-toasts) · [Keyboard & screen readers](#keyboard-and-screen-readers) · [Styles](#styles-default-crystal-frosted)
- [Squircle corners, pointer / tilt highlight, scroll edge effect](#squircle-corners-pointer--tilt-highlight-scroll-edge-effect)
- [Squish & stretch](#squish--stretch) · [Shape springs](#shape-springs) · [Morph any element](#morph-any-element-into-another-glassmorph) · [Glass that melts together](#glass-that-melts-together-glassgroup) · [Custom shapes & glass text](#custom-shapes-paths-icons-and-glass-text) · [Readable text](#readable-text-automatically-textcolor-auto)
- [Built-in groups](#built-in-groups-presets) · [Configuration](#configuration)
- [How it works](#how-it-works-and-what-your-page-needs) · [API](#api) · [Requirements](#requirements)
- [Troubleshooting](#troubleshooting) · [Building from source & contributing](#building-from-source--contributing) · [Credits](#credits)

## What it looks like

![Glass controls over flat colour artwork: a media player, settings rows, liquid drops and a thick glass bar over large type](https://cdn.jsdelivr.net/npm/glassparency@1.5.2/media/grid-light.webp)

| ![A glass media player floating over poster artwork](https://cdn.jsdelivr.net/npm/glassparency@1.5.2/media/player.webp) | ![Two glass drops melting into one over black and white stripes](https://cdn.jsdelivr.net/npm/glassparency@1.5.2/media/morph.webp) |
|---|---|
| Floating controls bend the artwork behind them | Liquid morph: shapes melt together and split apart |

![The same page in dark mode](https://cdn.jsdelivr.net/npm/glassparency@1.5.2/media/grid-dark.webp)

### The controls in motion

<!-- Animated WebPs live in the GitHub repo (library/npm/showcase, from client/src/glass/npm/showcase), not in the npm package, so installs stay small. -->

| <img src="https://cdn.jsdelivr.net/gh/RicoSuaveDev/glassparency@main/library/npm/showcase/switch.webp" alt="GlassSwitch: the knob turns into clear glass while it is dragged across" width="360"> | <img src="https://cdn.jsdelivr.net/gh/RicoSuaveDev/glassparency@main/library/npm/showcase/slider.webp" alt="GlassSlider: a glass knob dragged along the track" width="360"> |
|---|---|
| [`GlassSwitch`](#switches-and-sliders): drag the knob and it turns to glass | [`GlassSlider`](#switches-and-sliders): a glass knob that bends the track |
| <img src="https://cdn.jsdelivr.net/gh/RicoSuaveDev/glassparency@main/library/npm/showcase/checkbox-radio.webp" alt="GlassCheckbox and GlassRadio: a box is ticked and squishes, a radio is picked" width="360"> | <img src="https://cdn.jsdelivr.net/gh/RicoSuaveDev/glassparency@main/library/npm/showcase/text-field.webp" alt="GlassTextField: focused, typed into and cleared with the glass clear button" width="360"> |
| [`GlassCheckbox` · `GlassRadio`](#checkboxes-radios-text-fields-tab-bars-sidebars-and-progress-bars): squish when pressed | [`GlassTextField`](#checkboxes-radios-text-fields-tab-bars-sidebars-and-progress-bars): focus glow and a glass clear button |
| <img src="https://cdn.jsdelivr.net/gh/RicoSuaveDev/glassparency@main/library/npm/showcase/tab-bar.webp" alt="GlassTabBar: a magnifying glass lens slides across the tabs" width="360"> | <img src="https://cdn.jsdelivr.net/gh/RicoSuaveDev/glassparency@main/library/npm/showcase/sidebar.webp" alt="GlassSidebar: the glass lens slides down the list" width="360"> |
| [`GlassTabBar`](#checkboxes-radios-text-fields-tab-bars-sidebars-and-progress-bars): press and slide, the lens magnifies | [`GlassSidebar`](#checkboxes-radios-text-fields-tab-bars-sidebars-and-progress-bars): the same lens, vertical |
| <img src="https://cdn.jsdelivr.net/gh/RicoSuaveDev/glassparency@main/library/npm/showcase/progress.webp" alt="GlassProgress: fills with a glass bead on the end, then a busy liquid drop" width="360"> | <img src="https://cdn.jsdelivr.net/gh/RicoSuaveDev/glassparency@main/library/npm/showcase/button.webp" alt="Glass buttons swell, lean toward the pointer and wobble back" width="360"> |
| [`GlassProgress`](#checkboxes-radios-text-fields-tab-bars-sidebars-and-progress-bars): a glass bead, and a liquid drop when busy | [Squish & stretch](#squish--stretch): buttons swell, lean and wobble back |
| <img src="https://cdn.jsdelivr.net/gh/RicoSuaveDev/glassparency@main/library/npm/showcase/glass-ui.webp" alt="A glass-ui card pressed and released" width="360"> | <img src="https://cdn.jsdelivr.net/gh/RicoSuaveDev/glassparency@main/library/npm/showcase/shape-spring.webp" alt="A shape spring: circle to capsule to rounded square and back" width="360"> |
| [`<glass-ui>`](#3-any-framework-the-glass-ui-element): glass as an HTML element | [Shape springs](#shape-springs): glass springs between shapes |

<img src="https://cdn.jsdelivr.net/gh/RicoSuaveDev/glassparency@main/library/npm/showcase/morph.webp" alt="glassMorph: a glass button swells into a menu, then shrinks back into the button" width="728">

[`glassMorph`](#morph-any-element-into-another-glassmorph): the button itself swells into the menu and melts back into it

---

## Three ways to use it

### 1. React apps (React 19)

```bash
npm install glassparency react react-dom three @react-three/fiber @react-three/drei
```

```jsx
import { useRef } from 'react';
import { GlassProvider, Glass, useGlass } from 'glassparency';

// Wrap your app once.
root.render(
  <GlassProvider>
    <App />
  </GlassProvider>
);

// Any element, one line:
function SaveButton() {
  const ref = useRef(null);
  useGlass(ref, 'button');                         // the look = the "button" preset group
  return <button ref={ref}>Save</button>;
}

// Or the wrapper component:
<Glass as="section" group="card">…</Glass>

// Per-element changes on top of the group:
useGlass(ref, 'card', { tint: '#e0e7ff', tintOpacity: 0.7 });

// Switch groups with state (e.g. a toggle), or null = no glass:
useGlass(ref, on ? 'switchOn' : 'switch');
```

- **Server rendering** works (Next.js, Remix, Astro islands…). The package is marked `'use client'`. On the
  server and during hydration it renders only your children, then it starts in the browser.
- **TypeScript** types are included.

### 2. Any website, no React (one `<script>`)

```html
<script src="https://unpkg.com/glassparency/dist/glassparency.standalone.js"></script>

<button data-glassparency="button">Save</button>
<div data-glassparency="card" data-glassparency-props='{"tint":"#e0e7ff"}'>…</div>
```

- **Attributes:** every element with `data-glassparency="<group>"` gets glass. That includes elements added later,
  and the glass follows changes to the attributes.
- **Size:** the script holds React, three.js and everything else (≈ 420 kB gzipped). It works on WordPress,
  Shopify, Webflow or plain HTML.
- **Settings:** set `window.GlassparencyConfig = { … }` *before* the script, or call `Glassparency.configure({ … })`.
- **Starting it yourself:** add `data-manual` to the `<script>` tag, then call `Glassparency.start()`.

```js
Glassparency.start({ config, auto: true, injectStyles: true, nonce });
const glass = Glassparency.attach(element, 'buttonPrimary', { pressScale: 1.05 });
glass.setProps({ tintOpacity: 0.9 });
glass.destroy();
Glassparency.stop();          // remove all glass
Glassparency.status();        // { state: 'loading' | 'on' | 'fallback', reason }

// Motion (see "Shape springs" and "Morph any element"):
Glassparency.createShapeSpring(card).to({ width: 260, height: 72, radius: 36 });
const morph = Glassparency.glassMorph(menuButton, menuPanel);  // panel: <div hidden>
morph.reverse();
Glassparency.mergeProps(element, { tintOpacity: 0.6 });         // change SOME props
```

From a bundler without React, use the same API through `attachGlass()` and `configureGlass()`.
You still need `<GlassProvider>` (or the script build) running somewhere on the page.

### 3. Any framework: the `<glass-ui>` element

```html
<glass-ui group="card">
  <h3>Plain HTML inside</h3>
  <p>Styled by your own CSS.</p>
</glass-ui>

<glass-ui group="menu" props='{"tint":"#e0e7ff","tintOpacity":0.7}'>…</glass-ui>
```

A standard web component, so it works the same in plain HTML, React 19, Vue, Svelte, Angular, Astro or a CMS.
The element **is** the glass: `group` picks the look, `props` (JSON) changes it per element, and changing either
attribute updates the glass. Its content is ordinary HTML (no shadow DOM), so your CSS styles it.

- It is registered automatically wherever the glass runs (`<GlassProvider>` or the script build).
  `defineGlassElement('my-glass')` registers it under another name (custom element names need a hyphen).
- From JavaScript: `el.group = 'menu'`, `el.props = { style: 'crystal' }`.
- It's `display: block` by default, at zero specificity, so any CSS of yours wins.
- Use it for containers: cards, panels, bars, chips, menus. Native controls keep their own glass versions
  (`<GlassSwitch>`, `data-glassparency-switch`…).
- TypeScript: `<glass-ui>` is typed in JSX and in `document.querySelector('glass-ui')`.

---

## Looks: clear, frosted, tinted, dark smoke

Ready-made themes for the whole page, in one line:

| Look | |
|---|---|
| `clear` | Barely-there glass: almost no tint or frost, a stronger lens and a bright rim. The page shows through. |
| `frosted` | Milky, heavily frosted glass in each group's own tint; what's behind turns to soft colour. |
| `tinted` | Coloured glass: every surface takes one colour (default `#5b7cfa`), lightly, with the page's colours boosted. |
| `smoke` | Dark smoke: smoked, near-black glass that darkens what's behind it. Auto text turns light by itself. (`dark-smoke` works too.) |

```js
import { applyGlassLook } from 'glassparency';
applyGlassLook('frosted');
applyGlassLook('tinted', { color: '#ff2d55' });
applyGlassLook(null);                         // no look
```

```jsx
<GlassProvider look="frosted">…</GlassProvider>             {/* or look={{ name: 'tinted', color: '#ff2d55' }} */}
<Glass group="card" look="smoke">…</Glass>                  {/* one element (any props: { look: 'smoke' }) */}
<Glass group="card" look="none">…</Glass>                   {/* opt out of the page look */}
```

```html
<!-- script build -->
<html data-glassparency-look="frosted">                    <!-- the whole page (or on <body>) -->
<div data-glassparency="card" data-glassparency-look="tinted" data-glassparency-look-color="#ff2d55">…</div>
<div data-glassparency-look="smoke">…</div>                 <!-- a look alone gives glass too (group "panel") -->
```

Which look an element gets: its own `look` (props, its group or `defaults`; `"none"` = no look), then the page
look (`applyGlassLook()` / `<GlassProvider look>`), then `global.look` in the config.

Looks are rules applied to each group's values, like the [styles](#styles-default-crystal-frosted), so they work on
every group, your own included, in light and dark mode. They leave alone what isn't glass: solid parts (switch
knobs), accent colours (a checked box, a primary button) and grey tracks keep theirs; tinted and smoke recolour
only page surfaces (cards, panels, bars, menus…). Animated controls show the look in every frame.

Fine-tune a look, or make your own, in the config's `looks` block (preset packs can ship looks too):

```js
configureGlass({
  looks: {
    frosted: { blur: 32 },                                   // fine-tune a built-in look
    brand: { base: 'tinted', color: '#7c3aed', rimLight: 0.8, dark: { tintOpacity: 0.4 } },
  },
  global: { look: 'brand' },
});
```

---

## Vue

`glassparency/vue` (Vue 3.3+, Nuxt): a `v-glass` directive and components for every control. Thin wrappers over
the plain-JS API, so the controls are the very same ones.

```js
import { createApp } from 'vue';
import { GlassparencyPlugin } from 'glassparency/vue';
createApp(App).use(GlassparencyPlugin, { look: 'frosted' }).mount('#app');   // registers v-glass + the components
```

```vue
<div v-glass="'card'">…</div>
<div v-glass:card.smoke>…</div>                       <!-- group as the argument, look as a modifier -->
<div v-glass="{ group: 'card', look: 'tinted', lookColor: '#ff2d55', props: { tintOpacity: 0.3 } }">…</div>

<Glass as="section" group="card" look="frosted">…</Glass>
<GlassSwitch v-model="wifi" aria-label="Wi-Fi" />
<GlassSlider v-model="volume" :min="0" :max="100" @change-end="save" />
<GlassCheckbox v-model="desktop">On Desktop</GlassCheckbox>
<GlassSegmented v-model="range"><button data-gp-item>Day</button><button data-gp-item>Week</button></GlassSegmented>
<GlassSelect v-model="sort" :options="[{ value: 'a', label: 'Alpha' }]" />
<GlassSheet v-model:open="open" :detents="[0.45, 0.92]">…</GlassSheet>
```

Components: `Glass`, `GlassSwitch`, `GlassSlider`, `GlassCheckbox`, `GlassRadio`, `GlassTextField`, `GlassTabBar`,
`GlassSidebar`, `GlassProgress`, `GlassSegmented`, `GlassStepper`, `GlassRangeSlider`, `GlassBlockSlider`,
`GlassPopover`, `GlassMenu`, `GlassSelect`, `GlassTooltip`, `GlassSheet` — the same options as the React ones
(as props), plus `look`, `lookColor`, `glass-props` (per-part glass props) and `groups`. Events:
`update:modelValue`, `change`, and `change-end` / `clear` / `select` / `open-change` / `close` where the control has
them. Plugin options: `look`, `config`, `auto` (also scan the page for `data-glassparency` attributes and glass
classes; default `false`), `classes`, `components: false` (only the directive). Without the plugin, import
`vGlass` and the components directly — the glass starts on first use. Server rendering: nothing touches the page
until a component mounts in the browser.

## Svelte

`glassparency/svelte` (Svelte 5, runes): `use:glass` and an action for every control, plus components.

```svelte
<script>
  import { glass, startGlass, GlassSwitch, GlassSelect } from 'glassparency/svelte';
  startGlass({ look: 'clear' });          // optional: the glass starts by itself on first use
  let wifi = $state(true);
  let sort = $state('a');
</script>

<div use:glass={'card'}>…</div>
<div use:glass={{ group: 'card', look: 'smoke' }}>…</div>
<GlassSwitch bind:checked={wifi} aria-label="Wi-Fi" />
<GlassSelect bind:value={sort} options={[{ value: 'a', label: 'Alpha' }]} />
```

The components (the same list as Vue's) ship as `.svelte` source, compiled by your app's Svelte like any Svelte
library; values are `bind:`-able and callbacks are lower-case props (`onchange`, `onchangeend`, `onselect`…). The
actions (`glass`, `glassSwitch`, `glassSlider`, … `glassSelect`) are plain JavaScript —
`glassparency/svelte/actions` imports them without the components, and they fit any framework:
`const a = glassSwitch(el, { checked, onChange }); a.update({ checked }); a.destroy();`

## Tailwind CSS

`glassparency/tailwind` adds classes that mark elements for glass:

| Class | |
|---|---|
| `glass` | Glass (group `panel`) |
| `glass-clear`, `glass-frosted`, `glass-tinted`, `glass-smoke` | Glass with that [look](#looks-clear-frosted-tinted-dark-smoke) |
| `glass-group-card` | The glass group (`glass-group-[myGroup]` for your own) |
| `glass-tint-rose-500` | The tinted look's colour (any theme colour, or `glass-tint-[#ff2d55]`) |

```css
/* Tailwind v4 */
@import "tailwindcss";
@plugin "glassparency/tailwind";
```
```js
// Tailwind v3 — tailwind.config.js
plugins: [require('glassparency/tailwind')],
```
```html
<section class="glass-frosted glass-group-card rounded-3xl p-6">…</section>
<button class="glass-tinted glass-tint-rose-500 glass-group-button rounded-full px-5 py-2">Save</button>
```

The glass itself is attached by the library, which finds these classes the way it finds `data-glassparency`
attributes: load the script build, or call `start()` from `glassparency/vanilla` (in a React / Next.js app that
already renders `<GlassProvider>`: `start({ provider: false })`). Until the glass is attached each class shows a
plain-CSS stand-in (translucent background + backdrop blur in that look), so the page never shows bare boxes while
loading. Options: `@plugin "glassparency/tailwind" { fallback: false; }` (v4) or
`require('glassparency/tailwind')({ fallback: false })` (v3) turn the stand-in off. Class detection can be turned
off with `start({ classes: false })` (or `data-no-classes` on the script tag).

## Next.js and server rendering

Every entry that runs in the browser (`glassparency`, `/devtools`, `/vanilla`, `/vue`, `/svelte`) starts with
`"use client"`, and none touches `window` or `document` while loading — so they can be imported from App Router
server components (`<GlassProvider>` in `app/layout.js`, `<Glass>` in a page), from Nuxt and from SvelteKit.
The glass starts in the browser after hydration; the server renders your HTML unchanged. For the classes /
attributes in a Next.js app, start the auto-attach in a client component:

```jsx
'use client';
import { useEffect } from 'react';
import { start } from 'glassparency/vanilla';
export function GlassClasses() {
  useEffect(() => start({ provider: false }), []);
  return null;
}
```

---

## Switches and sliders

Liquid Glass controls that behave like the ones in macOS 26:
- **Switch:** click it, or drag the knob. While pressed, the solid knob swells into clear glass that bends the
  track behind it. The track colour fades between off and on as the knob moves, and it snaps to the nearer side
  when you let go.
- **Slider:** drag the knob or click the track. The knob turns into glass while you hold it, with the fill
  showing through.
- **Keyboard and screen readers:** Space/Enter toggles a switch; arrows, Page Up/Down and Home/End move a
  slider. They use `role="switch"` and `role="slider"` with live `aria-*` values.
- **Fallback:** without WebGL they keep the same shapes and motion in plain CSS.

```jsx
import { GlassSwitch, GlassSlider } from 'glassparency';

<GlassSwitch checked={wifi} onChange={setWifi} aria-label="Wi-Fi" />
<GlassSlider value={volume} onChange={setVolume} min={0} max={100} aria-label="Volume" />
```

- Both work controlled (`checked` / `value`) or uncontrolled (`defaultChecked` / `defaultValue`).
- `GlassSlider` also has `step` and `onChangeEnd` (called when the user lets go).
- Size them with CSS (`width` / `height`). The default switch is 46×26 px; a slider is 28 px tall and fills its
  container's width.
- Their looks are the config groups `switch` / `switchOn` (track), `switchKnob` / `switchKnobActive`,
  `sliderTrack`, `sliderFill` and `sliderKnob` / `sliderKnobActive`. Pass `groups` to use your own.

**Without React,** use `createSwitch(el, { checked, onChange })` and `createSlider(el, { value, min, max, onChange })`.
With the script build, just mark native inputs:

```html
<label for="wifi">Wi-Fi</label>
<input id="wifi" name="wifi" type="checkbox" checked data-glassparency-switch>
<input name="volume" type="range" min="0" max="10" value="4" aria-label="Volume" data-glassparency-slider>
```

The input stays in the page, hidden and kept in sync, so forms, `<label for>` and `input` / `change` listeners
keep working.

---

## Checkboxes, radios, text fields, tab bars, sidebars and progress bars

More Liquid Glass controls, built the same way as the switch: every part is glass, and they squish and stretch
when pressed (see "Squish & stretch").
- **Checkbox:** a rounded glass box that fills with the accent colour and draws its tick. Let go away from it and
  nothing changes, like macOS.
- **Radio:** a glass circle with a white dot that pops in. Radios with the same `name` uncheck each other; arrow
  keys move between them.
- **Text field:** a glass capsule round a native `<input>`. Focus lights its rim; `clearable` adds a round ×
  button that swells when pressed (iOS).
- **Tab bar:** like iOS 26. Press and slide along it: the selection lifts into a clear glass lens, bigger than the
  bar, that follows your finger, stretches with its speed and magnifies the icons under it. The accent colour
  wipes across each icon exactly where the lens is. Let go and it lands on the nearest tab with a wobble.
  It's WebGL glass on layer `top` in every browser **and on phones** (no setup: the provider hosts that layer
  itself, and `top` is in the default `global.mobileLayers`), sized like iOS (62px tall, icon over an 11px
  label). Give the bar's wrapper a `z-index` above 48 if it's inside a stacking context.
- **Sidebar:** the same sliding lens, vertical (click a row, or press and drag).
- **Progress bar:** a glass fill that springs to its value, with an optional glass bead on its end. With no value it
  shows a liquid drop sliding back and forth.

```jsx
import { GlassCheckbox, GlassRadio, GlassTextField, GlassTabBar, GlassSidebar, GlassProgress } from 'glassparency';

<GlassCheckbox checked={onDesktop} onChange={setOnDesktop}>On Desktop</GlassCheckbox>
<GlassRadio name="size" checked={size === 's'} onChange={() => setSize('s')}>Small</GlassRadio>
<GlassTextField icon={<SearchIcon />} clearable value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
<GlassTabBar value={tab} onChange={setTab} role="tablist">
  {tabs.map((t) => <button key={t.name} data-gp-item role="tab">{t.icon}<span>{t.name}</span></button>)}
</GlassTabBar>
<GlassSidebar value={page} onChange={setPage}>{pages.map((p) => <a key={p.href} href={p.href} data-gp-item>{p.name}</a>)}</GlassSidebar>
<GlassProgress value={0.4} bead />   <GlassProgress value={null} /> {/* busy */}
```

- Tab bar and sidebar items are their children marked `data-gp-item`. Colour them with CSS: `--gp-item-color`
  (normal) and `--gp-accent` (under the lens).
- `glassProps` gives a part per-element glass props, e.g. `glassProps={{ box: { style: 'crystal' } }}`
  (parts: checkbox / radio `box`, `dot`; text field `field`, `clear`; bars `bar`, `lens`, `lensActive`;
  progress `track`, `fill`, `bead`). `groups` swaps a part's config group.
- **Without React:** `createCheckbox`, `createRadio`, `createTextField`, `createTabBar`, `createSidebar`,
  `createProgress` (`(el, opts)`, each returns `{ update, destroy }`).
- **Script build:** mark plain HTML. Inputs stay in the page, hidden and in sync:

```html
<label><input type="checkbox" checked data-glassparency-checkbox> On Desktop</label>
<label><input type="radio" name="size" value="s" data-glassparency-radio> Small</label>
<div data-glassparency-field data-glassparency-clearable><input placeholder="Search"></div>
<nav data-glassparency-tabbar><button>Home</button><button aria-selected="true">Radio</button></nav>
<nav data-glassparency-sidebar><a href="/">Home</a><a href="/radio" aria-current="page">Radio</a></nav>
<progress data-glassparency-progress data-glassparency-bead value="40" max="100"></progress>
```

  A bar's children are its items; picking one fires `glassparency:change` (`event.detail.index`) on the bar.
  `data-glassparency-props='{"style":"crystal"}'` works on all of them.

---

## Segmented control, stepper, range and block sliders

- **Segmented control:** a small glass capsule with a sliding lens on the picked segment (Day / Week / Month).
  Tap a segment, or press and slide the lens across. It's the tab bar's lens in compact proportions (32 px tall,
  text segments) and on the `float` layer like the switch, so it sits in the page like any control.
- **Stepper:** one glass capsule reading **− value +**. Tap for one step; hold to repeat, faster and faster. The
  capsule leans towards the half you press. A half at its limit is dimmed (`wrap` goes round instead).
  `showValue={false}` hides the number; `format` writes it your way (`(v) => v + ' kg'`).
- **Range slider:** the slider with two knobs (`value={[low, high]}`). They never cross; press nearest the one
  you want. Same parts, groups and pressed-glass knobs as `<GlassSlider>`.
- **Vertical slider:** `orientation="vertical"` with one knob (`value={40}`); the value grows upwards.
- **Block slider:** Control Center's thick slider. The white fill *is* the value (no knob). Drag anywhere and the
  value moves **with** your finger (relative, not a jump); tap to jump. Pull past either end and the block
  stretches like rubber, then springs back. Its icon (the children) is black by default — set
  `--gp-block-icon` (or your own `color`) to change it.

```jsx
import { GlassSegmented, GlassStepper, GlassRangeSlider, GlassBlockSlider } from 'glassparency';

<GlassSegmented value={range} onChange={setRange}>
  {['Day', 'Week', 'Month', 'Year'].map((t) => <button key={t} data-gp-item role="tab">{t}</button>)}
</GlassSegmented>
<GlassStepper value={qty} onChange={setQty} min={0} max={20} aria-label="Quantity" />
<GlassRangeSlider value={price} onChange={setPrice} min={0} max={500} aria-label="Price" />   {/* price = [50, 300] */}
<GlassRangeSlider orientation="vertical" value={level} onChange={setLevel} style={{ height: 160 }} />
<GlassBlockSlider value={brightness} onChange={setBrightness} aria-label="Brightness"><SunIcon /></GlassBlockSlider>
<GlassBlockSlider orientation="horizontal" value={volume} onChange={setVolume}><SpeakerIcon /></GlassBlockSlider>
```

- Sizes: segmented 32 px tall (`width` with CSS), stepper 34 px tall, range 28 px tall, vertical 28 × 160, block
  72 × 160 (horizontal 220 × 56). Override them with your own CSS.
- `glassProps` parts: segmented `bar`, `lens`, `lensActive`; stepper `body`; range `track` (the knobs follow its
  style, like the slider); block `body`.
- Two knobs or one, and the orientation, are fixed per instance (change them and the control is re-created).
- **Without React:** `createSegmented`, `createStepper`, `createRangeSlider`, `createBlockSlider` (`(el, opts)`,
  each returns `{ update, destroy, value }`).
- **Script build:** mark plain HTML. Native inputs stay in the page, hidden and in sync (forms and `input` /
  `change` listeners keep working):

```html
<div data-glassparency-segmented><button>Day</button><button aria-selected="true">Week</button><button>Month</button></div>
<input type="number" min="0" max="20" value="3" data-glassparency-stepper aria-label="Quantity">
<div data-glassparency-range aria-label="Price"><input type="range" value="20"><input type="range" value="80"></div>
<div data-glassparency-range data-glassparency-vertical><input type="range" value="40" aria-label="Level"></div>
<div data-glassparency-block aria-label="Brightness"><svg…/><input type="range" value="60"></div>
```

  The segmented control fires `glassparency:change` (`event.detail.index`); a block slider also fires it with
  `event.detail.value`. `data-glassparency-horizontal` lays a block slider down; `data-glassparency-wrap` makes a
  stepper wrap round.

---

## Popovers, menus, selects, tooltips, sheets and toasts

All of these appear **above everything** on the page: they live in one shared overlay on `<body>` with its own
glass canvas (the `modal` layer), started once while the page is idle after the first one is created and kept
from then on, so nothing waits for a canvas when you open one.

- **Popover:** a glass button whose panel grows out of it. It's **one glass**: the panel starts exactly on the
  button (its box and its look), springs out over it to full size while its look turns into the panel's, and its
  content fades in. Closing plays it backwards and lands on the button, which takes over again in that same frame.
  The button's own glass steps aside while the panel stands in for it, so there are never two glasses or two
  labels on screen (like iOS 26 menus). Escape or a press outside closes it.
- **Menu:** a popover of items. A soft highlight **slides** between items as you hover or use the arrow keys;
  Enter / click picks, a letter jumps to an item, Escape / Tab close. `data-gp-keep-open` on an item keeps the
  menu open when it's picked.
- **Select:** a menu that remembers its value: a ✓ on the picked option, and it opens with that option
  highlighted.
- **Tooltip:** a small glass capsule above the element after a short hover (or keyboard focus), popping in with a
  bounce. Once one has shown, the next shows at once for a moment (like macOS).
- **Sheet:** an iOS bottom sheet. It rests at **detents** (fractions of the window height); drag its top — a flick
  carries it to the next detent. The glass gets thicker and frostier, and the page darker, as it rises. Drag it
  down, tap the dimmed page, or press Escape to close it.
- **Toasts:** banners that drop in from the top with a springy stretch, stack (3 at most), and leave after a few
  seconds — paused while hovered or held. Swipe one up to dismiss it.

```jsx
import { GlassPopover, GlassMenu, GlassSelect, GlassTooltip, GlassSheet, useGlassToaster } from 'glassparency';

<GlassPopover label="Info">This panel grew out of its button.</GlassPopover>

<GlassMenu label="Actions" onSelect={(i, item) => run(item.textContent)}>
  <button role="menuitem">New note</button>
  <button role="menuitem">Share…</button>
  <button role="menuitem">Delete</button>
</GlassMenu>

<GlassSelect
  value={sort}
  onChange={setSort}
  options={[{ value: 'recent', label: 'Most recent' }, { value: 'name', label: 'Name' }]}
  aria-label="Sort by"
/>

<GlassTooltip text="Share"><button aria-label="Share"><ShareIcon /></button></GlassTooltip>

<GlassSheet open={open} onClose={() => setOpen(false)} detents={[0.4, 0.9]}>
  <h3>Details</h3>…
</GlassSheet>

const toast = useGlassToaster();
toast.show({ title: 'Saved', body: 'Your changes are saved.', icon: '<svg …>…</svg>' });
```

- The trigger is a glass button (`triggerGroup`, default `button`; `triggerClassName`, `triggerGlass` for its
  per-element props). The panel takes `className`, `group` (`popover` / `menu`) and `glassProps`.
- `placement`: `"bottom"` grows down from the button's top edge, `"top"` up from its bottom edge, `"auto"`
  (default) down unless only up fits. `align`: `"start"` (default), `"center"`, `"end"`. Panels stay inside the
  window and follow the button while the page scrolls.
- Tooltip: `placement` `"top"` (default, flips below when there's no room) or `"bottom"`, `delay` (ms, default 500).
- Sheet: `detents` (default `[0.45, 0.92]`), `detent` (index to open at / move to), `onDetentChange`. Its look
  blends from group `sheet` (lowest detent) to `sheetFull` (highest).
- Toasts: `show({ title, body, icon, duration, role, props })` returns a function that dismisses that toast;
  `duration: 0` keeps it until it's swiped away. `role: "alert"` has screen readers announce it straight away
  (errors); the default `"status"` waits politely. `useGlassToaster({ max, duration })` sets the defaults.
- **Without React:** `createPopover(button, panel, opts)`, `createMenu(button, panel, opts)`,
  `createSelect(button, panel, opts)` (options are the panel's children with `data-value`),
  `createTooltip(el, { text })`, `createSheet(el, opts)` (`open(detent)`, `close()`, `snapTo(i)`),
  `createToaster(opts)` (`show()`, `clear()`). `getGlassOverlay()` returns the shared overlay element (to portal
  your own panel into it).
- **Script build:** mark plain HTML. Give the button its own glass with `data-glassparency="button"` as usual;
  `data-glassparency-panel-props='{…}'` on it styles the panel. Put `hidden` on panels so they don't flash before
  the script loads.

```html
<select data-glassparency-select aria-label="Sort"><option value="recent">Most recent</option>…</select>
<button data-glassparency="button" data-glassparency-menu="acts">Actions</button>
<div id="acts" hidden><button role="menuitem">Copy</button><button role="menuitem">Delete</button></div>
<button data-glassparency="button" data-glassparency-popover="info">Info</button>
<div id="info" hidden>…</div>
<button data-glassparency-tooltip="Share" aria-label="Share">…</button>
<div id="details" data-glassparency-sheet data-glassparency-detents="0.4,0.9" hidden>…</div>
<button data-glassparency-open="details">Details</button>
<script>Glassparency.toast({ title: 'Saved', body: 'Your changes are saved.' });</script>
```

  The `<select>` stays in the page, hidden and in sync. A menu fires `glassparency:select` (`detail.index`,
  `detail.item`) on its button; popovers and menus fire `glassparency:toggle` (`detail.open`); a sheet fires
  `glassparency:close`. `data-glassparency-open="<id>"` opens a sheet, popover or menu, and so do
  `Glassparency.open(id)` / `Glassparency.close(id)`. `data-glassparency-placement` / `-align` place a panel.

---

## Keyboard and screen readers

Every control works from the keyboard and tells screen readers what it is, with the WAI-ARIA roles and states
written for you. There is **no focus ring** on any glass control (by design — like Apple's controls); if your
site needs one, add your own `:focus-visible` style (the library's rules have zero specificity).

| Control | Role / states | Keys |
|---|---|---|
| Switch | `switch`, `aria-checked` | Space / Enter toggle |
| Checkbox | `checkbox`, `aria-checked` | Space (and Enter) toggle |
| Radio | `radio`, `aria-checked`; radios with the same `name` are one group: their shared parent gets `role="radiogroup"` (if it has no role), and only the checked radio is a Tab stop | ← → ↑ ↓ pick the previous / next radio |
| Slider, vertical / block slider | `slider`, `aria-valuenow` / `-valuemin` / `-valuemax`, `aria-orientation` | ← → ↑ ↓ one step, PageUp / PageDown a tenth, Home / End min / max |
| Range slider | a `group` of two `slider` knobs ("Minimum", "Maximum") | the same, on the focused knob |
| Stepper | `group` with "Decrease" / "Increase" buttons; the value is read out when it changes | ↑ → step up, ↓ ← down, Home / End min / max |
| Segmented control | `tablist` of `tab`s (`aria-selected`), roving focus: only the selected tab is a Tab stop | ← → (wrap), Home / End, Enter / Space |
| Tab bar, sidebar | links / buttons, `aria-current="page"` on the selected one — or set `role="tablist"` on the bar and it becomes a tab list like the segmented control | ← → (↑ ↓ for a sidebar), Home / End |
| Popover | `dialog`; its button gets `aria-haspopup`, `aria-expanded`, `aria-controls` | Enter / Space open (focus moves in), Escape closes (focus back on the button) |
| Menu | `menu` of `menuitem`s, roving focus | ↓ / ↑ / Enter / Space on the button open it; ↓ ↑ Home End move, Enter / Space pick, letters jump, Escape closes, Tab closes and moves on |
| Select | `listbox` of `option`s (`aria-selected`) | as the menu |
| Tooltip | `tooltip`, linked with `aria-describedby` | shown on keyboard focus, Escape hides |
| Sheet | `dialog`, `aria-modal` | Escape closes; Tab / Shift+Tab stay inside it; focus returns where it was |
| Toasts | announced through a polite (`status`) or assertive (`alert`, `role: "alert"`) live region | — |
| Progress | `progressbar`, `aria-valuenow` (none while busy) | — |

---

## Styles: default, crystal, frosted

Every group has a `style`:
- **`default`:** the group's own values (Apple's look).
- **`crystal`:** clearer, thicker glass that bends what's behind it more; accent parts (a checked box, a primary
  button) stay coloured but see‑through.
- **`frosted`:** milky, heavily frosted glass, in the group's own tint colour.

The styles are rules applied to each group's values, so they work on any group, including your own. Solid parts
(switch knobs, a radio's dot) never change. A control's parts follow its style: a crystal tab bar has a crystal lens.
Switches and sliders keep their track; only crystal changes their knob's glass while pressed.

```js
configureGlass({ groups: { card: { style: 'frosted' }, tabBar: { style: 'crystal' } } });
<Glass group="button" glass={{ style: 'crystal' }}>Save</Glass>
```

Fine-tune a style for one group with a `crystal` or `frosted` block, merged over the rules (like `hover`):
`tabLensActive: { frosted: { tintOpacity: 0.04, blur: 0 } }`.

---

## Squircle corners, pointer / tilt highlight, scroll edge effect

All three are **off by default** — existing glass looks exactly the same until you turn them on.

**Squircle corners** — `corners: "squircle"` gives a rounded rectangle Apple‑style *continuous‑curvature* corners
(a superellipse, exponent 4, bending over 1.6 × `radius` so it looks about as round) instead of quarter circles —
the outline, rim, border, shadow and refraction all follow it. (`profile` only shapes the rim's lens curve.) Live and
CSS glass use `corner-shape: squircle` where the browser has it (the identical curve); elsewhere CSS glass clips to
the exact path, and live glass in an older Chromium keeps round corners. Circles and capsules stay round. The rim
(`bevel`) is capped at 0.38 × the corner's extent — a squircle's tightest bend.

```json
{ "groups": { "card": { "corners": "squircle", "radius": 24 } } }
```

**Pointer / tilt highlight** — `lightFollow` turns the specular rim towards the mouse (`"pointer"`), follows the
device tilt (`"tilt"`), or picks one by device (`"auto"`: pointer with a mouse, tilt on touch screens).
`lightFollowAmount` (0–1, default 1) sets how far it turns away from `lightAngle`. The motion is smoothed and stops
when settled; with `prefers-reduced-motion` the light stays put, and with `"off"` nothing runs at all (no
listeners). **iOS** only gives tilt data after the user allows it, from a tap — the library never asks by itself:

```js
import { enableTiltHighlight } from 'glassparency';
button.addEventListener('click', () => enableTiltHighlight()); // → Promise<boolean>
```

**Scroll edge effect** (iOS 26) — content scrolling under a pinned bar blurs and fades out over the last few dozen
px instead of a hard cut. `effect: "soft"` (gradual blur + fade) or `"hard"` (a more opaque backing with a crisp
edge), on the `top`, `bottom` or `both` edges. `inset` = the bar's height (fully covered), `size` = the fade beyond
it (default 32 px), `color` = what it fades into (`"auto"`: the nearest opaque background). Pure CSS while scrolling
(backdrop‑filter slices + masks); a bar *inside* the scroller needs `z-index` ≥ 2 to stay above it.

```jsx
import { GlassScrollEdge } from 'glassparency';

<GlassScrollEdge edges="both" effect="soft" inset={{ top: 56, bottom: 80 }} style={{ height: '100vh' }}>
  <header style={{ position: 'sticky', top: 0, zIndex: 2 }}>…</header>
  …
</GlassScrollEdge>
```

Without React: `createScrollEdge(scroller | window, { edges, effect, size, inset, color }) → { update, destroy }`,
or in the script build `<div data-glassparency-scroll-edge="top soft" data-glassparency-scroll-edge-inset="56">`
(also `-size`, `-color`; `-inset="56 80"` = top / bottom; on `<body>` = the page's own scrolling). WebGL glass
refracts a picture of the page that doesn't include the blur; live glass (Chromium) sees it.

---

## Squish & stretch

Liquid Glass is jelly: pressed, it swells; dragged, it's pulled towards the pointer, stretching along the pull and
thinning across it; let go, it springs back with a wobble. Turn it on for any group:

```js
configureGlass({ groups: { button: { squish: 0.8, squishGrow: 1.1, squishPull: 10, squishBounce: 0.55 } } });
```

- The element is moved with the CSS `translate` and `scale` properties (not `transform`), so its glass, text and
  icon all deform together. Don't set those two properties on squishing elements yourself.
- While on, it replaces `pressScale`. Released away from the element, no `click` fires.
- `createSquish(el, readCfg)` gives the same motion to anything you animate yourself; `stretchFor(ux, uy, amount)`
  is the stretch maths for moving glass.
- The OS "reduce motion" setting turns the pull and wobble off.

## Shape springs

Spring any element between shapes: its width, height and corner radius each follow an under‑damped spring, so it
overshoots and wobbles into the new shape like a liquid. Works on glass (the glass corner radius follows) and on
plain elements alike.

```jsx
import { useShapeSpring } from 'glassparency';

const ref = useRef(null);
useShapeSpring(ref, expanded ? { width: 320, height: 200, radius: 28 } : { width: 120, height: 120, radius: 60 });
return <Glass ref={ref} group="card" glass={{ shape: 'roundedRectangle' }} onClick={toggle} />;
```

```js
// Without React:
const spring = createShapeSpring(el, { stiffness: 170, damping: 0.42 });
spring.to({ width: 260, height: 72, radius: 36 });   // any of width / height / radius
spring.to({ radius: 12 }, { immediate: true });       // jump, no animation
```

- Options: `stiffness` (default 170 — higher is snappier), `damping` (0–1, default 0.42 — lower wobbles more),
  `radiusDamping` (default 0.55), `onRest()`.
- The size is the element's own CSS `width` / `height`; the radius is set on both the glass and the element's CSS
  `border-radius`. Use `shape: "roundedRectangle"` glass (circles and capsules ignore `radius`).
- The OS "reduce motion" setting jumps straight to the new shape.

## Morph any element into another: `glassMorph`

Apple's liquid morph for **any two elements**: a button, an icon or a card turns into a menu, a panel, a dialog,
a photo — anything laid out where it should end up.

```jsx
import { useGlassMorph } from 'glassparency';

const button = useRef(null);
const panel = useRef(null);
useGlassMorph(button, panel, open);   // open → it grows out of the button; closed → melts back

<button ref={button} onClick={() => setOpen((v) => !v)}>More</button>
<Glass ref={panel} group="menu" className="menu">…</Glass>   {/* the hook hides it while closed */}
```

```js
// Without React: hide the target with the `hidden` attribute; glassMorph shows it.
const morph = glassMorph(button, panel);          // { finished, reverse(), cancel() }
await morph.finished;
await morph.reverse().finished;                    // mid-film, it plays back from where it is
glassMorph(button, panel, { direction: 'out' });   // close one that is already open
button.addEventListener('pointerenter', () => glassMorph.warm(button, panel));  // optional: picture ready early
```

The film: the target buds out of `from`. `from` itself stays exactly as it is (its size, its look, its content) and
joins the film's liquid while it plays; the new glass starts on `from`, swells into the target's exact box and corner
radius with a liquid neck back to `from` while they're close, and blends from `from`'s look to the target's. Then the
target takes over with its own glass and its content fades in. Closing melts it back into `from`. (Like a morph
toolbar's items coming out of its + button.)

| Option | Default | |
|---|---|---|
| `duration` / `reverseDuration` | 780 / 620 ms | Length of the film each way |
| `group` | the target's group, else `panel` | Glass group the film is drawn with |
| `look` | the target's look | End `tintOpacity` / `blur` of the film (it starts in `from`'s look) |
| `morphRadius` | 34 | How far the liquid neck reaches before it snaps (px) |
| `layer` | `float` | Glass layer of the film |
| `fadeContent` | `true` | Fade the target's content in at the end (and out first when closing) |
| `direction` | `in` | `out` = the shown target melts back into `from` and is hidden |
| `keepFrom` | `true` | `false` = `from` is hidden while the film plays and a stand-in takes its place (the 1.4 behaviour) |

- The target can be any element, with or without glass. It is measured where it is laid out, so give it its final
  position (e.g. `position: fixed` / `absolute`) before morphing.
- Where WebGL glass isn't running (phones' CSS layout, no WebGL, Reduce transparency) or with Reduce motion, the
  target simply grows out of `from` with a transform + fade — your code doesn't change.

## Glass that melts together: `<GlassGroup>`

Like Apple's `GlassEffectContainer`: the glass inside a group is drawn as **one liquid surface**. Pieces that come
within `spacing` px of each other melt into one blob, and pull apart again as they move away — live, while they
animate (CSS transitions, springs, drags).

```jsx
import { Glass, GlassGroup } from 'glassparency';

<GlassGroup spacing={24} className="toolbar">
  <Glass as="button" group="iconButton">…</Glass>
  <Glass as="button" group="iconButton">…</Glass>
</GlassGroup>
```

```js
// Plain JS
const group = createGlassGroup(toolbar, { spacing: 24 });
group.setSpacing(40);   // animate it, e.g. to pull pieces apart
group.destroy();        // separate glass again
```

```html
<!-- Script build -->
<div data-glassparency-group="24">
  <button data-glassparency="iconButton">…</button>
  <button data-glassparency="iconButton">…</button>
</div>
```

- `spacing` (px, default 24, max 200): two edges join once the gap between them closes to `spacing`; a soft
  bulge starts a little before that.
- Members are the glass elements whose nearest group container is this one (nested groups are separate), on
  the same layer and tier. The container may have glass of its own; it isn't a member.
- **Cap: 16 pieces per group** (the liquid shader's per-pixel loop). Of those, up to 4 can have custom shapes.
  Pieces past the cap are drawn as separate glass (no melting).
- Group members are always drawn by WebGL (live SVG glass can't melt). Where WebGL isn't running, every
  member keeps its own CSS glass: separate pieces, no melting.
- An element's own `morph` name wins over its group.

## Custom shapes: paths, icons and glass text

Glass in any outline. The shape is turned into a distance field (rasterized, then an exact distance transform,
cached per shape and size), and the glass shader reads that instead of its rounded rectangle, so the rim,
refraction, light, border, shadow and group melting all follow the real outline. The shape is fitted into the
element's box (centred; `fit: 'fill'` stretches it).

```jsx
// Any SVG path (viewBox optional: without one the path's own bounds are used)
<Glass group="iconButton" shape={{ path: 'M12 21.35l-1.45-1.32C5.4 15.36 …z', viewBox: '0 0 24 24' }} style={{ width: 120, height: 120 }} />

// A hole: fillRule "evenodd"
<Glass group="iconButton" shape={{ path: 'M12 1a11 11 0 1 0 0 22…z M12 6…z', fillRule: 'evenodd', viewBox: '0 0 24 24' }} />

// An icon: the <svg> inside the element (stroked icons work too). It's hidden — the glass is the icon.
<Glass as="button" group="iconButton" shape={{ svg: 'child' }} aria-label="Favourite"><StarIcon /></Glass>
// …or markup / an element: shape={{ svg: '<svg viewBox="0 0 24 24">…</svg>' }}

// Headline text made of glass, in the element's own font
<GlassText as="h1" group="panel" style={{ fontSize: 120, fontWeight: 900 }}>Liquid</GlassText>
```

- `shape` on `<Glass>` is the same as `glass={{ shape }}`, so it also works in `attachGlass(el, group, { shape })`,
  `data-glassparency-props='{"shape":{"text":true}}'` and `<glass-ui props>`. `{ text: true }` uses the
  element's own text.
- `<GlassText>`: the DOM text stays (selectable, read by screen readers) but turns see-through while glass draws
  it. It's `inline-block` + `white-space: pre` by default (`\n` starts a new line); big, bold type works best —
  thin strokes are all rim. Its shape is redrawn when the text, size or loaded web fonts change.
- While a custom shape's size keeps changing (a spring, a press), its last field is stretched; a fresh one is
  made once the size holds still.
- Custom shapes are drawn by WebGL. **CSS fallback:** the frosted, tinted pane masked to the outline (an SVG
  mask for paths / icons, the rasterized text for text) — no rim light or refraction there.
- An icon from `{ svg }` is drawn as an image: it can't use outside images or fonts.

## Readable text automatically: `textColor: "auto"`

On by default (since 1.5): text on glass is light or dark, whichever is readable over what's behind it.

```js
// pick the two colours it chooses between (for every group, or one):
configureGlass({ defaults: { textLight: '#ffffff', textDark: '#0b1b3a' } });
// a fixed colour turns it off for that group; null = your own CSS text colour:
configureGlass({ groups: { chip: { textColor: '#ffffff' }, card: { textColor: null } } });
```

The text (and `currentColor` icons) becomes `textLight` or `textDark`, whichever contrasts more (WCAG contrast
ratio) with what is really behind the glass, including its own tint and brightness. It switches with a margin, so it
doesn't flicker over a busy picture, and fades into the other colour (no CSS transition is set on your element, so
its own transitions keep working).

- **WebGL glass** samples the exact image it refracts, on the GPU: a tiny mip level of it is copied asynchronously
  (no GPU stall), at most about 4 times a second and only while frames are drawn. An idle page costs nothing.
- **Live glass** (Chromium's floating glass) and the **CSS fallback** have no pixels to read, so the colour is
  estimated from the tint and the page's background colour. Over photos, give such glass some tint, or a fixed
  `textColor`.

---

## Built-in groups (presets)

A **group** is a named look. These come built in. List them with `glassGroupNames()`, or read
`glassparency/glass.config.json`.

| Group | Use |
|---|---|
| `card`, `panel`, `tile`, `column` | Content surfaces |
| `button`, `buttonPrimary`, `buttonDanger`, `buttonGhost`, `buttonTint`, `buttonTintOn` | Capsule buttons |
| `iconButton`, `iconButtonActive` | Round icon buttons |
| `switch`, `switchOn`, `switchKnob`, `switchKnobActive` | `<GlassSwitch>`: track off / on, knob at rest / as glass |
| `sliderTrack`, `sliderFill`, `sliderKnob`, `sliderKnobActive` | `<GlassSlider>` parts |
| `checkbox`, `checkboxOn`, `radio`, `radioOn`, `radioDot` | `<GlassCheckbox>` / `<GlassRadio>`: box unchecked / checked, the radio's dot |
| `textField`, `textFieldFocus`, `textFieldClear` | `<GlassTextField>`: the capsule, focused, the × button |
| `tabBar`, `tabLens`, `tabLensActive` | `<GlassTabBar>`: the bar, its lens at rest / while dragged |
| `sidebarPanel`, `sidebarLens`, `sidebarLensActive` | `<GlassSidebar>` parts |
| `progressTrack`, `progressFill`, `progressBead` | `<GlassProgress>` parts |
| `segmented`, `segmentedLens`, `segmentedLensActive` | `<GlassSegmented>`: the capsule, its lens at rest / while dragged |
| `stepper` | `<GlassStepper>`: the − value + capsule |
| `blockSlider` | `<GlassBlockSlider>`: the block (the white fill is CSS, `--gp-block-fill`) |
| `popover` | `<GlassPopover>` panel (`<GlassMenu>` / `<GlassSelect>` use `menu`) |
| `tooltip` | `<GlassTooltip>` |
| `sheet`, `sheetFull` | `<GlassSheet>`: at its lowest / highest detent (blended between) |
| `toast` | Toasts from `useGlassToaster()` / `createToaster()` |
| `chip`, `alert` | Small capsules |
| `topbar`, `headerButton` | A floating header capsule and the buttons in it |
| `dock`, `menu` | Floating panels (the `float` layer) |
| `navActive`, `sidebar` | A sliding "lens" for the current menu item; a sidebar (off by default) |
| `modal`, `confirmPanel` | Dialogs (the `modal` layer, see "Layers") |
| `liquid` | A liquid morph group (shapes melt together) |

Make your own in the config: `groups: { myCard: { tint: '#fde68a', blur: 16 } }`, or ship a set of them with
`addGlassPresets()` (see "Configuration").

> **Changed after 1.2.1:** the presets named after one app's features (`chatPanel`, `chatMorph`, `dialPanel`,
> `dialMorph`, `notifPanel`, `notifMorph`, `scheduleTip`, `easterOrb`, `buttonCall`, `iconButtonCall`,
> `alertRinging`, `alertMissed`…) and `global.mobileLayers: ["top"]` were removed. Need one back? Copy it from
> the 1.2 `glass.config.json` into your config (or an `addGlassPresets()` pack).

---

## Configuration

Pass a config to `<GlassProvider config={…}>`, to `configureGlass(config)`, or to `window.GlassparencyConfig`.
It is **deep‑merged over the built‑in config**, so list only what you change.

```js
{
  global:   { … },                 // switches for the whole system (below)
  defaults: { … },                 // used by every group
  groups:   {
    button: { tintOpacity: 0.74, hover: { tintOpacity: 0.95 } },
    myCard: { tint: { from: '#c7d2fe', to: '#a5f3fc', angle: 135 }, blur: 14 },
  },
  themes:   { dark: { defaults: { … }, groups: { button: { tint: '#1e293b' } } } },
}
```

Bad values never break the page: they are clamped or replaced with the default, with one console warning each.

**Preset packs.** `configureGlass()` replaces the site config each time it's called. Groups you want to keep no
matter what (your design system's own looks, a theme package) go in a preset pack instead: merged over the
built-in presets and under the site config, kept by every `configureGlass()` call.

```js
const remove = addGlassPresets({
  groups: { promoCard: { tint: '#fde68a', blur: 16 } },
  themes: { dark: { groups: { promoCard: { tint: '#422006' } } } },
});
```

### Properties (per group, per element, or in `hover` / `pressed` / `disabled` blocks)

| Property | Values | What it does |
|---|---|---|
| `style` | `default`, `crystal`, `frosted` | The look family (see "Styles") |
| `enabled` | true/false | Glass on/off for the group. Off = the element's normal CSS, plus the colours / border / shadow / shape the group sets *itself*, as plain CSS |
| `sampler` | `auto`, `webgl`, `live` | How floating glass sees the page. `live` = the real page in real time (Chromium). `webgl` = page pictures. `auto` = live where possible |
| `shape` | `rectangle`, `roundedRectangle`, `circle`, `capsule` or a custom shape `{ path }` / `{ svg }` / `{ text }` (see "Custom shapes") | Outline of the slab |
| `radius` | px or `"auto"` | Corner radius (`auto` = the element's CSS `border-radius`, or 16 px) |
| `corners` | `round`, `squircle` | Corner shape of the outline: quarter circles, or Apple‑style continuous curvature (rounded rectangles) |
| `scale` | `{ x, y }` 0.5–1.5 | Glass size relative to the element |
| `bleed` | `{ top, right, bottom, left }` px | Hide the rim on those sides (full‑width bars) |
| `padding` | `{ top, right, bottom, left }` px | Moves the element in by this much (e.g. a header floating as a capsule) |
| `thickness` | 0–120 | Refraction strength |
| `bevel`, `bevelSegments` | 0–120 px, 1–16 | Width and smoothness of the rounded rim (only the rim bends light) |
| `profile` | `squircle`, `classic` | Rim curve: Apple‑style lens, or a quarter circle |
| `ior` | 1–2.5 | Index of refraction |
| `minify` | −0.5–0.5 | Lens: > 0 shows what's behind smaller (switch knob), < 0 magnifies it (tab bar lens) |
| `chromaticAberration` | 0–1 | Rainbow fringing at the rim |
| `blur` | px | Frost |
| `roughness`, `anisotropy` | 0–1 | Grain, directional smear (WebGL) |
| `distortion`, `distortionScale`, `temporalDistortion` | 0–2, 0–1 | Wavy / animated warp (WebGL; animated = GPU every frame) |
| `samples` | 1–16 | Refraction quality (WebGL) |
| `reflection` | 0–3 | Studio reflections on steep rims (WebGL) |
| `saturation`, `brightness` | 0–3, 0.5–1.5 | Colour of what's seen through the glass |
| `rimLight`, `rimWidth`, `lightAngle`, `innerGlow` | 0–1, px, deg, 0–1 | Specular rim and inner glow (CSS angles: −45 = top‑left) |
| `lightFollow`, `lightFollowAmount` | `off`, `auto`, `pointer`, `tilt`; 0–1 | Opt‑in: the rim light follows the pointer / device tilt (see above) |
| `pressScale`, `pressGlow` | 0.8–1.2, 0–1 | Grow and light up when pressed |
| `squish`, `squishGrow`, `squishPull`, `squishBounce` | 0–1, 1–1.6, px, 0–1 | Squish & stretch: strength (0 = off), swell, pull towards the pointer, wobble |
| `morph`, `morphRadius` | name, px | Glass with the same morph name (same layer) melts together within that distance |
| `tint`, `tintOpacity` | colour or `{ from, via?, to, angle }`, 0–1 | Glass colour / gradient and how strong it is |
| `textColor`, `font`, `fontWeight`, `iconColor`, `iconSize` | CSS values | Text and `<svg>` icon style while glass is on. `textColor: "auto"` = readable text (see above) |
| `textLight`, `textDark` | CSS colours | The two colours `textColor: "auto"` picks between (`#ffffff` / `#1d1d1f`) |
| `borderWidth`, `borderColor`, `borderOpacity` | px, colour, 0–1 | Hairline border drawn by the glass (follows its shape) |
| `shadowColor`, `shadowOpacity`, `shadowBlur`, `shadowX`, `shadowY`, `shadowSpread` | colour, 0–1, px | Drop shadow drawn by the glass |
| `keepBorder`, `keepShadow` | true/false | Also keep the element's own CSS border / box‑shadow |
| `layer`, `tier` | `auto`/`base`/`float`/`modal`/`top`, `auto`/0–5 | Which canvas draws it, and the order inside it |

**Colours** can be any CSS colour (`#hex`, `rgb()`, `hsl()`, `oklch()`, names) or `var(--token)`, read from the
element (also `var(--token, fallback)`). A colour's own alpha is ignored: use the matching `…Opacity` property.

### `global`

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch (false = your CSS everywhere) |
| `root` | `"body"` | CSS selector of your app's root. Its changes trigger redraws, and WebGL floating glass photographs it |
| `background` | `"auto"` | What base glass refracts (see "Page background") |
| `mobileQuery` | `"(max-width: 860px)"` | Layout that never starts WebGL (phones get your CSS). `null` = always try |
| `cssGlass` | `true` | The library's own CSS Liquid Glass wherever WebGL / live glass isn't drawing an element (Safari / Firefox without WebGL, phones, before WebGL starts): frosted pane in the group's tint, lit and unlit edges, soft shadow. `true` = 2 backdrop layers per element, `"full"` = 4 + a caustic (heavier), `"lite"` = 1, `false` = your own CSS only |
| `mobileLayers` | `["top"]` | Layers that still get WebGL in the mobile layout (only their own glass: tab bars). `[]` = all CSS there |
| `zIndex` | `{ base: -1, float: 49, top: 48 }` | Stacking of the page‑wide canvases (see "Layers") |
| `theme` | `"auto"` | `"light"` / `"dark"` forces a theme |
| `anchor` | `"page"` | The canvases scroll with the page, so glass can't trail behind its element; glass on fixed / sticky elements gets its own window-fixed canvas. `"viewport"` = the pre-1.4 window-fixed canvases |
| `backdrop` | `"snapshot"` | What floating WebGL glass refracts: `"snapshot"` = a picture of the page (every browser); `"canvas"` (experimental, Chromium 157+ HTML-in-Canvas) = the live page, every frame (the page scrolls in its own box; other-origin images without CORS draw blank) |
| `blur` | `"smooth"` | WebGL frost: `"smooth"` = a dual-Kawase blur (soft, steady while the page moves); `"mip"` = the GPU's box-filtered mipmaps (the pre-1.5 look) |
| `blend` | `"srgb"` | `"linear"` (opt-in) = the shaders mix rim light, border, saturation, morph glass and the frost in linear light: brighter rims over dark tints, frost that keeps bright spots. The tint over the refracted page stays sRGB |
| `maxDpr`, `bufferScale` | 1.5, 1 | Render resolution caps |
| `quality` | `"auto"` | Automatic quality: full quality, stepped down (`medium`: ≤ 4 samples, ¾ buffer, ≤ 1.25 dpr; `low`: ≤ 3, ½, 1) only while **animating** glass runs under ~40 fps, and back up once smooth. An idle page is never throttled. `"high"` / `"medium"` / `"low"` = fixed. `getGlassQuality()` says which level is in use |
| `powerSaving` | `true` | Saving power: nothing is drawn (and no page pictures are taken) while the tab is **hidden** — one redraw catches up when it's shown — and while the battery is **low (≤ 20 %) and unplugged** (Battery Status API, Chromium) the glass animates as with Reduce motion: springs jump to the end, no ripples or morph films. `false` = always in full. The OS **Reduce motion** setting is followed either way. `getGlassPower()` reports the state |
| `snapshot` | `{ enabled, debounceMs, minIntervalMs, margin, scale, fullPage: "mobile", mobileScale: 2 }` | Page pictures for WebGL floating glass. `fullPage` pictures the whole page (`true` / `"mobile"` / `false`), so pinned glass never runs out of picture while scrolling |
| `debugOutlines` | `false` | Pink outline round every slab |

---

## How it works (and what your page needs)

### Layers
Browsers allow only ~16 WebGL contexts, so glass is drawn by one transparent, click‑through canvas **per
layer**, not per element:

| Layer | z-index | What it sees |
|---|---|---|
| `base` | `global.zIndex.base` (−1) | Behind all page content. It refracts the page background (cards, buttons, sidebars). |
| `float` | `global.zIndex.float` (49) | Over the content. Headers, docks, menus. In Chromium it refracts the live page; elsewhere a picture of it. |
| `modal` | inside your dialog | Put `<GlassLayerHost />` inside your dialog's backdrop element. The backdrop's colour is used as the dimmer. |
| `top` | `global.zIndex.top` (48) | Pinned UI over the page (tab bars, by default). The provider hosts it, fixed to the window, while any glass uses it; a `<GlassLayerHost layer="top" />` of your own takes over. |

- A layer is picked automatically from the nearest glass parent. A group can force one with `layer`.
- Glass on glass works: a button refracts the card it sits on.
- Elements of a layer with no host (e.g. `modal` without `<GlassLayerHost>`) simply keep their CSS look.

**Checklist for your page:**
1. **Base glass needs a see‑through page.** The base canvas sits just above `<html>`/`<body>`. If a full‑page
   wrapper paints an opaque background over it, base glass is hidden. Give that wrapper
   `background: transparent`, or raise `global.zIndex.base`.
2. **Floating glass HTML must stack above the float canvas.** For example, a header with glass needs a
   `z-index` above 49 (or lower `global.zIndex.float`). Otherwise the canvas draws over its text in Safari
   and Firefox.
3. **Don't put `transform`, `filter` or `backdrop-filter` on an ancestor of a layer host.** It creates a
   new containing block.
4. **The glass replaces the element's background.** `:hover` background changes in your CSS won't show
   while glass is on. Use the group's `hover` block instead.
5. **Live glass draws on the element's `::before`.** Live elements shouldn't use `::before` themselves.
6. **Live glass scrolls with the element.** If a live element scrolls, put its content in an inner scroll
   box. Otherwise the glass scrolls away with the content.

### Page background
Base glass refracts a shader copy of the page background:
- **`"auto"` (default):** your `<body>` (or `<html>`) background **colour**, read live. Your real background
  stays visible. Gradients and images are refracted as their base colour.
- **An exact copy:** to match a gradient background, describe it per theme. It is then also drawn on screen
  under the glass.

```js
global: { background: {
  light: { base: { top: '#f5f7fd', bottom: '#eef1fa' },
           glows: [{ rx: 900, ry: 600, at: [0, 0], rgb: [99, 102, 241], alpha: 0.16, stop: 0.6 }] },
  dark:  { base: { top: '#0e1224', bottom: '#0b0e1a' } },
} }
```

### Live glass (Chromium) vs WebGL glass
- **Chromium (Chrome, Edge, Arc, Brave, Opera, Samsung Internet):** `backdrop-filter: url(#svg-filter)`
  bends the real page every frame — text, video, animations. It uses the same config: `thickness × (ior−1)`
  sets the bend, plus `bevel`, `chromaticAberration`, `blur`, `tint`, rim light and shape.
- **WebGL‑only properties:** `scale`, `anisotropy`, `roughness`, `distortion`, `samples` and `reflection`.
- **Safari and Firefox:** floating glass is WebGL. It refracts a picture of the page taken with
  [snapDOM](https://github.com/zumerlab/snapdom), retaken after changes, and up to ~0.5 s old.
  - Cross‑origin images without CORS headers are left out of the picture.
  - Mark heavy or private areas with `data-glass-ignore` to leave them out too.

### Liquid morph
Elements with the same `morph` name are drawn by one shader as a single smooth surface. Closer than
`morphRadius`, they melt into one; moving apart, they split into drops.

**Where morph glass must sit.** Melting needs the WebGL shader, so:
- **Not inside live glass.** In Chromium, glass inside a live glass element (e.g. inside a glass card)
  is drawn as a tint only, and the shapes won't melt. Put the morph elements in a parent without glass.
- **Use the `float` layer over a gradient or image page background.** With `background: "auto"`, WebGL
  glass on the `base` layer isn't drawn there, so the shapes keep their CSS look. Give them
  `layer: 'float'` (per group, or per element: `<Glass group="liquid" glass={{ layer: 'float' }} />`).
  On a plain-colour background, `base` works too.

For the common case — one element turning into another — use [`glassMorph`](#morph-any-element-into-another-glassmorph).
To animate a morph frame by frame yourself:
1. Move the elements yourself each `requestAnimationFrame`.
2. Change their look with `setGlassProps(el, { tintOpacity, blur, radius })` (no re‑render).
3. Call `reserveSnapshotArea(key, rect)` for the area the shapes will cover, and pass `null` when done.

### Dark mode
The top‑level settings are the light look. `themes.dark` lists only what changes. The theme is read live
from (first match wins):
1. `global.theme`;
2. `data-theme` / `data-bs-theme` on `<html>`/`<body>`;
3. a `dark` / `light` class on `<html>`/`<body>`;
4. the page's CSS `color-scheme`.

A site that never mentions dark mode stays light.

### Phones and tablets
- **Default:** below `mobileQuery` (860 px wide) the WebGL glass doesn't start (tab bars aside): glass elements get the library's CSS Liquid Glass instead (`global.cssGlass`), or your own CSS with `cssGlass: false`.
- **Why:** mobile browsers scroll the page on their own thread and tell the page afterwards. A canvas fixed
  to the window is always redrawn a frame or more late, so its glass trails the content while you scroll.
- **To use the glass on phones,** set `global.anchor: "page"` together with `mobileQuery: null`. The canvases
  then sit *in the page*, round the visible part, so the browser scrolls the drawn glass together with the
  content and it stays glued, even mid-fling.
- **Pinned elements:** glass on fixed / sticky elements (a fixed nav) can't scroll with the page, so in this
  mode it keeps its CSS look (or uses live glass where that runs).

```js
const touch = matchMedia('(pointer: coarse)').matches;
<GlassProvider config={{ global: touch ? { anchor: 'page', mobileQuery: null } : {} }}>
```

### Fallbacks (automatic, no layout change)
Your own CSS is used when:
- `global.enabled` is false;
- the layout matches `global.mobileQuery`;
- the OS **Reduce transparency** setting is on;
- the browser has no **hardware** WebGL 2 (software renderers, blocklisted GPUs);
- the browser has no window (server).

When the **graphics card resets** (WebGL context lost) the CSS glass shows only until the context is back: then
every glass canvas is rebuilt from scratch (new renderer, materials, textures) and the WebGL glass returns. If the
browser never restores it, a fresh context is tried after a few seconds. Only a context that keeps getting lost
(3 times in a minute) or never comes back (~30 s) leaves the CSS glass on for the rest of the visit. To try it:
`loseGlassContext()` from `glassparency/devtools` (or `Glassparency.loseGlassContext()`).

`getGlassStatus()` / `Glassparency.status()` says which applies.

### Performance
- **Idle cost:** nothing is drawn while nothing changes (scroll, resize, DOM changes, hover and CSS
  animations trigger frames).
- **Frame cost:** a frame is 0.5–2 ms.
- **Lazy loading:** three.js and snapDOM load lazily after first paint, and only where glass can run.
- **Saving power** (`global.powerSaving`, on by default): a hidden tab costs nothing, and a low, unplugged battery
  turns the motion down (see the table above).

### Content-Security-Policy
- The provider adds one `<style>`. Pass `nonce`, or set `injectStyles={false}` and import
  `glassparency/glass.css` yourself.
- Live glass uses `data:` images inside SVG filters, so `img-src` must allow `data:`.

---

## API

| Export | |
|---|---|
| `<GlassProvider config look renderIcon injectStyles nonce>` | Starts the glass (once per page). `look` = the page look |
| `<Glass as group glass look lookColor shape icon iconSize …>` | An element with glass. `icon` = an element, or a name drawn by `renderIcon(name, size)`; `shape` = a custom outline |
| `applyGlassLook(name, { color }) → undo()`, `getGlassLook()`, `GLASS_LOOKS` | The page look (see "Looks") |
| `useGlass(ref, group, props?) → handle` | The hook. Returns the element's glass handle (stable across renders) |
| `<GlassSwitch>`, `<GlassSlider>` | Liquid Glass switch and slider (see "Switches and sliders") |
| `createSwitch(el, opts)`, `createSlider(el, opts)` | The same without React |
| `<GlassCheckbox>`, `<GlassRadio>`, `<GlassTextField>`, `<GlassTabBar>`, `<GlassSidebar>`, `<GlassProgress>` | More controls (see "Checkboxes, radios…") |
| `createCheckbox`, `createRadio`, `createTextField`, `createTabBar`, `createSidebar`, `createLensBar`, `createProgress` | The same without React |
| `<GlassSegmented>`, `<GlassStepper>`, `<GlassRangeSlider>`, `<GlassBlockSlider>` | Segmented control, stepper, range / vertical slider, block slider |
| `createSegmented`, `createStepper`, `createRangeSlider`, `createBlockSlider` | The same without React |
| `<GlassPopover>`, `<GlassMenu>`, `<GlassSelect>`, `<GlassTooltip>`, `<GlassSheet>`, `useGlassToaster()` | Popover, menu, select, tooltip, bottom sheet, toasts |
| `createPopover`, `createMenu`, `createSelect`, `createTooltip`, `createSheet`, `createToaster`, `getGlassOverlay` | The same without React |
| `createSquish(el, readCfg)`, `stretchFor(ux, uy, amount)` | Squish & stretch for your own animations |
| `<GlassScrollEdge edges effect size inset color as>`, `createScrollEdge(scroller, opts)` | Scroll edge effect (iOS 26) |
| `enableTiltHighlight() → Promise<boolean>` | Allow the tilt highlight on iOS (call from a tap) |
| `attachGlass(el, group, props?) → handle` | The same without React. The handle: `setProps(props)`, `merge(partial)`, `getProps()`, `setState({ hover, pressed })` (the same look, press grow and glow the pointer gives), `ripple(x?, y?)`, `destroy()`, `el`, `id` |
| `setGlassProps(el, props)` | Change an element's look without a render (animations) |
| `getGlassProps(el)`, `mergeGlassProps(el, partial)` | Read / change some of an element's per-element props |
| `createShapeSpring(el, opts)`, `useShapeSpring(ref, shape, opts)` | Shape springs |
| `glassMorph(from, to, opts)`, `glassMorph.warm(from, to)`, `useGlassMorph(fromRef, toRef, open, opts)` | Morph any element into another |
| `<GlassGroup as spacing …>`, `createGlassGroup(el, { spacing }) → { setSpacing, destroy }` | Glass that melts together (see "Glass that melts together") |
| `<GlassText as group glass …>`, `shape: { path } \| { svg } \| { text }` (also `<Glass shape>`) | Custom shapes and glass text |
| `<glass-ui group props>`, `defineGlassElement(name?)`, `GLASS_ELEMENT` | Glass as an HTML element (any framework) |
| `configureGlass(config)` / `getGlassConfig()` | Merge a config over the built‑in one / read the result |
| `addGlassPresets(config) → remove()` | A preset pack: groups kept under every `configureGlass()` |
| `requestGlassRender()` | Redraw now (after moving elements outside `global.root` yourself) |
| `reserveSnapshotArea(key, rect)` | See "Liquid morph" |
| `<GlassLayerHost layer>` | A canvas for the `modal` / `top` layer |
| `getGlassStatus()`, `subscribeGlassStatus(fn)` | State: `loading` / `on` / `fallback` (+ reason) |
| `getGlassQuality()`, `subscribeGlassQuality(fn)` | Automatic quality: the level in use (`high` / `medium` / `low`) and the fps measured while animating |
| `getGlassPower()`, `subscribeGlassPower(fn)` | Saving power: `{ enabled, hidden, reducedMotion, lowBattery }` (script build: `Glassparency.power()` / `onPower(fn)`) |
| `resolveGlass(group, props?, state?)`, `getGlassGlobal()`, `getGlassTheme()`, `GLASS_LAYERS` | The resolved settings |

**`glassparency/devtools`** (tuning and debugging, not needed to use the glass): `setGlassOverride`,
`clearGlassOverride`, `getGlassOverride`, `setGlassStateOverride`, `setGlassForcedState`, `rawGlassGroup`,
`rawGlassThemeGroup`, `rawGlassDefaults`, `glassGroupNames`, `subscribeGlassConfig`, `GLASS_SCHEMA`,
`GLASS_STATE_KEYS`, `glassStats`, `glassLiveCount`, `isGlassColor`, `loseGlassContext({ restoreAfter })` (tests the
WebGL context-loss recovery). (Until the next major version the main entry
still exports them too, each warning once that it moved.)

**The script build** (`window.Glassparency`) has the same names (`attachGlass`, `setGlassProps`, `configureGlass`,
…); its short names (`attach`, `setProps`, `configure`, …) are aliases. **`glassparency/vanilla`** is the same API
as a module, without the auto-start (`start({ config, look, auto, classes, provider })`, `stop()`, `applyLook()`…).

**Framework entries:** `glassparency/vue` (`GlassparencyPlugin`, `vGlass`, components), `glassparency/svelte`
(actions + components; `glassparency/svelte/actions` = the actions alone), `glassparency/tailwind` (the Tailwind
plugin). Vue, Svelte and Tailwind are optional peer dependencies — install the one you use.

**TypeScript:** `group="…"` autocompletes the built-in group names. Add your own:
`declare module 'glassparency' { interface GlassGroups { promoCard: true } }`.

## Requirements
- **React apps:** React 19 (19.0–19.3, the range react‑three‑fiber 9 supports), three ≥ 0.159,
  @react-three/fiber 9 and @react-three/drei ≥ 10.7.
- **Script build:** no requirements.
- **Vue / Svelte wrappers:** Vue 3.3+ / Svelte 5 (the actions work in any Svelte), plus the React peers above
  (the glass renderer is React + three.js inside, whatever your framework).
- **Tailwind plugin:** Tailwind CSS v4 (`@plugin`) or v3.4 (`plugins: [...]`).
- **Browsers:** WebGL glass needs WebGL 2 (every current desktop browser). Everything else falls back to
  your CSS.

## Troubleshooting

| You see | Why, and the fix |
|---|---|
| No glass at all, your CSS instead | It fell back (see "Fallbacks"). `getGlassStatus()` says why: no WebGL 2, Reduce transparency, the mobile layout (`global.mobileQuery`), or a lost GPU context |
| Some glass is invisible in Safari / Firefox but fine in Chrome (buttons show as bare text) | It's `base`-layer glass: Chrome draws it live, other browsers on the base canvas **behind** the page (z-index −1). An element painting the page's picture (a full-page `<div>` with a photo) covers that canvas. Give the picture to the glass as `global.backgroundImage` (the canvas then paints and refracts it) and put the `<div>` behind the canvas (z-index −2) or remove it. Also keep the page colour on `<html>` *or* `<body>`, not both: with both set, `<body>`'s background paints over the canvas |
| Glass shows only the page colour, not the page | It's on the `base` layer, which refracts only the background. Floating glass (`layer: "float"`, z-index ≥ 50) refracts the page |
| Morph shapes don't melt | They must share a `morph` name and layer, and can't sit inside live glass (see "Liquid morph") |
| Glass lags behind an element you move with JS | Call `requestGlassRender()` after moving it (the watchers only see `global.root`) |
| Text hard to read over a photo | `textColor: "auto"`, or more `tintOpacity` / `blur` |
| `hover` / `.active` background doesn't change | The glass replaces the background: use the group's `hover` block or swap groups |

## Building from source & contributing

The source lives on GitHub in [`library/`](https://github.com/RicoSuaveDev/glassparency/tree/main/library)
(the rest of that repository is the [live demo](https://ricosuavedev.github.io/glassparency/)).

```bash
git clone https://github.com/RicoSuaveDev/glassparency.git
cd glassparency/library
npm install
npm run build        # → build/: the package exactly as published (dist/, README, types…)
```

- The build compiles the ES module, the CommonJS build and the one-file script, checks the output, and smoke-tests
  it in Node (ESM, CommonJS and a server render), so a green build means the package loads.
- Try your build in another project with `npm install /path/to/glassparency/library/build`.
- Where things are: the library is the `.js` / `.jsx` files in `library/`; `npm/` holds the build script
  (`build.mjs`), the types (`index.d.ts`), this README, the changelog and the license.
- Issues and pull requests are welcome. Keep changes small and focused, test in Chrome **and** Safari or Firefox
  (live vs WebGL glass), and say which browsers you tried.
- What changed in each version: [CHANGELOG](https://github.com/RicoSuaveDev/glassparency/blob/main/library/npm/CHANGELOG.md).

## Credits

- [three.js](https://threejs.org), [react-three-fiber](https://r3f.docs.pmnd.rs) and
  [drei](https://drei.docs.pmnd.rs) (`MeshTransmissionMaterial`) — the WebGL glass.
- [maath](https://github.com/pmndrs/maath) — easing.
- [snapDOM](https://github.com/zumerlab/snapdom) — page pictures for WebGL floating glass.
- The look is modelled on Apple's Liquid Glass (macOS 26 / iOS 26). Glassparency is not affiliated with Apple.

## License
MIT © RicoSuaveDev
