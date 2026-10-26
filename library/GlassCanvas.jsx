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
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MeshTransmissionMaterial } from '@react-three/drei';
import { easing } from 'maath';
import { getGlassTheme, getGlobal, glassRoot, resolveGlass, subscribeConfig } from './config';
import {
  addRenderer,
  allEntries,
  getHosts,
  isCoveredHost,
  isHolding,
  layerIndex,
  placement,
  requestRender,
  stats,
  subscribeHosts,
  subscribeProps,
  subscribeStructure,
} from './registry';
import { snapshot, startSnapshots } from './snapshot';
import { createTextSampler } from './autoText';
import { bufferScaleFactor, dprCap, getQualityIndex, noteFrame, samplesCap, subscribeGlassQuality } from './quality';
import { acquireGeometry, outline } from './shapes';

const MAX_LIQUID = 16; // shapes per morph group
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1); // shared by every shadow layer
import { backgroundFor, fullscreenVertexShader, isImageBackdrop, pageBackgroundShader, pageImageShader, setImageBackdrop } from './pageBackground';

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
 */
export default function GlassCanvas({ layer, layers, onLost, onReady }) {
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
      <GlassWorld layer={layer} layers={layers} onReady={onReady} />
    </Canvas>
  );
}

// =============================================================================
// GlassWorld — the render loop for one layer
// =============================================================================
function GlassWorld({ layer, layers, onReady }) {
  const { gl, size, scene, invalidate, viewport } = useThree();
  const myIndex = layerIndex(layer);
  const controllers = useRef(new Map()); // entry id → controller (from GlassMesh)
  const readySent = useRef(false);

  // Redraw on request from anywhere (scroll, hover, config change…).
  useEffect(() => addRenderer(() => invalidate()), [invalidate]);
  // The floating layers read the page snapshot; start watching the page.
  useEffect(() => (myIndex > 0 ? startSnapshots() : undefined), [myIndex]);

  // Which elements this canvas needs: its own layer's and every layer below
  // (those are drawn into the buffers only, so this layer can refract them).
  const [, rerender] = useReducer((n) => n + 1, 0);
  useEffect(() => subscribeStructure(rerender), []);
  useEffect(() => subscribeHosts(rerender), []);
  const hosts = getHosts();
  const entries = allEntries().filter((e) => {
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
  const fullBase = layer === 'base' && !layers;
  const kit = useMemo(() => makeKit(fullBase), [fullBase]);
  useEffect(() => () => kit.dispose(), [kit]);
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
  const bufScale = getGlobal().bufferScale * bufferScaleFactor();
  const bw = Math.max(1, Math.round(size.width * viewport.dpr * bufScale));
  const bh = Math.max(1, Math.round(size.height * viewport.dpr * bufScale));
  useLayoutEffect(() => {
    kit.bufA.setSize(bw, bh);
    kit.bufB.setSize(bw, bh);
    kit.bgMat.uniforms.uSize.value.set(size.width, size.height);
    requestRender();
  }, [kit, bw, bh, size]);

  // --- The frame -------------------------------------------------------------------------
  useFrame(() => {
    const t0 = performance.now();
    noteFrame(t0); // automatic quality: how fast frames come while animating
    // global.anchor "page": move the canvas round the visible part of the page
    // and aim the camera at where it really is. Between redraws the browser
    // scrolls the canvas WITH the page, so the glass never trails the content
    // (a window-fixed canvas is always redrawn a frame or more late on phones).
    let viewTop = 0; // world y of the canvas's top edge (0 = top of the window)
    if (pageAnchored(layer)) viewTop = placePageCanvas(gl.domElement, getHosts().get(layer), camera);
    let animating = false;
    const visible = [];
    // Background "auto" over a gradient / image page background: WebGL base
    // glass would refract a flat colour (an opaque-looking panel hiding the
    // background), so it isn't drawn and those elements keep their own CSS
    // look. (In Chromium base glass is live there anyway — see live.js.)
    // Not once global.backgroundImage is painted here: then WebGL base glass
    // refracts the real picture (kit.backgroundIsImage() turns false).
    kit.syncTheme();
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
          l.mat.uniforms.uBuffer.value = tex;
          const blur = members[0].p.blur;
          l.mat.uniforms.uLod.value = blur > 0 ? Math.max(0, Math.log2(blur * lodScale)) : 0;
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

    gl.autoClear = false;
    // (kit.syncTheme() ran at the top of the frame: light / dark mode or the
    // page's own background colour changed → background shader rebuilt.)
    // Background → buffer A (and to the screen on the base layer, when it is
    // an exact copy of the page's CSS background, or the background picture
    // once loaded — "auto" otherwise leaves the site's real background
    // visible; see pageBackground.js).
    gl.setRenderTarget(kit.bufA);
    gl.clear();
    gl.render(kit.bgScene, kit.quadCam);
    gl.setRenderTarget(null);
    gl.clear();
    if (myIndex === 0 && kit.paintBackground()) gl.render(kit.bgScene, kit.quadCam);

    let src = kit.bufA;
    let dst = kit.bufB;
    const sampleText = textSampler.begin(); // (throttled; only with auto-text glass)
    const lodScale = viewport.dpr * bufScale;
    let pictureReady = false; // floating layers: is the page picture in this frame?
    const shown = []; // controllers drawn to THIS canvas's screen this frame
    passes.forEach((pass, i) => {
      const last = i === passes.length - 1;
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
      for (const c of pass.ctls) c.setBuffer(src.texture, lodScale);
      // Auto text: queue a read of exactly what this stratum refracts (only
      // for glass this canvas draws — lower layers are sampled by theirs).
      if (sampleText && pass.layer === layer) {
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
      if (pass.layer === layer) {
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
    if (animating || isHolding()) invalidate();
  }, 2);

  return entries.map((e) => <GlassMesh key={e.id} entry={e} controllers={controllers} sharedTexture={kit.bufA.texture} />);
}

// =============================================================================
// GlassMesh — one element's glass slab + tint layer
// =============================================================================
function GlassMesh({ entry, controllers, sharedTexture }) {
  const group = useRef();
  const slab = useRef();
  const tint = useRef();
  const mat = useRef();
  const { invalidate } = useThree();

  // Props: re-resolve when config / element props / hover state change.
  const [, rerender] = useReducer((n) => n + 1, 0);
  useEffect(() => subscribeProps(rerender), []);
  const resolved = resolveGlass(entry.group, entry.props, entry.state);
  // Automatic quality caps the refraction samples (a new shader per level).
  useSyncExternalStore(subscribeGlassQuality, getQualityIndex, getQualityIndex);
  const samples = samplesCap(resolved.samples);
  const p = samples === resolved.samples ? resolved : { ...resolved, samples };
  // Tint colours as [r,g b] (CSS variables are read from the element).
  const tintFrom = colorOf(p.tint.from, entry.el);
  const tintVia = colorOf(p.tint.via || p.tint.from, entry.el);
  const tintTo = colorOf(p.tint.to, entry.el);
  const place = placement(entry.id);
  const channel = channelOf(place.layer, place.tier);

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
  c.p = p;
  c.layer = place.layer;
  c.channel = channel;
  c.entry = entry;

  useEffect(() => {
    controllers.current.set(entry.id, c);
    return () => {
      controllers.current.delete(entry.id);
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

  // --- Per-frame: follow the element --------------------------------------------------
  useFrame((_state, frameDelta) => {
    // On-demand frames can be seconds apart; cap the step so easing animates.
    const delta = Math.min(frameDelta, 1 / 30);
    const el = entry.el;
    const g = group.current;
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
    // A page-anchored canvas scrolls with the page, a fixed / sticky element
    // doesn't: its glass would slide off it while scrolling, so it keeps its
    // own CSS look instead (no data-glass-drawn).
    if (c.pinned && pageAnchored(place.layer)) {
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
    if (key !== c.shapeKey) {
      const nextSlab = acquireGeometry('slab', { ...o, bevel, depth: 1, segments: p.bevelSegments, profile: p.profile });
      const nextFlat = acquireGeometry('flat', o);
      c.slabGeo?.release();
      c.flatGeo?.release();
      c.slabGeo = nextSlab;
      c.flatGeo = nextFlat;
      c.shapeKey = key;
      slab.current.geometry = nextSlab.geo;
      tint.current.geometry = nextFlat.geo;
      tintMat.uniforms.uSize.value.set(o.w, o.h);
      tintMat.uniforms.uRadius.value = o.r;
    }

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
    planes[0].set(new THREE.Vector3(1, 0, 0), -L); //  x ≥ L
    planes[1].set(new THREE.Vector3(-1, 0, 0), R); //  x ≤ R
    planes[2].set(new THREE.Vector3(0, -1, 0), -T); // css y ≥ T
    planes[3].set(new THREE.Vector3(0, 1, 0), B); //  css y ≤ B

    // Morph members are drawn by their group's liquid mesh (GlassWorld).
    const pointer = entry.state.pointer || { x: 0.5, y: 0.5 };
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
        px: r.left + pointer.x * r.width,
        py: -(r.top + pointer.y * r.height),
      };
      c.visible = true;
      g.visible = false;
      return;
    }
    c.morphKey = null;

    // Material: saturation / brightness of the refracted page.
    const mu = mat.current?.uniforms;
    if (mu?.glassSat) {
      mu.glassSat.value = p.saturation;
      mu.glassBright.value = p.brightness;
      mu.glassMinify.value = 1 / (1 - p.minify);
      mu.glassCenter.value.set(g.position.x, g.position.y, 0);
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
    u.uRimWidth.value = p.rimWidth;
    u.uInner.value = p.innerGlow;
    u.uLight.value.copy(lightDir(p.lightAngle));
    u.uGlow.value = a.glow;
    u.uPointer.value.set(pointer.x, 1 - pointer.y);
    u.uBorderW.value = p.borderWidth;
    u.uBorderOp.value = p.borderOpacity;
    u.uBorderCol.value.set(...colorOf(p.borderColor || '#ffffff', el));

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
      su.uColor.value.set(...colorOf(p.shadowColor || '#1e1b4b', el));
      sm.visible = true;
    } else sm.visible = false;

    // Layer (channel) for the stratum pass, and draw order (shadow → slab → tint).
    slab.current.layers.set(channel);
    tint.current.layers.set(channel);
    sm.layers.set(channel);
    sm.renderOrder = entry.id * 3;
    slab.current.renderOrder = entry.id * 3 + 1;
    tint.current.renderOrder = entry.id * 3 + 2;
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
          thickness={p.thickness}
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
  const original = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    original(shader, renderer); // drei's own changes (adds our uniforms too)
    const before = shader.fragmentShader;
    shader.fragmentShader = before
      .replace(
        'uniform sampler2D buffer;',
        'uniform sampler2D buffer;\nuniform float blurLod;\nuniform float glassSat;\nuniform float glassBright;\nuniform vec3 glassCenter;\nuniform float glassMinify;'
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
            uv_ = c_ + (uv_ - c_) * glassMinify;
          }
          vec4 s_ = textureLod(buffer, uv_, blurLod);
          s_.rgb = mix(vec3(dot(s_.rgb, vec3(0.2126, 0.7152, 0.0722))), s_.rgb, glassSat) * glassBright;
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
      uniform float uRadius, uRim, uRimWidth, uInner, uGlow, uBorderW, uBorderOp;
      uniform vec2 uLight, uPointer;
      uniform vec3 uBorderCol;
      varying vec2 vUv;
      ${GLSL_SHAPES}
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
        float w = whiteLight(d, n, uLight, uRim, uRimWidth, uInner, min(uSize.x, uSize.y));
        float gr = max(min(uSize.x, uSize.y), 0.35 * max(uSize.x, uSize.y));
        vec2 gp = (vUv - uPointer) * uSize;
        w = clamp(w + uGlow * exp(-dot(gp, gp) / (gr * gr)), 0.0, 1.0);
        float outA = 1.0 - (1.0 - a) * (1.0 - w);
        col = (vec3(1.0) * w + col * a * (1.0 - w)) / max(outA, 1e-4);
        a = outA;

        // Border: a hairline just inside the edge, following the glass shape.
        if (uBorderW > 0.0 && uBorderOp > 0.0) {
          float band = 1.0 - smoothstep(uBorderW - 0.5, uBorderW + 0.5, -d);
          float ba = uBorderOp * band;
          float bA = 1.0 - (1.0 - a) * (1.0 - ba);
          col = (uBorderCol * ba + col * a * (1.0 - ba)) / max(bA, 1e-4);
          a = bA;
        }

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
      void main() {
        #include <clipping_planes_fragment>
        vec2 p = (vUv - 0.5) * uSize;
        float ds = sdRoundRect(p - uOffset, uHalf + uSpread, max(uRadius + uSpread, 0.0));
        float a = uOpacity * (1.0 - smoothstep(-uBlur * 0.5, uBlur * 0.5 + 0.75, ds));
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

// --- Shared GLSL: rounded-rectangle distance field + white light ---------------------------
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
 * the tint (blended between the shapes), rim light and press glow.
 * Same look as the drei slabs, but able to merge.
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
      uCount: { value: 0 },
      uK: { value: 24 },
      uBevel: { value: 12 },
      uBend: { value: 10 },
      uCA: { value: 0.05 },
      uLod: { value: 0 },
      uSat: { value: 1.6 },
      uBright: { value: 1 },
      uRim: { value: 0.6 },
      uRimWidth: { value: 1.25 },
      uInner: { value: 0.15 },
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
      uniform int uCount;
      uniform float uK, uBevel, uBend, uCA, uLod, uSat, uBright, uRim, uRimWidth, uInner;
      uniform vec2 uLight, uView;
      uniform float uViewTop;
      uniform sampler2D uBuffer;
      varying vec2 vWorld;
      ${GLSL_SHAPES}
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
      vec3 sat(vec3 c) { return mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, uSat) * uBright; }
      void main() {
        vec2 p = vWorld;
        float d = field(p);
        if (d > 1.0) discard;
        float aa = clamp(0.5 - d, 0.0, 1.0);
        vec2 e = vec2(0.75, 0.0);
        vec2 g = vec2(field(p + e.xy) - field(p - e.xy), field(p + e.yx) - field(p - e.yx));
        vec2 n = g / max(length(g), 1e-5);

        // Refraction: look inwards across the rim, more at the very edge.
        float x = clamp(1.0 + d / max(uBevel, 0.5), 0.0, 1.0);
        vec2 off = -n * uBend * tilt(x) / uView;
        vec2 uv = vec2(p.x / uView.x, 1.0 + (p.y - uViewTop) / uView.y);
        vec3 col = vec3(
          textureLod(uBuffer, uv + off * (1.0 + 2.0 * uCA), uLod).r,
          textureLod(uBuffer, uv + off * (1.0 + uCA), uLod).g,
          textureLod(uBuffer, uv + off, uLod).b);
        col = sat(col);

        // Tint + press glow, blended between the shapes by closeness.
        vec3 tc = vec3(0.0); float top = 0.0; float wsum = 0.0; float glow = 0.0;
        for (int i = 0; i < MAXS; i++) {
          if (i >= uCount) break;
          float di = sdRoundRect(p - uShapes[i].xy, uShapes[i].zw, uShape2[i].x);
          float w = exp(-max(di, 0.0) * 3.0 / max(uK, 1.0));
          tc += uTintCol[i] * uShape2[i].y * w;
          top += uShape2[i].y * w;
          wsum += w;
          vec2 gp = p - uGlowAt[i];
          float gr = max(uShapes[i].z, uShapes[i].w) * 1.4;
          glow += uShape2[i].z * w * exp(-dot(gp, gp) / (gr * gr));
        }
        float op = top / max(wsum, 1e-4);
        tc /= max(top, 1e-4);
        col = mix(col, tc, op);

        float minSide = 2.0 * min(uShapes[0].z, uShapes[0].w);
        float wl = clamp(whiteLight(d, n, uLight, uRim, uRimWidth, uInner, minSide) + glow / max(wsum, 1e-4), 0.0, 1.0);
        col = mix(col, vec3(1.0), wl);
        gl_FragColor = vec4(col, aa);
      }
    `,
  });
}

/** Push a morph group's shapes + settings into its liquid mesh. */
function updateLiquid(l, members, size, viewTop = 0) {
  const u = l.mat.uniforms;
  const p = members[0].p; // the group's look comes from its first element
  const n = Math.min(members.length, MAX_LIQUID);
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
    x0 = Math.min(x0, s.cx - s.hw);
    x1 = Math.max(x1, s.cx + s.hw);
    y0 = Math.min(y0, s.cy - s.hh);
    y1 = Math.max(y1, s.cy + s.hh);
  }
  u.uCount.value = n;
  u.uK.value = p.morphRadius;
  u.uBevel.value = p.bevel;
  u.uBend.value = p.thickness * (p.ior - 1) * 1.5;
  u.uCA.value = p.chromaticAberration * 3;
  u.uSat.value = p.saturation;
  u.uBright.value = p.brightness;
  u.uRim.value = p.rimLight;
  u.uRimWidth.value = p.rimWidth;
  u.uInner.value = p.innerGlow;
  u.uLight.value.copy(lightDir(p.lightAngle));
  u.uView.value.set(size.width, size.height);
  u.uViewTop.value = viewTop;
  // Cover all shapes plus the reach of the melt.
  const pad = p.morphRadius + 4;
  l.mesh.scale.set(x1 - x0 + pad * 2, y1 - y0 + pad * 2, 1);
  l.mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 2);
  l.mesh.layers.set(members[0].channel);
  l.mesh.renderOrder = Math.min(...members.map((m) => m.id)) * 3 + 1;
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
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(1, 1);

  // Page background (shader copy of the CSS background, or the page's own
  // colour in "auto" mode), for the current light / dark theme — rebuilt by
  // syncTheme() when it changes.
  let bg = backgroundFor(getGlobal().background, getGlassTheme());
  const bgMat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: new THREE.Vector2(1, 1) },
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
  let bgImageExact = false; // painting the picture as an exact background (syncTheme)
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
    quadCam,
    bgMat,
    bgScene,
    snapScene,
    underScene,
    /** Swap the background shader if the theme / background / picture changed. */
    syncTheme() {
      const g = getGlobal();
      bg = backgroundFor(g.background, getGlassTheme());
      // The picture only stands in for "auto" (an exact CSS copy is painted
      // on screen, so it must stay that copy).
      const imageUrl = bg.paint ? null : g.backgroundImage;
      if (imageUrl !== bgImageUrl) loadBackgroundImage(imageUrl);
      const useImage = Boolean(imageUrl && bgImageTex);
      // Loaded → an exact background: painted on screen, base glass WebGL.
      // Not with anchor "page": that canvas is taller than the window and
      // scrolls with the page, so it can't stand in for a window-fixed picture.
      bgImageExact = paintsImage && useImage && g.anchor !== 'page';
      if (paintsImage) setImageBackdrop(bgImageExact ? imageUrl : null);
      const key = useImage ? `image|${imageUrl}` : bg.key;
      if (key === bgShaderKey) return;
      bgShaderKey = key;
      bgMat.fragmentShader = useImage ? pageImageShader : pageBackgroundShader(bg.spec);
      bgMat.needsUpdate = true; // recompile once (a few ms, only on a change)
    },
    /** Draw the background on screen too? (exact CSS copies, or the loaded picture) */
    paintBackground: () => bg.paint || bgImageExact,
    /** "auto" background with a gradient / image the shader can't redraw? */
    // Not while the base canvas paints global.backgroundImage — checked
    // through the shared flag (isImageBackdrop), not this kit's own
    // bgImageExact: only the base kit sets that. A floating canvas's kit
    // (paintsImage false) otherwise thought the picture wasn't painted,
    // treated base glass as blocked and stripped data-glass-drawn from the
    // tiles every frame; the base canvas put it back the next frame, and
    // each flip woke GlassProvider's MutationObserver → an endless redraw
    // loop. (Its buffer refracts the same picture once its own copy loads.)
    backgroundIsImage: () => bg.image && !bgImageExact && !isImageBackdrop(getGlobal().backgroundImage),
    blit(gl, from, to) {
      blitMat.uniforms.tMap.value = from.texture;
      gl.setRenderTarget(to);
      gl.render(blitScene, quadCam);
    },
    /** Place the latest page picture, slid by the scroll since it was taken. */
    updateSnapshot() {
      if (!snapshot.canvas) return false;
      if (snapVersion !== snapshot.version) {
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

function pageAnchored(layer) {
  return (layer === 'base' || layer === 'float') && getGlobal().anchor === 'page';
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
