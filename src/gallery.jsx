/**
 * =============================================================================
 * "Every control" — the README's animated screenshots, live
 * =============================================================================
 * One tile per element, each over the same flat artwork and big word as its
 * animation in the README (library/npm/showcase/*.webp), plus the glass lab's
 * morph menus. Everything is interactive: press, drag, type, tap.
 *
 * The tiles use their own glass groups ("gx…", "toy…"): copies of the
 * library's built-in presets, made when this module loads (before the page's
 * config is applied), with the accent colours of the screenshots. So they
 * look exactly like the animations, and the page's own tweaks to the shared
 * groups (switch, sliderTrack… in the bento above) don't reach them.
 * Every group is on the float layer: the glass bends the tile artwork.
 * =============================================================================
 */
import { useEffect, useRef, useState } from 'react';
import {
  Glass,
  GlassCheckbox,
  GlassProgress,
  GlassRadio,
  GlassSidebar,
  GlassSlider,
  GlassSwitch,
  GlassTabBar,
  GlassTextField,
  createShapeSpring,
  rawGlassGroup,
  useGlassMorph,
} from 'glassparency';
import './gallery.css';

// --- Glass groups ---------------------------------------------------------------
const ACCENT = '#2b4bf2';
/** [gallery group, built-in preset it copies, changes on top] */
const GX = [
  ['gxButton', 'button'],
  ['gxButtonPrimary', 'buttonPrimary', { tint: '#111111', tintOpacity: 0.88, textColor: '#ffffff' }],
  ['gxCard', 'card'],
  ['gxPanel', 'panel'],
  ['gxMenu', 'menu'],
  ['gxSwitch', 'switch'],
  ['gxSwitchOn', 'switchOn', { tint: ACCENT, tintOpacity: 0.9 }],
  ['gxSwitchKnob', 'switchKnob'],
  ['gxSwitchKnobActive', 'switchKnobActive'],
  ['gxSliderTrack', 'sliderTrack'],
  ['gxSliderFill', 'sliderFill', { tint: ACCENT, tintOpacity: 0.9 }],
  ['gxSliderKnob', 'sliderKnob'],
  ['gxSliderKnobActive', 'sliderKnobActive'],
  ['gxCheckbox', 'checkbox'],
  ['gxCheckboxOn', 'checkboxOn', { tint: ACCENT }],
  ['gxRadio', 'radio'],
  ['gxRadioOn', 'radioOn', { tint: ACCENT }],
  ['gxRadioDot', 'radioDot'],
  ['gxTextField', 'textField'],
  ['gxTextFieldFocus', 'textFieldFocus', { borderColor: ACCENT, shadowColor: ACCENT }],
  ['gxTextFieldClear', 'textFieldClear'],
  ['gxTabBar', 'tabBar'],
  ['gxTabLens', 'tabLens'],
  ['gxTabLensActive', 'tabLensActive'],
  ['gxSidebarPanel', 'sidebarPanel'],
  ['gxSidebarLens', 'sidebarLens'],
  ['gxSidebarLensActive', 'sidebarLensActive'],
  ['gxProgressTrack', 'progressTrack'],
  ['gxProgressFill', 'progressFill', { tint: ACCENT }],
  ['gxProgressBead', 'progressBead'],
];
/** A preset as written (light theme), without its "$comment" notes. */
const preset = (name) => Object.fromEntries(Object.entries(rawGlassGroup(name)).filter(([k]) => !k.startsWith('$')));

// The glass lab's Toys (DashboardPro glassUiLab/looks.js): clear WebGL glass.
// The two buttons share one morph name, so they melt together where they meet.
const TOY_LENS = {
  layer: 'float', sampler: 'webgl', shape: 'circle', tint: '#ffffff', tintOpacity: 0.05, thickness: 40, bevel: 22,
  bevelSegments: 12, profile: 'squircle', ior: 1.5, chromaticAberration: 0.03, samples: 10, blur: 0, saturation: 1.8,
  brightness: 1.04, reflection: 0.5, rimLight: 0.9, rimWidth: 1.5, lightAngle: -45, innerGlow: 0.2, borderOpacity: 0.6,
  pressScale: 1, pressGlow: 0.35, squish: 0,
};
const TOYS = {
  toyBar: { ...TOY_LENS, tint: '#ffffff', tintOpacity: 0.3, blur: 8, thickness: 24, bevel: 14, morph: 'toyBar', morphRadius: 24 },
  toyMenu: { ...TOY_LENS, sampler: 'auto', shape: 'roundedRectangle', radius: 22, tint: '#ffffff', tintOpacity: 0.55, blur: 22, thickness: 36, bevel: 16, shadowOpacity: 0.22, shadowBlur: 30, shadowY: 12 },
  toyCard: { ...TOY_LENS, sampler: 'auto', shape: 'roundedRectangle', radius: 30, tint: '#ffffff', tintOpacity: 0.35, blur: 12, thickness: 40, bevel: 20, shadowOpacity: 0.25, shadowBlur: 36, shadowY: 14 },
};

/** The gallery's groups, for the page config's "groups". */
export const GALLERY_GROUPS = {
  ...Object.fromEntries(GX.map(([name, base, extra]) => [name, { ...preset(base), layer: 'float', ...(extra || {}) }])),
  ...TOYS,
};

// --- Icons ---------------------------------------------------------------------
const Ico = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICONS = {
  home: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  library: 'M6 3h12M5 6h14M5 9h14v11H5z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  note: 'M9 18a2.5 2.5 0 1 1-2.5-2.5H9V5l9-2v12a2.5 2.5 0 1 1-2.5-2.5H18',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
};

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A tile: artwork + big word behind, its label, the element on top. */
function Tile({ label, art, word, tileRef, onPointerDown, children }) {
  return (
    <section className="gx-tile" ref={tileRef} onPointerDown={onPointerDown}>
      <div className={'gx-art ' + art} aria-hidden="true" />
      <div className="gx-word" aria-hidden="true">{word}</div>
      <span className="gx-label mono">{label}</span>
      <div className="gx-stage">{children}</div>
    </section>
  );
}

// --- The tiles -------------------------------------------------------------------

function ButtonsTile() {
  return (
    <Tile label="Glass buttons" art="orange" word="Glass">
      <div className="gx-row">
        <Glass as="button" type="button" group="gxButton" className="gx-btn lift">Continue</Glass>
        <Glass as="button" type="button" group="gxButtonPrimary" className="gx-btn lift">Get started</Glass>
      </div>
    </Tile>
  );
}

function SwitchTile() {
  const [on, setOn] = useState({ a: false, b: true });
  const groups = { off: 'gxSwitch', on: 'gxSwitchOn', knob: 'gxSwitchKnob', knobActive: 'gxSwitchKnobActive' };
  return (
    <Tile label="GlassSwitch" art="cobalt" word="Toggle">
      <div className="gx-row">
        <GlassSwitch className="lift" groups={groups} checked={on.a} onChange={(v) => setOn((s) => ({ ...s, a: v }))} aria-label="Wi-Fi" />
        <GlassSwitch className="lift" groups={groups} checked={on.b} onChange={(v) => setOn((s) => ({ ...s, b: v }))} aria-label="Bluetooth" />
      </div>
    </Tile>
  );
}

function SliderTile() {
  const [vol, setVol] = useState(45);
  return (
    <Tile label="GlassSlider" art="mint" word="Volume">
      <GlassSlider
        className="gx-slider lift"
        groups={{ track: 'gxSliderTrack', fill: 'gxSliderFill', knob: 'gxSliderKnob', knobActive: 'gxSliderKnobActive' }}
        value={vol}
        onChange={setVol}
        aria-label="Volume"
      />
    </Tile>
  );
}

function ChoiceTile() {
  const [checks, setChecks] = useState({ a: true, b: false });
  const [size, setSize] = useState('m');
  const box = { off: 'gxCheckbox', on: 'gxCheckboxOn' };
  const radio = { off: 'gxRadio', on: 'gxRadioOn', dot: 'gxRadioDot' };
  return (
    <Tile label="GlassCheckbox · GlassRadio" art="pink" word="Choose">
      <Glass group="gxPanel" className="gx-check-row lift">
        <div className="gx-row">
          <GlassCheckbox className="lift" groups={box} checked={checks.a} onChange={(v) => setChecks((c) => ({ ...c, a: v }))}>Desktop</GlassCheckbox>
          <GlassCheckbox className="lift" groups={box} checked={checks.b} onChange={(v) => setChecks((c) => ({ ...c, b: v }))}>Stage Manager</GlassCheckbox>
        </div>
        <div className="gx-row" role="radiogroup" aria-label="Size">
          {[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([k, l]) => (
            <GlassRadio key={k} className="lift" groups={radio} name="gx-size" checked={size === k} onChange={() => setSize(k)}>{l}</GlassRadio>
          ))}
        </div>
      </Glass>
    </Tile>
  );
}

function TextFieldTile() {
  const [text, setText] = useState('');
  return (
    <Tile label="GlassTextField" art="check" word="Search">
      <GlassTextField
        className="gx-field lift"
        groups={{ field: 'gxTextField', focus: 'gxTextFieldFocus', clear: 'gxTextFieldClear' }}
        icon={<Ico d={ICONS.search} />}
        placeholder="Search"
        clearable
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Search"
      />
    </Tile>
  );
}

/**
 * Plays the README animation while it is on screen (fill to 100% with the
 * bead, busy drop, back to the start). Click or tap the bar to set it
 * yourself (the loop waits a few seconds).
 */
function ProgressTile() {
  const [value, setValue] = useState(0.62);
  const [busy, setBusy] = useState(false);
  const tile = useRef(null);
  const bar = useRef(null);
  const pausedUntil = useRef(0);
  useEffect(() => {
    if (reducedMotion()) return undefined;
    // [ms into the loop, value (null = busy)]
    const STEPS = [[600, 1], [2300, null], [4500, 0.1], [5000, 0.62]];
    const LOOP = 7000;
    let timers = [];
    let visible = false;
    const clear = () => {
      timers.forEach(clearTimeout);
      timers = [];
    };
    const run = () => {
      clear();
      if (!visible) return;
      for (const [at, v] of STEPS) {
        timers.push(setTimeout(() => {
          if (performance.now() < pausedUntil.current) return;
          setBusy(v === null);
          if (v !== null) setValue(v);
        }, at));
      }
      timers.push(setTimeout(run, LOOP));
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      run();
    });
    io.observe(tile.current);
    return () => {
      io.disconnect();
      clear();
    };
  }, []);
  const set = (e) => {
    const r = bar.current.getBoundingClientRect();
    pausedUntil.current = performance.now() + 6000;
    setBusy(false);
    setValue(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };
  return (
    <Tile label="GlassProgress" art="sun" word="Loading" tileRef={tile}>
      <div className="gx-prog-hit lift" ref={bar} onPointerDown={set} title="Click to set">
        <GlassProgress
          className="gx-prog"
          groups={{ track: 'gxProgressTrack', fill: 'gxProgressFill', bead: 'gxProgressBead' }}
          value={busy ? null : value}
          bead
          aria-label="Progress"
        />
      </div>
    </Tile>
  );
}

function TabBarTile() {
  const [tab, setTab] = useState(0);
  return (
    <Tile label="GlassTabBar" art="orange" word="Tabs">
      <GlassTabBar
        className="gx-tabbar lift"
        groups={{ bar: 'gxTabBar', lens: 'gxTabLens', lensActive: 'gxTabLensActive' }}
        value={tab}
        onChange={setTab}
        role="tablist"
        aria-label="Sections"
      >
        {[['Home', 'home'], ['Browse', 'grid'], ['Library', 'library'], ['Search', 'search']].map(([l, i]) => (
          <button key={l} type="button" role="tab" data-gp-item className="gx-tab"><Ico d={ICONS[i]} />{l}</button>
        ))}
      </GlassTabBar>
    </Tile>
  );
}

function SidebarTile() {
  const [page, setPage] = useState(0);
  return (
    <Tile label="GlassSidebar" art="cobalt" word="Library">
      <GlassSidebar
        className="gx-sidebar lift"
        groups={{ bar: 'gxSidebarPanel', lens: 'gxSidebarLens', lensActive: 'gxSidebarLensActive' }}
        value={page}
        onChange={setPage}
        aria-label="Library"
      >
        {[['Home', 'home'], ['Recently Added', 'clock'], ['Albums', 'grid'], ['Songs', 'note']].map(([l, i]) => (
          <button key={l} type="button" data-gp-item className="gx-side-item"><Ico d={ICONS[i]} />{l}</button>
        ))}
      </GlassSidebar>
    </Tile>
  );
}

function GlassUiTile() {
  return (
    <Tile label="<glass-ui> element" art="mint" word="Any app">
      <glass-ui group="gxCard" className="gx-card lift" props='{"pressScale":1.04,"squish":0.6,"squishGrow":1.05}'>
        <h3>Plain HTML inside</h3>
        <p>Glass as a web component — React, Vue, Svelte or plain HTML.</p>
      </glass-ui>
    </Tile>
  );
}

/** glassMorph: the Options button grows into its menu (tap outside to close). */
function MorphTile() {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const menu = useRef(null);
  useGlassMorph(btn, menu, open);
  const outside = (e) => {
    if (open && !menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false);
  };
  return (
    <Tile label="glassMorph()" art="pink" word="Morph" onPointerDown={outside}>
      <div className="gx-morph-area">
        <Glass ref={btn} as="button" type="button" group="gxButton" className="gx-morph-btn lift" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Options
        </Glass>
        <Glass ref={menu} group="gxMenu" className="gx-morph-panel lift" role="menu">
          {['New Folder', 'Get Info', 'Share…', 'Move to Trash'].map((t) => (
            <button key={t} type="button" role="menuitem" onClick={() => setOpen(false)}>{t}</button>
          ))}
        </Glass>
      </div>
    </Tile>
  );
}

/** createShapeSpring: tap to spring circle → capsule → rounded square. */
const SHAPES = [
  { width: 120, height: 120, radius: 60 },
  { width: 360, height: 112, radius: 56 },
  { width: 220, height: 220, radius: 36 },
];
// The "button" preset is a capsule (always fully round): the spring's corner
// radius only shows on a rounded rectangle.
const SPRING_GLASS = { shape: 'roundedRectangle', radius: 60 };
function SpringTile() {
  const el = useRef(null);
  const spring = useRef(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    spring.current = createShapeSpring(el.current);
    spring.current.to(SHAPES[0], { immediate: true });
    return () => spring.current?.destroy();
  }, []);
  const next = () => {
    const n = (i + 1) % SHAPES.length;
    setI(n);
    // Phones: never wider than the tile.
    const max = (el.current.closest('.gx-tile')?.clientWidth ?? 640) - 40;
    spring.current.to({ ...SHAPES[n], width: Math.min(SHAPES[n].width, max) });
  };
  return (
    <Tile label="createShapeSpring()" art="check" word="Spring">
      <Glass ref={el} as="button" type="button" group="gxButton" glass={SPRING_GLASS} className="gx-spring lift" onClick={next} aria-label="Change shape">
        Tap
      </Glass>
    </Tile>
  );
}

/** The glass lab's morph menus (DashboardPro Toys → "Glass morph"). */
function LabMorphTile() {
  const menuBtn = useRef(null);
  const menu = useRef(null);
  const cardBtn = useRef(null);
  const card = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  useGlassMorph(menuBtn, menu, menuOpen);
  useGlassMorph(cardBtn, card, cardOpen);
  return (
    <Tile label="useGlassMorph() — glass lab" art="sun" word="Menus">
      <div className="gx-toy">
        <div className="gx-toy-buttons">
          <Glass ref={menuBtn} as="button" type="button" group="toyBar" className="gx-toy-btn lift" aria-expanded={menuOpen} aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>
            <Ico d={ICONS.grid} />
          </Glass>
          <Glass ref={cardBtn} as="button" type="button" group="toyBar" className="gx-toy-btn lift" aria-expanded={cardOpen} aria-label="Card" onClick={() => setCardOpen((v) => !v)}>
            <Ico d={ICONS.heart} />
          </Glass>
        </div>
        <Glass ref={menu} group="toyMenu" className="gx-toy-menu lift" role="menu">
          {['New note', 'Share…', 'Duplicate', 'Delete'].map((t) => (
            <button key={t} type="button" role="menuitem" onClick={() => setMenuOpen(false)}>{t}</button>
          ))}
        </Glass>
        <Glass ref={card} group="toyCard" className="gx-toy-card lift">
          <strong>Liquid glass</strong>
          <span>This card grew out of the heart button. Tap the heart again to melt it back.</span>
        </Glass>
      </div>
    </Tile>
  );
}

/** The section. */
export function Gallery() {
  return (
    <section className="gx" id="controls">
      <div className="gx-head">
        <h2>Every control, live.</h2>
        <p>The same tiles as the animations in the README. Press, drag, type and tap: it's all real glass.</p>
      </div>
      <div className="gx-grid">
        <ButtonsTile />
        <SwitchTile />
        <SliderTile />
        <ChoiceTile />
        <TextFieldTile />
        <ProgressTile />
        <TabBarTile />
        <SidebarTile />
        <GlassUiTile />
        <MorphTile />
        <SpringTile />
        <LabMorphTile />
      </div>
    </section>
  );
}
