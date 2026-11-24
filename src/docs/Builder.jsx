/**
 * =============================================================================
 * src/docs/Builder.jsx — The online config builder
 * =============================================================================
 * Tune any config group (or the shared "defaults") for light or dark mode, in
 * any state (normal / hover / pressed / disabled), live on sample glass — then
 * export a ready-to-paste config: JSON, configureGlass({…}), <GlassProvider
 * config> or the script build's window.GlassparencyConfig. Copy or download.
 *
 * WHERE THE CONTROLS COME FROM — nothing here lists the settings by hand:
 *   GLASS_SCHEMA ("glassparency/devtools", the library's config.js SCHEMA)
 *     every tunable key: type, min / max / step, label and section. A key
 *     added to the library shows up here by itself, in its section (new
 *     sections too); a type this page doesn't know gets a JSON text box.
 *   glass.config.json ("glassparency/glass.config.json", shipped in the
 *     package) — the built-in values every control starts from, the group
 *     list and the built-in dark theme.
 *   GLASS_STATE_KEYS — the state blocks (hover / pressed / disabled).
 * Only the `global` block is mirrored by hand (GLOBAL_KNOBS below): it isn't
 * in GLASS_SCHEMA. It's export-only — the page's own global settings stay on.
 *
 * LIVE PREVIEW: the changes are a preset pack (addGlassPresets) — merged over
 * the built-in presets and under the page's own config, exactly where a
 * site's configureGlass() would sit — replaced on every change and removed
 * when you leave the page. Editing a state forces it on the group
 * (setGlassForcedState), so you see "pressed" without holding the mouse down.
 *
 * Your changes are kept in this browser only (localStorage, best effort) so
 * a reload doesn't lose them; "Reset all" clears them.
 * =============================================================================
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Glass,
  GlassSwitch,
  GlassSlider,
  GlassCheckbox,
  GlassSegmented,
  GlassProgress,
  GlassTextField,
  addGlassPresets,
  GLASS_LAYERS,
  GLASS_VERSION,
} from 'glassparency';
import { GLASS_SCHEMA, GLASS_STATE_KEYS, setGlassForcedState } from 'glassparency/devtools';
import BUILT_IN from 'glassparency/glass.config.json';
import { Icon } from '../lab/icons';
import { CodeTabs, ColourField, Stage } from './Playground';
import { js } from './codegen';

const STORE_KEY = 'gp-docs-builder';
const EMPTY = () => ({ light: { defaults: {}, groups: {} }, dark: { defaults: {}, groups: {} }, global: {} });

/** Sections in the schema's own order (a new section appears where its first key is). */
const SECTIONS = [...new Set(Object.values(GLASS_SCHEMA).map((r) => r.section))];
const OPEN_SECTIONS = new Set(['General', 'Glass']);

/**
 * The `global` block, mirrored from index.d.ts GlassGlobal (it isn't in
 * GLASS_SCHEMA). Export-only: these don't change this page.
 */
const GLOBAL_KNOBS = [
  { key: 'quality', type: 'enum', values: ['auto', 'high', 'medium', 'low'], label: 'Quality', def: 'auto' },
  { key: 'blur', type: 'enum', values: ['smooth', 'mip'], label: 'WebGL frost (blur)', def: 'smooth' },
  { key: 'blend', type: 'enum', values: ['srgb', 'linear'], label: 'Colour mixing (blend)', def: 'srgb' },
  { key: 'cssGlass', type: 'enum', values: ['true', 'full', 'lite', 'false'], label: 'CSS fallback glass', def: 'true' },
  { key: 'theme', type: 'enum', values: ['auto', 'light', 'dark'], label: 'Theme', def: 'auto' },
  { key: 'anchor', type: 'enum', values: ['page', 'viewport'], label: 'Canvas anchor', def: 'page' },
  { key: 'root', type: 'string', label: 'Root element (CSS selector)', def: 'body' },
  { key: 'mobileQuery', type: 'string', label: 'CSS-only layout (media query)', def: '(max-width: 860px)' },
];

// --- Config maths (mirrors config.js mergeConfig: tint / background replace whole) ------------
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const REPLACE_WHOLE = new Set(['tint', 'background']);
function merge(base, extra) {
  if (!isObj(extra)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) out[k] = isObj(v) && isObj(base?.[k]) && !REPLACE_WHOLE.has(k) ? merge(base[k], v) : v;
  return out;
}
/** Drop empty objects (an untouched state block, a group with nothing left…). */
function prune(o) {
  if (!isObj(o)) return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const p = isObj(v) && !REPLACE_WHOLE.has(k) ? prune(v) : v;
    if (isObj(p) && !Object.keys(p).length) continue;
    out[k] = p;
  }
  return out;
}
/** The draft → a config in glass.config.json's format (only what changed). */
function toConfig(d) {
  return prune({ global: d.global, defaults: d.light.defaults, groups: d.light.groups, themes: { dark: { defaults: d.dark.defaults, groups: d.dark.groups } } });
}

/** The block a (theme, target, state) edit lives in, inside a config / draft-shaped object. */
function blockOf(cfg, theme, target, state) {
  const root = theme === 'dark' ? cfg.themes?.dark : cfg;
  const level = target === 'defaults' ? root?.defaults : root?.groups?.[target];
  return state === 'normal' ? level : level?.[state];
}

/**
 * The value a key has at (theme, target, state) in a merged config, before
 * the style rules / validation (what you'd see written in the JSON): the last
 * layer that sets it, in config.js's order —
 * defaults → dark defaults → group → dark group (then the state blocks).
 */
function valueAt(cfg, theme, target, state, key) {
  const layers = [cfg.defaults];
  if (theme === 'dark') layers.push(cfg.themes?.dark?.defaults);
  if (target !== 'defaults') {
    layers.push(cfg.groups?.[target]);
    if (theme === 'dark') layers.push(cfg.themes?.dark?.groups?.[target]);
  }
  const pick = (ls) => {
    let v;
    for (const l of ls) {
      if (!l || l[key] === undefined) continue;
      // scale / bleed / padding merge key by key (config.js mergeProps)
      v = isObj(l[key]) && isObj(v) && !REPLACE_WHOLE.has(key) ? { ...v, ...l[key] } : l[key];
    }
    return v;
  };
  const normal = pick(layers);
  if (state === 'normal') return normal;
  const st = pick(layers.map((l) => l?.[state]));
  return st === undefined ? normal : isObj(st) && isObj(normal) ? { ...normal, ...st } : st;
}

/** How many settings a block changes (its state blocks included). */
function countBlock(b) {
  if (!isObj(b)) return 0;
  return Object.entries(b).reduce((n, [k, v]) => n + (GLASS_STATE_KEYS.includes(k) ? countBlock(v) : 1), 0);
}
/** How many settings the whole draft changes (both themes, every group, global). */
function countDraft(d) {
  const theme = (t) => countBlock(t.defaults) + Object.values(t.groups).reduce((n, g) => n + countBlock(g), 0);
  return theme(d.light) + theme(d.dark) + Object.keys(d.global).length;
}

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (d && isObj(d.light) && isObj(d.dark)) return { ...EMPTY(), ...d };
  } catch {
    /* private window / blocked storage: start clean */
  }
  return EMPTY();
}
function saveDraft(d) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

export default function Builder({ theme, setTheme, query }) {
  const [draft, setDraft] = useState(loadDraft);
  const builtInGroups = useMemo(() => Object.keys(BUILT_IN.groups || {}), []);
  // Groups you added yourself (any name in the draft that isn't built in).
  const customGroups = useMemo(() => [...new Set([...Object.keys(draft.light.groups), ...Object.keys(draft.dark.groups)])].filter((g) => !builtInGroups.includes(g)), [draft, builtInGroups]);
  const [target, setTarget] = useState(() => {
    const g = query?.get('group');
    return g && (BUILT_IN.groups?.[g] || g === 'defaults') ? g : 'button';
  });
  const [state, setState] = useState('normal');
  const [newGroup, setNewGroup] = useState('');
  const [full, setFull] = useState(false);
  const editTheme = theme === 'dark' ? 'dark' : 'light';

  // ?group= changed while the page is open (a link from a playground page).
  const qGroup = query?.get('group');
  useEffect(() => {
    if (qGroup && (BUILT_IN.groups?.[qGroup] || qGroup === 'defaults')) setTarget(qGroup);
  }, [qGroup]);

  const config = useMemo(() => toConfig(draft), [draft]);
  const merged = useMemo(() => merge(BUILT_IN, config), [config]);

  // Live preview: the changes as a preset pack (see the header).
  useEffect(() => {
    saveDraft(draft);
    return Object.keys(config).length ? addGlassPresets(config) : undefined;
  }, [config, draft]);

  // Editing a state: show the group in it (not for "defaults": it isn't a group).
  useEffect(() => {
    if (state === 'normal' || target === 'defaults') return undefined;
    setGlassForcedState(target, state);
    return () => setGlassForcedState(target, null);
  }, [target, state]);

  // --- Editing the draft ---------------------------------------------------------------
  // The draft in config shape (light at the top, dark under themes.dark).
  const draftCfg = { ...draft.light, themes: { dark: draft.dark } };
  const own = blockOf(draftCfg, editTheme, target, state) || {};
  const update = (fn) =>
    setDraft((old) => {
      const d = JSON.parse(JSON.stringify(old));
      const root = d[editTheme];
      let level;
      if (target === 'defaults') level = root.defaults;
      else level = root.groups[target] ||= {};
      const block = state === 'normal' ? level : (level[state] ||= {});
      fn(block);
      return d;
    });
  const setKey = (key, value) => update((b) => void (b[key] = value));
  const resetKey = (key) => update((b) => void delete b[key]);
  const resetTarget = () =>
    setDraft((old) => {
      const d = JSON.parse(JSON.stringify(old));
      const root = d[editTheme];
      if (target === 'defaults') {
        if (state === 'normal') root.defaults = Object.fromEntries(Object.entries(root.defaults).filter(([k]) => GLASS_STATE_KEYS.includes(k)));
        else delete root.defaults[state];
      } else if (root.groups[target]) {
        if (state === 'normal') root.groups[target] = Object.fromEntries(Object.entries(root.groups[target]).filter(([k]) => GLASS_STATE_KEYS.includes(k)));
        else delete root.groups[target][state];
      }
      return d;
    });
  const resetAll = () => setDraft(EMPTY());
  const setGlobal = (key, value) =>
    setDraft((old) => {
      const g = { ...old.global };
      if (value === undefined) delete g[key];
      else g[key] = value;
      return { ...old, global: g };
    });
  const addGroup = () => {
    const name = newGroup.trim();
    if (!/^[A-Za-z_$][\w$-]*$/.test(name)) return;
    setDraft((old) => ({ ...old, light: { ...old.light, groups: { ...old.light.groups, [name]: old.light.groups[name] || { tintOpacity: 0.3 } } } }));
    setTarget(name);
    setNewGroup('');
  };

  const total = countDraft(draft);
  const changedHere = Object.keys(own).filter((k) => !GLASS_STATE_KEYS.includes(k)).length;

  // --- Export ----------------------------------------------------------------------------
  const exportCfg = full ? merge(BUILT_IN, config) : config;
  const snippets = useMemo(() => {
    const c = config;
    const body = js(c, 0, 90);
    return {
      json: JSON.stringify(exportCfg, null, 2),
      configure: `import { configureGlass } from 'glassparency';\n\n// Merged over the built-in presets: only what you changed.\nconfigureGlass(${body});`,
      provider: `import { GlassProvider } from 'glassparency';\n\nconst glassConfig = ${body};\n\n<GlassProvider config={glassConfig}>\n  <App />\n</GlassProvider>`,
      window: `<!-- Before the script tag -->\n<script>\n  window.GlassparencyConfig = ${js(c, 2, 90)};\n</script>\n<script src="https://unpkg.com/glassparency/dist/glassparency.standalone.js"></script>`,
    };
  }, [config, exportCfg]);
  const downloads = {
    json: { name: full ? 'glass.config.json' : 'glass.changes.json', type: 'application/json' },
    configure: { name: 'glass-config.js', type: 'text/javascript' },
  };

  const keys = Object.entries(GLASS_SCHEMA);

  return (
    <article className="docPage">
      <header className="docHead">
        <p className="kicker">Config builder · glassparency {GLASS_VERSION}</p>
        <h1 className="docTitle">Build your config.</h1>
        <p className="lede">
          Pick a group, tune it for light and dark, in any state, and watch the sample glass change. Every setting comes straight from the library’s schema. Then copy or download the config: <b>only what you changed</b>, merged over the built-in presets.
        </p>
      </header>

      <div className="docBuilder">
        <section className="docPanel docBuilderPanel" data-glass-ignore="" aria-label="Settings">
          <div className="docPanelHead">
            <strong>Edit</strong>
            <span className="docMuted">{total} change{total === 1 ? '' : 's'} in all</span>
          </div>

          <label className="docKnob">
            <span className="docKnobLabel">Group</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="defaults">defaults (every group)</option>
              <optgroup label="Built-in groups">
                {builtInGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                    {countBlock(blockOf(draftCfg, editTheme, g, 'normal')) ? ' •' : ''}
                  </option>
                ))}
              </optgroup>
              {customGroups.length > 0 && (
                <optgroup label="Your groups">
                  {customGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <div className="docKnob">
            <span className="docKnobLabel">New group</span>
            <span className="docKnobRange">
              <input type="text" value={newGroup} placeholder="promoCard" onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGroup()} aria-label="New group name" />
              <button type="button" className="docBtn" onClick={addGroup} disabled={!newGroup.trim()}>
                Add
              </button>
            </span>
          </div>
          <div className="docSegs">
            <span className="docKnobLabel">Theme</span>
            {['light', 'dark'].map((t) => (
              <button key={t} type="button" aria-pressed={editTheme === t} onClick={() => setTheme(t)}>
                {t === 'light' ? 'Light' : 'Dark (themes.dark)'}
              </button>
            ))}
          </div>
          <div className="docSegs">
            <span className="docKnobLabel">State</span>
            {['normal', ...GLASS_STATE_KEYS].map((s) => (
              <button key={s} type="button" aria-pressed={state === s} onClick={() => setState(s)}>
                {s}
              </button>
            ))}
          </div>
          <p className="docMeta">
            Editing <code>{target === 'defaults' ? 'defaults' : `groups.${target}`}</code>
            {editTheme === 'dark' && ' in themes.dark'}
            {state !== 'normal' && <> · <code>{state}</code> block{target !== 'defaults' && ' (shown on the samples)'}</>}
          </p>
          <div className="docPanelActions">
            <button type="button" className="docBtn" onClick={resetTarget} disabled={!changedHere}>
              Reset this ({changedHere})
            </button>
            <button type="button" className="docBtn" onClick={resetAll} disabled={!total}>
              Reset all
            </button>
          </div>

          <div className="docSchema">
            {SECTIONS.map((section) => {
              const rows = keys.filter(([, r]) => r.section === section);
              if (!rows.length) return null;
              const n = rows.filter(([k]) => k in own).length;
              return (
                <details key={section} open={OPEN_SECTIONS.has(section)}>
                  <summary>
                    {section}
                    {n > 0 && <span className="docBadge">{n}</span>}
                  </summary>
                  {rows.map(([key, rule]) => (
                    <SchemaRow key={key} k={key} rule={rule} value={valueAt(merged, editTheme, target, state, key)} changed={key in own} onChange={(v) => setKey(key, v)} onReset={() => resetKey(key)} />
                  ))}
                </details>
              );
            })}
            <details>
              <summary>
                Global <em className="docMuted">(export only)</em>
                {Object.keys(draft.global).length > 0 && <span className="docBadge">{Object.keys(draft.global).length}</span>}
              </summary>
              <p className="docMeta">Page-wide switches (not per group). They go in the exported config but don’t change this page.</p>
              {GLOBAL_KNOBS.map((g) => (
                <GlobalRow key={g.key} knob={g} value={draft.global[g.key]} onChange={(v) => setGlobal(g.key, v)} />
              ))}
            </details>
          </div>
        </section>

        <div className="docBuilderMain">
          <Stage className="docBuilderStage">
            <Samples target={target} />
          </Stage>
          <label className="docKnob docKnobCheck docFull">
            <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
            <span className="docKnobLabel">JSON tab: the full file (built-in presets + your changes) instead of just the changes</span>
          </label>
          <CodeTabs title="Export" snippets={snippets} downloads={downloads} />
        </div>
      </div>
    </article>
  );
}

// --- One schema setting ----------------------------------------------------------------------
/**
 * A control for any GLASS_SCHEMA type: number, bool, enum, radius, size,
 * sides, color, string, layer, tier — and a JSON box for any other type, so
 * a new kind of setting is still editable (and exportable).
 */
function SchemaRow({ k, rule, value, changed, onChange, onReset }) {
  const head = (
    <span className="docKnobLabel">
      {rule.label}
      <code className="docKey">{k}</code>
      {changed && (
        <button type="button" className="docLink" onClick={onReset} title="Back to the built-in value">
          reset
        </button>
      )}
    </span>
  );
  const cls = `docKnob${changed ? ' changed' : ''}`;
  switch (rule.type) {
    case 'number': {
      const n = value ?? (rule.nullable ? '' : rule.min);
      return (
        <label className={cls}>
          {head}
          <span className="docKnobRange">
            <input type="range" min={rule.min} max={rule.max} step={rule.step} value={n === '' ? rule.min : n} onChange={(e) => onChange(Number(e.target.value))} />
            <input type="number" min={rule.min} max={rule.max} step={rule.step} value={n} placeholder={rule.nullable ? 'none' : ''} onChange={(e) => onChange(e.target.value === '' ? (rule.nullable ? null : rule.min) : Number(e.target.value))} aria-label={`${rule.label} value`} />
          </span>
        </label>
      );
    }
    case 'bool':
      return (
        <label className={`${cls} docKnobCheck`}>
          <input type="checkbox" checked={value === undefined ? true : Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {head}
        </label>
      );
    case 'enum':
    case 'layer':
    case 'tier': {
      const values = rule.type === 'layer' ? ['auto', ...GLASS_LAYERS] : rule.type === 'tier' ? ['auto', 0, 1, 2, 3, 4, 5] : rule.values;
      return (
        <label className={cls}>
          {head}
          <select value={String(value ?? values[0])} onChange={(e) => onChange(rule.type === 'tier' && e.target.value !== 'auto' ? Number(e.target.value) : e.target.value)}>
            {values.map((x) => (
              <option key={x} value={String(x)}>
                {String(x)}
              </option>
            ))}
          </select>
        </label>
      );
    }
    case 'radius': {
      const auto = value === undefined || value === 'auto';
      return (
        <div className={cls}>
          {head}
          <span className="docKnobRange">
            <label className="docKnobCheck">
              <input type="checkbox" checked={auto} onChange={(e) => onChange(e.target.checked ? 'auto' : 16)} /> auto
            </label>
            {!auto && <input type="range" min={rule.min} max={rule.max} step={rule.step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={rule.label} />}
            {!auto && <span className="docVal">{value}px</span>}
          </span>
        </div>
      );
    }
    case 'size':
      return (
        <div className={cls}>
          {head}
          {['x', 'y'].map((axis) => (
            <span key={axis} className="docKnobRange">
              <span className="docAxis">{axis.toUpperCase()}</span>
              <input type="range" min={rule.min} max={rule.max} step={rule.step} value={value?.[axis] ?? 1} onChange={(e) => onChange({ ...(value || {}), [axis]: Number(e.target.value) })} aria-label={`${rule.label} ${axis}`} />
              <span className="docVal">{Number(value?.[axis] ?? 1).toFixed(2)}</span>
            </span>
          ))}
        </div>
      );
    case 'sides':
      return (
        <div className={cls}>
          {head}
          <span className="docSides">
            {['top', 'right', 'bottom', 'left'].map((side) => (
              <label key={side}>
                <span className="docAxis">{side}</span>
                <input type="number" min={rule.min} max={rule.max} step={rule.step} value={value?.[side] ?? 0} onChange={(e) => onChange({ ...(value || {}), [side]: Number(e.target.value) || 0 })} />
              </label>
            ))}
          </span>
        </div>
      );
    case 'color':
      return <TintRow head={head} cls={cls} value={value} onChange={onChange} />;
    case 'string': {
      const colourish = /colou?r/i.test(k) || /colou?r/i.test(rule.label);
      return (
        <label className={cls}>
          {head}
          {colourish ? <ColourField value={value ?? ''} onChange={(v) => onChange(v ?? null)} /> : <input type="text" value={value ?? ''} placeholder="none" onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} />}
        </label>
      );
    }
    default:
      return <JsonRow head={head} cls={cls} value={value} onChange={onChange} />;
  }
}

/** Tint: one colour, or a gradient { from, via?, to, angle }. */
function TintRow({ head, cls, value, onChange }) {
  const grad = isObj(value);
  return (
    <div className={cls}>
      {head}
      <label className="docKnobCheck">
        <input type="checkbox" checked={grad} onChange={(e) => onChange(e.target.checked ? { from: typeof value === 'string' ? value : '#ffffff', to: '#c7d2fe', angle: 180 } : value?.from || '#ffffff')} /> gradient
      </label>
      {grad ? (
        <>
          <ColourField value={value.from} onChange={(v) => onChange({ ...value, from: v || '#ffffff' })} />
          <ColourField value={value.to} onChange={(v) => onChange({ ...value, to: v || '#ffffff' })} />
          <span className="docKnobRange">
            <span className="docAxis">angle</span>
            <input type="range" min={0} max={360} step={1} value={value.angle ?? 180} onChange={(e) => onChange({ ...value, angle: Number(e.target.value) })} aria-label="Gradient angle" />
            <span className="docVal">{value.angle ?? 180}°</span>
          </span>
        </>
      ) : (
        <ColourField value={value} onChange={(v) => onChange(v || '#ffffff')} />
      )}
    </div>
  );
}

/** Any other type: edit it as JSON (applied once it parses). */
function JsonRow({ head, cls, value, onChange }) {
  const [text, setText] = useState(JSON.stringify(value ?? null));
  const [bad, setBad] = useState(false);
  useEffect(() => setText(JSON.stringify(value ?? null)), [value]);
  return (
    <label className={cls}>
      {head}
      <input
        type="text"
        className={bad ? 'bad' : ''}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
      />
    </label>
  );
}

/** A `global` setting (export only). undefined = not set (the library's default). */
function GlobalRow({ knob, value, onChange }) {
  const head = (
    <span className="docKnobLabel">
      {knob.label}
      <code className="docKey">global.{knob.key}</code>
      {value !== undefined && (
        <button type="button" className="docLink" onClick={() => onChange(undefined)}>
          reset
        </button>
      )}
    </span>
  );
  if (knob.type === 'enum') {
    const shown = value === undefined ? knob.def : String(value);
    return (
      <label className={`docKnob${value !== undefined ? ' changed' : ''}`}>
        {head}
        <select value={shown} onChange={(e) => onChange(e.target.value === knob.def ? undefined : e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value)}>
          {knob.values.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className={`docKnob${value !== undefined ? ' changed' : ''}`}>
      {head}
      <input type="text" value={value ?? ''} placeholder={knob.def} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)} />
    </label>
  );
}

// --- Sample glass on the stage -----------------------------------------------------------------
/**
 * The group you're editing, big, plus a strip of real controls (their parts
 * use the built-in part groups: switchKnob, sliderFill, segmentedLens…, so
 * tuning a part shows up in its control).
 */
function Samples({ target }) {
  const [on, setOn] = useState(true);
  const [vol, setVol] = useState(60);
  const [seg, setSeg] = useState(1);
  const [check, setCheck] = useState(true);
  const [q, setQ] = useState('');
  const buttonish = /button|chip/i.test(target);
  const group = target === 'defaults' ? 'panel' : target;
  return (
    <div className="docSamples">
      <div className="docSampleMain">
        {buttonish ? (
          <Glass as="button" type="button" key={group} group={group} className="labBtn docSampleBtn">
            {group}
          </Glass>
        ) : (
          <Glass key={group} group={group} className="docSampleBox">
            <strong>{target === 'defaults' ? 'defaults (shown on group "panel")' : group}</strong>
            <span>Sample glass in this group</span>
          </Glass>
        )}
      </div>
      <div className="docSampleStrip">
        <Glass as="button" type="button" group="button" className="labBtn">
          Cancel
        </Glass>
        <Glass as="button" type="button" group="buttonPrimary" className="labBtn">
          Accept
        </Glass>
        <GlassSwitch checked={on} onChange={setOn} aria-label="Sample switch" />
        <GlassCheckbox checked={check} onChange={setCheck}>
          Check
        </GlassCheckbox>
        <GlassSlider className="labSlider" value={vol} onChange={setVol} aria-label="Sample slider" />
        <GlassSegmented className="labSeg docSampleSeg" value={seg} onChange={setSeg} aria-label="Sample segmented">
          {['Day', 'Week', 'Month'].map((t) => (
            <button key={t} type="button" role="tab" data-gp-item>
              {t}
            </button>
          ))}
        </GlassSegmented>
        <GlassTextField className="labField" icon={<Icon name="search" />} clearable value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
        <GlassProgress className="labProg" value={0.6} bead />
      </div>
    </div>
  );
}
