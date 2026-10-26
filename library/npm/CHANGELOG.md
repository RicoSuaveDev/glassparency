# Changelog

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

