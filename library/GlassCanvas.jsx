/**
 * =============================================================================
 * glass/GlassCanvas.jsx — One glass layer: a react-three-fiber canvas
 * =============================================================================
 * Loaded lazily (its own JS chunk with three.js), so first paint never waits
 * for it. <GlassProvider> mounts one of these per layer (base, float, modal).
 *
 * How a frame is drawn (only when something changed — frameloop "demand"):
 *
 *   1. Every glass element's mesh is moved/resized to its element's current
 *      on-screen box (GlassMesh useFrame, priority 1).
 *   2. The page background is drawn into buffer A.
 *   3. "Strata" are drawn bottom-up (GlassWorld useFrame, priority 2):
 *        base tier 0 (sidebar, cards) → base tier 1 (buttons on cards) → …
 *        → page snapshot (HTML content) → float tier 0 (header, dock) → …
 *      Each stratum's glass reads the buffer holding everything BELOW it and
 *      the result is added to the other buffer (ping-pong). That is how a
 *      button refracts the card it sits on, and the header refracts the page.
 *   4. Only this canvas's own layer is drawn to the screen; lower layers are
 *      drawn by their own canvases underneath.
 *
 * The glass itself is drei's MeshTransmissionMaterial fed a shared `buffer`
 * (so it never renders the scene per element), with a small patch that lets
 * each element pick how frosted it looks (blur = mipmap level of the buffer)
 * and how saturated/bright the refracted page is. A thin "tint layer" on top
 * adds the tint colour, the specular rim, the inner glow, the press glow and
 * the border; a "shadow layer" underneath draws the drop shadow. Border and
 * shadow are part of the glass so they always follow its real shape.
 *
 * Liquid morph: elements with the same `morph` name are drawn together by one
 * shader (makeLiquidMaterial) as a single smooth signed-distance field, so
 * they melt into each other when close, like Apple's morphing glass.
 * Coordinates are CSS pixels: x right, y UP (so an element at top:100px is
 * at y = −100), camera far above looking straight down.
 * =============================================================================
 */
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { Canvas, advance, createRoot, extend, useFrame, useThree } from '@react-three/fiber';
import { MeshTransmissionMaterial } from '@react-three/drei';
import { easing } from 'maath';
import { getGlassTheme, getGlobal, glassRoot, resolveGlass, subscribeConfig } from './config';
import {
  addRenderer,
  allEntries,
  getHosts,
  getPinnedHosts,
  isCoveredHost,
  isHolding,
  layerIndex,
  placement,
  requestRender,
  setPinned,
  stats,
  subscribeHosts,
  subscribeProps,
  subscribeStructure,
} from './registry';
import { snapshot, startSnapshots } from './snapshot';
import { createTextSampler } from './autoText';
import { bufferScaleFactor, dprCap, getQualityIndex, noteFrame, samplesCap, subscribeGlassQuality } from './quality';
import { acquireGeometry, outline } from './shapes';
import { MAX_RIPPLES, activeRipples } from './ripple';
import { drawInfo, drawableElements, getPage, needsRecopy, requestPagePaint, setPageRenderer } from './pageCanvas';

/** Scratch vector: a ripple's centre, projected to buffer uv each frame. */
const rippleAt = new THREE.Vector3();
// Clipping-plane normals (shared, read-only) and the default pointer, so the
// per-element frame doesn't allocate them every frame.
const PLANE_X_POS = new THREE.Vector3(1, 0, 0);
const PLANE_X_NEG = new THREE.Vector3(-1, 0, 0);
const PLANE_Y_NEG = new THREE.Vector3(0, -1, 0);
const PLANE_Y_POS = new THREE.Vector3(0, 1, 0);
const CENTER_POINTER = Object.freeze({ x: 0.5, y: 0.5 });

const MAX_LIQUID = 16; // shapes per morph group
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1); // shared by every shadow layer
import { backgroundFor, fullscreenVertexShader, isImageBackdrop, pageBackgroundShader, pageImageShader, setImageBackdrop } from './pageBackground';

/** This animation frame's timestamp (shared by all canvases drawn in it). */
const frameTime = (fallback) => {
  const t = typeof document !== 'undefined' ? document.timeline?.currentTime : null;
  return typeof t === 'number' && Number.isFinite(t) ? t : fallback;
};

const CAMERA_Z = 100000; // far away → view direction is straight down everywhere
// global.anchor "page": the canvas covers the visible part of the page plus
// this much of the window height above and below (room to scroll into before
// the next redraw puts it back round the visible part).
const PAGE_MARGIN = 0.35;
const channelOf = (layer, tier) => 1 + layerIndex(layer) * 6 + tier; // three.js layer (1–24; three.js allows 0–31)

/**
 * Mount point used by GlassProvider. `layer` = "base" | "float" | "modal" | "top".
 * `layers` (optional): draw only glass on these layers — the mobile-layout
 * exceptions (global.mobileLayers), where every other layer is CSS glass.
 * `pinned` (optional): this is the layer's window-fixed "pinned" canvas
 * (anchor "page"): it draws only the layer's glass on fixed / sticky
 * elements; the layer's in-page canvas draws the rest (registry.js).
 */
export default function GlassCanvas({ layer, layers, pinned = false, onLost, onReady }) {
  const g = getGlobal();
  // Automatic quality (quality.js): re-render when the level changes.
  useSyncExternalStore(subscribeGlassQuality, getQualityIndex, getQualityIndex);
  // react-three-fiber deliberately drops the WebGL context when a canvas is
  // removed (e.g. a dialog closing) — that isn't a failure, so only report
  // losses while this canvas is still mounted and on the page.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, dprCap(g.maxDpr)]}
      flat // no tone mapping: colours come out exactly as configured
      linear // no sRGB conversion: every colour here is already an sRGB value
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true; // glass inside scroll boxes is clipped to them
        gl.setClearColor(0x000000, 0);
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          if (!alive.current || !gl.domElement.isConnected) return;
          e.preventDefault();
          onLost?.('The graphics card reset (WebGL context lost)');
        });
      }}
      aria-hidden="true"
    >
      <GlassWorld layer={layer} layers={layers} pinned={pinned} onReady={onReady} />
    </Canvas>
  );
}

// =============================================================================
// PageGlass — canvas mode (global.backdrop "canvas"): the page canvas itself
// =============================================================================
/**
 * Turns the page canvas (pageCanvas.js — the page is rendered inside it)
 * into a react-three-fiber root that draws EVERYTHING: GlassWorld in its
 * "single" mode. It runs inside the canvas's paint event (frameloop
 * "never" + advance()), which fires whenever the page or a glass element
 * changes — so the page and the glass refracting it are always the same
 * frame. Redraw requests (hover easing, requestRender) ask for a paint.
 */
export function PageGlass({ onLost, onReady }) {
  useEffect(() => {
    const page = getPage();
    if (!page) return undefined;
    extend(THREE); // (createRoot, unlike <Canvas>, doesn't register three.js's classes)
    const { canvas } = page;
    const renderer = new THREE.WebGLRenderer({ canvas, context: page.gl, alpha: true, antialias: true, premultipliedAlpha: true });
    renderer.localClippingEnabled = true; // glass inside scroll boxes is clipped to them
    renderer.setClearColor(0x000000, 0);
    // react-three-fiber force-loses the WebGL context of a renderer it
    // releases — even one it didn't make. This context is the PAGE's (it
    // keeps drawing the page after the glass stops), so not this one.
    renderer.forceContextLoss = () => {};
    const root = createRoot(canvas);
    const sizeNow = () => ({ width: canvas.clientWidth, height: canvas.clientHeight, top: 0, left: 0 });
    const changed = { current: null }; // the paint event's changed elements
    let disposed = false;
    const onContextLost = () => onLost?.('The graphics card reset (WebGL context lost)');
    canvas.addEventListener('webglcontextlost', onContextLost);
    const offRenderer = addRenderer(() => requestPagePaint());
    root
      .configure({ gl: renderer, size: sizeNow(), dpr: window.devicePixelRatio || 1, frameloop: 'never', flat: true, linear: true, events: undefined })
      .then(() => {
        if (disposed) return;
        const store = root.render(<GlassWorld layer="base" single={{ root: page.root, changed }} onReady={onReady} />);
        // Anything that asks this root for a frame gets a paint instead.
        store.setState({ invalidate: () => requestPagePaint() });
        setPageRenderer({
          paint(ev) {
            changed.current = ev?.changedElements ? new Set(ev.changedElements) : null;
            advance(performance.now(), true, store.getState());
          },
          resize() {
            root.configure({ size: sizeNow(), dpr: window.devicePixelRatio || 1 });
          },
        });
      })
      .catch((err) => onLost?.(`The glass could not start in the page canvas (${err?.message || err})`));
    return () => {
      disposed = true;
      offRenderer();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      setPageRenderer(null); // the built-in painter draws the page again
      root.unmount();
    };
  }, [onLost, onReady]);
  return null;
}

// =============================================================================
// GlassWorld — the render loop for one layer
// =============================================================================
function GlassWorld({ layer, layers, pinned, onReady, single = null }) {
  // single = { root, changed }: CANVAS MODE (pageCanvas.js) — this world is
  // the page canvas itself and draws everything in it: background, every
  // layer's glass, the live page and the floating glass's own HTML.
  const { gl, size, scene, invalidate, viewport } = useThree();
  const myIndex = layerIndex(layer);
  const controllers = useRef(new Map()); // entry id → controller (from GlassMesh)
  const readySent = useRef(false);

  // Redraw on request from anywhere (scroll, hover, config change…).
  useEffect(() => addRenderer(() => invalidate()), [invalidate]);
  // The floating layers read the page snapshot; start watching the page.
  useEffect(() => (myIndex > 0 && !single ? startSnapshots() : undefined), [myIndex, single]);

  // Which elements this canvas needs: its own layer's and every layer below
  // (those are drawn into the buffers only, so this layer can refract them).
  const [, rerender] = useReducer((n) => n + 1, 0);
  useEffect(() => subscribeStructure(rerender), []);
  useEffect(() => subscribeHosts(rerender), []);
  const hosts = getHosts();
  // This canvas's own container, and whether it sits IN the page (anchor
  // "page": it scrolls with the content, so glass can't trail behind it) or
  // is fixed to the window. A pinned canvas is always window-fixed.
  const myHost = pinned ? getPinnedHosts().get(layer) : hosts.get(layer);
  const pageMode = !single && !pinned && myHost?.dataset.glassAnchor === 'page';
  const entries = allEntries().filter((e) => {
    // Canvas mode: the page's glass — and glassMorph's film shapes (empty
    // fixed <div>s in <body>, outside the page: only their box matters; they
    // were left out, so in canvas mode a morph showed no liquid at all).
    if (single) return single.root.contains(e.el) || e.el.dataset.glassMorphShape !== undefined;
    const p = placement(e.id);
    const idx = layerIndex(p.layer);
    return idx <= myIndex && hosts.has(p.layer) && (!layers || layers.includes(p.layer));
  });

  // --- Camera: CSS pixels, y up ------------------------------------------------------
  const camera = useMemo(() => {
    const cam = new THREE.OrthographicCamera(0, 1, 0, -1, 1, CAMERA_Z * 2);
    cam.position.set(0, 0, CAMERA_Z);
    return cam;
  }, []);
  useLayoutEffect(() => {
    camera.left = 0;
    camera.right = size.width;
    camera.top = 0;
    camera.bottom = -size.height;
    camera.updateProjectionMatrix();
  }, [camera, size]);

  // --- Studio lighting for the glass rims (generated, no image files) ----------------
  // Steep rims mirror their surroundings (Fresnel). Light mode: a bright room
  // (white overhead fading to a pale grey floor + a soft key light top-left),
  // so edges catch light instead of going dark. Dark mode: a dark room in the
  // page's own colours — a white room made every rim (and a big round lens,
  // which is mostly rim) look milky grey on the dark page.
  // Rebuilt when the theme switches.
  const [envTheme, setEnvTheme] = useReducer((_, t) => t, getGlassTheme());
  useEffect(() => subscribeConfig(() => setEnvTheme(getGlassTheme())), []);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const studio = makeStudioScene(envTheme);
    const env = pmrem.fromScene(studio, 0.02).texture;
    studio.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    scene.environment = env;
    pmrem.dispose();
    invalidate();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [gl, scene, envTheme, invalidate]);

  // --- Buffers (ping-pong) + helper scenes ------------------------------------------------
  // Only the full base canvas paints the background picture (and tells
  // live.js so) — not a mobile-exception canvas drawing just its own layers.
  const fullBase = layer === 'base' && !layers && !pinned;
  const kit = useMemo(() => makeKit(fullBase), [fullBase]);
  useEffect(() => () => kit.dispose(), [kit]);
  // Canvas mode: the live page + floating glass HTML as textured rectangles.
  const elems = useMemo(() => (single ? makeElementLayer(gl) : null), [single, gl]);
  useEffect(() => () => elems?.dispose(), [elems]);
  // textColor "auto": reads back what auto-text glass refracts (autoText.js).
  const textSampler = useMemo(() => createTextSampler(gl, invalidate), [gl, invalidate]);
  useEffect(() => () => textSampler.dispose(), [textSampler]);
  // Morph groups → one liquid mesh each (created/removed as groups come and go).
  const liquids = useRef(new Map());
  useEffect(
    () => () => {
      for (const l of liquids.current.values()) {
        scene.remove(l.mesh);
        l.mesh.geometry.dispose();
        l.mat.dispose();
      }
      liquids.current.clear();
    },
    [scene]
  );
  // (× the automatic-quality factor: 1 unless frames were too slow)
  useSyncExternalStore(subscribeGlassQuality, getQualityIndex, getQualityIndex);
  // (Canvas mode draws the page itself at the FULL pixel density — crisp
  // text — but keeps the glass buffers at the usual capped density.)
  const bufDpr = single ? Math.min(viewport.dpr, dprCap(getGlobal().maxDpr)) : viewport.dpr;
  const bufScale = getGlobal().bufferScale * bufferScaleFactor();
  const bw = Math.max(1, Math.round(size.width * bufDpr * bufScale));
  const bh = Math.max(1, Math.round(size.height * bufDpr * bufScale));
  useLayoutEffect(() => {
    kit.bufA.setSize(bw, bh);
    kit.bufB.setSize(bw, bh);
    kit.below.rt.setSize(bw, bh);
    kit.below.sig = null; // (its picture is the old size)
    kit.bgMat.uniforms.uSize.value.set(size.width, size.height);
    requestRender();
  }, [kit, bw, bh, size]);

  // --- The frame -------------------------------------------------------------------------
  useFrame(() => {
    const t0 = performance.now();
    // Automatic quality: how fast frames come while animating. Timed by the
    // ANIMATION FRAME (document.timeline.currentTime — the same value for
    // every canvas drawn in one refresh), not by when this canvas happened
    // to start: with performance.now(), the 2nd and 3rd canvas of one
    // refresh started a few ms after the 1st and were counted as extra,
    // very fast frames — Safari showed "333 fps" while struggling, and auto
    // quality never stepped down.
    noteFrame(frameTime(t0));
    // global.anchor "page": move the canvas round the visible part of the page
    // and aim the camera at where it really is. Between redraws the browser
    // scrolls the canvas WITH the page, so the glass never trails the content
    // (a window-fixed canvas is always redrawn a frame or more late on phones).
    let viewTop = 0; // world y of the canvas's top edge (0 = top of the window)
    if (pageMode) viewTop = placePageCanvas(gl.domElement, myHost, camera);
    else if (camera.top !== 0 || camera.bottom !== -size.height || camera.right !== size.width) {
      // Window-fixed (again — e.g. anchor switched back from "page"): aim
      // the camera at the window, as the size effect above does.
      camera.left = 0;
      camera.right = size.width;
      camera.top = 0;
      camera.bottom = -size.height;
      camera.updateProjectionMatrix();
    }
    let animating = false;
    const visible = [];
    // Background "auto" over a gradient / image page background: WebGL base
    // glass would refract a flat colour (an opaque-looking panel hiding the
    // background), so it isn't drawn and those elements keep their own CSS
    // look. (In Chromium base glass is live there anyway — see live.js.)
    // Not once global.backgroundImage is painted here: then WebGL base glass
    // refracts the real picture (kit.backgroundIsImage() turns false).
    // Background: an in-page canvas is taller than the window and moves, but
    // the page background is fixed to the WINDOW — so its shader draws in
    // window coordinates (uSize = window, uCanvas + uTop = where this canvas
    // is). A window-fixed canvas IS the window (uTop 0).
    {
      const bu = kit.bgMat.uniforms;
      if (pageMode) bu.uSize.value.set(window.innerWidth, window.innerHeight);
      else bu.uSize.value.set(size.width, size.height);
      bu.uCanvas.value.set(size.width, size.height);
      bu.uTop.value = pageMode ? -viewTop : 0;
    }
    // Paint the background on screen only from the window-fixed full base
    // canvas: from an in-page canvas a window-fixed picture would scroll
    // with the page between redraws (the site's own CSS background shows
    // through instead — the buffer still has the exact copy to refract).
    kit.syncTheme(!pageMode && !pinned);
    const baseBlocked = kit.backgroundIsImage();
    for (const c of controllers.current.values()) {
      if (c.animating) animating = true;
      const blocked = baseBlocked && c.layer === 'base';
      if (c.visible && !blocked) visible.push(c);
      // Hidden (display:none / zero size), detached or blocked → its CSS
      // glass comes back until its slab is drawn again (see "Per-element
      // hand-over" below). Merely scrolled out of a clipping box: leave it
      // (no churn while scrolling; it's drawn again the moment it scrolls
      // back in).
      else if (c.entry?.el.hasAttribute('data-glass-drawn')) {
        const el = c.entry.el;
        const r = el.isConnected ? el.getBoundingClientRect() : null;
        if (blocked || !r || r.width < 1 || r.height < 1) el.removeAttribute('data-glass-drawn');
      }
    }

    // Morph groups: their elements are drawn by one liquid mesh per group.
    const groups = new Map();
    const solo = [];
    for (const c of visible) {
      if (!c.morphKey) {
        solo.push(c);
        continue;
      }
      const key = `${c.channel}|${c.morphKey}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    const liquidCtls = [];
    for (const [key, members] of groups) {
      let l = liquids.current.get(key);
      if (!l) {
        const mat = makeLiquidMaterial();
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        mesh.frustumCulled = false;
        scene.add(mesh);
        l = { mesh, mat };
        liquids.current.set(key, l);
      }
      updateLiquid(l, members, size, viewTop);
      if (members.some((m) => m.animating)) animating = true;
      liquidCtls.push({
        members, // (for the per-element hand-over)
        channel: members[0].channel,
        layer: members[0].layer,
        setBuffer(tex, lodScale) {
          const u = l.mat.uniforms;
          u.uBuffer.value = tex;
          // Each shape's own frost (mip level).
          members.slice(0, MAX_LIQUID).forEach((m, i) => {
            const blur = m.p.blur;
            u.uShape3.value[i].x = blur > 0 ? Math.max(0, Math.log2(blur * lodScale)) : 0;
          });
        },
      });
    }
    for (const [key, l] of liquids.current) {
      if (groups.has(key)) continue;
      scene.remove(l.mesh);
      l.mesh.geometry.dispose();
      l.mat.dispose();
      liquids.current.delete(key);
    }

    // Group into strata: [layer][tier] bottom-up.
    const strata = new Map();
    for (const c of [...solo, ...liquidCtls]) {
      const key = c.channel;
      if (!strata.has(key)) strata.set(key, { type: 'glass', channel: key, layer: c.layer, ctls: [] });
      strata.get(key).ctls.push(c);
    }
    const order = [...strata.values()].sort((a, b) => a.channel - b.channel);
    const passes = [];
    let snapDone = myIndex === 0; // the base layer never needs the page picture
    let underDone = layer !== 'modal'; // only dialogs sit over a dimmer
    for (const s of order) {
      // HTML content sits on top of the base glass: the page picture goes in
      // right before the first floating stratum.
      if (!snapDone && layerIndex(s.layer) > 0) {
        passes.push({ type: 'snapshot' });
        snapDone = true;
      }
      if (!underDone && s.layer === layer) {
        passes.push({ type: 'underlay' });
        underDone = true;
      }
      passes.push(s);
    }
    // Canvas mode: the live page goes where the page picture would (on top
    // of the base glass, under the floating glass), and a floating LAYER's
    // own HTML right after its last stratum — above all of that layer's
    // glass, like the normal mode (where all HTML sits over the layer's
    // canvas: a tab bar's icons over its lens). Floating glass that isn't
    // drawn this frame (switched off, hidden, scrolled out) still needs its
    // HTML: the last "labels" pass draws whatever wasn't.
    if (single) {
      const out = [];
      let pageDone = false;
      let pending = null; // { layer, ctls } — labels of the layer being drawn
      const flush = () => {
        if (pending) out.push({ type: 'labels', ctls: pending.ctls });
        pending = null;
      };
      for (const ps of passes) {
        if (!pageDone && ps.type === 'glass' && layerIndex(ps.layer) > 0) {
          out.push({ type: 'page' });
          pageDone = true;
        }
        if (pending && ps.layer !== pending.layer) flush();
        out.push(ps);
        if (ps.type === 'glass' && layerIndex(ps.layer) > 0) {
          pending ||= { layer: ps.layer, ctls: [] };
          pending.ctls.push(...ps.ctls);
        }
      }
      flush();
      if (!pageDone) out.push({ type: 'page' });
      out.push({ type: 'labels', rest: true });
      passes.length = 0;
      passes.push(...out);
      elems.begin(size, single.changed.current);
    }

    gl.autoClear = false;
    // (kit.syncTheme() ran at the top of the frame: light / dark mode or the
    // page's own background colour changed → background shader rebuilt.)
    // Background → buffer A (and to the screen on the base layer, when it is
    // an exact copy of the page's CSS background, or the background picture
    // once loaded — "auto" otherwise leaves the site's real background
    // visible; see pageBackground.js).
    const lodScale = bufDpr * bufScale;
    const smoothBlur = getGlobal().blur === 'smooth';

    // --- "Everything below" cache ------------------------------------------
    // A floating / top / dialog canvas first redraws everything under its
    // own glass into the buffers — the background, the base (and float…)
    // glass, the page picture, the dialog dimmer — every frame, though that
    // usually hasn't changed (hovering a header button, dragging a tab bar
    // lens, a switch knob springing). So the result is kept (kit.below) with
    // a fingerprint of all of it (belowSignature: positions, sizes, shapes,
    // eased values, settings, background, picture, scroll); while the
    // fingerprint matches, one copy replaces all those passes. It is only
    // stored once the content below has held still for a frame, so a
    // continuous change (scrolling) costs nothing extra.
    const own0 = myIndex > 0 ? passes.findIndex((ps) => ps.type === 'glass' && ps.layer === layer) : -1;
    const belowSig = own0 > 0 ? belowSignature(passes, own0, kit, { size, viewTop, lodScale, layer }) : null;
    const belowHit = belowSig !== null && kit.below.sig === belowSig;
    const storeBelow = belowSig !== null && !belowHit && kit.below.lastSig === belowSig;
    if (own0 > 0) {
      kit.below.lastSig = belowSig;
      if (belowHit) stats.belowHits += 1;
      else stats.belowMisses += 1;
    }

    if (belowHit) kit.blit(gl, kit.below.rt, kit.bufA);
    else {
      gl.setRenderTarget(kit.bufA);
      gl.clear();
      gl.render(kit.bgScene, kit.quadCam);
    }
    gl.setRenderTarget(null);
    gl.clear();
    if (myIndex === 0 && kit.paintBackground()) gl.render(kit.bgScene, kit.quadCam);

    let src = kit.bufA;
    let dst = kit.bufB;
    const sampleText = textSampler.begin(); // (throttled; only with auto-text glass)
    let pictureReady = false; // floating layers: is the page picture in this frame?
    // (A cache hit skips the picture pass — it's in the cached buffer.)
    if (belowHit && passes.slice(0, own0).some((ps) => ps.type === 'snapshot')) pictureReady = Boolean(snapshot.canvas);
    const shown = []; // controllers drawn to THIS canvas's screen this frame
    // (The buffer only matters while glass is still to come — it's what that
    // glass refracts. Canvas mode ends with label passes nothing reads.)
    let lastGlass = -1;
    passes.forEach((ps, i) => {
      if (ps.type === 'glass') lastGlass = i;
    });
    passes.forEach((pass, i) => {
      if (belowHit && i < own0) return; // (in the cached buffer)
      if (storeBelow && i === own0) {
        kit.blit(gl, src, kit.below.rt);
        kit.below.sig = belowSig;
      }
      const last = i === passes.length - 1 || (single && i >= lastGlass);
      if (pass.type === 'page' || pass.type === 'labels') {
        // Canvas mode: the live page / floating glass HTML (premultiplied).
        if (!(pass.type === 'page' ? elems.preparePage(single.root) : elems.prepareLabels(pass))) return;
        camera.layers.set(0);
        if (!last) {
          kit.blit(gl, src, dst);
          gl.render(elems.scene, camera);
        }
        gl.setRenderTarget(null);
        gl.render(elems.scene, camera);
        if (!last) [src, dst] = [dst, src];
        return;
      }
      if (pass.type === 'snapshot' || pass.type === 'underlay') {
        const ready = pass.type === 'snapshot' ? kit.updateSnapshot() : kit.updateUnderlay(layer);
        if (pass.type === 'snapshot') pictureReady = ready;
        if (!ready) return;
        kit.blit(gl, src, dst);
        camera.layers.set(0);
        gl.render(pass.type === 'snapshot' ? kit.snapScene : kit.underScene, pass.type === 'snapshot' ? camera : kit.quadCam);
        [src, dst] = [dst, src];
        return;
      }
      // Smooth frost (global.blur "smooth"): smooth the buffer's mip levels
      // this stratum's frostiest glass reads, before it reads them.
      if (smoothBlur) {
        let maxLod = 0;
        for (const c of pass.ctls) {
          for (const m of c.members || [c]) {
            const blur = m.p?.blur ?? 0;
            if (blur > 0) maxLod = Math.max(maxLod, Math.log2(blur * lodScale));
          }
        }
        kit.smoothMips(gl, src, maxLod);
      }
      for (const c of pass.ctls) c.setBuffer(src.texture, lodScale);
      // Auto text: queue a read of exactly what this stratum refracts (only
      // for glass this canvas draws — lower layers are sampled by theirs).
      if (sampleText && (single || pass.layer === layer)) {
        const items = [];
        for (const c of pass.ctls) for (const m of c.members || [c]) if (m.p?.textColor === 'auto' && m.entry) items.push({ el: m.entry.el, p: m.p });
        if (items.length) textSampler.read(src, items);
      }
      camera.layers.set(pass.channel);
      if (!last) {
        // Buffer for the strata above: everything so far + this stratum.
        kit.blit(gl, src, dst);
        gl.render(scene, camera);
      }
      if (single || pass.layer === layer) {
        gl.setRenderTarget(null);
        gl.render(scene, camera);
        shown.push(...pass.ctls);
      }
      if (!last) [src, dst] = [dst, src];
    });
    gl.setRenderTarget(null);

    // --- Per-element hand-over ------------------------------------------------
    // An element's own CSS glass (background, blur, border, shadow) is only
    // hidden once ITS slab is on screen: glass.css keys on data-glass-drawn.
    // Before this, everything handed over as soon as the page's first frame
    // was drawn, so a new dialog showed bare text with no panel for the few
    // frames its canvas needed to start (WebGL context, shaders, page picture).
    // Floating glass also waits for the page picture — without it, it would
    // only show the plain background (a second visible change).
    // Set inside the frame (before the browser paints), so the CSS look and
    // the WebGL look swap in the same painted frame.
    if (myIndex === 0 || pictureReady || !getGlobal().snapshot.enabled) {
      for (const c of shown) {
        for (const m of c.members || [c]) {
          const el = m.entry?.el;
          if (el && !el.hasAttribute('data-glass-drawn')) el.setAttribute('data-glass-drawn', '');
        }
      }
    }

    // First frame drawn → the provider can hide the CSS glass backgrounds.
    if (!readySent.current && onReady) {
      readySent.current = true;
      requestAnimationFrame(() => onReady());
    }
    stats.frames += 1;
    stats.lastFrameMs = Math.round((performance.now() - t0) * 10) / 10;
    // Keep going while something is easing or a CSS animation is moving things.
    if (animating || isHolding() || elems?.retry) invalidate();
  }, 2);

  return entries.map((e) => (
    <GlassMesh key={e.id} entry={e} controllers={controllers} sharedTexture={kit.bufA.texture} canvasLayer={single ? null : layer} pageMode={pageMode} pinnedCanvas={pinned} />
  ));
}

// =============================================================================
// GlassMesh — one element's glass slab + tint layer
// =============================================================================
function GlassMesh({ entry, controllers, sharedTexture, canvasLayer, pageMode, pinnedCanvas }) {
  const group = useRef();
  const slab = useRef();
  const tint = useRef();
  const mat = useRef();
  const { invalidate } = useThree();

  // Props: re-resolve when config / element props / hover state change.
  const [, rerender] = useReducer((n) => n + 1, 0);
  // Only re-render for THIS element's changes (or a page-wide one: id
  // undefined = config / theme changed). Before, every glass element
  // re-rendered whenever ANY element's props changed — and the animated
  // controls (switch, slider, tab lens…) set props every frame, so one
  // toggling switch re-rendered (and re-resolved) all the page's glass
  // every frame.
  useEffect(
    () =>
      subscribeProps((id) => {
        if (id === undefined || id === entry.id) rerender();
      }),
    [entry.id]
  );
  const resolved = resolveGlass(entry.group, entry.props, entry.state);
  // Automatic quality caps the refraction samples (a new shader per level).
  useSyncExternalStore(subscribeGlassQuality, getQualityIndex, getQualityIndex);
  const samples = samplesCap(resolved.samples);
  const p = samples === resolved.samples ? resolved : { ...resolved, samples };
  // Tint colours as [r,g b] (CSS variables are read from the element).
  const tintFrom = colorOf(p.tint.from, entry.el);
  const tintVia = colorOf(p.tint.via || p.tint.from, entry.el);
  const tintTo = colorOf(p.tint.to, entry.el);
  // Border + shadow colours: read here (on re-render) like the tint, not in
  // the frame loop — a "var(--x)" colour there meant a getComputedStyle per
  // element on every frame. (Re-rendered on config / theme / own prop
  // changes, the same moments the tint colours are re-read.)
  const borderRgb = colorOf(p.borderColor || '#ffffff', entry.el);
  const shadowRgb = colorOf(p.shadowColor || '#1e1b4b', entry.el);
  const place = placement(entry.id);
  const channel = channelOf(place.layer, place.tier);
  // Canvas mode: match the LIVE (SVG) glass look — deeper rim bend, live
  // rim lighting, live minify (liveBendMatch, liveLight, glassLiveMinify) —
  // for the glass that Chromium draws live in the normal mode: the float
  // layer (knobs included). Not for top / base glass (a tab bar, buttons —
  // WebGL in both modes, so the same look in both).
  const liveMatch = canvasLayer === null && place.layer === 'float';

  // Tint layer shader (gradient + opacity), one per element.
  const planes = useMemo(() => [0, 1, 2, 3].map(() => new THREE.Plane()), []);
  const tintMat = useMemo(() => {
    const m = makeTintMaterial();
    m.clippingPlanes = planes;
    return m;
  }, [planes]);
  useEffect(() => () => tintMat.dispose(), [tintMat]);
  const shadow = useRef();
  const shadowMat = useMemo(() => {
    const m = makeShadowMaterial();
    m.clippingPlanes = planes;
    return m;
  }, [planes]);
  useEffect(() => () => shadowMat.dispose(), [shadowMat]);

  // Animated values (ease towards the configured ones on hover/press).
  const anim = useRef(null);
  if (!anim.current) {
    anim.current = {
      sx: p.scale.x,
      sy: p.scale.y,
      op: p.tintOpacity,
      from: new THREE.Vector3(...tintFrom),
      via: new THREE.Vector3(...tintVia),
      to: new THREE.Vector3(...tintTo),
      rim: p.rimLight,
      glow: 0, // press glow, eased in/out
    };
  }

  // Everything the frame loop needs, kept on a stable object.
  const ctl = useRef(null);
  if (!ctl.current) {
    ctl.current = {
      planes, // (canvas mode: the element's HTML is clipped like its glass)
      id: entry.id,
      visible: false,
      animating: false,
      layer: place.layer,
      channel,
      slabGeo: null,
      flatGeo: null,
      shapeKey: '',
      cssRadius: 0,
      cssRadiusFor: '',
      clipAncestors: [],
      pinned: false, // on a fixed / sticky element (page-anchored canvases leave it to its CSS)
      p,
      setBuffer(tex, lodScale) {
        const m = mat.current;
        if (!m) return;
        m.uniforms.buffer.value = tex;
        if (m.uniforms.blurLod) m.uniforms.blurLod.value = this.p.blur > 0 ? Math.max(0, Math.log2(this.p.blur * lodScale)) : 0;
      },
    };
  }
  const c = ctl.current;
  if (c.p !== p) c.pv = (c.pv || 0) + 1; // (settings version, for the "below" fingerprint)
  c.p = p;
  c.layer = place.layer;
  c.channel = channel;
  c.entry = entry;

  useEffect(() => {
    controllers.current.set(entry.id, c);
    return () => {
      controllers.current.delete(entry.id);
      if (c.reportedPinned) setPinned(entry.id, c.layer, false);
      c.reportedPinned = false;
      c.slabGeo?.release();
      c.flatGeo?.release();
    };
  }, [controllers, entry.id, c]);

  // Patch the material for per-element frost (see patchBlur). Re-run when a
  // new material instance is created (samples change → new shader).
  useLayoutEffect(() => {
    patchMaterial(mat.current, p.samples);
    invalidate();
  }, [p.samples, invalidate]);
  // The size in px of what the slab is being drawn into (a buffer or the
  // screen — it's drawn into both), for the live-minify shader (glassTargetPx).
  useLayoutEffect(() => {
    const m = slab.current;
    if (!m) return undefined;
    m.onBeforeRender = (renderer) => {
      const t = mat.current?.uniforms?.glassTargetPx?.value;
      if (!t) return;
      const rt = renderer.getRenderTarget();
      if (rt) t.set(rt.width, rt.height);
      else renderer.getDrawingBufferSize(t);
    };
    return () => {
      m.onBeforeRender = () => {};
    };
  }, []);

  // --- Per-frame: follow the element --------------------------------------------------
  useFrame((_state, frameDelta) => {
    // On-demand frames can be seconds apart; cap the step so easing animates.
    const delta = Math.min(frameDelta, 1 / 30);
    const el = entry.el;
    const g = group.current;
    c.sig = null; // ("below" fingerprint — set again below when drawn)
    if (!g) return;
    // entry.liveMode: drawn by the browser instead (live.js) — skip here.
    // entry.suspended: a glassMorph target while its film plays (motion.js).
    const r = el.isConnected && p.enabled && !entry.liveMode && !entry.suspended ? el.getBoundingClientRect() : null;
    if (!r || r.width < 1 || r.height < 1) {
      c.visible = false;
      g.visible = false;
      return;
    }
    // A dialog under another dialog (Edit task under "Delete this task?"):
    // this layer's canvas now lives in the TOP dialog, above this element, so
    // its slab would cover the element's own text. Not drawn — it keeps its
    // CSS look (data-glass-drawn off) under the top dialog's dimmer, and gets
    // its glass back once that dialog closes (registry.js, isCoveredHost).
    if (isCoveredHost(place.layer, el)) {
      c.visible = false;
      g.visible = false;
      el.removeAttribute('data-glass-drawn');
      return;
    }

    // Ease hover/press changes.
    const a = anim.current;
    let moving = false;
    moving = easing.damp(a, 'sx', p.scale.x, 0.07, delta) || moving;
    moving = easing.damp(a, 'sy', p.scale.y, 0.07, delta) || moving;
    moving = easing.damp(a, 'op', p.tintOpacity, 0.1, delta) || moving;
    moving = easing.damp3(a.from, tintFrom, 0.1, delta) || moving;
    moving = easing.damp3(a.via, tintVia, 0.1, delta) || moving;
    moving = easing.damp3(a.to, tintTo, 0.1, delta) || moving;
    moving = easing.damp(a, 'rim', p.rimLight, 0.1, delta) || moving;
    // Press glow: quick to light up, slower to fade.
    const glowTarget = entry.state.pressed ? p.pressGlow : 0;
    moving = easing.damp(a, 'glow', glowTarget, glowTarget > a.glow ? 0.06 : 0.25, delta) || moving;
    c.animating = moving || p.temporalDistortion > 0;

    // CSS border-radius (only re-read when the size changes).
    const sizeKey = `${Math.round(r.width)}x${Math.round(r.height)}`;
    if (c.cssRadiusFor !== sizeKey) {
      c.cssRadiusFor = sizeKey;
      const cs = getComputedStyle(el);
      c.cssRadius = cssLength(cs.borderTopLeftRadius, Math.min(r.width, r.height));
      c.clipAncestors = clipAncestors(el);
      c.pinned = isPinned(el);
    }
    // anchor "page": the layer's in-page canvas scrolls WITH the page, so it
    // draws glass on ordinary elements (never trailing behind them while
    // scrolling); glass on a fixed / sticky element would slide off it, so
    // that is drawn by the layer's window-fixed PINNED canvas instead (the
    // provider creates it once a pinned element is reported here). Only
    // this canvas's OWN layer is split like that — lower layers are drawn
    // only into the buffers (what this layer refracts), where all count.
    const own = place.layer === canvasLayer;
    if (own && pageMode && c.reportedPinned !== c.pinned) {
      c.reportedPinned = c.pinned;
      setPinned(entry.id, place.layer, c.pinned);
    }
    if (own && (pageMode ? c.pinned : pinnedCanvas && !c.pinned)) {
      c.visible = false;
      g.visible = false;
      return;
    }

    // Bleed: grow the slab past the element on some sides (clipped back below)
    // so a full-width bar shows its rim only where it meets the page.
    // (padding moves the whole element in — see useGlass — so the glass
    // simply fills the element.)
    const bl = p.bleed;
    const box = {
      left: r.left - bl.left,
      top: r.top - bl.top,
      width: r.width + bl.left + bl.right,
      height: r.height + bl.top + bl.bottom,
    };

    // Shape + geometry (shared cache; rebuilt only when the size changes).
    const o = outline(p.shape, box.width * a.sx, box.height * a.sy, p.radius, c.cssRadius);
    const bevel = Math.min(p.bevel, o.r > 0 ? o.r : p.bevel);
    const key = `${o.w}|${o.h}|${o.r}|${bevel}|${p.bevelSegments}|${p.profile}`;
    // The exact mesh for every size change: slabs are stretched from one
    // template per corner shape (shapes.js stretchedSlab — a vertex copy,
    // not a new extrusion), so even glass whose size animates every frame
    // (a tab bar lens while dragged, a squishing knob) gets its real shape.
    // (This replaced a stretch-the-old-mesh-and-wait workaround.)
    if (key !== c.shapeKey) {
      const nextSlab = acquireGeometry('slab', { ...o, bevel, depth: 1, segments: p.bevelSegments, profile: p.profile });
      const nextFlat = acquireGeometry('flat', o);
      c.slabGeo?.release();
      c.flatGeo?.release();
      c.slabGeo = nextSlab;
      c.flatGeo = nextFlat;
      c.shapeKey = key;
      c.geo = { w: o.w, h: o.h };
      slab.current.geometry = nextSlab.geo;
      tint.current.geometry = nextFlat.geo;
      tintMat.uniforms.uRadius.value = o.r;
    }
    // (The mesh is built at the size rounded to ½ px: scale the last bit.)
    const gsx = o.w / c.geo.w;
    const gsy = o.h / c.geo.h;
    slab.current.scale.set(gsx, gsy, 1);
    tint.current.scale.set(gsx, gsy, 1);
    tintMat.uniforms.uSize.value.set(o.w, o.h);

    // Position: centre of the (bled) box (y up).
    g.position.set(box.left + box.width / 2, -(box.top + box.height / 2), 0);
    tint.current.position.z = 0.5 + bevel + 0.5;

    // Clip to scroll boxes around the element (and to the element's own edge
    // on bled sides).
    let L = bl.left > 0 ? r.left : -1e6;
    let T = bl.top > 0 ? r.top : -1e6;
    let R = bl.right > 0 ? r.right : 1e6;
    let B = bl.bottom > 0 ? r.bottom : 1e6;
    for (const anc of c.clipAncestors) {
      const ar = anc.getBoundingClientRect();
      L = Math.max(L, ar.left);
      T = Math.max(T, ar.top);
      R = Math.min(R, ar.right);
      B = Math.min(B, ar.bottom);
    }
    if (R <= L || B <= T || r.right <= L || r.left >= R || r.bottom <= T || r.top >= B) {
      c.visible = false;
      g.visible = false;
      return;
    }
    // (Plane.set copies the normal, so the shared constants are safe — no
    // 4 new vectors per element per frame.)
    planes[0].set(PLANE_X_POS, -L); //  x ≥ L
    planes[1].set(PLANE_X_NEG, R); //  x ≤ R
    planes[2].set(PLANE_Y_NEG, -T); // css y ≥ T
    planes[3].set(PLANE_Y_POS, B); //  css y ≤ B

    // Morph members are drawn by their group's liquid mesh (GlassWorld).
    const pointer = entry.state.pointer || CENTER_POINTER;
    if (p.morph) {
      c.morphKey = p.morph;
      c.shape = {
        cx: box.left + box.width / 2,
        cy: -(box.top + box.height / 2),
        hw: o.w / 2,
        hh: o.h / 2,
        r: o.r,
        tint: a.from,
        op: a.op,
        glow: a.glow,
        rim: a.rim,
        border: borderRgb,
        shadow: shadowRgb,
        px: r.left + pointer.x * r.width,
        py: -(r.top + pointer.y * r.height),
      };
      if (canvasLayer !== null && place.layer !== canvasLayer) c.sig = drawSig(c, a, g, o, pointer, [L, T, R, B], 'm');
      c.visible = true;
      g.visible = false;
      return;
    }
    c.morphKey = null;

    // Material: saturation / brightness of the refracted page.
    const mu = mat.current?.uniforms;
    if (mu?.glassSat) {
      mu.glassSat.value = p.saturation;
      mu.glassLinear.value = blendLinear() ? 1 : 0;
      mu.glassBright.value = p.brightness;
      mu.glassMinify.value = 1 / (1 - p.minify);
      mu.glassLiveMinify.value = liveMatch ? 1 : 0;
      mu.glassHalf.value.set(o.w / 2, o.h / 2);
      mu.glassRad.value = o.r;
      mu.glassCenter.value.set(g.position.x, g.position.y, 0);
      // Ripples (ripple.js): each ring's centre in buffer uv (projected like
      // glassCenter), radius + strength in px. Keeps drawing while any lives.
      const rings = p.ripple > 0 ? activeRipples(entry) : [];
      mu.glassRippleWave.value = p.rippleWavelength;
      mu.glassRippleAmp.value = Math.max(0.5, p.ripple);
      mu.glassPxUv.value.set(1 / Math.max(1, _state.size.width), 1 / Math.max(1, _state.size.height));
      mu.glassRipples.value.forEach((v, i) => {
        const ring = rings[i];
        if (!ring || ring.amp <= 0.01) return v.set(0, 0, 0, 0);
        rippleAt.set(r.left + ring.x, -(r.top + ring.y), 0).project(_state.camera);
        return v.set(rippleAt.x * 0.5 + 0.5, rippleAt.y * 0.5 + 0.5, ring.radius, ring.amp);
      });
      if (rings.length) c.animating = true;
    }

    // Tint.
    const u = tintMat.uniforms;
    u.uFrom.value.copy(a.from);
    u.uVia.value.copy(a.via);
    u.uTo.value.copy(a.to);
    u.uHasVia.value = p.tint.via ? 1 : 0;
    u.uAngle.value = (p.tint.angle * Math.PI) / 180;
    u.uOpacity.value = a.op;
    u.uDebug.value = getGlobal().debugOutlines ? 1 : 0;
    u.uRim.value = a.rim;
    u.uLive.value = liveMatch ? 1 : 0;
    u.uBevel.value = p.bevel;
    u.uRimWidth.value = p.rimWidth;
    u.uInner.value = p.innerGlow;
    u.uLight.value.copy(lightDir(p.lightAngle));
    u.uGlow.value = a.glow;
    u.uLinear.value = blendLinear() ? 1 : 0;
    u.uPointer.value.set(pointer.x, 1 - pointer.y);
    u.uBorderW.value = p.borderWidth;
    u.uBorderOp.value = p.borderOpacity;
    u.uBorderCol.value.set(borderRgb[0], borderRgb[1], borderRgb[2]);

    // Drop shadow (under the slab, only outside the glass shape).
    const sm = shadow.current;
    if (p.shadowOpacity > 0) {
      const ext = p.shadowBlur * 1.5 + Math.max(Math.abs(p.shadowX), Math.abs(p.shadowY)) + Math.max(p.shadowSpread, 0) + 2;
      const su = shadowMat.uniforms;
      sm.scale.set(o.w + ext * 2, o.h + ext * 2, 1);
      sm.position.z = -1;
      su.uSize.value.set(o.w + ext * 2, o.h + ext * 2);
      su.uHalf.value.set(o.w / 2, o.h / 2);
      su.uRadius.value = o.r;
      su.uOffset.value.set(p.shadowX, -p.shadowY);
      su.uSpread.value = p.shadowSpread;
      su.uBlur.value = p.shadowBlur;
      su.uOpacity.value = p.shadowOpacity;
      su.uColor.value.set(shadowRgb[0], shadowRgb[1], shadowRgb[2]);
      sm.visible = true;
    } else sm.visible = false;

    // Layer (channel) for the stratum pass, and draw order (shadow → slab → tint).
    slab.current.layers.set(channel);
    tint.current.layers.set(channel);
    sm.layers.set(channel);
    sm.renderOrder = entry.id * 3;
    slab.current.renderOrder = entry.id * 3 + 1;
    tint.current.renderOrder = entry.id * 3 + 2;
    // Glass on a LOWER layer (drawn into this canvas's buffers only): its
    // fingerprint for the "everything below" cache (GlassWorld).
    if (canvasLayer !== null && place.layer !== canvasLayer) c.sig = drawSig(c, a, g, o, pointer, [L, T, R, B], `${borderRgb}|${shadowRgb}`);
    c.visible = true;
    g.visible = true;
  }, 1);

  return (
    <group ref={group} visible={false}>
      <mesh ref={shadow} frustumCulled={false} geometry={UNIT_PLANE} material={shadowMat} />
      <mesh ref={slab} frustumCulled={false}>
        <MeshTransmissionMaterial
          key={p.samples}
          ref={mat}
          // Shared buffer → drei skips its own per-element scene render;
          // resolution 1 keeps its (unused) internal buffers tiny.
          buffer={sharedTexture}
          resolution={1}
          backsideResolution={1}
          backside={false}
          samples={p.samples}
          thickness={liveMatch ? p.thickness * liveBendMatch(p.ior) : p.thickness}
          ior={p.ior}
          chromaticAberration={p.chromaticAberration}
          anisotropicBlur={p.anisotropy}
          roughness={p.roughness}
          distortion={p.distortion}
          distortionScale={p.distortionScale}
          temporalDistortion={p.temporalDistortion}
          envMapIntensity={p.reflection}
          clippingPlanes={planes}
          transparent
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={tint} frustumCulled={false} material={tintMat} />
    </group>
  );
}

// --- Material patch: per-element frost + colour ------------------------------------------
/**
 * drei's MeshTransmissionMaterial samples the shared buffer at full detail.
 * We add a `blurLod` uniform and read a smaller mipmap level of the buffer
 * instead (each level halves the detail = a smooth, cheap blur), so each
 * element can be as frosted as its config says without extra render passes.
 * The sample is then saturated / brightened (glassSat, glassBright) — the
 * vivid look of Apple's glass.
 */
function patchMaterial(material, samples) {
  if (!material || material.userData.dpGlassPatched) return;
  material.userData.dpGlassPatched = true;
  material.uniforms.blurLod = { value: 0 };
  material.uniforms.glassSat = { value: 1 };
  material.uniforms.glassBright = { value: 1 };
  material.uniforms.glassCenter = { value: new THREE.Vector3() }; // the slab's centre (world)
  material.uniforms.glassMinify = { value: 1 }; // > 1: sample further out = things look smaller (minify)
  // Ripples (ripple.js): up to MAX_RIPPLES rings — xy = centre (buffer uv),
  // z = radius (px), w = strength (px, 0 = unused); px → uv via glassPxUv.
  material.uniforms.glassRipples = { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0)) };
  material.uniforms.glassRippleWave = { value: 14 };
  material.uniforms.glassRippleAmp = { value: 1 }; // the group's full ring strength (crest light scales with it)
  material.uniforms.glassPxUv = { value: new THREE.Vector2(0.001, 0.001) };
  // Live minify (canvas mode, float glass — see the shader below): the lens
  // shape (half size + corner radius, CSS px), and the size in px of what is
  // being drawn into right now (the screen or a buffer — set per draw by the
  // slab mesh's onBeforeRender), to find each pixel's place in the lens.
  material.uniforms.glassLiveMinify = { value: 0 };
  material.uniforms.glassHalf = { value: new THREE.Vector2(1, 1) };
  material.uniforms.glassRad = { value: 0 };
  material.uniforms.glassTargetPx = { value: new THREE.Vector2(1, 1) };
  material.uniforms.glassLinear = { value: 0 }; // global.blend "linear": saturate in linear light
  const original = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    original(shader, renderer); // drei's own changes (adds our uniforms too)
    const before = shader.fragmentShader;
    shader.fragmentShader = before
      .replace(
        'uniform sampler2D buffer;',
        'uniform sampler2D buffer;\nuniform float blurLod;\nuniform float glassSat;\nuniform float glassBright;\nuniform vec3 glassCenter;\nuniform float glassMinify;' +
          `\nuniform vec4 glassRipples[${MAX_RIPPLES}];\nuniform float glassRippleWave;\nuniform float glassRippleAmp;\nuniform vec2 glassPxUv;` +
          '\nuniform float glassLiveMinify;\nuniform vec2 glassHalf;\nuniform float glassRad;\nuniform vec2 glassTargetPx;\nuniform float glassLinear;' +
          GLSL_LIVE_MINIFY +
          GLSL_LINEAR
      )
      .replace(
        'return texture2D(buffer, fragCoord.xy);',
        `{
          // minify: read the buffer further out from the slab's centre, so
          // what's behind looks smaller and the rim shows what's round it
          // (glassMinify > 1) — or closer in, magnifying it (< 1).
          vec2 uv_ = fragCoord.xy;
          if (abs(glassMinify - 1.0) > 0.0001) {
            vec4 cp_ = projectionMatrix * viewMatrix * vec4(glassCenter, 1.0);
            vec2 c_ = cp_.xy / cp_.w * 0.5 + 0.5;
            if (glassLiveMinify > 0.5) {
              // Canvas mode, float glass: minify like LIVE glass (live.js
              // displacementMap) — shrink the middle, squeeze the outer band
              // so it reads exactly up to the lens's own edge, never past it;
              // the rim's own (inward) bend then shows what's at the edge —
              // the green ring of an active switch knob. (Scaling the read
              // point outward everywhere read ~19% past the knob, into the
              // page: no green ring, a white side.)
              vec2 lp_ = (gl_FragCoord.xy / glassTargetPx - c_) / glassPxUv; // CSS px from the centre
              float hm_ = min(glassHalf.x, glassHalf.y);
              float r_ = clamp(1.0 + glassSdRR(lp_, glassHalf, glassRad) / hm_, 0.0, 1.0);
              uv_ += glassNormalRR(lp_, glassHalf, glassRad) * (glassLiveBend(r_, 1.0 / glassMinify) - r_) * hm_ * glassPxUv;
            } else {
              uv_ = c_ + (uv_ - c_) * glassMinify;
            }
          }
          // ripples: push the read point along each ring (a sine wave in a
          // soft envelope at the ring's radius) — the same profile as live.js.
          float crest_ = 0.0; // crest light (like live.js): visible even over a plain background
          for (int i_ = 0; i_ < ${MAX_RIPPLES}; i_++) {
            vec4 rp_ = glassRipples[i_];
            if (rp_.w <= 0.0) continue;
            vec2 dp_ = (uv_ - rp_.xy) / glassPxUv; // px from the centre
            float d_ = length(dp_);
            if (d_ < 0.001) continue;
            float x_ = d_ - rp_.z;
            float env_ = exp(-(x_ * x_) / (0.81 * glassRippleWave * glassRippleWave));
            float wave_ = env_ * sin(6.2831853 * x_ / glassRippleWave);
            uv_ += (dp_ / d_) * (wave_ * rp_.w) * glassPxUv;
            crest_ = max(crest_, max(wave_, 0.0) * min(1.0, rp_.w / glassRippleAmp) * 0.55);
          }
          vec4 s_ = textureLod(buffer, uv_, blurLod);
          s_.rgb = glassLin(s_.rgb, glassLinear);
          s_.rgb = mix(s_.rgb, vec3(1.0), crest_);
          s_.rgb = mix(vec3(dot(s_.rgb, vec3(0.2126, 0.7152, 0.0722))), s_.rgb, glassSat) * glassBright;
          s_.rgb = glassEnc(s_.rgb, glassLinear);
          return s_;
        }`
      );
    if (shader.fragmentShader === before || !shader.fragmentShader.includes('blurLod)')) {
      console.warn('glass: could not add frost blur to MeshTransmissionMaterial (drei changed?) — glass will be sharp');
    }
  };
  // Separate compiled program per sample count (it's baked into the shader).
  material.customProgramCacheKey = () => `dp-glass-mtm-${samples}`;
  material.needsUpdate = true;
}

// --- Tint layer ----------------------------------------------------------------------------
function makeTintMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    clipping: true,
    uniforms: {
      uFrom: { value: new THREE.Vector3(1, 1, 1) },
      uVia: { value: new THREE.Vector3(1, 1, 1) },
      uTo: { value: new THREE.Vector3(1, 1, 1) },
      uHasVia: { value: 0 },
      uAngle: { value: Math.PI },
      uOpacity: { value: 0.5 },
      uSize: { value: new THREE.Vector2(1, 1) },
      uRadius: { value: 0 },
      uDebug: { value: 0 },
      uRim: { value: 0 },
      uRimWidth: { value: 1.25 },
      uInner: { value: 0 },
      uLight: { value: new THREE.Vector2(-0.707, 0.707) },
      uGlow: { value: 0 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uBorderW: { value: 0 },
      uBorderOp: { value: 0 },
      uBorderCol: { value: new THREE.Vector3(1, 1, 1) },
      uLive: { value: 0 }, // canvas mode: light the rim like live (SVG) glass
      uBevel: { value: 12 },
      uLinear: { value: 0 }, // global.blend "linear": mix light + border in linear light
    },
    vertexShader: /* glsl */ `
      #include <clipping_planes_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <clipping_planes_pars_fragment>
      uniform vec3 uFrom, uVia, uTo;
      uniform float uHasVia, uAngle, uOpacity, uDebug;
      uniform vec2 uSize;
      uniform float uRadius, uRim, uRimWidth, uInner, uGlow, uBorderW, uBorderOp, uLive, uBevel;
      uniform vec2 uLight, uPointer;
      uniform vec3 uBorderCol;
      uniform float uLinear;
      varying vec2 vUv;
      ${GLSL_SHAPES}
      ${GLSL_LINEAR}
      void main() {
        #include <clipping_planes_fragment>
        // CSS linear-gradient angle: 0deg = towards the top, 90deg = right.
        vec2 dir = vec2(sin(uAngle), cos(uAngle));
        vec2 p = (vUv - 0.5) * uSize;
        float len = abs(uSize.x * dir.x) + abs(uSize.y * dir.y);
        float t = clamp(dot(p, dir) / max(len, 1.0) + 0.5, 0.0, 1.0);
        vec3 col = uHasVia > 0.5
          ? (t < 0.5 ? mix(uFrom, uVia, t * 2.0) : mix(uVia, uTo, t * 2.0 - 1.0))
          : mix(uFrom, uTo, t);
        float a = uOpacity;

        // Light: specular rim + inner glow + press glow (white, over the tint).
        vec2 half_ = uSize * 0.5;
        float d = sdRoundRect(p, half_, uRadius);               // ≤ 0 inside
        vec2 n = outwardNormal(p, half_, uRadius);
        float w = uLive > 0.5
          ? liveLight(p, d, half_, uRadius, uLight, uRim, uRimWidth, uInner, uBevel)
          : whiteLight(d, n, uLight, uRim, uRimWidth, uInner, min(uSize.x, uSize.y));
        float gr = max(min(uSize.x, uSize.y), 0.35 * max(uSize.x, uSize.y));
        vec2 gp = (vUv - uPointer) * uSize;
        w = clamp(w + uGlow * exp(-dot(gp, gp) / (gr * gr)), 0.0, 1.0);
        float outA = 1.0 - (1.0 - a) * (1.0 - w);
        col = glassLin(col, uLinear);
        col = (vec3(1.0) * w + col * a * (1.0 - w)) / max(outA, 1e-4);
        a = outA;

        // Border: a hairline just inside the edge, following the glass shape.
        if (uBorderW > 0.0 && uBorderOp > 0.0) {
          float band = 1.0 - smoothstep(uBorderW - 0.5, uBorderW + 0.5, -d);
          float ba = uBorderOp * band;
          float bA = 1.0 - (1.0 - a) * (1.0 - ba);
          col = (glassLin(uBorderCol, uLinear) * ba + col * a * (1.0 - ba)) / max(bA, 1e-4);
          a = bA;
        }
        col = glassEnc(col, uLinear);

        if (uDebug > 0.5) {
          vec2 e = min(vUv, 1.0 - vUv) * uSize;
          if (min(e.x, e.y) < 1.5) { col = vec3(1.0, 0.1, 0.4); a = 1.0; }
        }
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}

// --- Shadow layer -------------------------------------------------------------------------
/** Soft drop shadow of a rounded rectangle, drawn only outside the glass shape. */
function makeShadowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    clipping: true,
    uniforms: {
      uSize: { value: new THREE.Vector2(1, 1) }, // the shadow quad (px)
      uHalf: { value: new THREE.Vector2(1, 1) }, // half-size of the glass
      uRadius: { value: 0 },
      uOffset: { value: new THREE.Vector2(0, 0) }, // px, y up
      uSpread: { value: 0 },
      uBlur: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Vector3(0, 0, 0) },
    },
    vertexShader: /* glsl */ `
      #include <clipping_planes_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <clipping_planes_pars_fragment>
      uniform vec2 uSize, uHalf, uOffset;
      uniform float uRadius, uSpread, uBlur, uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      ${GLSL_SHAPES}
      ${GLSL_SHADOW}
      void main() {
        #include <clipping_planes_fragment>
        vec2 p = (vUv - 0.5) * uSize;
        // CSS box-shadow: the box moved by the offset, grown by the spread,
        // blurred by a Gaussian of σ = blur / 2.
        float a = uOpacity * glassBoxShadow(p - uOffset, max(uHalf + uSpread, vec2(0.0)), max(uRadius + uSpread, 0.0), uBlur * 0.5);
        // Like CSS box-shadow: nothing under the glass itself.
        a *= smoothstep(-0.5, 0.5, sdRoundRect(p, uHalf, uRadius));
        if (a <= 0.001) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

// --- Studio environment (what the glass rims reflect) --------------------------------------
/** @param {'light'|'dark'} theme */
function makeStudioScene(theme) {
  const dark = theme === 'dark';
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          // floor → horizon → overhead (light: pale grey → white; dark: the
          // page's navy → a slate grey), plus a soft key light up and to the
          // left (matches the rim lightAngle) — dimmer in the dark room.
          vec3 col = mix(${dark ? 'vec3(0.03, 0.04, 0.08), vec3(0.30, 0.33, 0.42)' : 'vec3(0.80, 0.82, 0.88), vec3(1.0)'}, smoothstep(-0.6, 0.7, d.y));
          col += ${dark ? '0.35' : '0.6'} * pow(max(dot(d, normalize(vec3(-0.6, 0.7, 0.4))), 0.0), 12.0);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  scene.add(sky);
  return scene;
}

// --- Live-glass minify, for the transmission material (canvas mode) ------------------------
/** live.js displacementMap's minify profile, in GLSL (inserted at global scope). */
const GLSL_LIVE_MINIFY = /* glsl */ `
  float glassSdRR(vec2 p, vec2 b, float r) {
    r = min(r, min(b.x, b.y));
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  vec2 glassNormalRR(vec2 p, vec2 b, float r) {
    vec2 e = vec2(0.5, 0.0);
    vec2 g = vec2(glassSdRR(p + e.xy, b, r) - glassSdRR(p - e.xy, b, r), glassSdRR(p + e.yx, b, r) - glassSdRR(p - e.yx, b, r));
    return g / max(length(g), 1e-5);
  }
  // r: 0 = deepest, 1 = the edge. scaleIn < 1 shrinks (minify), > 1 magnifies.
  float glassLiveBend(float r, float scaleIn) {
    if (scaleIn > 1.0) return r / scaleIn;
    float knee = 0.88 * scaleIn;
    if (r < knee) return r / scaleIn;
    float t = (r - knee) / (1.0 - knee);
    return 0.88 + 0.12 * (1.0 - (1.0 - t) * (1.0 - t));
  }
`;

// --- Shared GLSL: rounded-rectangle distance field + white light ---------------------------
// --- Shared GLSL: linear light (global.blend "linear") ------------------------------------
/**
 * Colours are sRGB values everywhere (the page, tints, the buffers). With
 * global.blend "linear" the shaders MIX them in linear light instead —
 * decode, mix, encode — which is how light actually adds up: a white rim over
 * a dark tint stays brighter, frost keeps small bright spots glowing instead
 * of greying them. (gamma 2.2 ≈ sRGB.) What the GPU blends itself — a slab's
 * tint layer laid over the refracted page — stays sRGB: WebGL can't blend
 * onto the screen in linear light without an extra full-screen pass.
 */
const GLSL_LINEAR = /* glsl */ `
  vec3 glassLin(vec3 c, float on) { return on > 0.5 ? pow(max(c, vec3(0.0)), vec3(2.2)) : c; }
  vec3 glassEnc(vec3 c, float on) { return on > 0.5 ? pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)) : c; }
`;

// --- Shared GLSL: Gaussian shadows, like CSS box-shadow -----------------------------------
/**
 * CSS box-shadow blurs the shadow shape with a Gaussian whose σ is HALF the
 * blur radius. glassBoxShadow is the exact Gaussian blur of a rounded
 * rectangle: erf (closed form) across x, a few samples across y — the
 * technique from Evan Wallace's "Fast Rounded Rectangle Shadows" (2015),
 * written out here. glassEdgeShadow is the same Gaussian falloff across a
 * distance field's edge (morph glass: any melted shape).
 * The old shadow was a straight ramp over the blur width — visibly harder
 * and shorter than the CSS / live-glass shadow of the same settings.
 */
const GLSL_SHADOW = /* glsl */ `
  // erf, vector form (Abramowitz–Stegun 7.1.27, max error ~5e-4).
  vec2 glassErf2(vec2 x) {
    vec2 s = sign(x);
    vec2 a = abs(x);
    vec2 t = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
    t *= t;
    return s - s / (t * t);
  }
  float glassErf(float x) { return glassErf2(vec2(x, 0.0)).x; }
  // Coverage across x of the rounded box (half size h, corner r) at height y, blurred by sigma.
  float glassShadowX(float x, float y, float sigma, float r, vec2 h) {
    float dy = min(h.y - r - abs(y), 0.0);
    float edge = h.x - r + sqrt(max(0.0, r * r - dy * dy));
    vec2 i = 0.5 + 0.5 * glassErf2((x + vec2(-edge, edge)) * (0.70710678 / sigma));
    return i.y - i.x;
  }
  // Shadow (0–1) at p of a rounded box centred at 0 (half size h, corner r), Gaussian sigma.
  float glassBoxShadow(vec2 p, vec2 h, float r, float sigma) {
    r = min(r, min(h.x, h.y));
    if (sigma < 0.01) return 1.0 - clamp(sdRoundRect(p, h, r) + 0.5, 0.0, 1.0);
    float lo = p.y - h.y;
    float hi = p.y + h.y;
    float y0 = clamp(-3.0 * sigma, lo, hi);
    float y1 = clamp(3.0 * sigma, lo, hi);
    float stepY = (y1 - y0) / 4.0;
    float y = y0 + stepY * 0.5;
    float v = 0.0;
    for (int i = 0; i < 4; i++) {
      float g = exp(-(y * y) / (2.0 * sigma * sigma)) / (2.50662827 * sigma);
      v += glassShadowX(p.x, p.y - y, sigma, r, h) * g * stepY;
      y += stepY;
    }
    return v;
  }
  // Gaussian falloff across a distance field's edge (d > 0 outside).
  float glassEdgeShadow(float d, float sigma) {
    if (sigma < 0.01) return 1.0 - clamp(d + 0.5, 0.0, 1.0);
    return 0.5 - 0.5 * glassErf(d * 0.70710678 / sigma);
  }
`;

const GLSL_SHAPES = /* glsl */ `
  // Signed distance to a rounded rectangle (half-size b, radius r): ≤ 0 inside.
  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  vec2 outwardNormal(vec2 p, vec2 b, float r) {
    vec2 e = vec2(0.5, 0.0);
    vec2 g = vec2(sdRoundRect(p + e.xy, b, r) - sdRoundRect(p - e.xy, b, r),
                  sdRoundRect(p + e.yx, b, r) - sdRoundRect(p - e.yx, b, r));
    return g / max(length(g), 1e-5);
  }
  // Specular rim (brightest facing the light, a softer echo opposite, like
  // Apple's glass) + a soft inner glow from the edge inwards.
  // Canvas mode: the rim light and inner glow of LIVE (SVG) glass, which is
  // what canvas mode replaces in Chromium (live.js rimShadow — four inset
  // box-shadows): a bright edge facing the light, a softer one opposite, a
  // 0.5 px ring all round, and an inner glow (10 + bevel) px deep. An inset
  // shadow offset by o shows where the shape moved by o doesn't cover —
  // sdRoundRect(p − o) — blurred over its blur radius. (y up: light = uLight.)
  float liveLight(vec2 p, float d, vec2 half_, float r, vec2 light, float rim, float rimWidth, float inner, float bevel) {
    float b = max(rimWidth * 0.6, 0.5);
    float lit = rim * 0.95 * smoothstep(-b, b, sdRoundRect(p + light * rimWidth, half_, r));
    float back = rim * 0.45 * smoothstep(-b, b, sdRoundRect(p - light * rimWidth * 0.8, half_, r));
    float ring = rim * 0.35 * smoothstep(-0.75, -0.25, d);
    float gb = 10.0 + bevel;
    float glow = inner * 0.45 * smoothstep(-gb, gb, d);
    return 1.0 - (1.0 - lit) * (1.0 - back) * (1.0 - ring) * (1.0 - glow);
  }
  float whiteLight(float d, vec2 n, vec2 light, float rim, float rimWidth, float inner, float minSide) {
    float edge = 1.0 - smoothstep(0.0, rimWidth, -d);
    float lit = max(dot(n, light), 0.0);
    float back = max(dot(n, -light), 0.0);
    float rimA = rim * edge * (0.22 + 0.78 * pow(lit, 1.5) + 0.5 * pow(back, 1.5));
    // Inner glow = a THIN band of light just inside the edge (Apple-style).
    // Capped at 14 px: as 22% of the short side it reached ~40 px into big
    // shapes (sidebars, cards, a 184 px round lens) and washed them
    // out into a milky haze — very visible on the dark theme.
    float glowLen = clamp(minSide * 0.22, 4.0, 14.0);
    float innerA = inner * exp(d / glowLen) * (0.55 + 0.45 * lit);
    return clamp(rimA + innerA, 0.0, 1.0);
  }
`;

/**
 * A lower-layer glass element's fingerprint for one frame: everything that
 * decides how it is drawn into the buffers (see belowSignature).
 */
function drawSig(c, a, g, o, pointer, clip, extra) {
  const f = (n) => Math.round(n * 1000) / 1000;
  return [
    f(g.position.x), f(g.position.y), f(o.w), f(o.h), f(o.r), c.shapeKey, c.pv, c.channel,
    clip.map((n) => Math.round(n * 10) / 10).join(','),
    f(a.sx), f(a.sy), f(a.op), f(a.rim), f(a.glow),
    f(a.from.x), f(a.from.y), f(a.from.z), f(a.via.x), f(a.via.y), f(a.via.z), f(a.to.x), f(a.to.y), f(a.to.z),
    f(pointer.x), f(pointer.y), extra,
  ].join(',');
}

/**
 * Canvas mode: how much thicker the WebGL slab must be to bend its rim as
 * far as the live (SVG) glass in Chromium — the look canvas mode replaces.
 * Live glass moves the backdrop up to thickness·(ior−1)·4 px at the very
 * edge (live.js: strength/2); the transmission material, at a vertical rim,
 * thickness·cos(asin(1/ior)). Measured side by side, canvas-mode sidebars
 * bent about half as much as live ones and read as flat rounded boxes.
 * (Normal mode is unchanged — it's what Safari / Firefox show.)
 */
function liveBendMatch(ior) {
  if (!(ior > 1.0001)) return 1;
  return Math.max(1, ((ior - 1) * 4) / Math.sqrt(1 - 1 / (ior * ior)));
}

/** global.blend "linear": mix colours in linear light (see GLSL_LINEAR). */
const blendLinear = () => getGlobal().blend === 'linear';

/** CSS-style angle (0 = top, 90 = right, −45 = top-left) → direction (y up). */
const lightVec = new THREE.Vector2();
function lightDir(deg) {
  const a = (deg * Math.PI) / 180;
  return lightVec.set(Math.sin(a), Math.cos(a));
}

// --- Liquid morph: one SDF glass surface for a whole morph group --------------------------
/**
 * Draws every shape of a morph group as ONE smooth distance field (shapes
 * within morphRadius melt together, "smooth minimum"), then does the glass
 * itself in the shader: the squircle rim bends the buffer behind (with
 * chromatic aberration), frost = buffer mip level, saturation/brightness,
 * the tint, reflection, rim light, inner glow, press glow, border and drop
 * shadow — each shape's OWN settings, blended between the shapes by
 * closeness (one morph group can mix looks; melted shapes fade between
 * them). Bevel, melt radius, chromatic aberration, rim width and light angle
 * stay group-wide. Same look as the drei slabs, but able to merge.
 */
function makeLiquidMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uShapes: { value: Array.from({ length: MAX_LIQUID }, () => new THREE.Vector4()) }, // cx, cy, hw, hh
      uShape2: { value: Array.from({ length: MAX_LIQUID }, () => new THREE.Vector4()) }, // r, tintOpacity, glow, 0
      uGlowAt: { value: Array.from({ length: MAX_LIQUID }, () => new THREE.Vector2()) },
      uTintCol: { value: Array.from({ length: MAX_LIQUID }, () => new THREE.Vector3(1, 1, 1)) },
      // Each shape's OWN look, blended between the shapes like the tint
      // (morph glass used to take all of this from its first shape):
      uShape3: { value: Array.from({ length: MAX_LIQUID }, () => new THREE.Vector4(0, 1, 1, 0)) }, // frost lod, saturation, brightness, bend (px)
      uShape4: { value: Array.from({ length: MAX_LIQUID }, () => new THREE.Vector4()) }, // rimLight, innerGlow, borderWidth, reflection
      uBorder: { value: Array.from({ length: MAX_LIQUID }, () => new THREE.Vector4(1, 1, 1, 0)) }, // border rgb, opacity
      uShadowC: { value: Array.from({ length: MAX_LIQUID }, () => new THREE.Vector4(0, 0, 0, 0)) }, // shadow rgb, opacity
      uShadowG: { value: Array.from({ length: MAX_LIQUID }, () => new THREE.Vector4()) }, // shadow offset x, y (y up), blur, spread
      uCount: { value: 0 },
      uLinear: { value: 0 }, // global.blend "linear": every mix below in linear light
      uK: { value: 24 },
      uBevel: { value: 12 },
      uCA: { value: 0.05 },
      uRimWidth: { value: 1.25 },
      uLight: { value: new THREE.Vector2(-0.707, 0.707) },
      uView: { value: new THREE.Vector2(1, 1) },
      uViewTop: { value: 0 }, // world y of the canvas top (page-anchored canvases)
      uBuffer: { value: null },
    },
    vertexShader: /* glsl */ `
      varying vec2 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xy;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      #define MAXS ${MAX_LIQUID}
      uniform vec4 uShapes[MAXS];
      uniform vec4 uShape2[MAXS];
      uniform vec2 uGlowAt[MAXS];
      uniform vec3 uTintCol[MAXS];
      uniform vec4 uShape3[MAXS];
      uniform vec4 uShape4[MAXS];
      uniform vec4 uBorder[MAXS];
      uniform vec4 uShadowC[MAXS];
      uniform vec4 uShadowG[MAXS];
      uniform int uCount;
      uniform float uLinear;
      uniform float uK, uBevel, uCA, uRimWidth;
      uniform vec2 uLight, uView;
      uniform float uViewTop;
      uniform sampler2D uBuffer;
      varying vec2 vWorld;
      ${GLSL_SHAPES}
      ${GLSL_SHADOW}
      ${GLSL_LINEAR}
      float smin(float a, float b, float k) {
        float h = max(k - abs(a - b), 0.0) / k;
        return min(a, b) - h * h * k * 0.25;
      }
      float field(vec2 p) {
        float d = 1e6;
        for (int i = 0; i < MAXS; i++) {
          if (i >= uCount) break;
          float di = sdRoundRect(p - uShapes[i].xy, uShapes[i].zw, uShape2[i].x);
          d = (i == 0) ? di : smin(d, di, max(uK, 0.001));
        }
        return d;
      }
      float tilt(float x) { // squircle rim (see shapes.js rimTilt)
        float b4 = 1.0 - pow(x, 4.0);
        if (b4 <= 1e-5) return 1.0;
        float s = pow(x, 3.0) / pow(b4, 0.75);
        return s / sqrt(1.0 + s * s);
      }
      void main() {
        vec2 p = vWorld;
        float d = field(p);

        // Each shape's weight here (by closeness — what the tint always
        // used): every per-shape setting below is blended with it, so a
        // morph group can mix looks and melted shapes fade between them.
        float wsum = 0.0;
        vec4 L3 = vec4(0.0); vec4 L4 = vec4(0.0);
        vec3 tc = vec3(0.0); float top = 0.0; float glow = 0.0; float minSide = 0.0;
        vec4 bc = vec4(0.0); vec4 sc = vec4(0.0); vec4 sg = vec4(0.0);
        for (int i = 0; i < MAXS; i++) {
          if (i >= uCount) break;
          float di = sdRoundRect(p - uShapes[i].xy, uShapes[i].zw, uShape2[i].x);
          float w = exp(-max(di, 0.0) * 3.0 / max(uK, 1.0));
          wsum += w;
          L3 += uShape3[i] * w;
          L4 += uShape4[i] * w;
          bc += uBorder[i] * w;
          sc += uShadowC[i] * w;
          sg += uShadowG[i] * w;
          minSide += 2.0 * min(uShapes[i].z, uShapes[i].w) * w;
          tc += uTintCol[i] * uShape2[i].y * w;
          top += uShape2[i].y * w;
          // Press glow: the same size as on regular glass (tint shader:
          // max(short side, 0.35 × long side)) — it used 1.4 × the half
          // size, about twice as wide.
          vec2 gp = p - uGlowAt[i];
          float gr = max(2.0 * min(uShapes[i].z, uShapes[i].w), 0.7 * max(uShapes[i].z, uShapes[i].w));
          glow += uShape2[i].z * w * exp(-dot(gp, gp) / (gr * gr));
        }
        float iw = 1.0 / max(wsum, 1e-4);
        L3 *= iw; L4 *= iw; bc *= iw; sc *= iw; sg *= iw; minSide *= iw;

        // Drop shadow (like regular glass's shadow mesh: only outside the
        // glass): the melted shape moved by the offset, grown by the
        // spread, softened over the blur.
        float sa = 0.0;
        if (sc.a > 0.0 && d > -0.5) {
          float ds = field(p - sg.xy) - sg.w;
          sa = sc.a * glassEdgeShadow(ds, sg.z * 0.5) * smoothstep(-0.5, 0.5, d);
        }
        if (d > 1.0) {
          if (sa <= 0.001) discard;
          gl_FragColor = vec4(sc.rgb, sa); // (one colour: nothing to mix)
          return;
        }
        float aa = clamp(0.5 - d, 0.0, 1.0);
        // The normal (4 more passes over every shape) is only needed near the
        // edge: deeper in than the bevel the refraction is zero (tilt(0) = 0),
        // and past 6 × the inner glow's max reach (14 px) the light it steers
        // is below 1/255 — so the interior skips it with the same pixels.
        vec2 n = vec2(0.0, 1.0);
        if (d > -max(uBevel, 84.0) - 1.0) {
          vec2 e = vec2(0.75, 0.0);
          vec2 g = vec2(field(p + e.xy) - field(p - e.xy), field(p + e.yx) - field(p - e.yx));
          n = g / max(length(g), 1e-5);
        }

        // Refraction: look inwards across the rim, more at the very edge.
        float x = clamp(1.0 + d / max(uBevel, 0.5), 0.0, 1.0);
        float tx = tilt(x);
        vec2 off = -n * L3.w * tx / uView;
        vec2 uv = vec2(p.x / uView.x, 1.0 + (p.y - uViewTop) / uView.y);
        vec3 col = vec3(
          textureLod(uBuffer, uv + off * (1.0 + 2.0 * uCA), L3.x).r,
          textureLod(uBuffer, uv + off * (1.0 + uCA), L3.x).g,
          textureLod(uBuffer, uv + off, L3.x).b);
        col = glassLin(col, uLinear);
        bc.rgb = glassLin(bc.rgb, uLinear);
        sc.rgb = glassLin(sc.rgb, uLinear);
        col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, L3.y) * L3.z;

        // Tint, blended between the shapes.
        float op = top * iw;
        tc = glassLin(tc / max(top, 1e-4), uLinear);
        col = mix(col, tc, op);

        // Reflection (regular glass: the studio environment, strongest where
        // the rim turns away — fresnel): a soft white sheen across the face
        // and more on the rim, brighter on edges facing up.
        float refl = L4.w * (0.05 + 0.45 * tx * tx) * (0.65 + 0.35 * n.y);
        col = mix(col, vec3(1.0), clamp(refl, 0.0, 1.0));

        float wl = clamp(whiteLight(d, n, uLight, L4.x, uRimWidth, L4.y, minSide) + glow * iw, 0.0, 1.0);
        col = mix(col, vec3(1.0), wl);

        // Border: a hairline just inside the edge (like the tint shader).
        if (L4.z > 0.0 && bc.a > 0.0) {
          float band = 1.0 - smoothstep(L4.z - 0.5, L4.z + 0.5, -d);
          col = mix(col, bc.rgb, bc.a * band);
        }

        // Glass over its own shadow's edge (anti-aliased rim).
        float outA = aa + sa * (1.0 - aa);
        col = (col * aa + sc.rgb * sa * (1.0 - aa)) / max(outA, 1e-4);
        col = glassEnc(col, uLinear);
        gl_FragColor = vec4(col, outA);
      }
    `,
  });
}

/** Push a morph group's shapes + settings into its liquid mesh. */
function updateLiquid(l, members, size, viewTop = 0) {
  const u = l.mat.uniforms;
  const p = members[0].p; // the group's look comes from its first element
  const n = Math.min(members.length, MAX_LIQUID);
  let shadowPad = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const s = members[i].shape;
    u.uShapes.value[i].set(s.cx, s.cy, s.hw, s.hh);
    u.uShape2.value[i].set(s.r, s.op, s.glow, 0);
    u.uGlowAt.value[i].set(s.px, s.py);
    u.uTintCol.value[i].copy(s.tint);
    // This shape's own look (blended between shapes in the shader).
    const q = members[i].p;
    const lod = u.uShape3.value[i].x; // (set by setBuffer: needs the buffer's scale)
    u.uShape3.value[i].set(lod, q.saturation, q.brightness, q.thickness * (q.ior - 1) * 1.5);
    u.uShape4.value[i].set(s.rim ?? q.rimLight, q.innerGlow, q.borderOpacity > 0 ? q.borderWidth : 0, q.reflection);
    u.uBorder.value[i].set(s.border[0], s.border[1], s.border[2], q.borderOpacity);
    u.uShadowC.value[i].set(s.shadow[0], s.shadow[1], s.shadow[2], q.shadowOpacity);
    u.uShadowG.value[i].set(q.shadowX, -q.shadowY, q.shadowBlur, q.shadowSpread);
    const reach = q.shadowOpacity > 0 ? q.shadowBlur * 1.5 + Math.max(Math.abs(q.shadowX), Math.abs(q.shadowY)) + Math.max(q.shadowSpread, 0) + 2 : 0;
    shadowPad = Math.max(shadowPad, reach);
    x0 = Math.min(x0, s.cx - s.hw);
    x1 = Math.max(x1, s.cx + s.hw);
    y0 = Math.min(y0, s.cy - s.hh);
    y1 = Math.max(y1, s.cy + s.hh);
  }
  u.uCount.value = n;
  u.uLinear.value = blendLinear() ? 1 : 0;
  u.uK.value = p.morphRadius;
  u.uBevel.value = p.bevel;
  u.uCA.value = p.chromaticAberration * 3;
  u.uRimWidth.value = p.rimWidth;
  u.uLight.value.copy(lightDir(p.lightAngle));
  u.uView.value.set(size.width, size.height);
  u.uViewTop.value = viewTop;
  // Cover all shapes plus the reach of the melt and of the drop shadows.
  const pad = p.morphRadius + 4 + shadowPad;
  l.mesh.scale.set(x1 - x0 + pad * 2, y1 - y0 + pad * 2, 1);
  l.mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 2);
  l.mesh.layers.set(members[0].channel);
  l.mesh.renderOrder = Math.min(...members.map((m) => m.id)) * 3 + 1;
}

// --- Canvas mode: the live page + floating glass HTML ---------------------------------------
/**
 * Textured rectangles for canvas mode: the page root (once per paint where
 * it changed) and each floating glass element's own HTML (re-captured only
 * when the paint event says it changed). Pictures come straight from the
 * page canvas (texElementSubImage2D) into render-target textures; they are
 * premultiplied, so they're drawn with ONE / ONE_MINUS_SRC_ALPHA.
 */
const WARM_FRAMES = 3;
function makeElementLayer(renderer) {
  const scene = new THREE.Scene();
  const quad = new THREE.PlaneGeometry(1, 1);
  const glc = renderer.getContext();
  const items = new Map(); // element → { rt, mesh, mat, w, h, src }
  let size = { width: 1, height: 1 };
  let changed = null;
  let drawn = new Set();
  let dpr = 1;
  let retry = false;
  const makeMat = () =>
    new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null } },
      vertexShader: /* glsl */ `
        #include <clipping_planes_pars_vertex>
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <clipping_planes_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <clipping_planes_pars_fragment>
        uniform sampler2D tMap;
        varying vec2 vUv;
        void main() {
          #include <clipping_planes_fragment>
          gl_FragColor = texture2D(tMap, vec2(vUv.x, 1.0 - vUv.y)); // (row 0 = the element's top)
        }`,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      clipping: true,
    });
  const item = (el) => {
    let it = items.get(el);
    if (!it) {
      const mat = makeMat();
      const mesh = new THREE.Mesh(quad, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      scene.add(mesh);
      // warm: capture again on the next few frames regardless — an element's
      // first pictures right after it became drawable can come out
      // incomplete (seen: a sidebar without its menu items), and nothing
      // later "changes" to trigger another capture.
      it = { rt: null, mesh, mat, w: 0, h: 0, src: '', warm: WARM_FRAMES };
      items.set(el, it);
    }
    return it;
  };
  const ensureRt = (it, w, h, exact = false) => {
    if (it.rt && it.w === w && it.h === h) return false;
    it.rt?.dispose();
    // exact (label pictures): nearest — drawn 1:1 on whole device px, an
    // exact copy. The page picture stays linear: it is also scaled down into
    // the refraction buffers.
    const f = exact ? THREE.NearestFilter : THREE.LinearFilter;
    it.rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, generateMipmaps: false, minFilter: f, magFilter: f });
    it.mat.uniforms.tMap.value = it.rt.texture;
    it.w = w;
    it.h = h;
    it.src = '';
    it.warm = WARM_FRAMES;
    return true;
  };
  /** Copy an element's picture into its texture. false = not drawable (yet). */
  const upload = (it, el, cfg) => {
    const t0 = performance.now();
    stats.canvasUploads = (stats.canvasUploads || 0) + 1;
    try {
      renderer.initRenderTarget(it.rt);
      glc.bindTexture(glc.TEXTURE_2D, renderer.properties.get(it.rt.texture).__webglTexture);
      glc.pixelStorei(glc.UNPACK_FLIP_Y_WEBGL, false);
      // Premultiplied on upload: drawn with ONE / ONE_MINUS_SRC_ALPHA. As
      // straight alpha, every half-transparent pixel (glyph edges, a faded
      // "Disabled" label) was added at full colour — text looked bold and
      // glowing, faded things at full strength.
      glc.pixelStorei(glc.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      glc.texElementSubImage2D(glc.TEXTURE_2D, 0, 0, 0, el, cfg);
      return true;
    } catch {
      return false; // (e.g. it only became drawable this frame — next paint)
    } finally {
      renderer.resetState();
      stats.canvasUploadMs = (stats.canvasUploadMs || 0) + (performance.now() - t0);
    }
  };
  const hideAll = () => {
    for (const it of items.values()) it.mesh.visible = false;
  };
  return {
    scene,
    /**
     * Start of a frame: the canvas size and the paint event's changed elements.
     * The changed list is NOT trusted: Chromium (157) left some changes out —
     * a sidebar whose menu items appear a moment after it mounts kept its
     * first, empty picture. Re-copying every picture each frame is cheap
     * (measured: 76 pictures ≈ 1.4 ms) and frames only run when something
     * changed, so every picture is copied every frame.
     */
    begin(sz, ch) {
      size = sz;
      changed = ch;
      drawn = new Set();
      dpr = renderer.getPixelRatio();
      retry = false;
      for (const [el, it] of items) {
        if (el.isConnected) continue;
        scene.remove(it.mesh);
        it.rt?.dispose();
        it.mat.dispose();
        items.delete(el);
      }
    },
    /** The live page, full canvas. */
    preparePage(root) {
      hideAll();
      const it = item(root);
      const w = Math.max(1, Math.round(size.width * dpr));
      const h = Math.max(1, Math.round(size.height * dpr));
      const fresh = ensureRt(it, w, h);
      if (fresh || !changed || changed.has(root) || !it.src || it.warm > 0) {
        if (it.warm > 0) {
          it.warm -= 1;
          retry = true; // (keep painting until warmed up)
        }
        if (!upload(it, root, { width: w, height: h })) {
          retry = true;
          return false;
        }
        it.src = 'page';
      }
      it.fails = 0;
      it.mesh.scale.set(size.width, size.height, 1);
      it.mesh.position.set(size.width / 2, -size.height / 2, 0);
      it.mat.clippingPlanes = null;
      it.mesh.visible = true;
      return true;
    },
    /** One stratum's floating glass HTML (or, rest: every floating element not drawn yet). */
    prepareLabels(pass) {
      hideAll();
      const list = [];
      if (pass.rest) {
        for (const el of drawableElements()) if (!drawn.has(el)) list.push({ el, planes: null });
      } else {
        for (const c of pass.ctls) for (const m of c.members || [c]) if (m.entry) list.push({ el: m.entry.el, planes: m.planes });
      }
      let any = false;
      list.forEach(({ el, planes }, order) => {
        drawn.add(el);
        const info = drawInfo(el);
        if (!info || !el.isConnected) return;
        const it = item(el);
        // Pixel-exact: the picture is w × h DEVICE px, drawn at whole device
        // px, 1:1 — any fractional position or scale resamples (bilinear) and
        // smeared every glyph and icon. (The capture rect is in the element's
        // CSS px — tested on a 2× canvas grid — and the destination size in
        // device px.)
        const w = Math.max(1, Math.round(info.sw * dpr));
        const h = Math.max(1, Math.round(info.sh * dpr));
        const fresh = ensureRt(it, w, h, true);
        const src = `${info.sx},${info.sy},${info.sw},${info.sh},${dpr}`;
        const again = needsRecopy(el);
        if (again) retry = true; // (more frames until the repaint has been copied)
        if (fresh || !changed || changed.has(el) || it.src !== src || it.warm > 0 || again) {
          if (it.warm > 0) {
            it.warm -= 1;
            retry = true; // (keep painting until warmed up)
          }
          if (!upload(it, el, { sx: info.sx, sy: info.sy, swidth: info.sw, sheight: info.sh, width: w, height: h })) {
            // Not capturable (yet): it only became drawable this frame, or
            // it isn't rendered (display: none). Retry just this one, a few
            // times — never re-copy everything because of it.
            it.src = '';
            it.fails = (it.fails || 0) + 1;
            if (it.fails <= 3) retry = true;
            return;
          }
          it.src = src;
          it.fails = 0;
        }
        const cw = w / dpr; // (exact texture size in CSS px)
        const ch = h / dpr;
        const left = Math.round((info.x + info.sx) * dpr) / dpr; // (whole device px)
        const top = Math.round((info.y + info.sy) * dpr) / dpr;
        it.mesh.scale.set(cw, ch, 1);
        it.mesh.position.set(left + cw / 2, -(top + ch / 2), 0);
        it.mesh.renderOrder = order;
        it.mat.clippingPlanes = planes || null;
        it.mesh.visible = true;
        any = true;
      });
      return any;
    },
    /** Did a picture fail to copy (ask for another paint)? */
    get retry() {
      return retry;
    },
    dispose() {
      for (const it of items.values()) {
        it.rt?.dispose();
        it.mat.dispose();
      }
      items.clear();
      quad.dispose();
    },
  };
}

// --- "Everything below" fingerprint ----------------------------------------------------------
/**
 * One string that changes whenever anything drawn under a canvas's OWN glass
 * would change: the background pass, every lower glass element (GlassMesh
 * writes c.sig each frame — position, size, shape, clip, eased values,
 * settings), the page picture (version + how far it has slid) and the dialog
 * dimmer. null = don't cache this frame (something below is animating, or
 * hasn't reported yet).
 */
function belowSignature(passes, own0, kit, { size, viewTop, lodScale, layer }) {
  const parts = [kit.bgSig(), size.width, size.height, viewTop, lodScale, getGlassTheme()];
  for (let i = 0; i < own0; i++) {
    const pass = passes[i];
    if (pass.type === 'snapshot') {
      parts.push('S', snapshot.version, snapshot.canvas ? 1 : 0, window.scrollX - snapshot.scrollX, window.scrollY - snapshot.scrollY);
    } else if (pass.type === 'underlay') {
      parts.push('U', kit.underlayKey(layer));
    } else {
      parts.push('G', pass.channel);
      for (const c of pass.ctls) {
        for (const m of c.members || [c]) {
          if (m.animating || !m.sig) return null;
          parts.push(m.sig);
        }
      }
    }
  }
  return parts.join('~');
}

// --- Buffers, background, snapshot and blit helpers -------------------------------------------
/**
 * @param {boolean} paintsImage  this is the full base canvas: once
 *   global.backgroundImage has loaded it paints it on screen and tells
 *   live.js (setImageBackdrop), so base glass stays WebGL over the picture.
 */
function makeKit(paintsImage) {
  const target = () =>
    new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      generateMipmaps: true, // mip levels = the frost blur (see patchBlur)
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
  const bufA = target();
  const bufB = target();
  // "Everything below" cache (GlassWorld: belowSignature) — floating canvases.
  const below = { rt: target(), sig: null, lastSig: null };
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(1, 1);

  // Page background (shader copy of the CSS background, or the page's own
  // colour in "auto" mode), for the current light / dark theme — rebuilt by
  // syncTheme() when it changes.
  let bg = backgroundFor(getGlobal().background, getGlassTheme());
  const bgMat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: new THREE.Vector2(1, 1) }, // the WINDOW (CSS px)
      uCanvas: { value: new THREE.Vector2(1, 1) }, // this canvas (CSS px)
      uTop: { value: 0 }, // this canvas's top edge, in window px (in-page canvases)
      // global.backgroundImage (background "auto" only): the picture + its size.
      uImage: { value: null },
      uImageSize: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: fullscreenVertexShader,
    fragmentShader: pageBackgroundShader(bg.spec),
    depthTest: false,
    depthWrite: false,
  });
  const bgScene = new THREE.Scene();
  bgScene.add(new THREE.Mesh(quad, bgMat));
  let bgShaderKey = bg.key; // what bgMat's shader draws right now

  // global.backgroundImage: loaded once per URL (CORS, so WebGL may read it
  // — serve it from your own origin to be sure). Until it
  // has loaded — or if it can't be (no CORS, 404) — the background stays the
  // flat page colour, and base glass stays live (live.js).
  let bgImageUrl = null;
  let bgImageTex = null;
  let bgImageExact = false; // painting the picture ON SCREEN as an exact background (syncTheme)
  let imageInBuffer = false; // the picture is what base glass refracts (syncTheme)
  let screenPaint = true; // may this canvas paint the background on screen? (syncTheme)
  function loadBackgroundImage(url) {
    bgImageUrl = url;
    bgImageTex?.dispose();
    bgImageTex = null;
    bgMat.uniforms.uImage.value = null;
    if (!url) return;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (tex) => {
        if (bgImageUrl !== url) return tex.dispose(); // replaced while loading
        tex = fitToScreen(tex);
        tex.minFilter = THREE.LinearFilter; // no mipmaps: any picture size works
        tex.generateMipmaps = false;
        bgImageTex = tex;
        bgMat.uniforms.uImage.value = tex;
        bgMat.uniforms.uImageSize.value.set(tex.image.width || 1, tex.image.height || 1);
        requestRender(); // next frame's syncTheme() swaps the shader in
      },
      undefined,
      () => {
        if (bgImageUrl === url) console.warn('glass: background image could not be loaded for WebGL (CORS?) — using the page colour', url);
      }
    );
  }

  // Copy one buffer into the other.
  const blitMat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null } },
    vertexShader: fullscreenVertexShader,
    fragmentShader: 'uniform sampler2D tMap; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tMap, vUv); }',
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  const blitScene = new THREE.Scene();
  blitScene.add(new THREE.Mesh(quad, blitMat));

  // Smooth frost (global.blur "smooth" — see smoothMips below): one level of
  // a dual-Kawase downsample. The output pixel sits on the corner of 4 source
  // texels; 4 bilinear taps one source texel out diagonally + the centre
  // (×4) cover a 4×4 footprint with a tent-like weight, where the GPU's own
  // mipmaps average just the 2×2 under it (a box: blocky, and it shimmers as
  // the page moves under the glass).
  const downMat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, uLod: { value: 0 }, uTexel: { value: new THREE.Vector2() }, uLinear: { value: 0 } },
    vertexShader: fullscreenVertexShader,
    fragmentShader: `
      uniform sampler2D tMap; uniform float uLod; uniform vec2 uTexel; uniform float uLinear; varying vec2 vUv;
      ${GLSL_LINEAR}
      // (global.blend "linear": averaged in linear light — bright spots
      // keep glowing through the frost instead of turning grey)
      vec4 tap(vec2 uv) { vec4 c = textureLod(tMap, uv, uLod); return vec4(glassLin(c.rgb, uLinear), c.a); }
      void main() {
        vec4 c = tap(vUv) * 4.0;
        c += tap(vUv + vec2(-uTexel.x, -uTexel.y));
        c += tap(vUv + vec2( uTexel.x, -uTexel.y));
        c += tap(vUv + vec2(-uTexel.x,  uTexel.y));
        c += tap(vUv + vec2( uTexel.x,  uTexel.y));
        c /= 8.0;
        gl_FragColor = vec4(glassEnc(c.rgb, uLinear), c.a);
      }`,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  const downScene = new THREE.Scene();
  downScene.add(new THREE.Mesh(quad, downMat));
  // Scratch target each smooth level is drawn into before it's copied into
  // the buffer's mip level (half the buffer size: big enough for level 1).
  const downRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

  // Page snapshot (HTML content) as a textured rectangle in CSS pixels.
  // A new texture per picture: three.js allocates a texture's storage once,
  // so re-using it for a picture of a different size would fail to upload.
  let snapTex = null;
  const snapMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
  );
  snapMesh.frustumCulled = false;
  const snapScene = new THREE.Scene();
  snapScene.add(snapMesh);
  let snapVersion = -1;

  // Dialog dimmer (the modal layer sits over the page's dark overlay).
  const underMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Vector4(0, 0, 0, 0) } },
    vertexShader: fullscreenVertexShader,
    fragmentShader: 'uniform vec4 uColor; void main(){ gl_FragColor = uColor; }',
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const underScene = new THREE.Scene();
  underScene.add(new THREE.Mesh(quad, underMat));

  return {
    bufA,
    bufB,
    below,
    quadCam,
    /** What the background pass draws (for the "everything below" fingerprint). */
    bgSig() {
      const u = bgMat.uniforms;
      return `${bgShaderKey}|${u.uSize.value.x},${u.uSize.value.y}|${u.uCanvas.value.x},${u.uCanvas.value.y}|${u.uTop.value}|${bgImageTex ? bgImageTex.id : 0}`;
    },
    /** The dialog dimmer's colour (fingerprint). */
    underlayKey(layer) {
      const host = getHosts().get(layer);
      return host?.parentElement ? getComputedStyle(host.parentElement).backgroundColor : '';
    },
    bgMat,
    bgScene,
    snapScene,
    underScene,
    /**
     * Swap the background shader if the theme / background / picture changed.
     * @param {boolean} [paintOnScreen] false: never paint the background on
     *   screen (in-page and pinned canvases — see GlassWorld).
     */
    syncTheme(paintOnScreen = true) {
      screenPaint = paintOnScreen;
      const g = getGlobal();
      bg = backgroundFor(g.background, getGlassTheme());
      // The picture only stands in for "auto" (an exact CSS copy is painted
      // on screen, so it must stay that copy).
      const imageUrl = bg.paint ? null : g.backgroundImage;
      if (imageUrl !== bgImageUrl) loadBackgroundImage(imageUrl);
      const useImage = Boolean(imageUrl && bgImageTex);
      // Loaded → an exact background: base glass stays WebGL and refracts it
      // (live.js is told). The window-fixed base canvas also paints it on
      // screen; an in-page one doesn't (it scrolls with the page between
      // redraws — the site's own CSS picture shows through instead), but
      // its buffer draws the picture in window coordinates, so the glass
      // refracts exactly what is behind it.
      imageInBuffer = paintsImage && useImage;
      bgImageExact = imageInBuffer && paintOnScreen;
      if (paintsImage) setImageBackdrop(imageInBuffer ? imageUrl : null);
      const key = useImage ? `image|${imageUrl}` : bg.key;
      if (key === bgShaderKey) return;
      bgShaderKey = key;
      bgMat.fragmentShader = useImage ? pageImageShader : pageBackgroundShader(bg.spec);
      bgMat.needsUpdate = true; // recompile once (a few ms, only on a change)
    },
    /** Draw the background on screen too? (exact CSS copies, or the loaded picture) */
    paintBackground: () => screenPaint && (bg.paint || bgImageExact),
    /** "auto" background with a gradient / image the shader can't redraw? */
    // Not while the base canvas paints global.backgroundImage — checked
    // through the shared flag (isImageBackdrop), not this kit's own
    // bgImageExact: only the base kit sets that. A floating canvas's kit
    // (paintsImage false) otherwise thought the picture wasn't painted,
    // treated base glass as blocked and stripped data-glass-drawn from the
    // tiles every frame; the base canvas put it back the next frame, and
    // each flip woke GlassProvider's MutationObserver → an endless redraw
    // loop. (Its buffer refracts the same picture once its own copy loads.)
    backgroundIsImage: () => bg.image && !imageInBuffer && !isImageBackdrop(getGlobal().backgroundImage),
    blit(gl, from, to) {
      blitMat.uniforms.tMap.value = from.texture;
      gl.setRenderTarget(to);
      gl.render(blitScene, quadCam);
    },
    /**
     * Smooth frost: rebuild a buffer's mip levels 1…N (N = the deepest level
     * the glass about to read it uses, +1 for the blend between two levels)
     * with the dual-Kawase downsample above, each from the level before —
     * instead of the GPU's box-filtered mipmaps. The glass still reads ONE
     * level (blurLod) per sample, so it costs only these few small passes
     * (all of them together ≈ a third of one full-size pass).
     */
    smoothMips(gl, rt, maxLod) {
      if (!(maxLod > 0)) return;
      const w = rt.width;
      const h = rt.height;
      const levels = Math.floor(Math.log2(Math.max(w, h)));
      const n = Math.min(levels, Math.ceil(maxLod) + 1, 8);
      if (n < 1) return;
      const hw = Math.max(1, Math.ceil(w / 2));
      const hh = Math.max(1, Math.ceil(h / 2));
      if (downRT.width < hw || downRT.height < hh) downRT.setSize(hw, hh);
      downMat.uniforms.tMap.value = rt.texture;
      downMat.uniforms.uLinear.value = blendLinear() ? 1 : 0;
      for (let lv = 1; lv <= n; lv++) {
        const lw = Math.max(1, Math.floor(w / 2 ** lv));
        const lh = Math.max(1, Math.floor(h / 2 ** lv));
        const sw = Math.max(1, Math.floor(w / 2 ** (lv - 1)));
        const sh = Math.max(1, Math.floor(h / 2 ** (lv - 1)));
        downMat.uniforms.uLod.value = lv - 1;
        downMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
        downRT.viewport.set(0, 0, lw, lh);
        gl.setRenderTarget(downRT);
        gl.render(downScene, quadCam);
        // (copies the bound framebuffer — downRT — into the buffer's level lv)
        gl.copyFramebufferToTexture(rt.texture, null, lv);
      }
      downRT.viewport.set(0, 0, downRT.width, downRT.height);
    },
    /** Place the latest page picture, slid by the scroll since it was taken. */
    updateSnapshot() {
      if (!snapshot.canvas) return false;
      if (snapVersion !== snapshot.version && snapTex && snapTex.image?.width === snapshot.canvas.width && snapTex.image?.height === snapshot.canvas.height) {
        // Same size as the last picture: re-use the texture (three.js only
        // re-uploads the pixels into the storage it already has) instead of
        // freeing it and allocating a new one — on phones a full-page picture
        // is up to 8192 px tall, and the free + allocate + upload stalled.
        snapTex.image = snapshot.canvas;
        snapTex.needsUpdate = true;
        snapVersion = snapshot.version;
      } else if (snapVersion !== snapshot.version) {
        snapTex?.dispose();
        snapTex = new THREE.CanvasTexture(snapshot.canvas);
        snapTex.minFilter = THREE.LinearFilter;
        snapTex.generateMipmaps = false;
        snapMesh.material.map = snapTex;
        snapMesh.material.needsUpdate = true;
        snapVersion = snapshot.version;
      }
      const dx = window.scrollX - snapshot.scrollX;
      const dy = window.scrollY - snapshot.scrollY;
      snapMesh.scale.set(snapshot.w, snapshot.h, 1);
      snapMesh.position.set(snapshot.x - dx + snapshot.w / 2, -(snapshot.y - dy + snapshot.h / 2), 0);
      return true;
    },
    /** Colour of the dialog backdrop that holds the modal layer's canvas. */
    updateUnderlay(layer) {
      const host = getHosts().get(layer);
      const bg = host?.parentElement ? getComputedStyle(host.parentElement).backgroundColor : '';
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      if (!(a > 0)) return false;
      underMat.uniforms.uColor.value.set(r / 255, g / 255, b / 255, a);
      return true;
    },
    dispose() {
      bufA.dispose();
      bufB.dispose();
      downRT.dispose();
      downMat.dispose();
      below.rt.dispose();
      quad.dispose();
      bgMat.dispose();
      bgImageUrl = null; // a load still in flight disposes its own texture
      bgImageTex?.dispose();
      if (paintsImage) setImageBackdrop(null); // base glass goes live again
      blitMat.dispose();
      snapTex?.dispose();
      snapMesh.geometry.dispose();
      snapMesh.material.dispose();
      underMat.dispose();
    },
  };
}

// --- Page-anchored canvases (global.anchor "page") ----------------------------------------------
/** Is this layer's canvas in the page (rather than fixed to the window)? */
/**
 * A background picture only ever fills the window (cover), so anything
 * beyond the screen's own pixels is wasted GPU memory and upload time — a
 * 6000 × 4000 phone photo is ~96 MB as a texture. Shrink it (once, on load)
 * so its shorter side covers the screen's longer side in device pixels
 * (either orientation, any window size), and to at most MAX_BG_SIDE.
 */
const MAX_BG_SIDE = 8192;
function fitToScreen(tex) {
  const img = tex.image;
  const iw = img?.width || 0;
  const ih = img?.height || 0;
  if (!iw || !ih) return tex;
  const need = Math.max(window.screen?.width || 0, window.screen?.height || 0, window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1);
  const k = Math.min(1, need / Math.min(iw, ih), MAX_BG_SIDE / Math.max(iw, ih));
  if (k > 0.95) return tex; // close enough: keep the original
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(iw * k));
  c.height = Math.max(1, Math.round(ih * k));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  tex.dispose();
  return new THREE.CanvasTexture(c);
}


/**
 * Put a page-anchored canvas round the visible part of the page and aim the
 * camera at where it really landed (measured, so a positioned <body> or any
 * other containing block can't throw it off).
 *   • It covers the window plus PAGE_MARGIN of its height above and below.
 *   • It never reaches past the end of the content: it would make the page
 *     longer (and scrollable into nothing).
 * @returns world y of the canvas top (for shaders that map world → buffer)
 */
function placePageCanvas(canvas, host, camera) {
  if (!host) return 0;
  const vh = window.innerHeight;
  const margin = Math.round(vh * PAGE_MARGIN);
  // End of the content: the glass root's box (an absolutely positioned
  // canvas doesn't count towards it, so this can't feed back on itself).
  const root = glassRoot();
  const contentEnd = root ? root.getBoundingClientRect().bottom + window.scrollY : vh;
  const docH = Math.max(vh, Math.ceil(contentEnd));
  const hostH = Math.min(vh + margin * 2, docH);
  if (host.__glassH !== hostH) {
    host.style.height = `${hostH}px`;
    host.__glassH = hostH;
  }
  const want = Math.max(0, Math.min(window.scrollY - margin, docH - hostH)); // page y of the canvas top
  host.style.top = `${Math.round(want - (host.__glassCb || 0))}px`;
  // Where it really is (the containing block may not start at the page top).
  const hr = host.getBoundingClientRect();
  host.__glassCb = hr.top + window.scrollY - parseFloat(host.style.top) || 0;
  const cr = canvas.getBoundingClientRect();
  if (camera.top !== -cr.top || camera.bottom !== -cr.top - cr.height || camera.right !== cr.width) {
    camera.left = 0;
    camera.right = cr.width;
    camera.top = -cr.top;
    camera.bottom = -cr.top - cr.height;
    camera.updateProjectionMatrix();
  }
  return -cr.top;
}

/** Is the element (or an ancestor) position: fixed / sticky? */
function isPinned(el) {
  // glassMorph's film shapes (motion.js) are position:fixed but NOT pinned:
  // they live for one film, are re-placed from fresh window rects every frame,
  // and ARE the morph — treated as pinned, a page-anchored canvas skipped them
  // and every glassMorph popped open with no film (anchor "page", 1.3.1).
  if (el.hasAttribute('data-glass-morph-shape')) return false;
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const pos = getComputedStyle(n).position;
    if (pos === 'fixed' || pos === 'sticky') return true;
  }
  return false;
}

// --- DOM helpers ------------------------------------------------------------------------------
/** Ancestors that clip their content (scroll boxes, overflow:hidden). */
function clipAncestors(el) {
  const out = [];
  for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || n.hasAttribute('data-glass-clip')) out.push(n);
  }
  return out;
}

/** "12px" / "50%" → px. */
function cssLength(v, basis) {
  const n = parseFloat(v) || 0;
  return String(v).trim().endsWith('%') ? (n / 100) * basis : n;
}

const rgbCache = new Map();
let colorProbe = null; // 1×1 canvas that turns any CSS colour into sRGB bytes
/**
 * Any CSS colour → [r, g, b] 0–1 (sRGB values, used as-is; alpha ignored).
 * "#rgb" / "#rrggbb" / "rgb()" are parsed directly; everything else (named
 * colours, hsl(), oklch(), #rrggbbaa…) is painted onto a 1×1 canvas and read
 * back. Unusable → white. Cached (max 512 colours); don't mutate the result.
 */
function rgb(color) {
  let v = rgbCache.get(color);
  if (!v) {
    const c = String(color).trim();
    const m = c.match(/^rgba?\(([^)]+)\)$/);
    if (m) v = m[1].split(/[ ,/]+/).filter(Boolean).slice(0, 3).map((n) => (n.endsWith('%') ? parseFloat(n) / 100 : Number(n) / 255));
    else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) {
      const h = c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c;
      v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    } else v = probeColor(c);
    if (!v || v.length !== 3 || v.some((n) => !Number.isFinite(n))) v = [1, 1, 1];
    if (rgbCache.size > 512) rgbCache.clear();
    rgbCache.set(color, v);
  }
  return v;
}
function probeColor(c) {
  colorProbe ||= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!colorProbe) return null;
  colorProbe.clearRect(0, 0, 1, 1);
  colorProbe.fillStyle = '#ffffff'; // stays white if the colour is invalid
  colorProbe.fillStyle = c;
  colorProbe.fillRect(0, 0, 1, 1);
  const d = colorProbe.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

/**
 * A config colour for an element: a CSS colour, or "var(--name)" /
 * "var(--name, fallback)" read from the element.
 */
const VAR_RE = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.*))?\)$/;
function colorOf(value, el) {
  const m = VAR_RE.exec(value);
  if (!m) return rgb(value);
  const css = getComputedStyle(el).getPropertyValue(m[1]).trim() || (m[2] || '').trim();
  return css ? (VAR_RE.test(css) ? colorOf(css, el) : rgb(css)) : [1, 1, 1];
}
