# Changelog

## 1.5.3 — 2026-11-24

- New: glassMorph(from, to, { replaceFrom: true }) — the target REPLACES `from`, like a popover: the button's own glass grows into the panel, the button stays hidden while the panel is open, and it comes back once the panel has melted back into it. One piece of glass the whole time, never a button and a panel side by side. Works with useGlassMorph too (and in the CSS fallback). keepFrom is now in the TypeScript types as well.
- Fixed: segmented control labels now follow the bar's auto text colour live ("textColor": "auto"): light labels over dark backdrops, dark over light. They used a colour read once, before auto text had picked one. The picked label follows the lens's own auto colour, so it stays readable on the white lens.
- Fixed: auto text on live / CSS glass over a backdrop picture (global.backgroundImage) now reads the picture's colour under the element when the picture is what's behind it — before, it guessed from the page's background colour (dark labels over a dark photo).
- Fixed: bottom sheets, toasts and other glass in the shared overlay now refract the page's HTML behind them. On a page whose other floating glass was all live (Chromium), no page picture was ever taken, so they showed only the page background or backdrop photo and kept their CSS look.
- Fixed: glass above the page (toasts, sheets, tooltips) now refracts what's really behind it: live glass (Chromium) such as a nav bar is part of the page picture, and with global.anchor "page" the backdrop picture (global.backgroundImage) is only drawn where the page itself shows it (on <body>, or in elements whose inline style paints it), and the page's own colour everywhere else — a toast over the nav showed the backdrop photo.

## 1.5.2 — 2026-11-24

- New: look presets — Clear, Frosted, Tinted and Dark smoke — in one line: applyGlassLook('frosted') (returns undo), <GlassProvider look>, a per-element look / lookColor prop, global.look in the config, a "looks" config block for your own, and data-glassparency-look in the script build. Looks only change glass surfaces; solid parts and accent colours keep theirs.
- New: squircle corners — "corners": "squircle" gives rounded rectangles Apple-style continuous corners in WebGL, live and CSS glass (default "round", unchanged).
- New: pointer / tilt highlight (opt-in) — "lightFollow": "auto" | "pointer" | "tilt" turns the rim light toward the cursor or follows the phone's tilt, smoothed, with "lightFollowAmount". enableTiltHighlight() asks iOS for motion permission from a tap; the library never asks by itself. Off by default and free when off; "Reduce motion" keeps the light still.
- New: scroll edge effect — content scrolling under a pinned glass bar blurs and fades out instead of a hard cut, like iOS 26: <GlassScrollEdge>, createScrollEdge() or data-glassparency-scroll-edge. "soft" or "hard", top / bottom / both edges, size, inset and colour. The effect starts behind the middle of the bar, so it has no visible edge and no corners showing around a rounded bar.
- New: glass that melts together — <GlassGroup spacing={24}>, createGlassGroup() or data-glassparency-group="24": the glass inside is one liquid surface, and pieces closer than the spacing melt into one blob and split apart again as they move (like Apple's GlassEffectContainer). Up to 16 pieces per group.
- New: custom shapes — glass in any SVG path (shape: { path, viewBox, fillRule }), an SVG icon (shape: { svg }) or text (<GlassText>, shape: { text: true }), drawn from a distance field. Without WebGL the shape shows as a frosted pane masked to the outline. Up to 4 custom shapes per liquid surface.
- New: melting glass (group members and custom shapes) over an image or gradient page background moves itself to the float layer, where WebGL can draw it, and lifts its own label above the glass. Before, it kept its CSS look and never melted.
- New: Vue and Svelte — "glassparency/vue" (GlassparencyPlugin, the v-glass directive, 18 components with v-model) and "glassparency/svelte" (use:glass and one action per control, plus 18 Svelte 5 components with bind:). "glassparency/svelte/actions" has the actions alone.
- New: Tailwind CSS plugin — "glassparency/tailwind" for v4 (@plugin) and v3 (plugins: [require(…)]): glass, glass-clear / frosted / tinted / smoke, glass-group-<name> and glass-tint-<colour> classes. The script build picks these classes up by itself (data-no-classes turns that off).
- New: "glassparency/vanilla" — the script build's API as a module with no auto-start (start({ provider: false }) etc.), for frameworks and bundlers.
- New: Next.js / server rendering — every client entry starts with "use client", every entry imports safely on the server, and the build's smoke test now covers all of them.
- New: WebGL context-loss recovery — when the browser drops the graphics context, the glass shows its CSS look and rebuilds itself in WebGL once the context is back (or retries a fresh one after 3 s). After 3 losses in a minute it stays on CSS glass. loseGlassContext() in "glassparency/devtools" tests it.
- New: power saving — global "powerSaving" (default true): nothing is drawn while the tab is hidden (one redraw when it's shown again), and animation calms down like "Reduce motion" while the battery is low and unplugged. getGlassPower() / subscribeGlassPower() report it.
- New: keyboard and screen readers — arrow keys, Home / End and Page Up / Down on sliders, arrows on tab bars, segmented controls and radios (roving tabindex), Home / End on the stepper, Tab closes a menu and moves on, focus stays inside an open sheet, toasts are read out through live regions (new per-toast role option), and ARIA roles and states on every control. No focus rings or highlights are drawn.
- Fixed: any page using GlassTooltip failed "next build" in Next.js 16 (its minifier broke one line of the tooltip's spring code).

## 1.5.1 — 2026-11-23

- New: segmented control (<GlassSegmented> / createSegmented), stepper with the value between − and + (<GlassStepper>), range slider with two knobs and a vertical slider (<GlassRangeSlider>), and a Control Center-style block slider (<GlassBlockSlider>: relative drag, rubber-band ends, black icon by default).
- New: popover, menu and select (<GlassPopover>, <GlassMenu>, <GlassSelect>) — one glass panel that grows out of its button and shrinks back into it — plus tooltips (<GlassTooltip>), an iOS bottom sheet with detents (<GlassSheet>) and toasts (useGlassToaster()). All have plain-JS create… versions and TypeScript types; they live in one shared overlay above the page.
- New: the script build (window.Glassparency) has all the new controls: the create… functions, toast(), open() / close(), and HTML markup (data-glassparency-segmented, -stepper, -range, -block, -select, -popover, -menu, -tooltip, -sheet, -open) with native inputs kept hidden and in sync.
- New: getGlassInfo(el) in "glassparency/devtools": an element's glass group, how it is drawn right now (live / tint / webgl / css) and its per-element props — for tuning panels that pick a control on the page.
- Fixed: glass whose layer or tier changes through its per-element props now moves to the new layer's canvas (it stayed drawn on the old one).
- Fixed: reserveSnapshotArea() / glassMorph no longer force a new page picture when the current one already covers the area (it froze large pages for 0.25–1 s at the start of every morph).

## 1.5.0 — 2026-11-20

- Fixed: WebGL buttons and tab bars froze their refraction until scrolling stopped (worst in Chrome on pages with many live controls). Text-colour readbacks no longer run mid-scroll, auto quality no longer drops (and recompiles shaders) during a scroll, and a busy progress bar no longer makes every canvas redraw every frame.
- Fixed: floating / tab-bar glass refracted a stale copy of a window-fixed background photo that slid along with the page. snapDOM 3.7 re-inlined the background after it had been removed from page pictures.
- Fixed: page pictures are no longer retaken after every scroll (only when glass scrolls in from outside the picture or a scroll box moves), and the glass's own CSS variables changing no longer trigger a new picture.
- Fixed: morph toolbars stopped animating because the auto-text colour fade replaced the element's own CSS transitions; the fade now runs in JS.
- Fixed: a pressed switch knob showed 1–3 frames of flat colour before its lens appeared (live glass now syncs in the same frame).
- Changed: textColor "auto" is now the default. Text on glass is light or dark (textLight / textDark), whichever reads better over what's behind it, and fades between them. Set a fixed textColor to opt out, or null to use your own CSS.
- Changed: glassMorph(from, to) keeps the real button (keepFrom, default true): the target buds out of it and melts back in. keepFrom: false gives the old film.
- Changed: glass controls show no focus ring, highlight or tap flash (add your own if you want one), and pressable glass never starts a link / image drag.
- Changed: the CSS fallback glass (Safari / Firefox / phones) draws the same thin rim on every control instead of a wide glowing edge on large or crystal ones.
- Changed: drop shadows on WebGL glass now match CSS box-shadow exactly (Gaussian blur).
- New: "glassparency/devtools" entry for live overrides, forced states, raw config blocks, the settings schema and render counters. The main entry still exports them until the next major version, warning once.
- New: one glass handle from attachGlass() and useGlass(): el, setProps, merge, getProps, setState({ hover, pressed }), ripple(x, y). The script build (window.Glassparency) now uses the module's names too.
- New: TypeScript group-name autocomplete generated from glass.config.json, a polymorphic <Glass as>, GlassHandle and devtools types.
- New: global.blur "smooth" (default, a dual-Kawase frost that stays steady while the page moves) or "mip" (the pre-1.5 look); global.blend "linear" (opt-in light mixing).
- New: morph glass now has the full look of regular glass (border, shadow, reflection, press glow) and blends each shape's own settings.
- New: per-group "canvas": { … } blocks applied only in canvas (HTML-in-Canvas) mode; canvas mode repaints more reliably in Chromium 157.
- New: a warning when two copies of the library are loaded on one page.
- Performance: live (SVG) glass displacement maps are cached, and large ones are built in a Web Worker.

## 1.4.0 — 2026-11-18

- Fixed: Safari froze for 5–16 s on glass-heavy pages; page pictures now skip backdrop-filter frost (snapDOM copied the whole page once per CSS-glass pane), and WebGL glass takes over again.
- Fixed: oversized crystal / frosted rims in Safari (the CSS fallback showed because WebGL glass never took over).
- Fixed: glass on buttons and tab bars trailed its element while scrolling, in every browser.
- Fixed: floating glass refracted the wrong part of a window-fixed (background-attachment: fixed) backdrop.
- Fixed: automatic quality never stepped down in Safari (frames from several canvases were counted as extra frames).
- Changed: global.anchor now defaults to "page" (canvases scroll with the page); glass on fixed / sticky elements gets its own window-fixed canvas. Set anchor: "viewport" for the old behaviour.
- Changed: deeper tabBar preset (thickness 48, rimLight 0.7, innerGlow 0.24).
- Changed: active tab bar / sidebar items get an accent glow + faint white halo; override with --gp-active-filter (none = off).
- New (experimental, opt-in, Chromium 157+): global.backdrop "canvas" renders the page inside one canvas so glass refracts the live page every frame; images / iframes from other origins without CORS draw blank, and the page scrolls in its own box.
- New: GLASS_CANVAS_BACKDROP_SUPPORTED; glassStats gains belowHits, belowMisses, canvasSyncMs, canvasPaintMs.
- Performance: a prop change re-renders only that element; resolved settings are cached; fewer pointless redraws; floating canvases reuse a cached picture of the glass below them.
- Performance: glass of any size is stretched from one mesh per corner shape instead of rebuilt per size; page pictures reuse their texture.

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

