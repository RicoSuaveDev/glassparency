/**
 * =============================================================================
 * src/docs/controls152.jsx — The playground pages for the 1.5.2 features
 * =============================================================================
 * Same format as controls.jsx (id, title, section, blurb, groups, knobs,
 * Demo, code — see the header there), for what 1.5.2 added:
 *   looks              page look + per-element look (applyGlassLook, look / lookColor)
 *   squircle           corners: "round" vs "squircle", side by side
 *   light-follow       lightFollow off / auto / pointer / tilt + enableTiltHighlight()
 *   scroll-edge        <GlassScrollEdge>: blur + fade where content meets a pinned bar
 *   glass-group        <GlassGroup spacing>: pieces that melt together and split
 *   custom-shapes      shape { path } / { svg: 'child' } and <GlassText>
 *   setup              Vue / Svelte / Tailwind / Next.js (code only: noStage)
 * The API is the package README's (sections "Looks", "Squircle corners,
 * pointer / tilt highlight, scroll edge effect", "Glass that melts together",
 * "Custom shapes", "Vue", "Svelte", "Tailwind CSS", "Next.js…") and
 * index.d.ts / vue.d.ts / svelte.d.ts / tailwind.d.ts — nothing private.
 *
 * Extra entry fields used here (Playground.jsx reads them):
 *   noStage: true      no live demo (the setup page): just knobs + code
 *   code: { … }        any tab names (CodeTabs labels them; see TAB_LABELS)
 * =============================================================================
 */
import { useEffect, useRef, useState } from 'react';
import { Glass, GlassGroup, GlassScrollEdge, GlassSegmented, GlassSwitch, GlassText, applyGlassLook, enableTiltHighlight, requestGlassRender } from 'glassparency';
import { Icon } from '../lab/icons';
import { changed, html, htmlAttr, js, jsx, propsAttr, scriptPage } from './codegen';
import { code, indent, orNone, reactExample, state } from './controls';

/** The section these pages sit in (docs sidebar). */
export const SECTION_152 = 'New in 1.5.2';
export const SECTION_SETUP = 'Setup';

const LOOK_OPTIONS = { none: 'None', clear: 'Clear', frosted: 'Frosted', tinted: 'Tinted', smoke: 'Dark smoke' };
const TINT_DEFAULT = '#5b7cfa';
/** A note for the pages whose effect needs WebGL (≤ 860px wide = the CSS-glass layout). */
const WEBGL_NOTE = 'It needs WebGL glass: in a narrow window (860px or less, the mobile CSS-glass layout) the pieces show as separate CSS glass instead.';

// --- Custom shape presets (24 × 24 viewBox) ---------------------------------------------
// heart / star: plain filled paths; ring: two circles with fillRule "evenodd" = a hole.
const SHAPES = {
  heart: { label: 'Heart (path)', shape: { path: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z', viewBox: '0 0 24 24' } },
  star: { label: 'Star (path)', shape: { path: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z', viewBox: '0 0 24 24' } },
  ring: { label: 'Ring (path, evenodd hole)', shape: { path: 'M12 1a11 11 0 1 0 0 22a11 11 0 1 0 0-22z M12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10z', fillRule: 'evenodd', viewBox: '0 0 24 24' } },
  icon: { label: 'SVG icon child', shape: { svg: 'child' } },
  text: { label: 'Glass text', shape: { text: true } },
};

export const CONTROLS_152 = [
  // ---- Looks --------------------------------------------------------------------------
  {
    id: 'looks',
    title: 'Looks',
    section: SECTION_152,
    blurb:
      'Ready-made looks for the whole page in one line: clear (barely-there glass, bright rim), frosted (milky), tinted (one colour, lookColor) and dark smoke. One element can take its own look, or "none" to opt out of the page look. While this page is open the page look applies to every glass on it, the nav included; leaving the page puts it back.',
    groups: ['card', 'button', 'buttonPrimary', 'switch', 'segmented'],
    knobs: [
      { key: 'pageLook', type: 'select', label: 'Page look', options: LOOK_OPTIONS, value: 'frosted' },
      { key: 'pageColor', type: 'color', label: 'Page lookColor (tinted)', value: TINT_DEFAULT },
      { key: 'elLook', type: 'select', label: 'The highlighted card’s own look', options: { inherit: 'Page look', ...LOOK_OPTIONS }, value: 'smoke' },
      { key: 'elColor', type: 'color', label: 'Its lookColor (tinted)', value: '#ff2d55' },
    ],
    Demo({ v }) {
      // The page look: applyGlassLook returns the undo, so leaving / changing puts the old one back.
      useEffect(() => (v.pageLook === 'none' ? undefined : applyGlassLook(v.pageLook, v.pageLook === 'tinted' ? { color: v.pageColor } : undefined)), [v.pageLook, v.pageColor]);
      const [on, setOn] = useState(true);
      const [seg, setSeg] = useState(1);
      const el = v.elLook === 'inherit' ? {} : { look: v.elLook, lookColor: v.elLook === 'tinted' ? v.elColor : undefined };
      return (
        <div className="docLooks">
          <Glass group="card" className="docCard">
            <strong>Page look: {LOOK_OPTIONS[v.pageLook]}</strong>
            <span>Every glass on the page takes it.</span>
          </Glass>
          <Glass group="card" className="docCard docCardHi" {...el}>
            <strong>Own look: {v.elLook === 'inherit' ? 'page look' : LOOK_OPTIONS[v.elLook]}</strong>
            <span>look="{v.elLook === 'inherit' ? '' : v.elLook}" on this card wins over the page look.</span>
          </Glass>
          <div className="docDemoRow">
            <Glass as="button" type="button" group="button" className="labBtn">
              Cancel
            </Glass>
            <Glass as="button" type="button" group="buttonPrimary" className="labBtn">
              Accept
            </Glass>
            <GlassSwitch checked={on} onChange={setOn} aria-label="Sample switch" />
            <GlassSegmented className="labSeg docLooksSeg" value={seg} onChange={setSeg} aria-label="Sample segmented">
              {['Day', 'Week', 'Month'].map((t) => (
                <button key={t} type="button" role="tab" data-gp-item>
                  {t}
                </button>
              ))}
            </GlassSegmented>
          </div>
        </div>
      );
    },
    code: {
      react(v) {
        const page = v.pageLook === 'none' ? undefined : v.pageLook === 'tinted' ? code(`{ name: 'tinted', color: '${v.pageColor}' }`) : v.pageLook;
        const card = jsx('Glass', { group: 'card', look: v.elLook === 'inherit' ? undefined : v.elLook, lookColor: v.elLook === 'tinted' ? v.elColor : undefined }, '…');
        return [
          "import { GlassProvider, Glass, applyGlassLook } from 'glassparency';",
          '',
          '// The page look (or call applyGlassLook(…) any time; it returns an undo function):',
          jsx('GlassProvider', { look: page }, `<App />`),
          '',
          '// One element with its own look ("none" = opt out of the page look):',
          card,
        ].join('\n');
      },
      script(v) {
        const lines = [];
        if (v.pageLook !== 'none') lines.push(`Glassparency.applyLook(${js(v.pageLook)}${v.pageLook === 'tinted' ? `, { color: ${js(v.pageColor)} }` : ''});`);
        else lines.push('Glassparency.applyLook(null); // no page look');
        const props = v.elLook === 'inherit' ? undefined : orNone({ look: v.elLook, lookColor: v.elLook === 'tinted' ? v.elColor : undefined });
        lines.push(`Glassparency.attach(document.getElementById('card'), 'card'${props ? `, ${js(props)}` : ''});`);
        return scriptPage('<div id="card">…</div>', lines.join('\n'));
      },
      html(v) {
        const page = v.pageLook === 'none' ? '<html>' : `<html ${htmlAttr('data-glassparency-look', v.pageLook)}${v.pageLook === 'tinted' ? ` ${htmlAttr('data-glassparency-look-color', v.pageColor)}` : ''}>   <!-- the whole page (or on <body>) -->`;
        const card = html('div', [htmlAttr('data-glassparency', 'card'), v.elLook === 'inherit' ? '' : htmlAttr('data-glassparency-look', v.elLook), v.elLook === 'tinted' ? htmlAttr('data-glassparency-look-color', v.elColor) : ''], '…');
        return scriptPage(`${page}\n…\n${card}`);
      },
    },
  },

  // ---- Squircle corners ---------------------------------------------------------------
  {
    id: 'squircle',
    title: 'Squircle corners',
    section: SECTION_152,
    blurb:
      'corners: "squircle" gives a rounded rectangle Apple-style continuous-curvature corners (a superellipse) instead of quarter circles; the outline, rim, border, shadow and refraction all follow it. Left: round, right: squircle, same radius. Circles and capsules stay round. Off by default.',
    groups: ['card'],
    knobs: [
      { key: 'radius', type: 'range', label: 'Corner radius (px)', min: 0, max: 80, step: 1, value: 40 },
      { key: 'size', type: 'range', label: 'Size (px)', min: 100, max: 220, step: 2, value: 170 },
      { key: 'group', type: 'select', label: 'Group', options: { card: 'card', panel: 'panel', buttonPrimary: 'buttonPrimary', iconButton: 'iconButton' }, value: 'card' },
    ],
    Demo({ v }) {
      const box = { width: v.size, height: v.size, borderRadius: v.radius };
      return (
        <div className="docDemoRow docSquircle">
          {['round', 'squircle'].map((c) => (
            <div key={c} className="docDemoCol">
              <Glass group={v.group} glass={{ shape: 'roundedRectangle', corners: c, radius: v.radius }} className="docSquare" style={box} />
              <span className="docNote">{c}</span>
            </div>
          ))}
        </div>
      );
    },
    code: {
      react(v) {
        return reactExample({ names: ['Glass'], body: jsx('Glass', { group: v.group, glass: { corners: 'squircle', radius: v.radius } }, '…') });
      },
      script(v) {
        return scriptPage('<div id="card">…</div>', `Glassparency.attach(document.getElementById('card'), ${js(v.group)}, ${js({ corners: 'squircle', radius: v.radius })});\n// or for a whole group: Glassparency.configure({ groups: { ${v.group}: { corners: 'squircle', radius: ${v.radius} } } });`);
      },
      html(v) {
        return scriptPage(html('div', [htmlAttr('data-glassparency', v.group), propsAttr({ corners: 'squircle', radius: v.radius })], '…'));
      },
    },
  },

  // ---- Pointer / tilt highlight -------------------------------------------------------
  {
    id: 'light-follow',
    title: 'Pointer / tilt highlight',
    section: SECTION_152,
    blurb:
      'lightFollow turns the specular rim towards the mouse ("pointer"), follows the device tilt ("tilt"), or picks one by device ("auto": pointer with a mouse, tilt on touch screens). lightFollowAmount (0–1) sets how far it turns from lightAngle. Move the mouse over the stage. iOS only sends tilt data after the user allows it from a tap: that is what enableTiltHighlight() is for — the library never asks by itself.',
    groups: ['card', 'buttonPrimary'],
    knobs: [
      { key: 'lightFollow', type: 'select', label: 'lightFollow', options: { off: 'off', auto: 'auto', pointer: 'pointer', tilt: 'tilt' }, value: 'pointer' },
      { key: 'amount', type: 'range', label: 'lightFollowAmount', min: 0, max: 1, step: 0.01, value: 1 },
      { key: 'rimLight', type: 'range', label: 'Rim highlight (to see it better)', min: 0, max: 1, step: 0.01, value: 0.9 },
    ],
    Demo({ v }) {
      const [tilt, setTilt] = useState('');
      const props = { lightFollow: v.lightFollow, lightFollowAmount: v.amount, rimLight: v.rimLight };
      return (
        <div className="docDemoCol">
          <Glass group="card" glass={props} className="docCard docLightCard">
            <strong>Move the pointer around</strong>
            <span>The bright rim turns towards it.</span>
          </Glass>
          <div className="docDemoRow">
            <Glass as="button" type="button" group="buttonPrimary" glass={props} className="labBtn" onClick={() => enableTiltHighlight().then((ok) => setTilt(ok ? 'tilt data allowed' : 'no tilt data (refused or no sensor)'))}>
              Enable tilt (phones)
            </Glass>
            {tilt && <span className="docNote">{tilt}</span>}
          </div>
        </div>
      );
    },
    code: {
      react(v) {
        const props = lightProps(v);
        return reactExample({
          names: ['Glass', 'enableTiltHighlight'],
          body: `<>\n${indent(jsx('Glass', { group: 'card', glass: props }, '…'))}\n  {/* iOS: tilt needs a tap first */}\n${indent(jsx('button', { onClick: code('() => enableTiltHighlight()') }, 'Enable tilt'))}\n</>`,
        });
      },
      script(v) {
        return scriptPage(
          '<div id="card">…</div>\n<button id="tilt">Enable tilt</button>',
          `Glassparency.attach(document.getElementById('card'), 'card', ${js(lightProps(v))});\n// iOS: tilt data only after a tap (resolves true / false)\ndocument.getElementById('tilt').onclick = () => Glassparency.enableTiltHighlight();`
        );
      },
      html(v) {
        return scriptPage(`${html('div', [htmlAttr('data-glassparency', 'card'), propsAttr(lightProps(v))], '…')}\n<button onclick="Glassparency.enableTiltHighlight()">Enable tilt</button>`);
      },
    },
  },

  // ---- Scroll edge effect -------------------------------------------------------------
  {
    id: 'scroll-edge',
    title: 'Scroll edge effect',
    section: SECTION_152,
    blurb:
      'Like iOS 26: content scrolling under a pinned bar blurs and fades out over the last few dozen px instead of a hard cut. effect "soft" (gradual blur + fade) or "hard" (a more opaque backing, crisp edge), on the top, bottom or both edges. inset = the bar’s height (fully covered), size = the fade beyond it. Scroll the list.',
    groups: ['topbar', 'tabBar'],
    knobs: [
      { key: 'edges', type: 'select', label: 'edges', options: { top: 'top', bottom: 'bottom', both: 'both' }, value: 'both' },
      { key: 'effect', type: 'select', label: 'effect', options: { soft: 'soft', hard: 'hard' }, value: 'soft' },
      { key: 'size', type: 'range', label: 'size (fade, px)', min: 0, max: 120, step: 1, value: 32 },
      { key: 'insetTop', type: 'range', label: 'inset top (bar height, px)', min: 0, max: 120, step: 1, value: 56 },
      { key: 'insetBottom', type: 'range', label: 'inset bottom (px)', min: 0, max: 120, step: 1, value: 56 },
      { key: 'color', type: 'text', label: 'color (auto or a CSS colour)', value: 'auto' },
    ],
    Demo({ v }) {
      const top = v.edges !== 'bottom';
      const bottom = v.edges !== 'top';
      return (
        // The wrapper clips the scroller to its rounded corners (the scrollbar
        // painted square corners on the right).
        <div className="docEdgeClip">
        <GlassScrollEdge className="docEdge" edges={v.edges} effect={v.effect} size={v.size} inset={edgeInset(v)} color={v.color || 'auto'} aria-label="Scrolling list">
          {top && (
            <Glass group="topbar" className="docEdgeBar docEdgeTop" style={{ height: v.insetTop || 48 }}>
              <strong>Library</strong>
            </Glass>
          )}
          <ul className="docEdgeList">
            {ROWS.map((r, i) => (
              <li key={i}>
                <span className="docEdgeSwatch" style={{ background: r.c }} />
                <span>
                  <strong>{r.t}</strong>
                  <em>{r.s}</em>
                </span>
              </li>
            ))}
          </ul>
          {bottom && (
            <Glass group="topbar" className="docEdgeBar docEdgeBottom" style={{ height: v.insetBottom || 48 }}>
              <strong>Now playing</strong>
            </Glass>
          )}
        </GlassScrollEdge>
        </div>
      );
    },
    code: {
      react(v) {
        const top = v.edges !== 'bottom';
        const bottom = v.edges !== 'top';
        const kids = [top && "<header style={{ position: 'sticky', top: 0, zIndex: 2 }}>…</header>", '…your content…', bottom && "<footer style={{ position: 'sticky', bottom: 0, zIndex: 2 }}>…</footer>"].filter(Boolean).join('\n');
        return reactExample({ names: ['GlassScrollEdge'], body: jsx('GlassScrollEdge', { ...edgeOpts(v), style: code("{ height: '100vh' }") }, kids) });
      },
      script(v) {
        return scriptPage('<div id="list" style="height: 100vh; overflow-y: auto">\n  <header style="position: sticky; top: 0; z-index: 2">…</header>\n  …\n</div>', `const edge = Glassparency.createScrollEdge(document.getElementById('list'), ${js(edgeOpts(v))});\n// edge.update({ effect: 'hard' })  ·  edge.destroy()  ·  createScrollEdge(window, …) = the page itself`);
      },
      html(v) {
        const o = edgeOpts(v);
        const ins = typeof o.inset === 'object' ? `${o.inset.top ?? 0} ${o.inset.bottom ?? 0}` : o.inset;
        return scriptPage(
          html(
            'div',
            [htmlAttr('data-glassparency-scroll-edge', `${v.edges} ${v.effect}`), ins !== undefined ? htmlAttr('data-glassparency-scroll-edge-inset', ins) : '', v.size !== 32 ? htmlAttr('data-glassparency-scroll-edge-size', v.size) : '', o.color ? htmlAttr('data-glassparency-scroll-edge-color', o.color) : '', htmlAttr('style', 'height: 100vh; overflow-y: auto')],
            '\n  <header style="position: sticky; top: 0; z-index: 2">…</header>\n  …\n'
          )
        );
      },
    },
  },

  // ---- Glass that melts together ------------------------------------------------------
  {
    id: 'glass-group',
    title: 'Glass that melts together',
    section: SECTION_152,
    blurb: `Like Apple’s GlassEffectContainer: the glass inside a <GlassGroup> is one liquid surface. Pieces that come within spacing px of each other melt into one blob and pull apart as they move away — live, while they animate. Move them with the gap slider, turn on Breathe, or drag the loose drop. Up to 16 pieces melt per group. ${WEBGL_NOTE}`,
    groups: ['iconButton'],
    knobs: [
      { key: 'spacing', type: 'range', label: 'spacing (px)', min: 0, max: 200, step: 1, value: 24 },
      { key: 'gap', type: 'range', label: 'Gap between the pieces (px)', min: 0, max: 120, step: 1, value: 12 },
      { key: 'breathe', type: 'bool', label: 'Breathe (pieces glide apart and back)', value: false },
    ],
    Demo({ v }) {
      const box = useRef(null);
      const [apart, setApart] = useState(false);
      const [drop, setDrop] = useState({ x: 40, y: 150 });
      const drag = useRef(null);
      // Breathe: flip between the gap and a wide gap; the CSS transition does the motion.
      useEffect(() => {
        if (!v.breathe) return setApart(false);
        const t = setInterval(() => setApart((a) => !a), 1400);
        return () => clearInterval(t);
      }, [v.breathe]);
      const gap = apart ? v.gap + 70 : v.gap;
      const size = 64;
      const down = (e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { sx: e.clientX, sy: e.clientY, x: drop.x, y: drop.y };
      };
      const move = (e) => {
        const d = drag.current;
        const b = box.current;
        if (!d || !b) return;
        setDrop({
          x: Math.min(b.clientWidth - size, Math.max(0, d.x + e.clientX - d.sx)),
          y: Math.min(b.clientHeight - size, Math.max(0, d.y + e.clientY - d.sy)),
        });
        requestGlassRender();
      };
      const up = () => (drag.current = null);
      return (
        <GlassGroup ref={box} spacing={v.spacing} className="docMelt">
          {[-1, 0, 1].map((i) => (
            <Glass key={i} group="iconButton" glass={{ shape: 'circle' }} className="docBlob" style={{ left: `calc(50% - ${size / 2}px + ${i * (size + gap)}px)`, top: 30 }} aria-hidden="true">
              <Icon name={['heart', 'share', 'trash'][i + 1]} />
            </Glass>
          ))}
          <Glass group="iconButton" glass={{ shape: 'circle' }} className="docBlob docBlobDrag" style={{ left: drop.x, top: drop.y }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Drag me">
            <Icon name="plus" />
          </Glass>
        </GlassGroup>
      );
    },
    code: {
      react(v) {
        const items = ['<Glass as="button" group="iconButton">…</Glass>', '<Glass as="button" group="iconButton">…</Glass>'].join('\n');
        return reactExample({ names: ['Glass', 'GlassGroup'], body: jsx('GlassGroup', { spacing: v.spacing !== 24 ? v.spacing : undefined, className: 'toolbar' }, items) });
      },
      script(v) {
        return scriptPage(
          '<div id="toolbar">\n  <button data-glassparency="iconButton">…</button>\n  <button data-glassparency="iconButton">…</button>\n</div>',
          `const group = Glassparency.createGlassGroup(document.getElementById('toolbar')${v.spacing !== 24 ? `, { spacing: ${v.spacing} }` : ''});\n// group.setSpacing(40)  ·  group.destroy()`
        );
      },
      html(v) {
        return scriptPage(html('div', [htmlAttr('data-glassparency-group', v.spacing)], '\n  <button data-glassparency="iconButton">…</button>\n  <button data-glassparency="iconButton">…</button>\n'));
      },
    },
  },

  // ---- Custom shapes + glass text -----------------------------------------------------
  {
    id: 'custom-shapes',
    title: 'Custom shapes & glass text',
    section: SECTION_152,
    blurb: `Glass in any outline: an SVG path (fillRule "evenodd" cuts holes), the <svg> icon inside the element, or text in the element’s own font (<GlassText>: the DOM text stays selectable and readable by screen readers). The rim, refraction, light, border and shadow all follow the real outline. ${WEBGL_NOTE.replace('the pieces show as separate CSS glass', 'the shape shows as a frosted pane masked to the outline (no rim light or refraction)')}`,
    groups: ['iconButton', 'panel'],
    knobs: [
      { key: 'kind', type: 'select', label: 'Shape', options: Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.label])), value: 'heart' },
      { key: 'word', type: 'text', label: 'Glass text (Shape: Glass text)', value: 'Liquid' },
      { key: 'size', type: 'range', label: 'Size (px)', min: 80, max: 260, step: 2, value: 180 },
      { key: 'group', type: 'select', label: 'Group', options: { iconButton: 'iconButton', panel: 'panel', card: 'card', buttonPrimary: 'buttonPrimary' }, value: 'iconButton' },
    ],
    remount: (v) => v.kind,
    Demo({ v }) {
      if (v.kind === 'text') {
        return (
          <GlassText group={v.group} className="docGlassText" style={{ fontSize: Math.round(v.size * 0.6) }}>
            {v.word || ' '}
          </GlassText>
        );
      }
      const box = { width: v.size, height: v.size };
      if (v.kind === 'icon') {
        return (
          <Glass as="button" type="button" group={v.group} shape={SHAPES.icon.shape} className="docShape" style={box} aria-label="Favourite">
            <Icon name="heart" size={v.size} />
          </Glass>
        );
      }
      return <Glass group={v.group} shape={SHAPES[v.kind].shape} className="docShape" style={box} aria-hidden="true" />;
    },
    code: {
      react(v) {
        if (v.kind === 'text') return reactExample({ names: ['GlassText'], body: jsx('GlassText', { as: 'h1', group: v.group, style: code(`{ fontSize: ${Math.round(v.size * 0.6)}, fontWeight: 900 }`) }, v.word) });
        if (v.kind === 'icon') return reactExample({ names: ['Glass'], body: jsx('Glass', { as: 'button', group: v.group, shape: { svg: 'child' }, 'aria-label': 'Favourite' }, '<HeartIcon />') });
        return reactExample({ names: ['Glass'], body: jsx('Glass', { group: v.group, shape: SHAPES[v.kind].shape, style: code(`{ width: ${v.size}, height: ${v.size} }`) }) });
      },
      script(v) {
        const { tag, inner } = shapeMarkup(v);
        return scriptPage(html(tag, { id: 'shape' }, inner), `Glassparency.attach(document.getElementById('shape'), ${js(v.group)}, ${js({ shape: SHAPES[v.kind].shape })});`);
      },
      html(v) {
        const { tag, inner } = shapeMarkup(v);
        return scriptPage(html(tag, [htmlAttr('data-glassparency', v.group), propsAttr({ shape: SHAPES[v.kind].shape })], inner));
      },
    },
  },

  // ---- Framework setup (code only) ----------------------------------------------------
  {
    id: 'setup',
    title: 'Vue, Svelte, Tailwind & Next.js',
    section: SECTION_SETUP,
    noStage: true,
    blurb:
      'Glassparency outside plain React: glassparency/vue (a v-glass directive and components for every control), glassparency/svelte (use:glass and actions, Svelte 5), glassparency/tailwind (classes like glass-frosted glass-group-card) and Next.js / server rendering. Pick a look and a group: every snippet follows them.',
    groups: ['card'],
    knobs: [
      { key: 'look', type: 'select', label: 'Look', options: LOOK_OPTIONS, value: 'frosted' },
      { key: 'color', type: 'color', label: 'lookColor (tinted)', value: TINT_DEFAULT },
      { key: 'group', type: 'text', label: 'Group', value: 'card' },
    ],
    Demo: () => null,
    code: {
      vue(v) {
        const look = v.look === 'none' ? null : v.look;
        const g = v.group || 'card';
        return [
          '// main.js — Vue 3.3+ / Nuxt',
          "import { createApp } from 'vue';",
          "import { GlassparencyPlugin } from 'glassparency/vue';",
          `createApp(App).use(GlassparencyPlugin${look ? `, { look: ${js(look)} }` : ''}).mount('#app');`,
          '',
          '<!-- any component -->',
          `<div v-glass="'${g}'">…</div>`,
          look && look !== 'tinted' ? `<div v-glass:${g}.${look}>…</div>          <!-- group as the argument, look as a modifier -->` : `<div v-glass="{ group: '${g}', look: 'tinted', lookColor: '${v.color}' }">…</div>`,
          `<Glass as="section" group="${g}"${look ? ` look="${look}"` : ''}>…</Glass>`,
          '<GlassSwitch v-model="wifi" aria-label="Wi-Fi" />',
          '<GlassSlider v-model="volume" :min="0" :max="100" />',
        ].join('\n');
      },
      svelte(v) {
        const look = v.look === 'none' ? null : v.look;
        const g = v.group || 'card';
        return [
          '<script>',
          "  import { glass, startGlass, GlassSwitch } from 'glassparency/svelte';",
          `  startGlass(${look ? js(look === 'tinted' ? { look: { name: 'tinted', color: v.color } } : { look }) : ''}); // optional: starts by itself on first use`,
          '  let wifi = $state(true);',
          '</script>',
          '',
          `<div use:glass={'${g}'}>…</div>`,
          `<div use:glass={${js({ group: g, look: look || undefined, lookColor: look === 'tinted' ? v.color : undefined })}}>…</div>`,
          '<GlassSwitch bind:checked={wifi} aria-label="Wi-Fi" />',
        ].join('\n');
      },
      tailwind(v) {
        const g = v.group || 'card';
        const lookClass = v.look === 'none' ? 'glass' : `glass-${v.look}`;
        const tint = v.look === 'tinted' ? ` glass-tint-[${v.color}]` : '';
        return [
          '/* Tailwind v4 — your CSS */',
          '@import "tailwindcss";',
          '@plugin "glassparency/tailwind";',
          '',
          '// Tailwind v3 — tailwind.config.js',
          "// plugins: [require('glassparency/tailwind')],",
          '',
          '<!-- markup -->',
          `<section class="${lookClass}${tint} glass-group-${g} rounded-3xl p-6">…</section>`,
          '',
          '<!-- the library attaches the glass: load the script build, or in your app’s JS (bundler): -->',
          "// import { start } from 'glassparency/vanilla';",
          '// start();                      // a React / Next.js app with <GlassProvider>: start({ provider: false })',
        ].join('\n');
      },
      next(v) {
        const look = v.look === 'none' ? null : v.look;
        const g = v.group || 'card';
        return [
          '// app/layout.js — every browser entry starts with "use client"',
          "import { GlassProvider } from 'glassparency';",
          '',
          'export default function RootLayout({ children }) {',
          '  return (',
          '    <html lang="en">',
          '      <body>',
          `        <GlassProvider${look ? ` look=${look === 'tinted' ? `{{ name: 'tinted', color: '${v.color}' }}` : `"${look}"`}` : ''}>{children}</GlassProvider>`,
          '      </body>',
          '    </html>',
          '  );',
          '}',
          '',
          `// a page: <Glass as="section" group="${g}">…</Glass>`,
          '',
          '// Classes / data attributes too (Tailwind): a client component',
          "'use client';",
          "import { useEffect } from 'react';",
          "import { start } from 'glassparency/vanilla';",
          'export function GlassClasses() {',
          '  useEffect(() => start({ provider: false }), []);',
          '  return null;',
          '}',
        ].join('\n');
      },
    },
  },
];

// --- Helpers --------------------------------------------------------------------------------
/** lightFollow props, only what differs from the defaults (off / 1). */
const lightProps = (v) => ({ lightFollow: v.lightFollow, ...changed({ lightFollowAmount: v.amount }, { lightFollowAmount: 1 }) });
/** inset for the chosen edges: one number, or { top, bottom } for both. */
const edgeInset = (v) => (v.edges === 'both' ? { top: v.insetTop, bottom: v.insetBottom } : v.edges === 'top' ? v.insetTop : v.insetBottom);
/** GlassScrollEdge options, defaults left out (edges top, effect soft, size 32, color auto). */
const edgeOpts = (v) => {
  const inset = edgeInset(v);
  return {
    ...changed({ edges: v.edges, effect: v.effect, size: v.size, color: v.color || 'auto' }, { edges: 'top', effect: 'soft', size: 32, color: 'auto' }),
    inset: inset && (typeof inset === 'number' || inset.top || inset.bottom) ? inset : undefined,
  };
};
/** The element a custom-shape snippet puts the glass on. */
function shapeMarkup(v) {
  if (v.kind === 'text') return { tag: 'h1', inner: v.word };
  if (v.kind === 'icon') return { tag: 'button', inner: '<svg viewBox="0 0 24 24">…</svg>' };
  return { tag: 'div', inner: '' };
}

/** Rows for the scroll edge demo (colour swatches, so the blur / fade is easy to see). */
const ROWS = [
  ['#ff5b1f', 'Sunset Drive', 'Album · 12 songs'],
  ['#2b4bf2', 'Blue Hour', 'Single'],
  ['#f4d000', 'Lemonade Days', 'Album · 9 songs'],
  ['#28c840', 'Greenhouse', 'EP · 5 songs'],
  ['#ff2d55', 'Neon Hearts', 'Album · 14 songs'],
  ['#5e5ce6', 'Night Swim', 'Single'],
  ['#ff9f0a', 'Amber Waves', 'Album · 11 songs'],
  ['#30b0c7', 'Glass Lake', 'EP · 6 songs'],
  ['#bf5af2', 'Violet Hours', 'Album · 10 songs'],
  ['#111111', 'Monochrome', 'Single'],
  ['#ff453a', 'Red Shift', 'Album · 8 songs'],
  ['#64d2ff', 'Skyline', 'EP · 4 songs'],
  ['#32d74b', 'Evergreen', 'Album · 13 songs'],
  ['#ffd60a', 'Golden', 'Single'],
].map(([c, t, s]) => ({ c, t, s }));
