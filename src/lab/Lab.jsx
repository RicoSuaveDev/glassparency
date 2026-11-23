/**
 * =============================================================================
 * The glass UI lab — every control, every setting, live
 * =============================================================================
 * The showcase's main section: three columns with the same controls in the
 * library's three styles (default / crystal / frosted), over a photo — on
 * phones one style at a time ("Glass mode"). A sticky settings bar switches:
 *   Renderer   WebGL, or the CSS fallback glass (what Safari / Firefox /
 *              phones show without WebGL) — reloads the page with ?css=1
 *   Quality    the provider's global.quality (auto = automatic)
 *   Theme      light / dark (the same switch as the nav's button)
 *   Squish     squish & stretch presets for every squishing control
 *   Backdrop   the photo the glass bends, or any image URL
 *   Inspector  pick any control and tune its glass group live (inspector.jsx)
 *
 * The photo is global.backgroundImage: the library's base canvas (behind the
 * page, fixed to the window) paints it and the glass refracts it — in every
 * browser, and it stays still while the controls scroll over it. The rest
 * of the page has solid backgrounds that cover the canvas; the stage is the
 * see-through window onto it (lab.css).
 * =============================================================================
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Glass,
  GlassSwitch,
  GlassSlider,
  GlassCheckbox,
  GlassRadio,
  GlassTextField,
  GlassTabBar,
  GlassSidebar,
  GlassProgress,
  GlassSegmented,
  GlassStepper,
  GlassRangeSlider,
  GlassBlockSlider,
  GlassPopover,
  GlassMenu,
  GlassSelect,
  GlassTooltip,
  GlassSheet,
  useGlassToaster,
  getGlassStatus,
  subscribeGlassStatus,
  getGlassQuality,
  subscribeGlassQuality,
  addGlassPresets,
} from 'glassparency';
import { LOOKS, SQUISH } from './looks';
import { BACKDROPS } from './backdrops';
import { Icon } from './icons';
import Inspector from './inspector';
import './lab.css';

/** "high (auto, 60 fps animating)" for the settings bar. */
function useQualityText() {
  const q = useSyncExternalStore(subscribeGlassQuality, getGlassQuality);
  return `${q.level}${q.auto ? ` (auto${q.fps ? `, ${q.fps} fps animating` : ''})` : ''}`;
}

/** Renderer switch: "CSS fallback" reloads with ?css=1 (the provider reads its layout once). */
export const RENDERER = typeof window !== 'undefined' && new URLSearchParams(location.search).get('css') === '1' ? 'css' : 'webgl';
function setRenderer(v) {
  const u = new URL(location.href);
  if (v === 'css') u.searchParams.set('css', '1');
  else u.searchParams.delete('css');
  u.hash = 'lab';
  location.href = u.toString();
}

const QUALITIES = { auto: 'Auto', high: 'High', medium: 'Medium', low: 'Low' };
const GLASS_MODES = { default: 'Default', crystal: 'Crystal', frosted: 'Frosted' };

/** True at phone width (the page's own mobile breakpoint, styles.css). */
const NARROW = '(max-width: 860px)';
function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/**
 * @param {{ theme: 'light'|'dark', setTheme: (t: string) => void,
 *           quality: string, setQuality: (q: string) => void }} props
 */
export default function Lab({ theme, setTheme, quality, setQuality }) {
  const [squish, setSquish] = useState('apple');
  // Phones / narrow windows: one column at a time, picked with "Glass mode".
  const narrow = useNarrow();
  const [mode, setMode] = useState('default');
  const [backdrop, setBackdrop] = useState('lake');
  const [imageUrl, setImageUrl] = useState('');
  // Settings inspector (inspector.jsx): pick a control, tune it with sliders, copy the settings.
  const [inspecting, setInspecting] = useState(false);
  const image = backdrop === 'image' ? imageUrl : BACKDROPS[backdrop]?.url || '';
  // The photo is the glass's background: the BASE canvas (z-index −1, behind
  // the page, fixed to the window) paints it and base glass refracts it.
  // A preset pack, so it sits under the page's config and is swapped
  // whenever the backdrop changes.
  useEffect(() => (image ? addGlassPresets({ global: { backgroundImage: image } }) : undefined), [image]);
  const status = useGlassStatus();
  const qualityText = useQualityText();
  // ONE bottom sheet and ONE toast stack for the whole lab (any column opens
  // them, in that column's style).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStyle, setSheetStyle] = useState('default');
  const sheetProps = useMemo(() => ({ style: sheetStyle }), [sheetStyle]);
  const toast = useGlassToaster();
  const openSheet = (style) => {
    setSheetStyle(style);
    setSheetOpen(true);
  };

  return (
    <section className="lab" id="lab" aria-label="Glass UI lab">
      <div className="lab-intro">
        <div className="wrap">
          <p className="kicker">The glass UI lab</p>
          <h2 className="lab-title">
            Every control.
            <br />
            Every setting.
          </h2>
          <p className="lede">
            Press, drag, type and flick: everything below is live glass from the package. The photo stays still while the controls scroll over it, so you can watch them bend it. Change the renderer, the quality, the theme, the squish and the backdrop, or open the <b>Inspector</b> and tune any control yourself.
          </p>
        </div>
      </div>

      {/* The see-through window onto the photo (lab.css). */}
      <div className="labStage">
        <Backdrop image={image} />
        {/* Sticky settings bar (plain HTML, above the glass while you scroll). */}
        <header className="labBar">
          <div className="labTitle">
            <strong>Glass: {status}</strong>
            <span>quality: {qualityText}</span>
          </div>
          {narrow && <Choice label="Glass mode" value={mode} onChange={setMode} options={GLASS_MODES} />}
          <Choice label="Renderer" value={RENDERER} onChange={setRenderer} options={{ webgl: 'WebGL', css: 'CSS fallback' }} />
          <Choice label="Quality" value={quality} onChange={setQuality} options={QUALITIES} />
          <Choice label="Theme" value={theme} onChange={setTheme} options={{ light: 'Light', dark: 'Dark' }} />
          <Choice label="Squish" value={squish} onChange={setSquish} options={Object.fromEntries(Object.entries(SQUISH).map(([k, v]) => [k, v.label]))} />
          <Choice label="Backdrop" value={backdrop} onChange={setBackdrop} options={{ ...Object.fromEntries(Object.entries(BACKDROPS).map(([k, v]) => [k, v.label])), image: 'Image URL' }} />
          {backdrop === 'image' && (
            <input className="labUrl" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Paste an image URL (https://…)" aria-label="Backdrop image URL" />
          )}
          <button type="button" className="labInsToggle" aria-pressed={inspecting} onClick={() => setInspecting((v) => !v)}>
            Inspector
          </button>
        </header>
        <div className="labCols">
          {(narrow ? LOOKS.filter((l) => l.id === mode) : LOOKS).map((look) => (
            <Column key={look.id} look={look} squish={SQUISH[squish].props} onSheet={openSheet} toast={toast} />
          ))}
        </div>
      </div>

      {inspecting && <Inspector onClose={() => setInspecting(false)} />}
      <GlassSheet open={sheetOpen} onClose={() => setSheetOpen(false)} detents={SHEET_DETENTS} glassProps={sheetProps} className="labSheet" aria-label="Sample sheet">
        <h3>Bottom sheet · {sheetStyle}</h3>
        <p>Drag the top of this sheet up and down: it rests at {SHEET_DETENTS.map((d) => `${Math.round(d * 100)}%`).join(' and ')} of the window. Flick it to jump. The glass gets thicker and the page darker as it rises.</p>
        <p>Drag it down, tap the dark page, or press Escape to close it.</p>
        <Glass as="button" type="button" className="labBtn" group="buttonPrimary" glass={sheetProps} onClick={() => setSheetOpen(false)}>
          Done
        </Glass>
      </GlassSheet>
    </section>
  );
}

const SHEET_DETENTS = [0.4, 0.9];
const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'name', label: 'Name' },
  { value: 'size', label: 'Size' },
  { value: 'kind', label: 'Kind' },
];
const TOAST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>';

/** Glass status ("on", "fallback (reason)"…) for the top bar. */
function useGlassStatus() {
  const read = () => {
    const s = getGlassStatus();
    return typeof s === 'string' ? s : [s?.state || s?.mode, s?.reason].filter(Boolean).join(' — ') || 'starting';
  };
  const [s, setS] = useState(read);
  useEffect(() => subscribeGlassStatus(() => setS(read())), []);
  return s;
}

/** Plain segmented choice for the lab's own settings (not glass). */
function Choice({ label, value, onChange, options }) {
  return (
    <div className="labChoice" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      {Object.entries(options).map(([k, text]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * One style: every control, with the column's "style" given to it as a
 * per-element glass prop (its parts — lens, knob, tick box… — follow it).
 */
function Column({ look, squish, onSheet, toast }) {
  const style = look.id;
  const [checks, setChecks] = useState({ desktop: true, stage: false, dock: true });
  const [size, setSize] = useState('m');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(3);
  const [page, setPage] = useState(1);
  const [on, setOn] = useState(true);
  const [vol, setVol] = useState(60);
  const [prog, setProg] = useState(0.35);
  const [bead, setBead] = useState(true);
  const [clicks, setClicks] = useState(0);
  // New controls
  const [seg, setSeg] = useState(1);
  const [count, setCount] = useState(3);
  const [range, setRange] = useState([25, 75]);
  const [vert, setVert] = useState(40);
  const [bright, setBright] = useState(60);
  const [loud, setLoud] = useState(30);
  const [wide, setWide] = useState(50);
  const [picked, setPicked] = useState('nothing yet');
  const [sort, setSort] = useState('recent');
  const toastN = useRef(0);

  // Per-part props: the column's style (+ the squish preset where it squishes).
  const btn = useMemo(() => ({ ...squish, style }), [squish, style]);
  const box = useMemo(() => ({ box: { ...squish, style } }), [squish, style]);
  const field = useMemo(() => ({ field: { ...squish, style }, clear: squish }), [squish, style]);
  const bar = useMemo(() => ({ bar: { style } }), [style]);
  const track = useMemo(() => ({ track: { style } }), [style]);
  // Top bar: the column's style; no outer padding (the app's header keeps
  // 20px round it — here it sits in the column like the other rows).
  // sampler "webgl": auto text (light / dark) is picked from the pixels the
  // glass really refracts. Drawn live (Chromium's SVG filter) there are no
  // pixels to read, so it was only estimated from the tint and the page
  // colour — never the photo — and the title / icons never changed colour.
  const topbar = useMemo(() => ({ style, sampler: 'webgl', padding: { top: 0, right: 0, bottom: 0, left: 0 } }), [style]);
  const headBtn = useMemo(() => ({ style, sampler: 'webgl' }), [style]);
  const plain = useMemo(() => ({ style }), [style]);
  const body = useMemo(() => ({ body: { ...squish, style } }), [squish, style]);
  const block = useMemo(() => ({ body: { style } }), [style]);

  return (
    <section className="labCol" data-style={style} style={{ '--gp-accent': 'var(--cobalt)', '--gp-focus': 'var(--cobalt)' }}>
      <h2>{look.name}</h2>
      <p className="labBlurb">{look.blurb}</p>

      <Row title="Top bar" note="a page header (group topbar + headerButton)">
        <Glass className="labTopbar" group="topbar" glass={topbar}>
          <span className="labTopbarTitle">glassparency</span>
          <Glass as="button" type="button" className="labHeadBtn" group="headerButton" glass={headBtn} aria-label="Search" onClick={() => setClicks((n) => n + 1)}>
            <Icon name="search" />
          </Glass>
          <Glass as="button" type="button" className="labHeadBtn" group="headerButton" glass={headBtn} aria-label="New" onClick={() => setClicks((n) => n + 1)}>
            <Icon name="plus" />
          </Glass>
        </Glass>
      </Row>

      <Row title="Buttons" note={`clicked ${clicks}× — drag off a button and let go: no click`}>
        <div className="labTraffic">
          {['trafficRed', 'trafficYellow', 'trafficGreen'].map((grp) => (
            <Glass key={grp} as="button" type="button" className="labDot" group={grp} glass={{ style }} aria-label={grp.slice(7)} onClick={() => setClicks((n) => n + 1)} />
          ))}
        </div>
        <Glass as="button" type="button" className="labBtn" group="buttonPrimary" glass={btn} onClick={() => setClicks((n) => n + 1)}>
          Accept
        </Glass>
        <Glass as="button" type="button" className="labBtn" group="button" glass={btn} onClick={() => setClicks((n) => n + 1)}>
          Cancel
        </Glass>
        <Glass as="button" type="button" className="labRound" group="roundButton" glass={squish.squish === 0 ? btn : { style }} aria-label="Close" onClick={() => setClicks((n) => n + 1)}>
          <Icon name="x" />
        </Glass>
      </Row>

      <Row title="Checkboxes">
        <GlassCheckbox checked={checks.desktop} onChange={(v) => setChecks((c) => ({ ...c, desktop: v }))} glassProps={box}>
          On Desktop
        </GlassCheckbox>
        <GlassCheckbox checked={checks.stage} onChange={(v) => setChecks((c) => ({ ...c, stage: v }))} glassProps={box}>
          In Stage Manager
        </GlassCheckbox>
        <GlassCheckbox checked={checks.dock} onChange={(v) => setChecks((c) => ({ ...c, dock: v }))} glassProps={box} disabled>
          Disabled
        </GlassCheckbox>
      </Row>

      <Row title="Radio buttons">
        {[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([k, label]) => (
          <GlassRadio key={k} name={`size-${look.id}`} checked={size === k} onChange={() => setSize(k)} glassProps={box}>
            {label}
          </GlassRadio>
        ))}
      </Row>

      <Row title="Text field">
        <GlassTextField
          className="labField"
          icon={<Icon name="search" />}
          clearable
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Artists, Songs, Lyrics, and More"
          glassProps={field}
        />
      </Row>

      <Row title="Switch + slider">
        <GlassSwitch checked={on} onChange={setOn} glassProps={track} aria-label="Switch" />
        <GlassSlider className="labSlider" value={vol} onChange={setVol} glassProps={track} aria-label="Slider" />
      </Row>

      <Row title="Tab bar" note="press, then slide your finger / mouse along it">
        <GlassTabBar className="labTabs" value={tab} onChange={setTab} glassProps={bar} role="tablist">
          {[['home', 'Home'], ['grid', 'New'], ['radio', 'Radio'], ['library', 'Library'], ['search', 'Search']].map(([icon, label]) => (
            <button key={label} type="button" role="tab" data-gp-item className="labTab">
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </GlassTabBar>
      </Row>

      <Row title="Sidebar" note="click, or press and drag up / down">
        <GlassSidebar className="labSide" value={page} onChange={setPage} glassProps={bar} aria-label="Sidebar">
          {[['search', 'Search'], ['home', 'Home'], ['radio', 'Radio'], ['clock', 'Recently Added'], ['mic', 'Artists'], ['album', 'Albums'], ['note', 'Songs']].map(([icon, label]) => (
            <button key={label} type="button" data-gp-item className="labSideItem">
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </GlassSidebar>
      </Row>

      <Row title="Progress">
        <GlassProgress className="labProg" value={prog} bead={bead} glassProps={track} />
        <div className="labProgBtns">
          {[0, 0.35, 0.7, 1].map((v) => (
            <button key={v} type="button" className="labMini" onClick={() => setProg(v)}>
              {Math.round(v * 100)}%
            </button>
          ))}
          <label className="labMini">
            <input type="checkbox" checked={bead} onChange={(e) => setBead(e.target.checked)} /> bead
          </label>
        </div>
        <GlassProgress className="labProg" value={null} glassProps={track} />
      </Row>

      {/* ---- New controls ---------------------------------------------- */}
      <Row title="Segmented control" note="tap, or press and slide">
        <GlassSegmented className="labSeg" value={seg} onChange={setSeg} glassProps={bar} aria-label="Range">
          {['Day', 'Week', 'Month', 'Year'].map((t) => (
            <button key={t} type="button" role="tab" data-gp-item>
              {t}
            </button>
          ))}
        </GlassSegmented>
      </Row>

      <Row title="Stepper" note="tap, or hold to repeat (0–20)">
        <GlassStepper value={count} onChange={setCount} min={0} max={20} glassProps={body} aria-label="Quantity" />
      </Row>

      <Row title="Range + vertical slider" note={`range ${range[0]}–${range[1]} · vertical ${vert}`}>
        <GlassRangeSlider className="labSlider" value={range} onChange={setRange} glassProps={track} aria-label="Price range" />
        <GlassRangeSlider orientation="vertical" value={vert} onChange={setVert} glassProps={track} aria-label="Vertical slider" />
      </Row>

      <Row title="Block sliders" note="drag (moves with your finger), tap to jump, pull past an end">
        <GlassBlockSlider value={bright} onChange={setBright} glassProps={block} aria-label="Brightness">
          <Icon name="sun" size={24} />
        </GlassBlockSlider>
        <GlassBlockSlider value={loud} onChange={setLoud} glassProps={block} aria-label="Volume">
          <Icon name="speaker" size={24} />
        </GlassBlockSlider>
        <GlassBlockSlider orientation="horizontal" value={wide} onChange={setWide} glassProps={block} aria-label="Wide block slider">
          <Icon name="sun" size={22} />
        </GlassBlockSlider>
      </Row>

      <Row title="Menu + select" note={`picked: ${picked}`}>
        <GlassMenu
          label={
            <>
              <Icon name="grid" size={16} /> Actions
            </>
          }
          triggerClassName="labBtn labBtnIcon"
          triggerGlass={btn}
          glassProps={plain}
          onSelect={(i, it) => setPicked(it.textContent.trim())}
        >
          {['New note', 'Share…', 'Duplicate', 'Delete'].map((t) => (
            <button key={t} type="button" role="menuitem">
              {t}
            </button>
          ))}
        </GlassMenu>
        <GlassSelect options={SORTS} value={sort} onChange={setSort} triggerClassName="labBtn" triggerGlass={btn} glassProps={plain} aria-label="Sort by" />
      </Row>

      <Row title="Popover + tooltips" note="click Info · hover the round buttons">
        <GlassPopover
          label={
            <>
              <Icon name="info" size={16} /> Info
            </>
          }
          triggerClassName="labBtn labBtnIcon"
          triggerGlass={btn}
          glassProps={plain}
          className="labPop"
          aria-label="Info"
        >
          <strong>Liquid glass popover</strong>
          <span>It grew out of the button. Press outside it or Escape to melt it back.</span>
        </GlassPopover>
        {[['share', 'Share'], ['heart', 'Favourite'], ['trash', 'Delete']].map(([icon, label]) => (
          <GlassTooltip key={label} text={label} glassProps={plain}>
            <Glass as="button" type="button" className="labRound" group="roundButton" glass={squish.squish === 0 ? btn : plain} aria-label={label} onClick={() => setClicks((n) => n + 1)}>
              <Icon name={icon} />
            </Glass>
          </GlassTooltip>
        ))}
      </Row>

      <Row title="Sheet + toast" note="the sheet and toasts take this column's style">
        <Glass as="button" type="button" className="labBtn" group="button" glass={btn} onClick={() => onSheet(style)}>
          Open sheet
        </Glass>
        <Glass
          as="button"
          type="button"
          className="labBtn"
          group="button"
          glass={btn}
          onClick={() => {
            toastN.current += 1;
            toast.show({ title: `${look.name} toast ${toastN.current}`, body: 'Swipe it up, or wait a few seconds.', icon: TOAST_ICON, props: plain });
          }}
        >
          Show toast
        </Glass>
      </Row>
    </section>
  );
}

function Row({ title, note, children }) {
  return (
    <div className="labRow">
      <div className="labRowHead">
        <span>{title}</span>
        {note && <em>{note}</em>}
      </div>
      <div className="labRowBody">{children}</div>
    </div>
  );
}

/**
 * The photo you see, fixed to the window and clipped to the stage (lab.css),
 * BEHIND the base canvas (z-index −2). The canvas refracts its own copy
 * (global.backgroundImage) but, anchored to the page, doesn't paint it.
 */
function Backdrop({ image }) {
  return (
    // data-glass-ignore: left out of the library's page pictures. A fixed
    // layer would be photographed once, at whatever scroll position, and
    // then cover the whole picture: floating / top / modal glass (the hero
    // lens, tab bars, toasts, the sheet) saw only this photo instead of the
    // page's HTML, and a stale copy of it once you scrolled. The library
    // paints the photo itself under those pictures (global.backgroundImage,
    // in window coordinates), so nothing is lost.
    <div className="labBackdrop" aria-hidden="true" data-glass-ignore="">
      <div className="labBackdropImg" data-glass-ignore="" style={image ? { backgroundImage: `url("${image.replace(/"/g, '%22')}")` } : undefined} />
    </div>
  );
}
