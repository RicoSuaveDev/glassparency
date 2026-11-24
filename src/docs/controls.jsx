/**
 * =============================================================================
 * src/docs/controls.jsx — Every control page of the playground, as data
 * =============================================================================
 * One entry per control in the library README (button / any element, switch,
 * slider, checkbox, radio, text field, tab bar, sidebar, progress, segmented,
 * stepper, range + vertical slider, block slider, popover, menu, select,
 * tooltip, sheet, toasts, morph, shape spring). Each entry is:
 *
 *   id, title, section     where it sits in the docs sidebar
 *   blurb                  one paragraph: what it is / how it behaves
 *   groups                 the config groups its parts use (link to the builder)
 *   knobs                  the props panel (see Knobs in Playground.jsx):
 *                            { key, type: 'range'|'bool'|'select'|'text'|'glass', … }
 *                          'glass' knobs read their label / range from the
 *                          library's own GLASS_SCHEMA and start "from the
 *                          group" (null) until you move them.
 *   remount(v)             (optional) a key: knobs that are fixed per instance
 *                          (two knobs vs one, orientation) re-create the demo
 *   Demo({ v })            the live control, driven by the knob values
 *   code.react / .script / .html (v) → string   the three copyable snippets
 *                          (.html may return null: no markup version exists)
 *
 * The snippets only spell out what differs from the library's defaults, so
 * they stay as short as the README's examples. Everything here uses the
 * published API only (index.d.ts) — nothing private.
 * =============================================================================
 */
import { useEffect, useRef, useState } from 'react';
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
  useGlassMorph,
  useShapeSpring,
} from 'glassparency';
import { Icon } from '../lab/icons';
import { SQUISH } from '../lab/looks';
import { changed, html, htmlAttr, js, jsx, propsAttr, scriptPage } from './codegen';

// --- Shared knobs ------------------------------------------------------------------
/** The config's three looks (config.js STYLES), as a per-element prop. */
export const STYLE_KNOB = { key: 'style', type: 'select', label: 'Style', options: { default: 'Default', crystal: 'Crystal', frosted: 'Frosted' }, value: 'default' };
/** The lab's squish & stretch presets (src/lab/looks.js) for squishing parts. */
const SQUISH_KNOB = {
  key: 'squish',
  type: 'select',
  label: 'Squish & stretch',
  options: Object.fromEntries(Object.entries(SQUISH).map(([k, s]) => [k, s.label])),
  value: 'default',
  extra: { default: 'Group default' },
};
const DISABLED_KNOB = { key: 'disabled', type: 'bool', label: 'Disabled', value: false };
const PLACEMENT_KNOB = { key: 'placement', type: 'select', label: 'Placement', options: { auto: 'Auto', bottom: 'Bottom', top: 'Top' }, value: 'auto' };
const ALIGN_KNOB = { key: 'align', type: 'select', label: 'Align', options: { start: 'Start', center: 'Center', end: 'End' }, value: 'start' };

/** { style } when a style other than default is picked (else undefined). */
export const styleOf = (v) => (v.style && v.style !== 'default' ? { style: v.style } : {});
/** The style + the squish preset's props, for a part that squishes. */
const squishOf = (v) => ({ ...(v.squish && v.squish !== 'default' ? SQUISH[v.squish].props : {}), ...styleOf(v) });
/** { [part]: props } or undefined when props is empty (so the snippet leaves it out). */
export const part = (name, props) => (props && Object.keys(props).length ? { [name]: props } : undefined);
/** undefined when an object is empty. */
export const orNone = (o) => (o && Object.keys(o).length ? o : undefined);
/** The glass knobs that were moved (null = "from the group": left out). */
const glassOf = (v, keys) => {
  const out = {};
  for (const k of keys) if (v[k] !== null && v[k] !== undefined) out[k] = v[k];
  return out;
};
/** A handler placeholder in generated code. */
export const code = (c) => ({ $code: c });

/** A complete React example: imports, an Example component, hooks and the JSX. */
export function reactExample({ names, hooks = [], body, extraImports = [] }) {
  // (hook: undefined = a line that isn't a React hook, e.g. useGlassToaster())
  const reactHooks = [...new Set(hooks.map((h) => h.hook).filter(Boolean))].sort();
  const lines = [];
  if (reactHooks.length) lines.push(`import { ${reactHooks.join(', ')} } from 'react';`);
  lines.push(`import { ${names.join(', ')} } from 'glassparency';`, ...extraImports, '', 'export function Example() {');
  for (const h of hooks) lines.push(`  ${h.line}`);
  if (hooks.length) lines.push('');
  const b = body.split('\n');
  if (b.length === 1) lines.push(`  return ${b[0]};`);
  else lines.push('  return (', ...b.map((l) => `    ${l}`), '  );');
  lines.push('}');
  return lines.join('\n');
}
export const state = (name, init) => {
  const setter = `set${name[0].toUpperCase()}${name.slice(1)}`;
  return { hook: 'useState', line: `const [${name}, ${setter}] = useState(${js(init)});`, setter };
};

/** Keep a demo's own state in step with its "value" knob (and still let you drag). */
export function useKnobState(initial) {
  const [s, setS] = useState(initial);
  const key = JSON.stringify(initial);
  useEffect(() => setS(initial), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [s, setS];
}

const TABS = [
  ['home', 'Home'],
  ['grid', 'New'],
  ['radio', 'Radio'],
  ['library', 'Library'],
  ['search', 'Search'],
];
const SIDE = [
  ['search', 'Search'],
  ['home', 'Home'],
  ['radio', 'Radio'],
  ['clock', 'Recently Added'],
  ['mic', 'Artists'],
  ['album', 'Albums'],
  ['note', 'Songs'],
];
const SEGMENTS = ['Day', 'Week', 'Month', 'Year', 'All'];
const MENU_ITEMS = ['New note', 'Share…', 'Duplicate', 'Rename', 'Delete'];
const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'name', label: 'Name' },
  { value: 'size', label: 'Size' },
  { value: 'kind', label: 'Kind' },
];
const TOAST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>';

// --- The pages -----------------------------------------------------------------------
/** @type {Array<object>} */
export const CONTROLS = [
  // ---- Any element ------------------------------------------------------------------
  {
    id: 'glass',
    title: 'Glass on any element',
    section: 'Basics',
    blurb:
      'Any element gets glass from a config group: <Glass>, useGlass(), data-glassparency="…" or <glass-ui>. Per-element props go on top of the group. Leave a setting on “group” and it keeps the group’s value; move it and the snippet shows just that change.',
    groups: ['button', 'buttonPrimary', 'buttonDanger', 'buttonGhost', 'chip', 'card', 'panel'],
    knobs: [
      { key: 'group', type: 'select', label: 'Group', options: { button: 'button', buttonPrimary: 'buttonPrimary', buttonDanger: 'buttonDanger', buttonGhost: 'buttonGhost', chip: 'chip', card: 'card', panel: 'panel', iconButton: 'iconButton' }, value: 'button' },
      { key: 'label', type: 'text', label: 'Label', value: 'Save' },
      STYLE_KNOB,
      { key: 'shape', type: 'glass' },
      { key: 'tint', type: 'glass' },
      { key: 'tintOpacity', type: 'glass' },
      { key: 'blur', type: 'glass' },
      { key: 'thickness', type: 'glass' },
      { key: 'bevel', type: 'glass' },
      { key: 'ior', type: 'glass' },
      { key: 'rimLight', type: 'glass' },
      { key: 'squish', type: 'glass' },
      { key: 'squishGrow', type: 'glass' },
      { key: 'squishPull', type: 'glass' },
      { key: 'squishBounce', type: 'glass' },
    ],
    Demo({ v }) {
      const [n, setN] = useState(0);
      const box = v.group === 'card' || v.group === 'panel';
      const props = { ...styleOf(v), ...glassOf(v, GLASS_KEYS) };
      return (
        <div className="docDemoCol">
          <Glass as={box ? 'div' : 'button'} type={box ? undefined : 'button'} group={v.group} glass={props} className={box ? 'docCard' : 'labBtn'} onClick={() => setN((x) => x + 1)}>
            {box ? (
              <>
                <strong>{v.label || 'Card'}</strong>
                <span>Any HTML inside: your own CSS styles it.</span>
              </>
            ) : (
              v.label || 'Save'
            )}
          </Glass>
          {!box && <span className="docNote">clicked {n}×</span>}
        </div>
      );
    },
    code: {
      react(v) {
        const props = orNone({ ...styleOf(v), ...glassOf(v, GLASS_KEYS) });
        const box = v.group === 'card' || v.group === 'panel';
        return reactExample({
          names: ['Glass'],
          body: jsx('Glass', { as: box ? 'section' : 'button', group: v.group, glass: props, onClick: box ? undefined : code('() => save()') }, v.label || 'Save'),
        });
      },
      script(v) {
        const props = orNone({ ...styleOf(v), ...glassOf(v, GLASS_KEYS) });
        const box = v.group === 'card' || v.group === 'panel';
        const tag = box ? 'section' : 'button';
        return scriptPage(
          html(tag, { id: 'save' }, v.label || 'Save'),
          `const glass = Glassparency.attach(document.getElementById('save'), ${js(v.group)}${props ? `, ${js(props, 0)}` : ''});\n// glass.merge({ tintOpacity: 0.9 })  ·  glass.destroy()`
        );
      },
      html(v) {
        const props = { ...styleOf(v), ...glassOf(v, GLASS_KEYS) };
        const box = v.group === 'card' || v.group === 'panel';
        const tag = box ? 'section' : 'button';
        return scriptPage(
          [
            html(tag, [htmlAttr('data-glassparency', v.group), propsAttr(props)], v.label || 'Save'),
            '',
            '<!-- or as an element (any framework): -->',
            html('glass-ui', [htmlAttr('group', v.group), propsAttr(props, 'props')], v.label || 'Save'),
          ].join('\n')
        );
      },
    },
  },

  // ---- Switch -------------------------------------------------------------------------
  {
    id: 'switch',
    title: 'Switch',
    section: 'Controls',
    blurb: 'Click it, or drag the knob: while pressed, the solid knob swells into clear glass that bends the track. The track colour fades between off and on as the knob moves. Space / Enter toggles it.',
    groups: ['switch', 'switchOn', 'switchKnob', 'switchKnobActive'],
    knobs: [{ key: 'checked', type: 'bool', label: 'Checked (starts)', value: true }, DISABLED_KNOB, { key: 'label', type: 'text', label: 'aria-label', value: 'Wi-Fi' }, STYLE_KNOB],
    Demo({ v }) {
      const [on, setOn] = useKnobState(v.checked);
      return (
        <div className="docDemoCol">
          <GlassSwitch checked={on} onChange={setOn} disabled={v.disabled} glassProps={part('track', styleOf(v))} aria-label={v.label} />
          <span className="docNote">{on ? 'on' : 'off'}</span>
        </div>
      );
    },
    code: {
      react(v) {
        const s = state('on', v.checked);
        return reactExample({
          names: ['GlassSwitch'],
          hooks: [s],
          body: jsx('GlassSwitch', { checked: code('on'), onChange: code(s.setter), disabled: v.disabled, glassProps: part('track', styleOf(v)), 'aria-label': v.label }),
        });
      },
      script(v) {
        const opts = { checked: v.checked, disabled: v.disabled || undefined, props: part('track', styleOf(v)), onChange: code('(on) => console.log(on)') };
        return scriptPage(html('button', { type: 'button', id: 'wifi', 'aria-label': v.label }, ''), `const sw = Glassparency.createSwitch(document.getElementById('wifi'), ${js(opts)});\n// sw.update({ checked: false })  ·  sw.destroy()`);
      },
      html(v) {
        const lines = [html('input', [htmlAttr('type', 'checkbox'), htmlAttr('checked', v.checked), htmlAttr('disabled', v.disabled), htmlAttr('aria-label', v.label), 'data-glassparency-switch'])];
        if (v.style !== 'default') lines.push('<!-- A marked switch has no per-element style: use createSwitch(el, { props: { track: … } }) (Script tab). -->');
        return scriptPage(lines.join('\n'));
      },
    },
  },

  // ---- Slider -------------------------------------------------------------------------
  {
    id: 'slider',
    title: 'Slider',
    section: 'Controls',
    blurb: 'Drag the knob or click the track. The knob turns into glass while you hold it, with the fill showing through. Arrows, Page Up / Down and Home / End move it.',
    groups: ['sliderTrack', 'sliderFill', 'sliderKnob', 'sliderKnobActive'],
    knobs: [
      { key: 'value', type: 'range', label: 'Value (starts)', min: 0, max: 100, step: 1, value: 60 },
      { key: 'min', type: 'range', label: 'Min', min: 0, max: 50, step: 1, value: 0 },
      { key: 'max', type: 'range', label: 'Max', min: 50, max: 200, step: 1, value: 100 },
      { key: 'step', type: 'range', label: 'Step', min: 1, max: 25, step: 1, value: 1 },
      DISABLED_KNOB,
      STYLE_KNOB,
    ],
    Demo({ v }) {
      const [val, setVal] = useKnobState(v.value);
      return (
        <div className="docDemoCol docWide">
          <GlassSlider className="labSlider" value={val} onChange={setVal} min={v.min} max={v.max} step={v.step} disabled={v.disabled} glassProps={part('track', styleOf(v))} aria-label="Volume" />
          <span className="docNote">value {val}</span>
        </div>
      );
    },
    code: {
      react(v) {
        const s = state('volume', v.value);
        const lim = changed({ min: v.min, max: v.max, step: v.step }, { min: 0, max: 100, step: 1 });
        return reactExample({
          names: ['GlassSlider'],
          hooks: [s],
          body: jsx('GlassSlider', { value: code('volume'), onChange: code(s.setter), ...lim, disabled: v.disabled, glassProps: part('track', styleOf(v)), 'aria-label': 'Volume' }),
        });
      },
      script(v) {
        const lim = changed({ min: v.min, max: v.max, step: v.step }, { min: 0, max: 100, step: 1 });
        const opts = { value: v.value, ...lim, disabled: v.disabled || undefined, props: part('track', styleOf(v)), onChange: code('(v) => console.log(v)') };
        return scriptPage(html('div', { id: 'volume', 'aria-label': 'Volume' }, ''), `const slider = Glassparency.createSlider(document.getElementById('volume'), ${js(opts)});`);
      },
      html(v) {
        const lim = changed({ min: v.min, max: v.max, step: v.step }, { min: 0, max: 100, step: 1 });
        const lines = [html('input', [htmlAttr('type', 'range'), ...Object.entries(lim).map(([k, x]) => htmlAttr(k, x)), htmlAttr('value', v.value), htmlAttr('disabled', v.disabled), htmlAttr('aria-label', 'Volume'), 'data-glassparency-slider'])];
        if (v.style !== 'default') lines.push('<!-- A marked slider has no per-element style: use createSlider(el, { props: { track: … } }) (Script tab). -->');
        return scriptPage(lines.join('\n'));
      },
    },
  },

  // ---- Checkbox -----------------------------------------------------------------------
  {
    id: 'checkbox',
    title: 'Checkbox',
    section: 'Controls',
    blurb: 'A rounded glass box that fills with the accent colour and draws its tick. It squishes when pressed; let go away from it and nothing changes, like macOS.',
    groups: ['checkbox', 'checkboxOn'],
    knobs: [{ key: 'checked', type: 'bool', label: 'Checked (starts)', value: true }, DISABLED_KNOB, { key: 'label', type: 'text', label: 'Label', value: 'On Desktop' }, STYLE_KNOB, SQUISH_KNOB],
    Demo({ v }) {
      const [on, setOn] = useKnobState(v.checked);
      return (
        <GlassCheckbox checked={on} onChange={setOn} disabled={v.disabled} glassProps={part('box', squishOf(v))}>
          {v.label}
        </GlassCheckbox>
      );
    },
    code: {
      react(v) {
        const s = state('checked', v.checked);
        return reactExample({ names: ['GlassCheckbox'], hooks: [s], body: jsx('GlassCheckbox', { checked: code('checked'), onChange: code(s.setter), disabled: v.disabled, glassProps: part('box', squishOf(v)) }, v.label) });
      },
      script(v) {
        const opts = { checked: v.checked, disabled: v.disabled || undefined, props: part('box', squishOf(v)), onChange: code('(on) => console.log(on)') };
        return scriptPage(`<label>${html('button', { type: 'button', id: 'desktop' }, '')} ${v.label}</label>`, `Glassparency.createCheckbox(document.getElementById('desktop'), ${js(opts)});`);
      },
      html(v) {
        return scriptPage(`<label>${html('input', [htmlAttr('type', 'checkbox'), htmlAttr('checked', v.checked), htmlAttr('disabled', v.disabled), 'data-glassparency-checkbox', propsAttr(squishOf(v))])} ${v.label}</label>`);
      },
    },
  },

  // ---- Radio --------------------------------------------------------------------------
  {
    id: 'radio',
    title: 'Radio buttons',
    section: 'Controls',
    blurb: 'A glass circle with a white dot that pops in. Radios with the same name uncheck each other; the arrow keys move between them.',
    groups: ['radio', 'radioOn', 'radioDot'],
    knobs: [{ key: 'count', type: 'range', label: 'Options', min: 2, max: 4, step: 1, value: 3 }, DISABLED_KNOB, STYLE_KNOB, SQUISH_KNOB],
    Demo({ v }) {
      const [pick, setPick] = useState(0);
      return (
        <div className="docDemoRow">
          {RADIOS.slice(0, v.count).map((label, i) => (
            <GlassRadio key={label} name="doc-size" checked={pick === i} onChange={() => setPick(i)} disabled={v.disabled} glassProps={part('box', squishOf(v))}>
              {label}
            </GlassRadio>
          ))}
        </div>
      );
    },
    code: {
      react(v) {
        const s = state('size', 's');
        const items = RADIOS.slice(0, v.count)
          .map((label) => jsx('GlassRadio', { name: 'size', checked: code(`size === '${label[0].toLowerCase()}'`), onChange: code(`() => ${s.setter}('${label[0].toLowerCase()}')`), disabled: v.disabled, glassProps: part('box', squishOf(v)) }, label))
          .join('\n');
        return reactExample({ names: ['GlassRadio'], hooks: [s], body: `<>\n${indent(items)}\n</>` });
      },
      script(v) {
        const opts = (i) => ({ name: 'size', checked: i === 0 || undefined, disabled: v.disabled || undefined, props: part('box', squishOf(v)) });
        const ids = RADIOS.slice(0, v.count).map((l) => l.toLowerCase());
        return scriptPage(
          ids.map((id, i) => `<label>${html('button', { type: 'button', id }, '')} ${RADIOS[i]}</label>`).join('\n'),
          ids.map((id, i) => `Glassparency.createRadio(document.getElementById('${id}'), ${js(opts(i))});`).join('\n')
        );
      },
      html(v) {
        return scriptPage(
          RADIOS.slice(0, v.count)
            .map((l, i) => `<label>${html('input', [htmlAttr('type', 'radio'), htmlAttr('name', 'size'), htmlAttr('value', l[0].toLowerCase()), htmlAttr('checked', i === 0), htmlAttr('disabled', v.disabled), 'data-glassparency-radio', propsAttr(squishOf(v))])} ${l}</label>`)
            .join('\n')
        );
      },
    },
  },

  // ---- Text field ---------------------------------------------------------------------
  {
    id: 'text-field',
    title: 'Text field',
    section: 'Controls',
    blurb: 'A glass capsule round a native <input>. Focus lights its rim; clearable adds a round × button that swells when pressed (iOS). Input props go to the <input>, className / style to the capsule.',
    groups: ['textField', 'textFieldFocus', 'textFieldClear'],
    knobs: [{ key: 'placeholder', type: 'text', label: 'Placeholder', value: 'Search' }, { key: 'clearable', type: 'bool', label: 'Clearable', value: true }, { key: 'icon', type: 'bool', label: 'Search icon', value: true }, STYLE_KNOB, SQUISH_KNOB],
    Demo({ v }) {
      const [q, setQ] = useState('Liquid glass');
      return (
        <div className="docDemoCol docWide">
          <GlassTextField className="labField" icon={v.icon ? <Icon name="search" /> : undefined} clearable={v.clearable} value={q} onChange={(e) => setQ(e.target.value)} placeholder={v.placeholder} glassProps={orNone({ ...part('field', squishOf(v)), ...part('clear', v.squish !== 'default' ? SQUISH[v.squish].props : undefined) })} />
        </div>
      );
    },
    code: {
      react(v) {
        const s = state('q', '');
        const gp = orNone({ ...part('field', squishOf(v)), ...part('clear', v.squish !== 'default' ? SQUISH[v.squish].props : undefined) });
        return reactExample({ names: ['GlassTextField'], hooks: [s], body: jsx('GlassTextField', { icon: v.icon ? code('<SearchIcon />') : undefined, clearable: v.clearable, value: code('q'), onChange: code(`(e) => ${s.setter}(e.target.value)`), placeholder: v.placeholder, glassProps: gp }) });
      },
      script(v) {
        const opts = { clearable: v.clearable || undefined, props: part('field', squishOf(v)) };
        return scriptPage(`<div id="search">${v.icon ? '<svg…/>' : ''}<input placeholder="${v.placeholder}"></div>`, `Glassparency.createTextField(document.getElementById('search')${Object.keys(changed(opts, {})).length ? `, ${js(changed(opts, {}))}` : ''});`);
      },
      html(v) {
        return scriptPage(html('div', ['data-glassparency-field', htmlAttr('data-glassparency-clearable', v.clearable), propsAttr(squishOf(v))], `${v.icon ? '<svg…/>' : ''}<input placeholder="${v.placeholder}">`));
      },
    },
  },

  // ---- Tab bar ------------------------------------------------------------------------
  {
    id: 'tab-bar',
    title: 'Tab bar',
    section: 'Controls',
    blurb: 'Like iOS 26: press and slide along it. The selection lifts into a clear glass lens that follows your finger, stretches with its speed and magnifies the icons under it. Let go and it lands on the nearest tab with a wobble.',
    groups: ['tabBar', 'tabLens', 'tabLensActive'],
    knobs: [
      { key: 'count', type: 'range', label: 'Tabs', min: 2, max: 5, step: 1, value: 5 },
      { key: 'lensScale', type: 'range', label: 'Lens size while pressed', min: 1, max: 1.6, step: 0.01, value: 1.3 },
      { key: 'inset', type: 'range', label: 'Lens inset (px)', min: 0, max: 10, step: 1, value: 4 },
      STYLE_KNOB,
    ],
    remount: (v) => v.count,
    Demo({ v }) {
      const [tab, setTab] = useState(0);
      return (
        <GlassTabBar className="labTabs" value={Math.min(tab, v.count - 1)} onChange={setTab} lensScale={v.lensScale} inset={v.inset} glassProps={part('bar', styleOf(v))} role="tablist">
          {TABS.slice(0, v.count).map(([icon, label]) => (
            <button key={label} type="button" role="tab" data-gp-item className="labTab">
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </GlassTabBar>
      );
    },
    code: lensBarCode('GlassTabBar', 'createTabBar', 'data-glassparency-tabbar', { lensScale: 1.3, inset: 4 }, () => TABS.map((t) => t[1])),
  },

  // ---- Sidebar ------------------------------------------------------------------------
  {
    id: 'sidebar',
    title: 'Sidebar',
    section: 'Controls',
    blurb: 'The tab bar’s sliding lens, vertical: click a row, or press and drag up and down the list.',
    groups: ['sidebarPanel', 'sidebarLens', 'sidebarLensActive'],
    knobs: [
      { key: 'count', type: 'range', label: 'Rows', min: 2, max: 7, step: 1, value: 6 },
      { key: 'lensScale', type: 'range', label: 'Lens size while pressed', min: 1, max: 1.3, step: 0.01, value: 1.06 },
      { key: 'inset', type: 'range', label: 'Lens inset (px)', min: 0, max: 10, step: 1, value: 0 },
      STYLE_KNOB,
    ],
    remount: (v) => v.count,
    Demo({ v }) {
      const [page, setPage] = useState(1);
      return (
        <GlassSidebar className="labSide" value={Math.min(page, v.count - 1)} onChange={setPage} lensScale={v.lensScale} inset={v.inset} glassProps={part('bar', styleOf(v))} aria-label="Sidebar">
          {SIDE.slice(0, v.count).map(([icon, label]) => (
            <button key={label} type="button" data-gp-item className="labSideItem">
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </GlassSidebar>
      );
    },
    code: lensBarCode('GlassSidebar', 'createSidebar', 'data-glassparency-sidebar', { lensScale: 1.06, inset: 0 }, () => SIDE.map((s) => s[1])),
  },

  // ---- Progress -----------------------------------------------------------------------
  {
    id: 'progress',
    title: 'Progress bar',
    section: 'Controls',
    blurb: 'A glass fill that springs to its value, with an optional glass bead on its end. With no value (null) it shows a liquid drop sliding back and forth.',
    groups: ['progressTrack', 'progressFill', 'progressBead'],
    knobs: [{ key: 'value', type: 'range', label: 'Value', min: 0, max: 1, step: 0.01, value: 0.4 }, { key: 'busy', type: 'bool', label: 'Busy (value null)', value: false }, { key: 'bead', type: 'bool', label: 'Bead', value: true }, STYLE_KNOB],
    Demo({ v }) {
      return (
        <div className="docDemoCol docWide">
          <GlassProgress className="labProg" value={v.busy ? null : v.value} bead={v.bead} glassProps={part('track', styleOf(v))} />
        </div>
      );
    },
    code: {
      react(v) {
        return reactExample({ names: ['GlassProgress'], body: jsx('GlassProgress', { value: v.busy ? null : v.value, bead: v.bead, glassProps: part('track', styleOf(v)) }) });
      },
      script(v) {
        const opts = { value: v.busy ? null : v.value, bead: v.bead || undefined, props: part('track', styleOf(v)) };
        return scriptPage('<div id="upload"></div>', `const bar = Glassparency.createProgress(document.getElementById('upload'), ${js(opts)});\n// bar.update({ value: 0.8 })`);
      },
      html(v) {
        return scriptPage(html('progress', ['data-glassparency-progress', htmlAttr('data-glassparency-bead', v.bead), propsAttr(styleOf(v)), v.busy ? '' : htmlAttr('value', Math.round(v.value * 100)), v.busy ? '' : htmlAttr('max', 100)], '') + (v.busy ? '\n<!-- no value = busy -->' : ''));
      },
    },
  },

  // ---- Segmented ----------------------------------------------------------------------
  {
    id: 'segmented',
    title: 'Segmented control',
    section: 'Pickers',
    blurb: 'A small glass capsule with a sliding lens on the picked segment. Tap a segment, or press and slide the lens across. The tab bar’s lens in compact proportions, on the float layer like a switch.',
    groups: ['segmented', 'segmentedLens', 'segmentedLensActive'],
    knobs: [
      { key: 'count', type: 'range', label: 'Segments', min: 2, max: 5, step: 1, value: 4 },
      { key: 'lensScale', type: 'range', label: 'Lens size while pressed', min: 1, max: 1.4, step: 0.01, value: 1.16 },
      { key: 'inset', type: 'range', label: 'Lens inset (px)', min: 0, max: 8, step: 1, value: 2 },
      STYLE_KNOB,
    ],
    remount: (v) => v.count,
    Demo({ v }) {
      const [seg, setSeg] = useState(1);
      return (
        <div className="docDemoCol docWide">
          <GlassSegmented className="labSeg" value={Math.min(seg, v.count - 1)} onChange={setSeg} lensScale={v.lensScale} inset={v.inset} glassProps={part('bar', styleOf(v))} aria-label="Range">
            {SEGMENTS.slice(0, v.count).map((t) => (
              <button key={t} type="button" role="tab" data-gp-item>
                {t}
              </button>
            ))}
          </GlassSegmented>
        </div>
      );
    },
    code: lensBarCode('GlassSegmented', 'createSegmented', 'data-glassparency-segmented', { lensScale: 1.16, inset: 2 }, () => SEGMENTS, true),
  },

  // ---- Stepper ------------------------------------------------------------------------
  {
    id: 'stepper',
    title: 'Stepper',
    section: 'Pickers',
    blurb: 'One glass capsule reading − value +. Tap for one step; hold to repeat, faster and faster. The capsule leans towards the half you press; a half at its limit is dimmed (wrap goes round instead).',
    groups: ['stepper'],
    knobs: [
      { key: 'value', type: 'range', label: 'Value (starts)', min: 0, max: 20, step: 1, value: 3 },
      { key: 'min', type: 'range', label: 'Min', min: 0, max: 10, step: 1, value: 0 },
      { key: 'max', type: 'range', label: 'Max', min: 10, max: 100, step: 1, value: 20 },
      { key: 'step', type: 'range', label: 'Step', min: 1, max: 5, step: 1, value: 1 },
      { key: 'wrap', type: 'bool', label: 'Wrap round', value: false },
      { key: 'showValue', type: 'bool', label: 'Show the value', value: true },
      DISABLED_KNOB,
      STYLE_KNOB,
      SQUISH_KNOB,
    ],
    Demo({ v }) {
      const [n, setN] = useKnobState(v.value);
      return <GlassStepper value={n} onChange={setN} min={v.min} max={v.max} step={v.step} wrap={v.wrap} showValue={v.showValue} disabled={v.disabled} glassProps={part('body', squishOf(v))} aria-label="Quantity" />;
    },
    code: {
      react(v) {
        const s = state('qty', v.value);
        const lim = changed({ min: v.min, max: v.max, step: v.step }, { step: 1 });
        return reactExample({ names: ['GlassStepper'], hooks: [s], body: jsx('GlassStepper', { value: code('qty'), onChange: code(s.setter), ...lim, wrap: v.wrap, showValue: v.showValue ? undefined : false, disabled: v.disabled, glassProps: part('body', squishOf(v)), 'aria-label': 'Quantity' }) });
      },
      script(v) {
        const lim = changed({ min: v.min, max: v.max, step: v.step }, { step: 1 });
        const opts = { value: v.value, ...lim, wrap: v.wrap || undefined, showValue: v.showValue ? undefined : false, disabled: v.disabled || undefined, props: part('body', squishOf(v)), onChange: code('(v) => console.log(v)') };
        return scriptPage('<div id="qty" aria-label="Quantity"></div>', `Glassparency.createStepper(document.getElementById('qty'), ${js(opts)});`);
      },
      html(v) {
        const lines = [html('input', [htmlAttr('type', 'number'), htmlAttr('min', v.min), htmlAttr('max', v.max), v.step !== 1 ? htmlAttr('step', v.step) : '', htmlAttr('value', v.value), htmlAttr('disabled', v.disabled), 'data-glassparency-stepper', htmlAttr('data-glassparency-wrap', v.wrap), propsAttr(squishOf(v)), htmlAttr('aria-label', 'Quantity')])];
        if (!v.showValue) lines.push('<!-- showValue: false has no markup attribute: use createStepper (Script tab). -->');
        return scriptPage(lines.join('\n'));
      },
    },
  },

  // ---- Range + vertical ---------------------------------------------------------------
  {
    id: 'range-slider',
    title: 'Range & vertical slider',
    section: 'Pickers',
    blurb: 'The slider with two knobs ([low, high]: they never cross; press nearest the one you want), or one knob standing up with orientation="vertical". Same parts and groups as the slider. Two knobs or one, and the orientation, are fixed per instance.',
    groups: ['sliderTrack', 'sliderFill', 'sliderKnob', 'sliderKnobActive'],
    knobs: [
      { key: 'two', type: 'bool', label: 'Two knobs (range)', value: true },
      { key: 'vertical', type: 'bool', label: 'Vertical', value: false },
      { key: 'min', type: 'range', label: 'Min', min: 0, max: 50, step: 1, value: 0 },
      { key: 'max', type: 'range', label: 'Max', min: 50, max: 500, step: 1, value: 100 },
      { key: 'step', type: 'range', label: 'Step', min: 1, max: 25, step: 1, value: 1 },
      DISABLED_KNOB,
      STYLE_KNOB,
    ],
    remount: (v) => `${v.two}${v.vertical}`,
    Demo({ v }) {
      const [val, setVal] = useState(() => (v.two ? [Math.round(v.min + (v.max - v.min) * 0.25), Math.round(v.min + (v.max - v.min) * 0.75)] : Math.round((v.min + v.max) / 2)));
      return (
        <div className={`docDemoCol${v.vertical ? '' : ' docWide'}`}>
          <GlassRangeSlider className={v.vertical ? undefined : 'labSlider'} value={val} onChange={setVal} min={v.min} max={v.max} step={v.step} orientation={v.vertical ? 'vertical' : undefined} disabled={v.disabled} glassProps={part('track', styleOf(v))} aria-label="Price" />
          <span className="docNote">{Array.isArray(val) ? `${val[0]} – ${val[1]}` : val}</span>
        </div>
      );
    },
    code: {
      react(v) {
        const s = state(v.two ? 'price' : 'level', v.two ? [25, 75] : 50);
        const lim = changed({ min: v.min, max: v.max, step: v.step }, { min: 0, max: 100, step: 1 });
        return reactExample({ names: ['GlassRangeSlider'], hooks: [s], body: jsx('GlassRangeSlider', { value: code(v.two ? 'price' : 'level'), onChange: code(s.setter), ...lim, orientation: v.vertical ? 'vertical' : undefined, disabled: v.disabled, glassProps: part('track', styleOf(v)), 'aria-label': v.two ? 'Price' : 'Level' }) });
      },
      script(v) {
        const lim = changed({ min: v.min, max: v.max, step: v.step }, { min: 0, max: 100, step: 1 });
        const opts = { value: v.two ? [25, 75] : 50, ...lim, orientation: v.vertical ? 'vertical' : undefined, disabled: v.disabled || undefined, props: part('track', styleOf(v)), onChange: code('(v) => console.log(v)') };
        return scriptPage('<div id="price" aria-label="Price"></div>', `Glassparency.createRangeSlider(document.getElementById('price'), ${js(opts)});`);
      },
      html(v) {
        const lim = changed({ min: v.min, max: v.max, step: v.step }, { min: 0, max: 100, step: 1 });
        const input = (val) => html('input', [htmlAttr('type', 'range'), ...Object.entries(lim).map(([k, x]) => htmlAttr(k, x)), htmlAttr('value', val), htmlAttr('disabled', v.disabled)]);
        const inner = v.two ? input(25) + input(75) : input(50);
        return scriptPage(html('div', ['data-glassparency-range', htmlAttr('data-glassparency-vertical', v.vertical), propsAttr(styleOf(v)), htmlAttr('aria-label', v.two ? 'Price' : 'Level')], inner));
      },
    },
  },

  // ---- Block slider -------------------------------------------------------------------
  {
    id: 'block-slider',
    title: 'Block slider',
    section: 'Pickers',
    blurb: 'Control Center’s thick slider: the white fill is the value (no knob). Drag anywhere and the value moves with your finger; tap to jump. Pull past an end and the block stretches like rubber, then springs back. The icon is black by default (--gp-block-icon).',
    groups: ['blockSlider'],
    knobs: [
      { key: 'horizontal', type: 'bool', label: 'Horizontal', value: false },
      { key: 'value', type: 'range', label: 'Value (starts)', min: 0, max: 100, step: 1, value: 60 },
      { key: 'step', type: 'range', label: 'Step', min: 1, max: 25, step: 1, value: 1 },
      DISABLED_KNOB,
      STYLE_KNOB,
    ],
    remount: (v) => String(v.horizontal),
    Demo({ v }) {
      const [val, setVal] = useKnobState(v.value);
      return (
        <div className="docDemoCol">
          <GlassBlockSlider value={val} onChange={setVal} step={v.step} orientation={v.horizontal ? 'horizontal' : undefined} disabled={v.disabled} glassProps={part('body', styleOf(v))} aria-label="Brightness">
            <Icon name="sun" size={v.horizontal ? 22 : 24} />
          </GlassBlockSlider>
          <span className="docNote">value {val}</span>
        </div>
      );
    },
    code: {
      react(v) {
        const s = state('brightness', v.value);
        return reactExample({ names: ['GlassBlockSlider'], hooks: [s], body: jsx('GlassBlockSlider', { value: code('brightness'), onChange: code(s.setter), step: v.step !== 1 ? v.step : undefined, orientation: v.horizontal ? 'horizontal' : undefined, disabled: v.disabled, glassProps: part('body', styleOf(v)), 'aria-label': 'Brightness' }, '<SunIcon />') });
      },
      script(v) {
        const opts = { value: v.value, step: v.step !== 1 ? v.step : undefined, orientation: v.horizontal ? 'horizontal' : undefined, disabled: v.disabled || undefined, props: part('body', styleOf(v)), onChange: code('(v) => console.log(v)') };
        return scriptPage('<div id="brightness" aria-label="Brightness"><svg…/></div>', `Glassparency.createBlockSlider(document.getElementById('brightness'), ${js(opts)});`);
      },
      html(v) {
        const input = html('input', [htmlAttr('type', 'range'), v.step !== 1 ? htmlAttr('step', v.step) : '', htmlAttr('value', v.value), htmlAttr('disabled', v.disabled)]);
        return scriptPage(html('div', ['data-glassparency-block', htmlAttr('data-glassparency-horizontal', v.horizontal), propsAttr(styleOf(v)), htmlAttr('aria-label', 'Brightness')], `<svg…/>${input}`));
      },
    },
  },

  // ---- Popover ------------------------------------------------------------------------
  {
    id: 'popover',
    title: 'Popover',
    section: 'Overlays',
    blurb: 'A glass button whose panel grows out of it. It’s one glass: the panel starts exactly on the button, springs out to full size while its look turns into the panel’s, and shrinks back into the button when it closes. Escape or a press outside closes it.',
    groups: ['button', 'popover'],
    knobs: [{ key: 'label', type: 'text', label: 'Button label', value: 'Info' }, PLACEMENT_KNOB, ALIGN_KNOB, { ...STYLE_KNOB, label: 'Panel style' }, { ...STYLE_KNOB, key: 'triggerStyle', label: 'Button style' }],
    Demo({ v }) {
      return (
        <GlassPopover label={v.label} triggerClassName="labBtn" triggerGlass={orNone(v.triggerStyle !== 'default' ? { style: v.triggerStyle } : {})} glassProps={orNone(styleOf(v))} placement={v.placement} align={v.align} className="labPop" aria-label={v.label}>
          <strong>Liquid glass popover</strong>
          <span>It grew out of the button. Press outside it or Escape to melt it back.</span>
        </GlassPopover>
      );
    },
    code: overlayCode('GlassPopover', 'createPopover', 'data-glassparency-popover', 'info', '<p>This panel grew out of its button.</p>'),
  },

  // ---- Menu ---------------------------------------------------------------------------
  {
    id: 'menu',
    title: 'Menu',
    section: 'Overlays',
    blurb: 'A popover of items. A soft highlight slides between them as you hover or use the arrow keys; Enter / click picks, a letter jumps to an item, Escape / Tab close. data-gp-keep-open on an item keeps the menu open when it’s picked.',
    groups: ['button', 'menu'],
    knobs: [{ key: 'label', type: 'text', label: 'Button label', value: 'Actions' }, { key: 'count', type: 'range', label: 'Items', min: 2, max: 5, step: 1, value: 4 }, PLACEMENT_KNOB, ALIGN_KNOB, { ...STYLE_KNOB, label: 'Panel style' }, { ...STYLE_KNOB, key: 'triggerStyle', label: 'Button style' }],
    Demo({ v }) {
      const [picked, setPicked] = useState('nothing yet');
      return (
        <div className="docDemoCol">
          <GlassMenu label={v.label} triggerClassName="labBtn" triggerGlass={orNone(v.triggerStyle !== 'default' ? { style: v.triggerStyle } : {})} glassProps={orNone(styleOf(v))} placement={v.placement} align={v.align} onSelect={(i, it) => setPicked(it.textContent.trim())}>
            {MENU_ITEMS.slice(0, v.count).map((t) => (
              <button key={t} type="button" role="menuitem">
                {t}
              </button>
            ))}
          </GlassMenu>
          <span className="docNote">picked: {picked}</span>
        </div>
      );
    },
    code: overlayCode('GlassMenu', 'createMenu', 'data-glassparency-menu', 'acts', null),
  },

  // ---- Select -------------------------------------------------------------------------
  {
    id: 'select',
    title: 'Select',
    section: 'Overlays',
    blurb: 'A menu that remembers its value: a ✓ on the picked option, and it opens with that option highlighted. In the script build a plain <select> is upgraded and kept in sync.',
    groups: ['button', 'menu'],
    knobs: [PLACEMENT_KNOB, ALIGN_KNOB, { ...STYLE_KNOB, label: 'Panel style' }, { ...STYLE_KNOB, key: 'triggerStyle', label: 'Button style' }],
    Demo({ v }) {
      const [sort, setSort] = useState('recent');
      return <GlassSelect options={SORTS} value={sort} onChange={setSort} triggerClassName="labBtn" triggerGlass={orNone(v.triggerStyle !== 'default' ? { style: v.triggerStyle } : {})} glassProps={orNone(styleOf(v))} placement={v.placement} align={v.align} aria-label="Sort by" />;
    },
    code: {
      react(v) {
        const s = state('sort', 'recent');
        return reactExample({
          names: ['GlassSelect'],
          hooks: [s],
          body: jsx('GlassSelect', { value: code('sort'), onChange: code(s.setter), options: SORTS.slice(0, 2), ...placeProps(v), triggerGlass: orNone(v.triggerStyle !== 'default' ? { style: v.triggerStyle } : {}), glassProps: orNone(styleOf(v)), 'aria-label': 'Sort by' }),
        });
      },
      script(v) {
        const opts = { value: 'recent', ...placeProps(v), props: orNone(styleOf(v)), onChange: code('(value) => console.log(value)') };
        return scriptPage(
          `<button type="button" id="sort">Most recent</button>\n<div id="sort-options" hidden>\n  <button data-value="recent">Most recent</button>\n  <button data-value="name">Name</button>\n</div>`,
          `const btn = document.getElementById('sort');\nGlassparency.attach(btn, 'button'${v.triggerStyle !== 'default' ? `, { style: '${v.triggerStyle}' }` : ''});\nGlassparency.createSelect(btn, document.getElementById('sort-options'), ${js(opts)});`
        );
      },
      html(v) {
        return scriptPage(
          `${html('select', ['data-glassparency-select', ...placeAttrs(v), propsAttr(v.triggerStyle !== 'default' ? { style: v.triggerStyle } : {}), propsAttr(styleOf(v), 'data-glassparency-panel-props'), htmlAttr('aria-label', 'Sort')], '\n  <option value="recent">Most recent</option>\n  <option value="name">Name</option>\n')}`
        );
      },
    },
  },

  // ---- Tooltip ------------------------------------------------------------------------
  {
    id: 'tooltip',
    title: 'Tooltip',
    section: 'Overlays',
    blurb: 'A small glass capsule above the element after a short hover (or keyboard focus), popping in with a bounce. Once one has shown, the next shows at once for a moment, like macOS.',
    groups: ['tooltip'],
    knobs: [{ key: 'text', type: 'text', label: 'Text', value: 'Share' }, { key: 'placement', type: 'select', label: 'Placement', options: { top: 'Top', bottom: 'Bottom' }, value: 'top' }, { key: 'delay', type: 'range', label: 'Delay (ms)', min: 0, max: 1500, step: 50, value: 500 }, STYLE_KNOB],
    Demo({ v }) {
      return (
        <div className="docDemoRow">
          {[
            ['share', v.text || 'Share'],
            ['heart', 'Favourite'],
            ['trash', 'Delete'],
          ].map(([icon, label]) => (
            <GlassTooltip key={icon} text={label} placement={v.placement} delay={v.delay} glassProps={orNone(styleOf(v))}>
              <Glass as="button" type="button" className="labRound" group="roundButton" aria-label={label}>
                <Icon name={icon} />
              </Glass>
            </GlassTooltip>
          ))}
        </div>
      );
    },
    code: {
      react(v) {
        return reactExample({
          names: ['GlassTooltip'],
          body: jsx('GlassTooltip', { text: v.text, placement: v.placement !== 'top' ? v.placement : undefined, delay: v.delay !== 500 ? v.delay : undefined, glassProps: orNone(styleOf(v)) }, `<button aria-label="${v.text}"><ShareIcon /></button>`),
        });
      },
      script(v) {
        const opts = { text: v.text, placement: v.placement !== 'top' ? v.placement : undefined, delay: v.delay !== 500 ? v.delay : undefined, props: orNone(styleOf(v)) };
        return scriptPage(`<button id="share" aria-label="${v.text}"><svg…/></button>`, `Glassparency.createTooltip(document.getElementById('share'), ${js(opts)});`);
      },
      html(v) {
        const lines = [html('button', [htmlAttr('data-glassparency-tooltip', v.text), v.placement !== 'top' ? htmlAttr('data-glassparency-placement', v.placement) : '', propsAttr(styleOf(v)), htmlAttr('aria-label', v.text)], '<svg…/>')];
        if (v.delay !== 500) lines.push('<!-- delay has no markup attribute: use createTooltip (Script tab). -->');
        return scriptPage(lines.join('\n'));
      },
    },
  },

  // ---- Sheet --------------------------------------------------------------------------
  {
    id: 'sheet',
    title: 'Bottom sheet',
    section: 'Overlays',
    blurb: 'An iOS bottom sheet that rests at detents (fractions of the window height). Drag its top; a flick carries it to the next detent. The glass gets thicker and frostier, and the page darker, as it rises. Drag it down, tap the dimmed page or press Escape to close it.',
    groups: ['sheet', 'sheetFull'],
    knobs: [{ key: 'low', type: 'range', label: 'Low detent', min: 0.2, max: 0.6, step: 0.01, value: 0.45 }, { key: 'high', type: 'range', label: 'High detent', min: 0.6, max: 0.98, step: 0.01, value: 0.92 }, STYLE_KNOB],
    Demo({ v }) {
      const [open, setOpen] = useState(false);
      const detents = [v.low, v.high];
      return (
        <>
          <Glass as="button" type="button" className="labBtn" group="button" onClick={() => setOpen(true)}>
            Open sheet
          </Glass>
          <GlassSheet open={open} onClose={() => setOpen(false)} detents={detents} glassProps={orNone(styleOf(v))} className="labSheet" aria-label="Sample sheet">
            <h3>Bottom sheet</h3>
            <p>
              It rests at {detents.map((d) => `${Math.round(d * 100)}%`).join(' and ')} of the window. Drag the top up and down, or flick it.
            </p>
            <Glass as="button" type="button" className="labBtn" group="buttonPrimary" onClick={() => setOpen(false)}>
              Done
            </Glass>
          </GlassSheet>
        </>
      );
    },
    code: {
      react(v) {
        const s = state('open', false);
        const detents = changedDetents(v);
        return reactExample({
          names: ['Glass', 'GlassSheet'],
          hooks: [s],
          body: `<>\n${indent(jsx('Glass', { as: 'button', group: 'button', onClick: code(`() => ${s.setter}(true)`) }, 'Details'))}\n${indent(jsx('GlassSheet', { open: code('open'), onClose: code(`() => ${s.setter}(false)`), detents, glassProps: orNone(styleOf(v)) }, '<h3>Details</h3>'))}\n</>`,
        });
      },
      script(v) {
        const opts = { detents: changedDetents(v), props: orNone(styleOf(v)), onClose: code("() => console.log('closed')") };
        return scriptPage('<button id="open-details">Details</button>\n<div id="details" hidden><h3>Details</h3></div>', `const sheet = Glassparency.createSheet(document.getElementById('details'), ${js(opts)});\ndocument.getElementById('open-details').onclick = () => sheet.open();`);
      },
      html(v) {
        const d = changedDetents(v);
        return scriptPage(
          `${html('button', [htmlAttr('data-glassparency', 'button'), htmlAttr('data-glassparency-open', 'details')], 'Details')}\n${html('div', [htmlAttr('id', 'details'), 'data-glassparency-sheet', d ? htmlAttr('data-glassparency-detents', d.join(',')) : '', propsAttr(styleOf(v)), 'hidden'], '<h3>Details</h3>')}`
        );
      },
    },
  },

  // ---- Toasts -------------------------------------------------------------------------
  {
    id: 'toasts',
    title: 'Toasts',
    section: 'Overlays',
    blurb: 'Banners that drop in from the top with a springy stretch, stack (3 at most) and leave after a few seconds, paused while hovered or held. Swipe one up to dismiss it.',
    groups: ['toast'],
    knobs: [{ key: 'title', type: 'text', label: 'Title', value: 'Saved' }, { key: 'body', type: 'text', label: 'Body', value: 'Your changes are saved.' }, { key: 'duration', type: 'range', label: 'Duration (ms, 0 = until swiped)', min: 0, max: 10000, step: 250, value: 4000 }, { key: 'icon', type: 'bool', label: 'Icon', value: true }, STYLE_KNOB],
    Demo({ v }) {
      const toast = useGlassToaster();
      return (
        <div className="docDemoRow">
          <Glass as="button" type="button" className="labBtn" group="button" onClick={() => toast.show({ title: v.title, body: v.body, duration: v.duration, icon: v.icon ? TOAST_ICON : undefined, props: orNone(styleOf(v)) })}>
            Show toast
          </Glass>
          <button type="button" className="labMini" onClick={() => toast.clear()}>
            Clear all
          </button>
        </div>
      );
    },
    code: {
      react(v) {
        const opts = toastOpts(v);
        return reactExample({
          names: ['Glass', 'useGlassToaster'],
          hooks: [{ line: 'const toast = useGlassToaster();' }],
          body: jsx('Glass', { as: 'button', group: 'button', onClick: code(`() => toast.show(${js(opts, 4)})`) }, 'Save'),
        });
      },
      script(v) {
        return scriptPage(null, `const dismiss = Glassparency.toast(${js(toastOpts(v))});`);
      },
      html(v) {
        return scriptPage(`<!-- Toasts have no markup: one line of script shows one. -->\n<script>Glassparency.toast(${js(toastOpts(v))});</script>`);
      },
    },
  },

  // ---- Morph --------------------------------------------------------------------------
  {
    id: 'morph',
    title: 'Morph (glassMorph)',
    section: 'Motion',
    blurb: 'Apple’s liquid morph for any two elements: the button’s own glass swells into the panel and melts back into it — one piece of glass, never a button and a panel side by side (replaceFrom). The target is any element laid out where it ends up, over the button; the hook (or the hidden attribute) hides it while closed.',
    groups: ['button', 'menu'],
    knobs: [
      { key: 'duration', type: 'range', label: 'Duration (ms)', min: 200, max: 2000, step: 10, value: 780 },
      { key: 'reverseDuration', type: 'range', label: 'Reverse duration (ms)', min: 200, max: 2000, step: 10, value: 620 },
      { key: 'morphRadius', type: 'range', label: 'Neck reach (px)', min: 0, max: 80, step: 1, value: 34 },
      { key: 'fadeContent', type: 'bool', label: 'Fade the content', value: true },
    ],
    Demo({ v }) {
      const [open, setOpen] = useState(false);
      const from = useRef(null);
      const to = useRef(null);
      // replaceFrom: the panel takes the button's place (the button's own
      // glass grows into it) instead of budding off a button that stays.
      const opts = { ...changed({ duration: v.duration, reverseDuration: v.reverseDuration, morphRadius: v.morphRadius, fadeContent: v.fadeContent }, MORPH_DEFAULTS), replaceFrom: true };
      useGlassMorph(from, to, open, opts);
      return (
        <div className="docMorph">
          <Glass as="button" type="button" ref={from} group="button" className="labBtn" onClick={() => setOpen((o) => !o)}>
            More
          </Glass>
          <Glass ref={to} group="menu" className="docMorphPanel" hidden>
            <strong>It grew out of the button</strong>
            <span>Press Close and it melts back in.</span>
            <button type="button" className="labMini" onClick={() => setOpen(false)}>
              Close
            </button>
          </Glass>
        </div>
      );
    },
    code: {
      react(v) {
        const opts = { replaceFrom: true, ...changed({ duration: v.duration, reverseDuration: v.reverseDuration, morphRadius: v.morphRadius, fadeContent: v.fadeContent }, MORPH_DEFAULTS) };
        return reactExample({
          names: ['Glass', 'useGlassMorph'],
          hooks: [state('open', false), { hook: 'useRef', line: 'const button = useRef(null);' }, { hook: 'useRef', line: 'const panel = useRef(null);' }, { line: `useGlassMorph(button, panel, open${opts ? `, ${js(opts, 2)}` : ''});` }],
          body: `<div style={{ position: 'relative' }}>\n  <Glass as="button" ref={button} group="button" onClick={() => setOpen((o) => !o)}>More</Glass>\n  {/* laid out OVER the button: it grows from where the button is */}\n  <Glass ref={panel} group="menu" className="menu" style={{ position: 'absolute', top: 0 }}>…</Glass>\n</div>`,
        });
      },
      script(v) {
        const opts = { replaceFrom: true, ...changed({ duration: v.duration, reverseDuration: v.reverseDuration, morphRadius: v.morphRadius, fadeContent: v.fadeContent }, MORPH_DEFAULTS) };
        return scriptPage(
          '<div style="position: relative">\n  <button id="more" data-glassparency="button">More</button>\n  <!-- laid out OVER the button: it grows from where the button is -->\n  <div id="menu" data-glassparency="menu" style="position: absolute; top: 0" hidden>…</div>\n</div>',
          `const morph = Glassparency.glassMorph(document.getElementById('more'), document.getElementById('menu')${opts ? `, ${js(opts)}` : ''});\n// await morph.finished;  ·  morph.reverse()  ·  glassMorph(from, to, { direction: 'out' })`
        );
      },
      html: () => null,
    },
  },

  // ---- Shape spring -------------------------------------------------------------------
  {
    id: 'shape-spring',
    title: 'Shape spring',
    section: 'Motion',
    blurb: 'Spring any element between shapes: its width, height and corner radius each follow an under-damped spring, so it overshoots and wobbles into the new shape like a liquid. Click the glass to change its shape.',
    groups: ['card'],
    knobs: [
      { key: 'stiffness', type: 'range', label: 'Stiffness (higher = snappier)', min: 40, max: 500, step: 5, value: 170 },
      { key: 'damping', type: 'range', label: 'Damping (lower = more wobble)', min: 0.05, max: 1, step: 0.01, value: 0.42 },
      { key: 'radiusDamping', type: 'range', label: 'Corner damping', min: 0.05, max: 1, step: 0.01, value: 0.55 },
    ],
    remount: (v) => `${v.stiffness}|${v.damping}|${v.radiusDamping}`,
    Demo({ v }) {
      const ref = useRef(null);
      const [i, setI] = useState(0);
      useShapeSpring(ref, SPRING_SHAPES[i], changed({ stiffness: v.stiffness, damping: v.damping, radiusDamping: v.radiusDamping }, SPRING_DEFAULTS));
      return (
        <div className="docSpring">
          <Glass ref={ref} group="card" glass={{ shape: 'roundedRectangle' }} className="docSpringBox" onClick={() => setI((n) => (n + 1) % SPRING_SHAPES.length)} role="button" tabIndex={0} aria-label="Change shape" />
          <span className="docNote">click it: {['circle', 'capsule', 'rounded square'][i]}</span>
        </div>
      );
    },
    code: {
      react(v) {
        const opts = orNone(changed({ stiffness: v.stiffness, damping: v.damping, radiusDamping: v.radiusDamping }, SPRING_DEFAULTS));
        return reactExample({
          names: ['Glass', 'useShapeSpring'],
          hooks: [state('expanded', false), { hook: 'useRef', line: 'const ref = useRef(null);' }, { line: `useShapeSpring(ref, expanded ? { width: 320, height: 200, radius: 28 } : { width: 120, height: 120, radius: 60 }${opts ? `, ${js(opts, 2)}` : ''});` }],
          body: `<Glass ref={ref} group="card" glass={{ shape: 'roundedRectangle' }} onClick={() => setExpanded((e) => !e)} />`,
        });
      },
      script(v) {
        const opts = orNone(changed({ stiffness: v.stiffness, damping: v.damping, radiusDamping: v.radiusDamping }, SPRING_DEFAULTS));
        return scriptPage('<div id="card" data-glassparency="card" data-glassparency-props=\'{"shape":"roundedRectangle"}\'></div>', `const spring = Glassparency.createShapeSpring(document.getElementById('card')${opts ? `, ${js(opts)}` : ''});\nspring.to({ width: 260, height: 72, radius: 36 });`);
      },
      html: () => null,
    },
  },
];

// --- Helpers the entries above share -----------------------------------------------------------
/** The per-element glass keys the "Glass on any element" page exposes. */
const GLASS_KEYS = ['shape', 'tint', 'tintOpacity', 'blur', 'thickness', 'bevel', 'ior', 'rimLight', 'squish', 'squishGrow', 'squishPull', 'squishBounce'];
const RADIOS = ['Small', 'Medium', 'Large', 'Huge'];
const MORPH_DEFAULTS = { duration: 780, reverseDuration: 620, morphRadius: 34, fadeContent: true };
const SPRING_DEFAULTS = { stiffness: 170, damping: 0.42, radiusDamping: 0.55 };
const SPRING_SHAPES = [
  { width: 120, height: 120, radius: 60 },
  { width: 260, height: 72, radius: 36 },
  { width: 200, height: 160, radius: 28 },
];

export const indent = (s, n = 2) =>
  s
    .split('\n')
    .map((l) => ' '.repeat(n) + l)
    .join('\n');

/** placement / align only when not the default. */
const placeProps = (v) => changed({ placement: v.placement, align: v.align }, { placement: 'auto', align: 'start' });
const placeAttrs = (v) => Object.entries(placeProps(v)).map(([k, x]) => htmlAttr(`data-glassparency-${k}`, x));
const changedDetents = (v) => (v.low === 0.45 && v.high === 0.92 ? undefined : [v.low, v.high]);
const toastOpts = (v) => changed({ title: v.title, body: v.body || undefined, icon: v.icon ? code("'<svg …>…</svg>'") : undefined, duration: v.duration, props: orNone(styleOf(v)) }, { duration: 4000 });

/** Code for the three lens bars (tab bar, sidebar, segmented): same API. */
function lensBarCode(Comp, create, attr, defaults, labels, segmented = false) {
  const opts = (v) => changed({ lensScale: v.lensScale, inset: v.inset }, defaults);
  return {
    react(v) {
      const s = state(segmented ? 'range' : 'tab', 0);
      const items = labels()
        .slice(0, v.count)
        .map((l) => `<button data-gp-item${segmented || Comp === 'GlassTabBar' ? ' role="tab"' : ''}>${l}</button>`)
        .join('\n');
      return reactExample({ names: [Comp], hooks: [s], body: jsx(Comp, { value: code(segmented ? 'range' : 'tab'), onChange: code(s.setter), ...opts(v), glassProps: part('bar', styleOf(v)) }, items) });
    },
    script(v) {
      const o = { value: 0, ...opts(v), props: part('bar', styleOf(v)), onChange: code('(i) => console.log(i)') };
      const items = labels()
        .slice(0, v.count)
        .map((l) => `  <button data-gp-item>${l}</button>`)
        .join('\n');
      return scriptPage(`<nav id="bar">\n${items}\n</nav>`, `Glassparency.${create}(document.getElementById('bar'), ${js(o)});`);
    },
    html(v) {
      const items = labels()
        .slice(0, v.count)
        .map((l, i) => `  <button${i === 0 ? ' aria-selected="true"' : ''}>${l}</button>`)
        .join('\n');
      const lines = [`${html(segmented ? 'div' : 'nav', [attr, propsAttr(styleOf(v))], `\n${items}\n`)}`];
      if (Object.keys(opts(v)).length) lines.push(`<!-- lensScale / inset have no markup attribute: use ${create} (Script tab). -->`);
      lines.push(`<script>document.querySelector('[${attr}]').addEventListener('glassparency:change', (e) => console.log(e.detail.index));</script>`);
      return scriptPage(lines.join('\n'));
    },
  };
}

/** Code for the popover / menu (a trigger button + a panel). */
function overlayCode(Comp, create, attr, id, panelHtml) {
  const triggerGlass = (v) => orNone(v.triggerStyle !== 'default' ? { style: v.triggerStyle } : {});
  const items = (v) => MENU_ITEMS.slice(0, v.count || 3);
  return {
    react(v) {
      const isMenu = Comp === 'GlassMenu';
      const children = isMenu ? items(v).map((t) => `<button role="menuitem">${t}</button>`).join('\n') : 'This panel grew out of its button.';
      return reactExample({
        names: [Comp],
        body: jsx(Comp, { label: v.label, ...placeProps(v), triggerGlass: triggerGlass(v), glassProps: orNone(styleOf(v)), onSelect: isMenu ? code('(i, item) => run(item.textContent)') : undefined }, children),
      });
    },
    script(v) {
      const isMenu = Comp === 'GlassMenu';
      const panel = isMenu ? `\n${items(v).map((t) => `  <button role="menuitem">${t}</button>`).join('\n')}\n` : panelHtml;
      const opts = { ...placeProps(v), props: orNone(styleOf(v)), ...(isMenu ? { onSelect: code('(i, item) => console.log(item.textContent)') } : {}) };
      return scriptPage(
        `<button id="${id}-btn">${v.label}</button>\n<div id="${id}" hidden>${panel}</div>`,
        `const btn = document.getElementById('${id}-btn');\nGlassparency.attach(btn, 'button'${triggerGlass(v) ? `, ${js(triggerGlass(v))}` : ''});\nGlassparency.${create}(btn, document.getElementById('${id}')${Object.keys(changed(opts, {})).length ? `, ${js(changed(opts, {}))}` : ''});`
      );
    },
    html(v) {
      const isMenu = Comp === 'GlassMenu';
      const panel = isMenu ? `\n${items(v).map((t) => `  <button role="menuitem">${t}</button>`).join('\n')}\n` : panelHtml;
      return scriptPage(
        `${html('button', [htmlAttr('data-glassparency', 'button'), propsAttr(triggerGlass(v)), htmlAttr(attr, id), ...placeAttrs(v), propsAttr(styleOf(v), 'data-glassparency-panel-props')], v.label)}\n<div id="${id}" hidden>${panel}</div>`
      );
    },
  };
}

/** The sidebar's sections, in order (pages.js adds the 1.5.2 ones after these). */
export const SECTIONS = ['Basics', 'Controls', 'Pickers', 'Overlays', 'Motion'];
