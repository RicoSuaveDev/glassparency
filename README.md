# Glassparency

[![npm](https://img.shields.io/npm/v/glassparency?color=0a84ff&label=npm)](https://www.npmjs.com/package/glassparency)
[![License: MIT](https://img.shields.io/badge/license-MIT-0a84ff)](LICENSE)
[![Live demo](https://img.shields.io/badge/demo-live-0a84ff)](https://ricosuavedev.github.io/glassparency/)

Apple-style **Liquid Glass** for the web: glass that really refracts the page (WebGL, and live SVG filters in
Chromium), squircle rims, specular light, liquid morphing, light/dark themes and an automatic CSS fallback. React
components and hooks, a one-file script for any site, and a `<glass-ui>` element for any framework.

**[See it live →](https://ricosuavedev.github.io/glassparency/)**

| <img src="library/npm/showcase/switch.webp" alt="GlassSwitch: the knob turns into clear glass while it is dragged across" width="360"> | <img src="library/npm/showcase/slider.webp" alt="GlassSlider: a glass knob dragged along the track" width="360"> |
|---|---|
| `GlassSwitch`: drag the knob and it turns to glass | `GlassSlider`: a glass knob that bends the track |
| <img src="library/npm/showcase/checkbox-radio.webp" alt="GlassCheckbox and GlassRadio: a box is ticked and squishes, a radio is picked" width="360"> | <img src="library/npm/showcase/text-field.webp" alt="GlassTextField: focused, typed into and cleared with the glass clear button" width="360"> |
| `GlassCheckbox` · `GlassRadio`: squish when pressed | `GlassTextField`: focus glow and a glass clear button |
| <img src="library/npm/showcase/tab-bar.webp" alt="GlassTabBar: a magnifying glass lens slides across the tabs" width="360"> | <img src="library/npm/showcase/sidebar.webp" alt="GlassSidebar: the glass lens slides down the list" width="360"> |
| `GlassTabBar`: press and slide, the lens magnifies | `GlassSidebar`: the same lens, vertical |
| <img src="library/npm/showcase/progress.webp" alt="GlassProgress: fills with a glass bead on the end, then a busy liquid drop" width="360"> | <img src="library/npm/showcase/button.webp" alt="Glass buttons swell, lean toward the pointer and wobble back" width="360"> |
| `GlassProgress`: a glass bead, and a liquid drop when busy | Squish & stretch: buttons swell, lean and wobble back |
| <img src="library/npm/showcase/glass-ui.webp" alt="A glass-ui card pressed and released" width="360"> | <img src="library/npm/showcase/shape-spring.webp" alt="A shape spring: circle to capsule to rounded square and back" width="360"> |
| `<glass-ui>`: glass as an HTML element | Shape springs: glass springs between shapes |

<img src="library/npm/showcase/morph.webp" alt="glassMorph: a glass button swells into a menu, then shrinks back into the button" width="728">

`glassMorph`: the button itself swells into the menu and melts back into it

## Get the library

**npm** (React 19 apps, or any bundler):

```bash
npm install glassparency react react-dom three @react-three/fiber @react-three/drei
```

```jsx
import { GlassProvider, Glass } from 'glassparency';

<GlassProvider>
  <Glass as="button" group="buttonPrimary">Save</Glass>
</GlassProvider>
```

**One `<script>` tag** (plain HTML, WordPress, Shopify, Webflow… — no React needed):

```html
<script src="https://unpkg.com/glassparency/dist/glassparency.standalone.js"></script>

<glass-ui group="card">Any HTML inside</glass-ui>
<button data-glassparency="button">Save</button>
```

**Documentation:** the full guide — every component, the config, how it works — is the
[library README](library/README.md) (the same page as on [npm](https://www.npmjs.com/package/glassparency)).

## What's in this repository

| Folder | What |
|---|---|
| [`library/`](library) | **The source of the npm package.** `npm install && npm run build` there builds it ([how](library/README.md#building-from-source--contributing)) |
| `src/`, `index.html`, `public/` | The [live demo page](https://ricosuavedev.github.io/glassparency/). It installs the published npm package like any other site would; its own looks are the config in `src/main.jsx` |

## Run the demo page

```bash
npm install
npm run dev        # http://localhost:5300
```

Every push to `main` builds the page and publishes it to GitHub Pages (`.github/workflows/deploy.yml`). To show a
newer release of the library: `npm install glassparency@latest`, commit, push.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Every pull request that touches
`library/` is built and smoke-tested automatically (`.github/workflows/library.yml`).
Found a security problem? Please report it privately: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © RicoSuaveDev. The look is modelled on Apple's Liquid Glass; Glassparency is not affiliated with Apple.
