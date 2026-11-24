/**
 * =============================================================================
 * Glassparency showcase page (https://ricosuavedev.github.io/glassparency/)
 * =============================================================================
 * Everything glass comes from the published npm package. The page is a nav,
 * the hero (with a lens you can drag), then "The controls" (src/home/): six
 * small tiles, each one live control from the Playground with a link to its
 * page — the Playground (#/playground) and the Config builder (#/builder)
 * replaced the old glass UI lab. (src/lab/ still holds the backdrops, icons,
 * squish presets and control CSS the docs pages share.)
 * The tiles' photo is global.backgroundImage (src/home/Overview.jsx): the base
 * canvas behind the page paints it, fixed to the window. Everything except
 * the tile windows has a solid background that covers that canvas.
 * The nav / hero glass sits over page CONTENT (not just the page colour), so
 * it is on the "float" layer and Safari / Firefox (WebGL + page pictures)
 * bend it too; its HTML has class "lift" (z-index above the float canvas).
 * =============================================================================
 */
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GLASS_VERSION, Glass, GlassProvider, requestGlassRender, reserveSnapshotArea, useGlass } from 'glassparency';
import { labConfig } from './lab/looks';
// The control sizes and styles the docs pages and the home tiles share.
import './lab/lab.css';
// "The controls" — the home page's short tour of the common controls.
import Overview from './home/Overview';
// The playground / docs pages and the config builder (#/playground…, #/builder): src/docs/.
import Docs from './docs/Docs';
import { useRoute } from './docs/route';

// Every device: the glass canvases are anchored to the page. Browsers scroll on
// their own thread (phones, and desktop trackpads / wheels too), so a
// window-fixed canvas draws its WebGL glass a frame behind the content — the
// hero lens and the drop / "Aa" tiles jumped up and down while scrolling.
// Anchor "page" scrolls the canvas WITH the content, so the glass stays glued.
// Phones and tablets (touch) also get WebGL glass at phone width (mobileQuery null).
// Testing: ?anchor=page also turns glass on at phone width on a desktop;
// ?anchor=viewport goes back to the old window-fixed canvas (to compare).
const FORCED = typeof window !== 'undefined' ? new URLSearchParams(location.search).get('anchor') : null;
const TOUCH = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || FORCED === 'page');

const LAB = labConfig();
// ?css=1 — the CSS glass that Safari / Firefox / phones show without WebGL,
// in every browser (it was the old lab's Renderer "CSS fallback" switch;
// kept as a URL option for checking the fallback).
const RENDERER = typeof window !== 'undefined' && new URLSearchParams(location.search).get('css') === '1' ? 'css' : 'webgl';
const PARAMS = typeof window !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
// ?blur=mip — the pre-1.5 frost (GPU box mipmaps), for side-by-side checks.
const BLUR = PARAMS.get('blur') === 'mip' ? { blur: 'mip' } : {};
// ?blend=linear — mix colours in linear light (opt-in look).
const BLEND = PARAMS.get('blend') === 'linear' ? { blend: 'linear' } : {};

/** The page's glass config (quality: the lab's Quality choice). */
function makeConfig(quality) {
  return {
    global: {
      root: '#root',
      background: 'auto',
      quality,
      snapshot: { scale: 2 }, // (crisp page pictures on Retina screens)
      anchor: 'page', // (all devices — see the note above makeConfig)
      ...(TOUCH && FORCED !== 'viewport' ? { mobileQuery: null } : {}),
      ...(FORCED === 'viewport' ? { mobileQuery: null, anchor: 'viewport' } : {}),
      // ?css=1 (RENDERER above): the CSS glass that
      // Safari / Firefox / phones show without WebGL, in every browser — the
      // whole window counts as the CSS-only "mobile" layout.
      ...(RENDERER === 'css' ? { mobileQuery: 'all', mobileLayers: [] } : {}),
      ...BLUR,
      ...BLEND,
    },
    groups: {
      ...LAB.groups,
      // Nav buttons: the library's "chip" capsule, squishing.
      chip: { layer: 'float', rimLight: 0.6, chromaticAberration: 0.06, pressGlow: 0.5, ...SQUISH_TEXT },
      nav: { layer: 'float', shape: 'capsule', tint: '#efede8', tintOpacity: 0.5, blur: 16, thickness: 26, bevel: 10, rimLight: 0.5 },
      install: { layer: 'float', shape: 'capsule', tint: '#ffffff', tintOpacity: 0.55, blur: 10, thickness: 24, bevel: 10, rimLight: 0.5 },
      // The hero lens. Big lenses bend far more than live (SVG) glass can reach: WebGL, like a real lens.
      lens: {
        layer: 'float', sampler: 'webgl', shape: 'circle', tint: '#ffffff', tintOpacity: 0.03, blur: 1,
        thickness: 36, bevel: 46, ior: 1.5, chromaticAberration: 0.07, rimLight: 0.85, innerGlow: 0.15,
        shadowOpacity: 0.16, shadowBlur: 40, shadowY: 18, pressScale: 1.03,
      },
    },
    themes: {
      dark: {
        groups: {
          ...LAB.themes.dark.groups,
          nav: { tint: '#0e0e10', tintOpacity: 0.5 },
          install: { tint: '#2a2a2e', tintOpacity: 0.55 },
        },
      },
    },
  };
}

/** Squish & stretch tuning for the page's buttons. */
const SQUISH_TEXT = { squish: 0.8, squishGrow: 1.1, squishPull: 10, squishBounce: 0.55, pressScale: 1 };

/** Main actions: the chip as dark tinted glass (light in dark mode: it reads the page's ink colour). */
const STRONG = { tint: 'var(--ink)', tintOpacity: 0.88, textColor: 'var(--paper)', hover: { tintOpacity: 0.96 } };

/** Any element with glass from a group (the hook version), plus per-element looks. */
function G({ as: Tag = 'button', group, glass, className, ...rest }) {
  const ref = useRef(null);
  useGlass(ref, group, glass);
  return <Tag ref={ref} className={className} {...rest} />;
}

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
    // The lens is WebGL glass refracting a PICTURE of the page, and pictures
    // only cover the area around the glass. While it is dragged, make them
    // cover the whole hero, so wherever it goes there is page to bend (it
    // showed an empty pale disc until the next picture came in).
    const h = heroRef.current?.getBoundingClientRect();
    if (h) reserveSnapshotArea('heroLens', { left: h.left, top: h.top, right: h.right, bottom: h.bottom });
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
    reserveSnapshotArea('heroLens', null);
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
  const [theme, setTheme] = useState('light');
  // (The old lab's Quality picker set this; the page now always uses "auto".)
  const [quality] = useState('auto');
  const [copied, setCopied] = useState(false);
  const heroRef = useRef(null);
  // A docs route (#/playground…, #/builder) shows the docs instead of the home page.
  const route = useRoute();
  const config = useMemo(() => makeConfig(quality), [quality]);
  const dark = theme === 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
          <a href="#controls">Controls</a>
          <a href="#/playground">Playground</a>
          <a href="#/builder">Config builder</a>
          <a href="#principles">How it works</a>
        </div>
        <span className="ver mono">v{GLASS_VERSION}</span>
        <G group="chip" className="pill" onClick={() => setTheme(dark ? 'light' : 'dark')}>{dark ? 'Light' : 'Dark'}</G>
        <G as="a" group="chip" glass={STRONG} className="pill dark" href="https://www.npmjs.com/package/glassparency" style={{ display: 'grid', placeItems: 'center' }}>
          <span className="long">Get it on&nbsp;</span>npm
        </G>
      </Glass>

      {route ? <Docs route={route} theme={theme} setTheme={setTheme} /> : <>
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

      <main>
        {/* The controls: six live tiles + links to the Playground (src/home/) */}
        <Overview G={G} strong={STRONG} />

        <div className="after">
        <div className="wrap">

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
        </div>
        </div>
      </main>
      </>}
    </GlassProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
