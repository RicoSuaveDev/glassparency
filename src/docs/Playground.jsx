/**
 * =============================================================================
 * src/docs/Playground.jsx — One control's docs page: live demo, props panel, code
 * =============================================================================
 * Layout (docs.css), top to bottom:
 *   title + blurb          from the control's entry (controls.jsx)
 *   Stage                  the live control over a photo — the same see-through
 *                          window onto the glass's backdrop as the UI lab
 *   Props panel            the entry's knobs: sliders, toggles, selects
 *   Code                   React / Script / HTML tabs, rewritten on every
 *                          knob change, each with a Copy button
 *
 * Stage, Knob and CodeTabs are exported: the config builder uses them too.
 * The panels are plain HTML (not glass). They are NOT data-glass-ignore:
 * glass that floats over them — bottom sheets, toasts, menus — refracts a
 * picture of the page, and a panel left out of it simply wasn't there (the
 * sheet showed only the backdrop photo). Their changes (knobs, code) just
 * make the next picture a little later; only the stage's photo copy and its
 * backdrop buttons stay left out.
 * =============================================================================
 */
import { useEffect, useMemo, useState } from 'react';
import { addGlassPresets, resolveGlass } from 'glassparency';
import { GLASS_SCHEMA } from 'glassparency/devtools';
import { BACKDROPS } from '../lab/backdrops';
import { PAGES } from './pages';
import { hrefFor } from './route';

/** The knobs' starting values (a 'glass' knob starts at null = "from the group"). */
const initialValues = (control) => Object.fromEntries(control.knobs.map((k) => [k.key, k.type === 'glass' ? null : k.value]));

export default function Playground({ id }) {
  const control = PAGES.find((c) => c.id === id) || PAGES[0];
  // The knob values belong to one page: switching pages starts from the new
  // page's defaults in the SAME render (an effect resetting them afterwards
  // let one render run the new page's code with the old page's values).
  const [store, setStore] = useState(() => ({ id: control.id, v: initialValues(control) }));
  const v = store.id === control.id ? store.v : initialValues(control);
  const set = (key, value) => setStore((s) => ({ id: control.id, v: { ...(s.id === control.id ? s.v : initialValues(control)), [key]: value } }));
  const reset = () => setStore({ id: control.id, v: initialValues(control) });
  const { Demo } = control;
  // One tab per code function (react / script / html; the setup page has vue / svelte / tailwind / next).
  const snippets = useMemo(() => Object.fromEntries(Object.entries(control.code).map(([tab, fn]) => [tab, fn(v)])), [control, v]);
  // Knobs that are fixed per instance re-create the demo (controls.jsx remount).
  const demoKey = `${control.id}:${control.remount ? control.remount(v) : ''}`;

  return (
    <article className="docPage">
      <header className="docHead">
        <p className="kicker">Playground · {control.section}</p>
        <h1 className="docTitle">{control.title}</h1>
        <p className="lede">{control.blurb}</p>
        <p className="docGroups">
          Config groups:{' '}
          {control.groups.map((g, i) => (
            <span key={g}>
              {i > 0 && ', '}
              <a href={`${hrefFor('builder')}?group=${g}`} className="mono">
                {g}
              </a>
            </span>
          ))}
          <span className="docMuted"> — tune them in the config builder</span>
        </p>
      </header>

      {/* (noStage: a code-only page, e.g. the framework setup) */}
      {!control.noStage && <Stage><Demo key={demoKey} v={v} /></Stage>}

      <div className="docSplit">
        <section className="docPanel" aria-label="Props">
          <div className="docPanelHead">
            <strong>Props</strong>
            <button type="button" className="docLink" onClick={reset}>
              Reset
            </button>
          </div>
          {control.knobs.map((k) => (
            <Knob key={k.key} knob={k} value={v[k.key]} group={v.group || control.groups[0]} onChange={(x) => set(k.key, x)} />
          ))}
        </section>
        <CodeTabs key={control.id} snippets={snippets} />
      </div>
    </article>
  );
}

// --- The stage ---------------------------------------------------------------------------
/**
 * The live glass over a photo. Like the lab's stage (lab.css): the photo is
 * global.backgroundImage (a preset pack, so the page's own config stays on
 * top), the base canvas refracts it, and a CSS copy fixed to the window —
 * clipped to the stage — is what you see. Nothing here may set z-index /
 * overflow / transform on the stage: the controls' HTML must stack with the
 * glass canvases.
 */
export function Stage({ children, className = '' }) {
  const [backdrop, setBackdrop] = useState('lake');
  const image = BACKDROPS[backdrop]?.url || '';
  useEffect(() => (image ? addGlassPresets({ global: { backgroundImage: image } }) : undefined), [image]);
  return (
    <div className={`docStage ${className}`}>
      <div className="docBackdrop" aria-hidden="true" data-glass-ignore="">
        <div className="docBackdropImg" data-glass-ignore="" style={{ backgroundImage: `url("${image}")` }} />
      </div>
      <div className="docStageBar" data-glass-ignore="">
        {Object.entries(BACKDROPS).map(([k, b]) => (
          <button key={k} type="button" aria-pressed={backdrop === k} onClick={() => setBackdrop(k)}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="docStageBody">{children}</div>
    </div>
  );
}

// --- Knobs -------------------------------------------------------------------------------
/**
 * One knob. Types:
 *   range   { min, max, step }        slider + number box
 *   bool                               checkbox
 *   select  { options: {value: label} } (extra: options listed first)
 *   text                               text box
 *   color                              colour picker + text box (any CSS colour)
 *   glass   { key }                    a GLASS_SCHEMA setting: label, range and
 *                                      type come from the library; null = the
 *                                      group's own value (shown, not set)
 */
export function Knob({ knob, value, group, onChange }) {
  if (knob.type === 'glass') return <GlassKnob k={knob.key} value={value} group={group} onChange={onChange} />;
  switch (knob.type) {
    case 'range':
      return (
        <label className="docKnob">
          <span className="docKnobLabel">{knob.label}</span>
          <span className="docKnobRange">
            <input type="range" min={knob.min} max={knob.max} step={knob.step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
            <input type="number" min={knob.min} max={knob.max} step={knob.step} value={value} onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))} aria-label={`${knob.label} value`} />
          </span>
        </label>
      );
    case 'color':
      return (
        <label className="docKnob">
          <span className="docKnobLabel">{knob.label}</span>
          <ColourField value={value} onChange={(x) => onChange(x || knob.value)} />
        </label>
      );
    case 'bool':
      return (
        <label className="docKnob docKnobCheck">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <span className="docKnobLabel">{knob.label}</span>
        </label>
      );
    case 'select':
      return (
        <label className="docKnob">
          <span className="docKnobLabel">{knob.label}</span>
          <select value={value} onChange={(e) => onChange(e.target.value)}>
            {Object.entries({ ...(knob.extra || {}), ...knob.options }).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      );
    default:
      return (
        <label className="docKnob">
          <span className="docKnobLabel">{knob.label}</span>
          <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
  }
}

/** A per-element glass setting, described by the library's GLASS_SCHEMA. */
function GlassKnob({ k, value, group, onChange }) {
  const rule = GLASS_SCHEMA[k];
  if (!rule) return null; // (a key this build doesn't have)
  // What the group gives it right now (shown while the knob isn't set).
  const fromGroup = resolveGlass(group)[k];
  const set = value !== null && value !== undefined;
  const head = (
    <span className="docKnobLabel">
      {rule.label}
      {set ? (
        <button type="button" className="docLink" onClick={() => onChange(null)} title="Back to the group's value">
          reset
        </button>
      ) : (
        <em className="docMuted"> group</em>
      )}
    </span>
  );
  if (rule.type === 'number') {
    const shown = set ? value : fromGroup;
    return (
      <label className={`docKnob${set ? ' changed' : ''}`}>
        {head}
        <span className="docKnobRange">
          <input type="range" min={rule.min} max={rule.max} step={rule.step} value={shown ?? rule.min} onChange={(e) => onChange(Number(e.target.value))} />
          <input type="number" min={rule.min} max={rule.max} step={rule.step} value={shown ?? ''} onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))} aria-label={`${rule.label} value`} />
        </span>
      </label>
    );
  }
  if (rule.type === 'enum') {
    return (
      <label className={`docKnob${set ? ' changed' : ''}`}>
        {head}
        <select value={set ? value : ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">group ({String(fromGroup)})</option>
          {rule.values.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (rule.type === 'color') {
    // A gradient tint shows its first colour; picking a colour replaces it.
    const hex = set ? value : fromGroup?.from;
    return (
      <label className={`docKnob${set ? ' changed' : ''}`}>
        {head}
        <ColourField value={hex} onChange={onChange} />
      </label>
    );
  }
  return null;
}

/** A colour picker when the value is #rrggbb, plus a text box for any CSS colour. */
export function ColourField({ value, onChange }) {
  const isHex = /^#[0-9a-f]{6}$/i.test(value || '');
  return (
    <span className="docKnobRange">
      <input type="color" value={isHex ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      <input type="text" value={value ?? ''} placeholder="#hex, var(--x)…" onChange={(e) => onChange(e.target.value || null)} />
    </span>
  );
}

// --- Code tabs ---------------------------------------------------------------------------
const TAB_LABELS = { react: 'React', script: 'Script build', html: 'HTML markup', vue: 'Vue', svelte: 'Svelte', tailwind: 'Tailwind CSS', next: 'Next.js', json: 'JSON', configure: 'configureGlass', provider: '<GlassProvider>', window: 'Script config' };

/**
 * Tabs of copyable code. snippets: { tab: string | null } (null = "no
 * version for this tab", shown as a note instead of code). Optional
 * `downloads`: { tab: { name, type } } adds a Download button for that tab.
 */
export function CodeTabs({ snippets, downloads, title = 'Code' }) {
  const tabs = Object.keys(snippets);
  const [tab, setTab] = useState(tabs[0]);
  const [copied, setCopied] = useState(false);
  const current = tabs.includes(tab) ? tab : tabs[0];
  const text = snippets[current];

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      window.prompt('Copy this:', text);
    }
  }
  function download() {
    const d = downloads[current];
    const url = URL.createObjectURL(new Blob([text], { type: d.type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = d.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="docCode" aria-label={title}>
      <div className="docCodeHead">
        <div className="docTabs" role="tablist" aria-label={`${title} format`}>
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={t === current} onClick={() => setTab(t)}>
              {TAB_LABELS[t] || t}
            </button>
          ))}
        </div>
        <div className="docCodeActions">
          {downloads?.[current] && text != null && (
            <button type="button" onClick={download}>
              Download
            </button>
          )}
          {text != null && (
            <button type="button" className="primary" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>
      {text != null ? (
        <pre className="docPre mono">
          <code>{text}</code>
        </pre>
      ) : (
        <p className="docPreNone">No markup version: this one is JavaScript only (see the Script build tab).</p>
      )}
    </section>
  );
}
