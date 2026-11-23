/**
 * =============================================================================
 * src/lab/inspector.jsx — Live settings inspector for the UI lab's controls
 * =============================================================================
 * Opened from the lab's top bar ("Inspector"). Pick a control — from the list,
 * or "Pick on page" and click any glass on the page — then drag the sliders:
 * every element of that control's config GROUP changes immediately, in all
 * three columns (each column's style — crystal / frosted — still applies its
 * own rules on top, see config.js STYLES).
 *
 * Nothing is saved anywhere but this browser: tweaks are kept
 * (localStorage) so a reload doesn't lose them; "Reset all" clears them.
 * "Copy settings" puts every changed value (all groups) on the clipboard as
 * JSON, ready to paste into your own <GlassProvider config> groups.
 *
 * Uses Glassparency's devtools overrides (setGlassOverride…): the same live
 * overrides any tuning panel can use. The panel itself is plain
 * HTML (no glass: it shouldn't add load or be refracted), marked
 * data-glass-ignore so page pictures leave it out.
 * =============================================================================
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getGlassTheme, resolveGlass } from 'glassparency';
import { GLASS_SCHEMA, clearGlassOverride, getGlassInfo, getGlassOverride, glassGroupNames, setGlassOverride, subscribeGlassConfig } from 'glassparency/devtools';

/** The controls on the lab's pages → their config groups (friendly names first). */
const CONTROLS = [
  ['button', 'Button (Cancel)'],
  ['buttonPrimary', 'Primary button (Accept)'],
  ['roundButton', 'Round × button'],
  ['trafficRed', 'Window button — red'],
  ['trafficYellow', 'Window button — yellow'],
  ['trafficGreen', 'Window button — green'],
  ['tabBar', 'Tab bar'],
  ['tabLens', 'Tab bar lens (selected tab)'],
  ['topbar', 'Top bar'],
  ['headerButton', 'Top bar button'],
  ['checkbox', 'Checkbox'],
  ['radio', 'Radio button'],
  ['radioDot', 'Radio dot'],
  ['textField', 'Text field'],
  ['textFieldClear', 'Text field clear (×)'],
  ['switch', 'Switch track'],
  ['switchKnob', 'Switch knob'],
  ['sliderTrack', 'Slider track'],
  ['sliderFill', 'Slider fill'],
  ['sliderKnob', 'Slider knob'],
  ['sidebarPanel', 'Sidebar panel'],
  ['sidebarLens', 'Sidebar lens (selected row)'],
  ['progressTrack', 'Progress track'],
  ['progressFill', 'Progress fill'],
  ['progressBead', 'Progress bead'],
];

/** Sections shown, in order (the refraction / depth ones first and open). */
const SECTIONS = [
  ['Glass', 'Refraction & depth', true],
  ['Shape', 'Shape', false],
  ['Light', 'Light', false],
  ['Colour', 'Colour', false],
  ['Edge', 'Border & shadow', false],
  ['Squish', 'Squish & stretch', false],
  ['Ripple', 'Ripples', false],
];
/** Settings only WebGL glass uses (live glass in Chrome ignores them). */
const WEBGL_ONLY = new Set(['scale', 'anisotropy', 'roughness', 'distortion', 'distortionScale', 'temporalDistortion', 'samples', 'reflection', 'bevelSegments']);
/** String settings that are colours (shown as a colour picker when hex). */
const COLOUR_STRINGS = new Set(['borderColor', 'shadowColor']);

const STORE_KEY = 'gp-lab-inspector';

// --- Keep tweaks across reloads (this browser only) ----------------------------------
function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    for (const [group, props] of Object.entries(saved)) {
      if (props && typeof props === 'object' && Object.keys(props).length) setGlassOverride(group, props);
    }
  } catch {
    /* private window / blocked storage: start clean */
  }
}
function save(groups) {
  try {
    const all = {};
    for (const g of groups) {
      const o = getGlassOverride(g);
      if (Object.keys(o).length) all[g] = o;
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
let restored = false;

export default function Inspector({ onClose }) {
  const allGroups = useMemo(() => glassGroupNames(), []);
  // Friendly list first, then any other group in the config.
  const options = useMemo(() => {
    const known = new Set(CONTROLS.map(([g]) => g));
    return [...CONTROLS.filter(([g]) => allGroups.includes(g)), ...allGroups.filter((g) => !known.has(g)).map((g) => [g, g])];
  }, [allGroups]);
  const [group, setGroup] = useState('button');
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState('');

  // Restore saved tweaks once per page load.
  useEffect(() => {
    if (restored) return;
    restored = true;
    loadSaved();
  }, []);

  // Re-render on any config change (overrides, theme, file hot-reload).
  const version = useSyncExternalStore(subscribeGlassConfig, () => getGlassTheme() + JSON.stringify(getGlassOverride(group)));
  void version;
  const p = resolveGlass(group);
  const override = getGlassOverride(group);
  const changedGroups = allGroups.filter((g) => Object.keys(getGlassOverride(g)).length);

  const set = (key, value) => {
    setGlassOverride(group, { [key]: value });
    save(allGroups);
  };
  const resetKey = (key) => {
    const { [key]: _drop, ...rest } = getGlassOverride(group);
    clearGlassOverride(group);
    if (Object.keys(rest).length) setGlassOverride(group, rest);
    save(allGroups);
  };
  const resetGroup = () => {
    clearGlassOverride(group);
    save(allGroups);
  };
  const resetAll = () => {
    allGroups.forEach((g) => clearGlassOverride(g));
    save(allGroups);
  };

  // "Pick on page": the next click on any glass selects its group (and does
  // nothing else — no button press, no tab switch). Esc cancels.
  useEffect(() => {
    if (!picking) return undefined;
    const glassAt = (ev) => {
      const el = ev.target?.closest?.('[data-glass-id]');
      return el && !el.closest('.labInspector') ? el : null;
    };
    const swallow = (ev) => {
      if (!glassAt(ev)) return;
      ev.preventDefault();
      ev.stopPropagation();
    };
    const onClick = (ev) => {
      const el = glassAt(ev);
      if (!el) return;
      ev.preventDefault();
      ev.stopPropagation();
      const e = getGlassInfo(el);
      if (e?.group) setGroup(e.group);
      setPicking(false);
    };
    const onKey = (ev) => ev.key === 'Escape' && setPicking(false);
    document.addEventListener('pointerdown', swallow, true);
    document.addEventListener('pointerup', swallow, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('labPicking');
    return () => {
      document.removeEventListener('pointerdown', swallow, true);
      document.removeEventListener('pointerup', swallow, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('labPicking');
    };
  }, [picking]);

  // How this group is drawn right now (WebGL / live SVG filter / CSS).
  const renderer = useRendererOf(group);

  async function copySettings() {
    const groups = {};
    for (const g of changedGroups) groups[g] = getGlassOverride(g);
    const text = JSON.stringify({ glassparencyInspector: 1, theme: getGlassTheme(), groups }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Copied');
    } catch {
      window.prompt('Copy these settings:', text);
      setCopied('');
    }
    setTimeout(() => setCopied(''), 1800);
  }

  return (
    <aside className="labInspector" data-glass-ignore="" aria-label="Glass inspector">
      <div className="labInsHead">
        <strong>Inspector</strong>
        <button type="button" className="labInsX" onClick={onClose} aria-label="Close inspector">
          ×
        </button>
      </div>

      <div className="labInsPick">
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Control to edit">
          {options.map(([g, label]) => (
            <option key={g} value={g}>
              {label}
              {Object.keys(getGlassOverride(g)).length ? ' •' : ''}
            </option>
          ))}
        </select>
        <button type="button" className={picking ? 'on' : ''} onClick={() => setPicking((v) => !v)}>
          {picking ? 'Click a control… (Esc)' : 'Pick on page'}
        </button>
      </div>
      <p className="labInsMeta">
        group <code>{group}</code> · drawn as <strong>{renderer}</strong>
        {renderer === 'live' && <> — settings marked “WebGL” don’t apply to it</>}
      </p>

      <div className="labInsActions">
        <button type="button" className="primary" onClick={copySettings} disabled={!changedGroups.length}>
          {copied || `Copy settings${changedGroups.length ? ` (${changedGroups.length})` : ''}`}
        </button>
        <button type="button" onClick={resetGroup} disabled={!Object.keys(override).length}>
          Reset control
        </button>
        <button type="button" onClick={resetAll} disabled={!changedGroups.length}>
          Reset all
        </button>
      </div>

      <div className="labInsBody">
        {SECTIONS.map(([section, title, open]) => {
          const keys = Object.entries(GLASS_SCHEMA).filter(([k, rule]) => rule.section === section && shown(k, rule));
          if (!keys.length) return null;
          return (
            <details key={section} open={open}>
              <summary>{title}</summary>
              {keys.map(([key, rule]) => (
                <Setting
                  key={key}
                  k={key}
                  rule={rule}
                  value={p[key]}
                  changed={key in override}
                  webglOnly={WEBGL_ONLY.has(key)}
                  onChange={(v) => set(key, v)}
                  onReset={() => resetKey(key)}
                />
              ))}
            </details>
          );
        })}
      </div>
    </aside>
  );
}

/** Which settings get a control (not names, layers, fonts… — just the look). */
function shown(key, rule) {
  if (rule.type === 'number' || rule.type === 'bool' || rule.type === 'radius' || rule.type === 'size' || rule.type === 'color') return true;
  if (rule.type === 'enum') return key === 'shape' || key === 'profile';
  return COLOUR_STRINGS.has(key);
}

/** "webgl" / "live" / "css" for the first element of the group on the page. */
function useRendererOf(group) {
  const [r, setR] = useState('…');
  useEffect(() => {
    const read = () => {
      const els = [...document.querySelectorAll('[data-glass-id]')].map((el) => getGlassInfo(el)).filter((e) => e?.group === group);
      if (!els.length) return setR('not on this page');
      setR({ live: 'live', tint: 'tint only', webgl: 'WebGL', css: 'CSS' }[els[0].renderer]);
    };
    read();
    const t = setInterval(read, 1000);
    return () => clearInterval(t);
  }, [group]);
  return r;
}

const fmt = (v, step) => (typeof v === 'number' ? (step >= 1 ? String(Math.round(v)) : v.toFixed(Math.min(3, String(step).split('.')[1]?.length || 2))) : String(v));

/** One setting: label + control + reset dot. */
function Setting({ k, rule, value, changed, webglOnly, onChange, onReset }) {
  const head = (
    <span className="labInsLabel">
      {rule.label}
      {webglOnly && <em> WebGL</em>}
      {changed && (
        <button type="button" className="labInsReset" onClick={onReset} title="Back to the config value">
          reset
        </button>
      )}
    </span>
  );
  const cls = `labInsRow${changed ? ' changed' : ''}`;
  switch (rule.type) {
    case 'number':
      return (
        <label className={cls}>
          {head}
          <span className="labInsRange">
            <input type="range" min={rule.min} max={rule.max} step={rule.step} value={value ?? rule.min} onChange={(e) => onChange(Number(e.target.value))} />
            <input type="number" min={rule.min} max={rule.max} step={rule.step} value={value ?? ''} onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))} aria-label={`${rule.label} value`} />
          </span>
        </label>
      );
    case 'radius': {
      const auto = value === 'auto';
      return (
        <label className={cls}>
          {head}
          <span className="labInsRange">
            <span className="labInsCheck">
              <input type="checkbox" checked={auto} onChange={(e) => onChange(e.target.checked ? 'auto' : 16)} /> auto
            </span>
            {!auto && <input type="range" min={rule.min} max={rule.max} step={rule.step} value={value} onChange={(e) => onChange(Number(e.target.value))} />}
            {!auto && <span className="labInsVal">{value}px</span>}
          </span>
        </label>
      );
    }
    case 'size':
      return (
        <div className={cls}>
          {head}
          {['x', 'y'].map((axis) => (
            <span key={axis} className="labInsRange">
              <span className="labInsAxis">{axis.toUpperCase()}</span>
              <input type="range" min={rule.min} max={rule.max} step={rule.step} value={value?.[axis] ?? 1} onChange={(e) => onChange({ ...value, [axis]: Number(e.target.value) })} aria-label={`${rule.label} ${axis}`} />
              <span className="labInsVal">{fmt(value?.[axis] ?? 1, rule.step)}</span>
            </span>
          ))}
        </div>
      );
    case 'enum':
      return (
        <label className={cls}>
          {head}
          <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {rule.values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      );
    case 'bool':
      return (
        <label className={cls}>
          <span className="labInsCheck">
            <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> {head}
          </span>
        </label>
      );
    case 'color': {
      // Tint: one colour (a gradient tint shows its first colour; picking one
      // replaces the gradient with that colour).
      const hex = typeof value === 'string' ? value : value?.from;
      return (
        <label className={cls}>
          {head}
          <ColourInput value={hex} onChange={onChange} />
        </label>
      );
    }
    default:
      return (
        <label className={cls}>
          {head}
          <ColourInput value={value} onChange={onChange} />
        </label>
      );
  }
}

/** Colour picker when the value is #rrggbb, else a text box (e.g. var(--x)). */
function ColourInput({ value, onChange }) {
  const isHex = /^#[0-9a-f]{6}$/i.test(value || '');
  return (
    <span className="labInsRange">
      <input type="color" value={isHex ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      <input type="text" value={value ?? ''} placeholder="(from CSS)" onChange={(e) => onChange(e.target.value || null)} />
    </span>
  );
}
