# Changelog

## 1.3.7 — 2026-11-08

- Fixed: switches built from <input type="checkbox" data-glassparency-switch> in the script build (glassparency.standalone.js) showed an empty track with no knob in Safari and on phones. glass.css was being added after the page's controls were already built, so the CSS glass fallback measured the knob without its styles and collapsed it to 0×0. start() now adds glass.css before it upgrades any switches or sliders.
- Fixed: the CSS glass fallback no longer re-positions switch knobs, so a knob keeps its shape even when glass.css loads late or you link it yourself with injectStyles: false.

## 1.3.6 — 2026-11-04

- Every GlassTabBar now looks like the iOS 26 tab bar by default: real WebGL glass on layer "top" in every browser, phones included, with the clear lens that shrinks the bar inside it and bends the page into its rim.
- Tab bars no longer need any setup for real glass: GlassProvider hosts the "top" layer itself (fixed to the window, new global.zIndex.top, default 48); your own <GlassLayerHost layer="top"> still takes over.
- New defaults: global.mobileLayers ["top"] (only tab bars get WebGL on phones), global.snapshot.fullPage "mobile" and mobileScale 2 (a pinned tab bar never runs out of picture while scrolling).
- Tab bar items default to iOS proportions: 62px bar, icon over an 11px bold label. The bar sits at z-index 50, so a wrapper with its own stacking context needs a z-index above 48.
- The held lens now resizes as you drag: it eases to fit the content (icon + label) of the tab it's over, from a circle up to about 1.45× its height (more only for wider labels).
- Faster: WebGL glass whose size animates (the stretching tab lens, squishing knobs) no longer builds a new 3D mesh every frame. Small size changes stretch the current mesh, and the exact one is built once the size holds still. Dragging the tab bar stays at full frame rate.
- New: CSS Liquid Glass fallback (global.cssGlass, on by default). Wherever WebGL or live glass isn't drawing an element (Safari and Firefox without WebGL, phones, the moment before WebGL starts), the library now draws its own CSS glass from the element's config group: a frosted pane in its tint, a lit edge (top-right / bottom-left), a shaded unlit edge, a specular line, a fold along the rim and a soft shadow. Works in every engine (no SVG filters). Budgets: true = 2 backdrop layers per element, "full" = the complete set (4 + caustic), "lite" = 1, false = your own CSS only (the old behaviour). The edge lighting follows nordify/css-liquid-glass (MIT).
- CSS glass follows the group's style: default (tinted frost, thin lit rim), crystal (clear, a thick bright rim and fold, a caustic glow; edges stay bright without over-saturating the page) and frosted (milky veil, soft wide edge). Edge widths follow the group's thickness.
- CSS glass uses the group's shape only where the site sets no corner radius of its own (a site's mobile stylesheet keeps its rounded rectangle).
- Tab bars and sidebars no longer start dragging the link or icon under the pointer when you press and slide (dragstart is cancelled, -webkit-user-drag: none for Safari).
- The topbar preset lost its old "bleed": WebGL browsers (Safari, Firefox) drew it as a full-width rectangle while Chromium's live glass drew a floating capsule. Both draw the capsule now.
- Held lens colour fringe toned down (tabLensActive chromaticAberration 0.15 → 0.04).
- Fixed: WebGL glass drawn in the mobile layout (global.mobileLayers) now hides the element's CSS background and the tab bar's CSS shadows, with no extra CSS needed.

## 1.3.5 — 2026-10-30

- Fixed Switch knob gap offset with a nudge to the refraction itself.
- Switch now looks closer to its inspiration.

## 1.3.4 — 2026-10-29

- Minor bug fixes relating to the new tab bar and its configuration.

## 1.3.3 — 2026-10-29

- Glassparency tab bar now looks closer to it's iOS inspiration.
- Added Full page snapshots for mobile up to 8192px

## Unreleased

- Tab bar: the default look now matches the iOS 26 Music tab bar. The bar is solid-looking glass with no frost (dark mode #3a3a3c at 75%). The held lens is clear and shrinks what's behind it a little (minify 0.12, was a −0.1 magnify): the bar shows inside it slightly smaller, with the page above and below as dark bands curving into its rim, plus a faint colour fringe. While held, the lens is at most 1.45× as wide as it is tall (it used to take a wide tab's full width); the stretch while moving is unchanged.
- New: global.snapshot.fullPage (true / "mobile") pictures the whole page (up to a GPU-safe height) for floating WebGL glass, so glass pinned over a scrolling page (a phone's header and tab bar) only slides the picture and never runs out of it mid-flick. New global.snapshot.mobileScale sets the picture's resolution in the mobile layout.

## 1.3.2 — 2026-10-28

- Fix Glass Morphs anchoring to page preventing the morph animation from triggering. glassMorph’s own shapes are now still drawn on a page-anchored canvas. They only exist for one animation and get re-measured every frame, so this is safe. Nothing else changed, and the scroll-jitter fix stays in.

## 1.3.1 — 2026-10-26

- glassMorph grows the button itself into the target, in the button's own
  glass look, and closing lands back on it (no more round droplet)
- Fixed the morph's first frames showing flat white glass, and live glass
  flashing unfrosted as the target's content faded
- README: animated gallery of the glass controls

## 1.3.0 — 2026-10-26

- New: glassMorph(from, to) — Apple's liquid morph between any two elements (a button grows into a menu, card or panel), with reverse() from mid-film, glassMorph.warm() and a useGlassMorph hook; a grow-and-fade fallback where WebGL glass isn't running.
- New: shape springs — createShapeSpring(el).to({ width, height, radius }) and useShapeSpring(): elements spring and wobble between shapes.
- New: textColor "auto" picks light or dark text (textLight / textDark) by contrast with what's really behind the glass; WebGL glass samples it on the GPU without stalling.
- New: <glass-ui group="card" props='{…}'> — glass as an HTML element for any framework (React 19, Vue, Svelte, plain HTML), registered automatically.
- New: automatic quality (global.quality, default "auto"): full quality, stepped down only while animating glass runs too slow, back up once smooth; getGlassQuality() reports the level.
- New: addGlassPresets() for preset packs that every configureGlass() call keeps; getGlassProps() / mergeGlassProps() to read or change some of an element's props.
- Fixed: the TypeScript types check cleanly with React 19.
- The source is now on GitHub (library/ in RicoSuaveDev/glassparency), with a build check on every pull request.

## 1.2.1 — 2026-10-24

- Fixed: WebGL glass (lenses, morph drops) could take until a tab switch to appear on pages with animated controls.

## 1.2.0 — 2026-10-23

- New glass controls: GlassCheckbox, GlassRadio, GlassTextField (optional clear button), GlassTabBar, GlassSidebar and GlassProgress, plus plain-JS versions (createCheckbox, createRadio, createTextField, createTabBar, createSidebar, createProgress).
- Tab bar and sidebar: press and slide, and a clear glass lens follows your finger, magnifying the icons and wiping the accent colour across them, then lands on the nearest item with a wobble.
- Progress bar: springs to its value, with an optional glass bead on the end and a sliding liquid drop when there's no value (busy).
- Squish & stretch: glass swells when pressed, leans toward the pointer and wobbles back when let go. Turn it on per group with squish, squishGrow, squishPull and squishBounce; createSquish() adds it to anything you animate yourself.
- New "style" setting on every group: "default", "crystal" (clearer, thicker, more refraction) or "frosted" (milky, in the group's own tint). A control's parts follow its style, and "crystal" / "frosted" blocks fine-tune a style per group.
- minify can now be negative to magnify what's behind the glass.
- Script build: data-glassparency-checkbox, -radio, -progress, -field, -tabbar and -sidebar turn plain HTML into the new controls, keeping native inputs in sync for forms and labels.
- GlassSwitch and GlassSlider accept glassProps; a crystal switch or slider keeps its track and only changes the knob while pressed.
- Fixed: a press now always ends, even when a parent element takes the pointer (glass no longer stays swollen).
- Fixed: the tab bar and sidebar lens returns to the selected item after a window resize.

## 1.1.1 — 2026-10-23

- Fixed an endless redraw loop with backgroundImage: the floating canvas no longer toggles base glass off and on every frame, so idle pages stop using the GPU.

## 1.1.0 — 2026-10-23

- Faster background images: once `backgroundImage` has loaded, the base canvas paints it and base glass stays on WebGL instead of live SVG filters (about half the graphics work, no dropped frames).
- Safari and Firefox now get real refracting glass over `backgroundImage` too.
- The picture needs CORS to be painted; serve it from your own origin to be safe. Until it loads (or if it can't), glass falls back to the previous behaviour.
- Fixed WebGL glass drawing square corners with a light frame when `bevel` is at least the corner radius.
- New `tileClear` preset: clear, unfrosted glass with a stronger refracting rim.

## 1.0.5 — 2026-10-19

- Fixed bug in glass layer registry that caused multiple glass layers to share the same host, making it render the previous layer on the new one.

## 1.0.4 — 2026-10-16

- Fixed Switch and Slider Refractions.
- Fixed Canvas Anchor problem on mobile.

## 1.0.3 — 2026-10-16

- Showcase now live and ready.
- Redesigned switches and sliders.

## 1.0.2 — 2026-10-16

- Added showcase images.

## 1.0.1 — 2026-10-16

- Fixed License Issue

## 1.0.0 — 2026-10-16

- Glassparency brings the new age glass aesthetic to your website with minimum effort.
- Using WebGL and DOM snapshots for real-time refraction, glassparency is able to mimic the look of glass without the need for complicated shaders or CSS workarounds.
- Don't settle for a replica, get the real deal.

