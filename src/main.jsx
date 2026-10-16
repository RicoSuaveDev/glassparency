/**
 * =============================================================================
 * Glassparency showcase page (https://ricosuavedev.github.io/glassparency/)
 * =============================================================================
 * Everything glass comes from the published npm package. The page defines its
 * own glass groups (config below), merged over the package's presets. Glass
 * that sits over page CONTENT (not just the page colour) uses the "float"
 * layer, so Safari / Firefox (WebGL + page pictures) bend it too; its HTML
 * has class "lift" (z-index above the float canvas).
 * The "Live settings" tile rewrites the config while you click: the glass
 * on the page changes with it.
 * =============================================================================
 */
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GLASS_VERSION, Glass, GlassProvider, GlassSlider, GlassSwitch, requestGlassRender, useGlass } from 'glassparency';

// Phones and tablets (touch): WebGL glass with the canvas anchored to the page.
// Mobile browsers scroll on their own thread, so a window-fixed canvas would
// draw its glass a frame behind the content; anchor "page" keeps it glued.
// Testing: ?anchor=page forces it on a desktop; ?anchor=viewport turns glass on
// at phone width with the old window-fixed canvas (to compare).
const FORCED = typeof window !== 'undefined' ? new URLSearchParams(location.search).get('anchor') : null;
const TOUCH = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || FORCED === 'page');

/** The page's glass config, built from the live settings. */
function makeConfig({ frost, fringe, rim, thickness }) {
  const light = rim ? 0.85 : 0;
  const ca = fringe ? 0.14 : 0;
  return {
    global: {
      root: '#root',
      background: 'auto',
      snapshot: { scale: 2 }, // (crisp page pictures on Retina screens)
      ...(TOUCH && FORCED !== 'viewport' ? { mobileQuery: null, anchor: 'page' } : {}),
      ...(FORCED === 'viewport' ? { mobileQuery: null, anchor: 'viewport' } : {}),
    },
    defaults: { saturation: 1.5, brightness: 1.03, innerGlow: 0.1, borderOpacity: 0.3, shadowOpacity: 0.1, shadowBlur: 24, shadowY: 10 },
    groups: {
      // Buttons: the library's own topbar presets ("chip" capsules,
      // "headerButton" circles: clear glass, as in DashboardPro's topbar),
      // with the live settings' rim light / colour fringe on top.
      // On the floating layer: these buttons sit on solid-colour tiles, and base
      // glass is drawn BEHIND the page (the tile would cover it in WebGL mode).
      chip: { layer: 'float', rimLight: 0.25 + light * 0.4, chromaticAberration: 0.03 + ca * 0.2, pressScale: 1.05, pressGlow: 0.5 },
      headerButton: { layer: 'float', rimLight: 0.25 + light * 0.4, chromaticAberration: 0.03 + ca * 0.2, pressScale: 1.08, pressGlow: 0.6 },
      nav: { layer: 'float', shape: 'capsule', tint: '#efede8', tintOpacity: 0.5, blur: 16, thickness: 26, bevel: 10, rimLight: light * 0.6 },
      install: { layer: 'float', shape: 'capsule', tint: '#ffffff', tintOpacity: 0.55, blur: 10, thickness: 24, bevel: 10, rimLight: light * 0.6 },
      // Big lenses bend far more than live (SVG) glass can reach: WebGL, like a real lens.
      lens: {
        layer: 'float', sampler: 'webgl', shape: 'circle', tint: '#ffffff', tintOpacity: 0.03, blur: frost ? 1 : 0,
        thickness, bevel: 46, ior: 1.5, chromaticAberration: ca * 0.5, rimLight: light, innerGlow: 0.15,
        shadowOpacity: 0.16, shadowBlur: 40, shadowY: 18, pressScale: 1.03,
      },
      player: {
        layer: 'float', radius: 30, tint: '#111111', tintOpacity: 0.2, blur: frost ? 18 : 2,
        thickness: 46, bevel: 18, chromaticAberration: ca * 0.6, rimLight: light * 0.8, borderOpacity: 0.2,
      },
      row: {
        layer: 'float', radius: 22, tint: '#ffffff', tintOpacity: 0.3, blur: frost ? 5 : 0,
        thickness: 34, bevel: 14, chromaticAberration: ca * 0.6, rimLight: light * 0.7,
      },
      // GlassSwitch / GlassSlider in this page's ink colour (on the orange tile).
      switch: { tint: '#111111', tintOpacity: 0.22 },
      switchOn: { tint: '#111111', tintOpacity: 0.9 },
      sliderTrack: { tint: '#111111', tintOpacity: 0.2 },
      sliderFill: { tint: '#111111', tintOpacity: 0.9 },
      drop: {
        layer: 'float', sampler: 'webgl', morph: 'drops', morphRadius: 48, shape: 'circle',
        tint: '#ffffff', tintOpacity: 0.06, blur: frost ? 1 : 0, thickness: 30, bevel: 30, ior: 1.45,
        chromaticAberration: ca * 0.2, rimLight: light,
      },
      slab: {
        layer: 'float', sampler: 'webgl', shape: 'capsule', tint: '#ffffff', tintOpacity: 0.05, blur: 0,
        thickness, bevel: 40, ior: 1.5, chromaticAberration: ca * 0.5, rimLight: light, shadowOpacity: 0.14,
      },
    },
    themes: {
      dark: {
        groups: {
          nav: { tint: '#0e0e10', tintOpacity: 0.5 },
          install: { tint: '#2a2a2e', tintOpacity: 0.55 },
        },
      },
    },
  };
}

/** Main actions: the chip as dark tinted glass (light in dark mode: it reads the page's ink colour). */
const STRONG = { tint: 'var(--ink)', tintOpacity: 0.88, textColor: 'var(--paper)', hover: { tintOpacity: 0.96 } };

/** Any element with glass from a group (the hook version), plus per-element looks. */
function G({ as: Tag = 'button', group, glass, className, ...rest }) {
  const ref = useRef(null);
  useGlass(ref, group, glass);
  return <Tag ref={ref} className={className} {...rest} />;
}

// --- Icons (plain strokes, drawn here) ----------------------------------------------
const Prev = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9.5 12z" /></svg>
);
const Next = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l10.5-7z" /></svg>
);
const Play = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15L19.5 12z" /></svg>
);
const Pause = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" /></svg>
);

/** The big lens over the headline: drag it around. */
function Lens({ heroRef }) {
  const [pos, setPos] = useState(null);
  const drag = useRef(null);
  // Start over the second line of the headline.
  useEffect(() => {
    const place = () => {
      const h = heroRef.current;
      if (!h) return;
      const w = h.clientWidth;
      // (phones: a smaller lens, over "bends")
      setPos((p) => p || (w < 600 ? { x: w * 0.42, y: 150 } : { x: Math.min(w - 260, w * 0.3), y: 200 }));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [heroRef]);
  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    // Keep at least a third of the lens inside the hero (a finger can't lose it).
    const h = heroRef.current;
    const size = e.currentTarget.offsetWidth;
    const maxX = (h?.clientWidth ?? 1000) - size / 3;
    const maxY = (h?.clientHeight ?? 800) - size / 3;
    setPos({
      x: Math.min(maxX, Math.max(-size * 2 / 3, d.x + e.clientX - d.sx)),
      y: Math.min(maxY, Math.max(-size * 2 / 3, d.y + e.clientY - d.sy)),
    });
    requestGlassRender();
  };
  const up = () => {
    drag.current = null;
  };
  if (!pos) return null;
  return (
    <>
      <Glass
        group="lens"
        className="lens lift"
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Glass lens: drag me"
      />
    </>
  );
}

function App() {
  const [dark, setDark] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [merged, setMerged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState({ frost: true, fringe: true, rim: true, thickness: 36 });
  const heroRef = useRef(null);
  const config = useMemo(() => makeConfig(settings), [settings]);
  const set = useCallback((k, v) => setSettings((s) => ({ ...s, [k]: v })), []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  const copy = () => {
    navigator.clipboard?.writeText('npm i glassparency').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <GlassProvider config={config}>
      <Glass as="nav" group="nav" className="nav">
        <a className="brand" href="#top">glassparency</a>
        <div className="links">
          <a href="https://www.npmjs.com/package/glassparency">Docs</a>
          <a href="#bento">Examples</a>
          <a href="#principles">How it works</a>
        </div>
        <span className="ver mono">v{GLASS_VERSION}</span>
        <G group="chip" className="pill" onClick={() => setDark(!dark)}>{dark ? 'Light' : 'Dark'}</G>
        <G as="a" group="chip" glass={STRONG} className="pill dark" href="https://www.npmjs.com/package/glassparency" style={{ display: 'grid', placeItems: 'center' }}>
          <span className="long">Get it on&nbsp;</span>npm
        </G>
      </Glass>

      <header className="hero" id="top" ref={heroRef}>
        <div className="wrap">
          <p className="kicker">Liquid glass for the web</p>
          <h1 className="display">
            Glass that
            <br />
            bends the page.
          </h1>
          <div className="hero-foot">
            <p className="lede">
              Real refraction, specular rims and liquid morphing, drawn behind your HTML.{' '}
              <b>Text, focus and clicks stay exactly where they are.</b>
            </p>
            <Glass group="install" className="install lift mono">
              npm i glassparency
              <G group="chip" glass={STRONG} className="pill dark" onClick={copy} style={{ fontFamily: 'inherit' }}>
                {copied ? 'Copied' : 'Copy'}
              </G>
            </Glass>
          </div>
        </div>
        <Lens heroRef={heroRef} />
      </header>

      <main className="wrap" id="bento">
        <div className="bento">
          {/* Floating controls over "album art" */}
          <section className="tile poster span-7 on-color">
            <div className="word">Blue
              <br />
              Hour</div>
            <div className="sun" />
            <div className="half" />
            <div className="bar" style={{ top: 250 }} />
            <div className="bar" style={{ top: 290, height: 12 }} />
            <Glass group="player" className="player lift">
              <div className="art" />
              <div className="track">
                <b>Blue Hour</b>
                <span>Ostra Kollektiv</span>
                <div className="scrub" />
                <div className="times mono">
                  <span>1:24</span>
                  <span>3:41</span>
                </div>
              </div>
              <div className="controls">
                <G group="headerButton" className="round" aria-label="Previous"><Prev /></G>
                <G group="headerButton" className="round big" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}>
                  {playing ? <Pause /> : <Play />}
                </G>
                <G group="headerButton" className="round" aria-label="Next"><Next /></G>
              </div>
            </Glass>
          </section>

          {/* Live settings: these rewrite the glass config */}
          <section className="tile settings span-5">
            <span className="label">Live settings</span>
            <div className="numeral">07</div>
            {[
              ['frost', 'Frost', 'Blur what the glass sees'],
              ['fringe', 'Colour fringe', 'Split light at the rim'],
              ['rim', 'Rim light', 'Specular edge, lit from the top left'],
            ].map(([k, title, sub]) => (
              <Glass key={k} group="row" className="row lift">
                <span>
                  <b>{title}</b>
                  <small>{sub}</small>
                </span>
                <GlassSwitch checked={settings[k]} onChange={(v) => set(k, v)} aria-label={title} />
              </Glass>
            ))}
            <Glass group="row" className="row lift">
              <span>
                <b>Thickness</b>
                <small>How far light bends</small>
              </span>
              <GlassSlider className="thick" min={8} max={80} value={settings.thickness} onChange={(v) => set('thickness', v)} aria-label="Thickness" />
            </Glass>
          </section>

          {/* Liquid morph */}
          <section className="tile stripes span-5" style={{ minHeight: 340 }}>
            <Glass group="drop" className="drop lift" style={{ left: merged ? 'calc(50% - 105px)' : '10%' }} />
            <Glass group="drop" className="drop lift" style={{ left: merged ? 'calc(50% - 15px)' : 'calc(90% - 120px)' }} />
            <div className="tile-cta">
              <G group="chip" glass={STRONG} className="pill dark lift" onClick={() => setMerged(!merged)}>{merged ? 'Split' : 'Merge'}</G>
            </div>
          </section>

          {/* Thickness over type */}
          <section className="tile type span-7" style={{ minHeight: 340 }}>
            <div className="aa">Aa</div>
            <Glass group="slab" className="slab lift" />
          </section>
        </div>

        <section className="principles" id="principles">
          <div>
            <span className="n mono">01</span>
            <h3>Refraction, not blur.</h3>
            <p>Light bends across a squircle rim, like real glass. Chromium refracts the live page every frame; other browsers use WebGL.</p>
          </div>
          <div>
            <span className="n mono">02</span>
            <h3>Your HTML stays HTML.</h3>
            <p>The glass is drawn behind your elements. Layout, text, focus and screen readers are untouched.</p>
          </div>
          <div>
            <span className="n mono">03</span>
            <h3>Falls back on its own.</h3>
            <p>No WebGL, reduced transparency or a slow GPU: your own CSS takes over, with no layout shift.</p>
          </div>
        </section>
        <footer>
          <span>MIT license</span>
          <span>React 19, or one script tag</span>
        </footer>
      </main>
    </GlassProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
