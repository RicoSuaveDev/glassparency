/**
 * =============================================================================
 * src/docs/codegen.js — Turns the playground's knob values into source code
 * =============================================================================
 * Every control page shows three copyable snippets that follow its knobs:
 *   React    JSX for the glassparency components
 *   Script   the one-file script build (window.Glassparency.create…)
 *   HTML     the script build's data-attribute markup (no JS at all)
 * These helpers write values the way a person would type them: single-quoted
 * strings, unquoted keys, short objects on one line, longer ones wrapped —
 * so what you copy reads like the README's examples.
 * Nothing here knows about any particular control (see controls.jsx).
 * =============================================================================
 */

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** A JS string literal, single-quoted. */
const str = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

/**
 * A JS value as source: { style: 'crystal', squish: 0.8 }.
 * Objects longer than `width` characters are written over several lines.
 * @param {unknown} v
 * @param {number} [indent] current indentation (spaces)
 */
export function js(v, indent = 0, width = 72) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return str(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)));
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'function') return v.toString();
  // A raw piece of code (a handler…): { $code: '(v) => console.log(v)' }
  if (v && typeof v === 'object' && '$code' in v) return v.$code;
  if (Array.isArray(v)) {
    const one = `[${v.map((x) => js(x, indent, width)).join(', ')}]`;
    if (one.length + indent <= width) return one;
    const pad = ' '.repeat(indent + 2);
    return `[\n${v.map((x) => pad + js(x, indent + 2, width)).join(',\n')},\n${' '.repeat(indent)}]`;
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  if (!entries.length) return '{}';
  const key = (k) => (IDENT.test(k) ? k : str(k));
  const one = `{ ${entries.map(([k, x]) => `${key(k)}: ${js(x, indent, width)}`).join(', ')} }`;
  if (one.length + indent <= width && !one.includes('\n')) return one;
  const pad = ' '.repeat(indent + 2);
  return `{\n${entries.map(([k, x]) => `${pad}${key(k)}: ${js(x, indent + 2, width)}`).join(',\n')},\n${' '.repeat(indent)}}`;
}

/**
 * One JSX attribute: name="text", name (true), name={1}, name={{ … }}.
 * Returns '' for undefined / false (left out), so callers can list every knob.
 */
export function jsxAttr(name, v, indent = 2) {
  if (v === undefined || v === false) return '';
  if (v === true) return name;
  if (typeof v === 'string') return `${name}="${v.replace(/"/g, '&quot;')}"`;
  if (v && typeof v === 'object' && '$code' in v) return `${name}={${v.$code}}`;
  return `${name}={${js(v, indent)}}`;
}

/**
 * A JSX element from a tag, attributes (name → value) and children text.
 * Short tags stay on one line; long ones put each attribute on its own line.
 */
export function jsx(tag, attrs, children, indent = 0) {
  const parts = Object.entries(attrs)
    .map(([k, v]) => jsxAttr(k, v, indent + 2))
    .filter(Boolean);
  const pad = ' '.repeat(indent);
  const open = parts.length ? `<${tag} ${parts.join(' ')}` : `<${tag}`;
  const inline = open.length + indent <= 96 && !open.includes('\n');
  const head = inline ? open : `<${tag}\n${parts.map((p) => `${pad}  ${p}`).join('\n')}\n${pad}`;
  if (children == null || children === '') return `${head}${inline ? ' ' : ''}/>`;
  const body = String(children);
  if (!body.includes('\n') && body.length < 60) return `${head}>${body}</${tag}>`;
  return `${head}>\n${body
    .split('\n')
    .map((l) => `${pad}  ${l}`)
    .join('\n')}\n${pad}</${tag}>`;
}

/** An HTML attribute: name="value", bare name for true, '' for false / undefined. */
export function htmlAttr(name, v) {
  if (v === undefined || v === false || v === null) return '';
  if (v === true) return name;
  return `${name}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
}

/**
 * data-glassparency-props='{"style":"crystal"}' — JSON in single quotes, as
 * in the README (JSON never contains a single quote unless a value does;
 * those are escaped as &#39;). '' when there are no props.
 */
export function propsAttr(props, name = 'data-glassparency-props') {
  if (!props || !Object.keys(props).length) return '';
  return `${name}='${JSON.stringify(props).replace(/'/g, '&#39;')}'`;
}

/** An HTML tag: <tag a="1" b>children</tag> (void tags: no children, no end tag). */
export function html(tag, attrs, children) {
  const list = (Array.isArray(attrs) ? attrs : Object.entries(attrs).map(([k, v]) => htmlAttr(k, v))).filter(Boolean);
  const open = `<${tag}${list.length ? ` ${list.join(' ')}` : ''}>`;
  if (VOID.has(tag)) return open;
  return `${open}${children ?? ''}</${tag}>`;
}
const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link']);

/**
 * Only the keys that differ from the defaults (so the snippets stay short and
 * never spell out a default). Keys whose value is undefined are dropped too.
 */
export function changed(values, defaults) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue;
    if (JSON.stringify(v) !== JSON.stringify(defaults?.[k])) out[k] = v;
  }
  return out;
}

/** The script tag every "Script" / "HTML" snippet starts with. */
export const SCRIPT_TAG = '<script src="https://unpkg.com/glassparency/dist/glassparency.standalone.js"></script>';

/** Wrap a script-build body in the script tag + <script>…</script>. */
export function scriptPage(markup, code) {
  const lines = [SCRIPT_TAG, ''];
  if (markup) lines.push(markup, '');
  if (code) {
    lines.push('<script>');
    lines.push(
      ...code
        .trim()
        .split('\n')
        .map((l) => (l ? `  ${l}` : l))
    );
    lines.push('</script>');
  }
  return lines.join('\n').trim();
}
