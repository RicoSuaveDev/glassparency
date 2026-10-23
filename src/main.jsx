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
import {
  GLASS_VERSION,
  Glass,
  GlassCheckbox,
  GlassProgress,
  GlassProvider,
  GlassRadio,
  GlassSidebar,
  GlassSlider,
  GlassSwitch,
  GlassTabBar,
  GlassTextField,
  requestGlassRender,
  useGlass,
} from 'glassparency';

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
      // Squish & stretch: pressed they swell, dragged they lean after the pointer, let go they wobble.
      chip: { layer: 'float', rimLight: 0.25 + light * 0.4, chromaticAberration: 0.03 + ca * 0.2, pressGlow: 0.5, ...SQUISH_TEXT },
      headerButton: { layer: 'float', rimLight: 0.25 + light * 0.4, chromaticAberration: 0.03 + ca * 0.2, pressGlow: 0.6, ...SQUISH_ROUND },
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
      // The new controls in the page's cobalt accent.
      checkboxOn: { tint: '#2b4bf2' },
      radioOn: { tint: '#2b4bf2' },
      progressFill: { tint: '#2b4bf2' },
      textFieldFocus: { borderColor: '#2b4bf2', shadowColor: '#2b4bf2' },
      // A demo button for the Styles tile (white glass capsule that squishes).
      demoButton: { layer: 'float', shape: 'capsule', tint: '#ffffff', tintOpacity: 0.35, blur: 12, thickness: 12, bevel: 12, ior: 1.3, rimLight: 0.5, pressGlow: 0.4, chromaticAberration: 0, ...SQUISH_TEXT },
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

/** Squish & stretch tuning for the page's buttons (text capsules swell less than round ones). */
const SQUISH_TEXT = { squish: 0.8, squishGrow: 1.1, squishPull: 10, squishBounce: 0.55, pressScale: 1 };
const SQUISH_ROUND = { squish: 0.8, squishGrow: 1.18, squishPull: 12, squishBounce: 0.55, pressScale: 1 };

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

// Tab bar / sidebar icons (strokes in currentColor, so the accent wipe colours them).
const Ico = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICONS = {
  home: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  radio: 'M12 12h.01M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8',
  library: 'M6 3h12M5 6h14M5 9h14v11H5z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  note: 'M9 18a2.5 2.5 0 1 1-2.5-2.5H9V5l9-2v12a2.5 2.5 0 1 1-2.5-2.5H18',
  mic: 'M15 4l5 5-8 8-5-5zM7 12l-4 8 8-4',
};

/** Checkboxes, radios, a search field and progress bars over flat artwork. */
function ControlsTile() {
  const [checks, setChecks] = useState({ desktop: true, stage: false });
  const [size, setSize] = useState('m');
  const [q, setQ] = useState('');
  const [prog, setProg] = useState(0.62);
  return (
    <section className="tile controls-tile span-7">
      <span className="label">Controls</span>
      <div className="ct-art" aria-hidden="true">
        <div className="ct-disc" />
        <div className="ct-word">Press
          <br />
          &amp; drag</div>
      </div>
      <div className="ct-body">
        <GlassTextField
          className="ct-field lift"
          icon={<Ico d={ICONS.search} />}
          clearable
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Artists, songs, lyrics"
          aria-label="Search"
        />
        <div className="ct-row">
          <GlassCheckbox className="lift" checked={checks.desktop} onChange={(v) => setChecks((c) => ({ ...c, desktop: v }))}>On Desktop</GlassCheckbox>
          <GlassCheckbox className="lift" checked={checks.stage} onChange={(v) => setChecks((c) => ({ ...c, stage: v }))}>In Stage Manager</GlassCheckbox>
        </div>
        <div className="ct-row" role="radiogroup" aria-label="Size">
          {[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([k, label]) => (
            <GlassRadio key={k} className="lift" name="size" checked={size === k} onChange={() => setSize(k)}>{label}</GlassRadio>
          ))}
        </div>
        <GlassProgress className="ct-prog lift" value={prog} bead aria-label="Progress" />
        <div className="ct-row">
          {[0, 0.33, 0.62, 1].map((v) => (
            <G key={v} group="chip" className="pill small lift" onClick={() => setProg(v)}>{Math.round(v * 100)}%</G>
          ))}
        </div>
        <GlassProgress className="ct-prog lift" value={null} aria-label="Loading" />
      </div>
    </section>
  );
}

/** An iOS 26-style tab bar floating over "album covers". */
function TabBarTile() {
  const [tab, setTab] = useState(3);
  return (
    <section className="tile tabs-tile span-5">
      <span className="label">Tab bar</span>
      <div className="covers" aria-hidden="true">
        {['#ff5b1f', '#2b4bf2', '#f4d000', '#111111', '#f7f5f0', '#ff5b1f', '#111111', '#2b4bf2', '#f4d000'].map((c, i) => (
          <div key={i} className={`cover c${i % 3}`} style={{ background: c }} />
        ))}
      </div>
      <p className="hint lift">Press and slide along it</p>
      <GlassTabBar className="tabbar lift" value={tab} onChange={setTab} role="tablist" aria-label="Sections">
        {[['home', 'Home'], ['grid', 'New'], ['radio', 'Radio'], ['library', 'Library'], ['search', 'Search']].map(([icon, label]) => (
          <button key={label} type="button" role="tab" data-gp-item className="tab">
            <Ico d={ICONS[icon]} />
            <span>{label}</span>
          </button>
        ))}
      </GlassTabBar>
    </section>
  );
}

/** A floating glass sidebar with the same sliding lens. */
function SidebarTile() {
  const [page, setPage] = useState(1);
  return (
    <section className="tile side-tile span-5">
      <span className="label">Sidebar</span>
      <div className="side-art" aria-hidden="true" />
      <GlassSidebar className="sidebar lift" value={page} onChange={setPage} aria-label="Library">
        {[['search', 'Search'], ['home', 'Home'], ['radio', 'Radio'], ['clock', 'Recently Added'], ['mic', 'Artists'], ['note', 'Songs']].map(([icon, label]) => (
          <button key={label} type="button" data-gp-item className="side-item">
            <Ico d={ICONS[icon]} />
            <span>{label}</span>
          </button>
        ))}
      </GlassSidebar>
    </section>
  );
}

/** One setting, three looks: the same controls in style default / crystal / frosted. */
function StylesTile() {
  const STYLES = ['default', 'crystal', 'frosted'];
  const [pick, setPick] = useState(1);
  const style = STYLES[pick];
  const [on, setOn] = useState(true);
  const [check, setCheck] = useState(true);
  const [vol, setVol] = useState(55);
  const glass = useMemo(() => ({ style }), [style]);
  return (
    <section className="tile styles-tile span-7">
      <span className="label">Styles</span>
      <div className="styles-art" aria-hidden="true">
        <div className="sa-word">{style}</div>
      </div>
      <div className="styles-body">
        <GlassTabBar className="style-pick lift" value={pick} onChange={setPick} aria-label="Style">
          {STYLES.map((s) => (
            <button key={s} type="button" data-gp-item className="style-opt">{s[0].toUpperCase() + s.slice(1)}</button>
          ))}
        </GlassTabBar>
        <code className="style-code lift mono">{`"style": "${style}"`}</code>
        <div className="ct-row">
          <G group="demoButton" glass={glass} className="pill lift">Glass button</G>
          <GlassCheckbox className="lift on-dark" checked={check} onChange={setCheck} glassProps={{ box: glass }}>Checkbox</GlassCheckbox>
          <GlassSwitch className="lift" checked={on} onChange={setOn} glassProps={{ track: glass }} aria-label="Switch" />
        </div>
        <GlassTextField className="ct-field lift" icon={<Ico d={ICONS.search} />} placeholder="Search" glassProps={{ field: glass }} aria-label="Search" />
        <GlassSlider className="style-slider lift" value={vol} onChange={setVol} glassProps={{ track: glass }} aria-label="Volume" />
      </div>
    </section>
  );
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

          {/* The controls: checkboxes, radios, text field, progress; tab bar; sidebar; styles */}
          <ControlsTile />
          <TabBarTile />
          <SidebarTile />
          <StylesTile />
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
