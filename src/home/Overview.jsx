/**
 * =============================================================================
 * src/home/Overview.jsx — "The controls" on the home page
 * =============================================================================
 * A short tour of the common controls, in place of the old glass UI lab
 * (the Playground and the Config builder do everything the lab did, and
 * more). Each tile is a small see-through window onto the same photo the
 * Playground uses, with ONE live control in it, a line about it, and a link
 * to its Playground page for the knobs and the code.
 *
 * The demos are the Playground's own (docs/controls.jsx, CONTROLS[].Demo),
 * run with each page's starting knob values — so a tile always shows exactly
 * what its Playground page opens with, and there's one place to fix a demo.
 *
 * The photo: global.backgroundImage (a preset pack, so the page's own config
 * stays on top) — the base glass canvas refracts it, and each tile shows a
 * CSS copy of it fixed to the window and clipped to the tile (docs.css
 * .docBackdrop / .docBackdropImg, the same trick as the Playground's stage).
 * As there, nothing may set z-index / overflow / transform on a tile window:
 * the controls' HTML has to stack with the glass canvases.
 * =============================================================================
 */
import { useEffect } from 'react';
import { addGlassPresets } from 'glassparency';
import { PAGES } from '../docs/pages';
import { hrefFor } from '../docs/route';
import { BACKDROPS } from '../lab/backdrops';
import './overview.css';

/** The tiles, in order: a Playground page id + the line shown under it. */
const TILES = [
  { id: 'switch', text: 'An iOS-style toggle whose knob turns to glass while you drag it.' },
  { id: 'slider', text: 'Drag the knob or click the track; the fill shows through the glass.' },
  { id: 'segmented', text: 'One glass lens slides between the options and wipes their colour.' },
  { id: 'tab-bar', text: 'A floating tab bar with a lens that follows your finger.' },
  { id: 'menu', text: 'Menus, popovers and selects grow out of their button as one piece of glass.' },
  { id: 'glass-group', text: 'Pieces in a group melt together when they come close. New in 1.5.2.' },
];

/** A Playground page's starting knob values (as docs/Playground.jsx opens it). */
const startValues = (page) => Object.fromEntries((page.knobs || []).map((k) => [k.key, k.type === 'glass' ? null : k.value]));

/** One tile: the live control over the photo, then its name, line and link. */
function Tile({ page, text }) {
  const Demo = page.Demo;
  return (
    <article className="ovTile">
      <div className="docStage ovStage">
        <div className="docBackdrop" aria-hidden="true" data-glass-ignore="">
          <div className="docBackdropImg" data-glass-ignore="" style={{ backgroundImage: `url("${BACKDROPS.lake.url}")` }} />
        </div>
        <div className="docStageBody ovStageBody">{Demo ? <Demo v={startValues(page)} /> : null}</div>
      </div>
      <div className="ovText">
        <h3>{page.title}</h3>
        <p>{text}</p>
        <a className="ovLink" href={hrefFor('playground', page.id)}>
          Open in the Playground <span aria-hidden="true">→</span>
        </a>
      </div>
    </article>
  );
}

/**
 * The section. `G` and `strong` are the home page's own glass button helper
 * and dark-chip look (main.jsx), so the two call-to-action buttons match the
 * nav's.
 */
export default function Overview({ G, strong }) {
  // The photo every tile window shows (and the base canvas refracts).
  useEffect(() => addGlassPresets({ global: { backgroundImage: BACKDROPS.lake.url } }), []);
  const tiles = TILES.map((t) => ({ ...t, page: PAGES.find((p) => p.id === t.id) })).filter((t) => t.page);
  return (
    <section className="overview" id="controls">
      <div className="wrap">
        <div className="ovHead">
          <p className="kicker">The controls</p>
          <h2 className="ovTitle">Every control, in glass.</h2>
          <p className="ovLede">
            Switches, sliders, tab bars, menus, sheets and more, each one a few lines of code. Here are six; the
            Playground has all of them, with live settings and code to copy for React, a script tag or plain HTML.
          </p>
        </div>
        <div className="ovGrid">
          {tiles.map((t) => (
            <Tile key={t.id} page={t.page} text={t.text} />
          ))}
        </div>
        <div className="ovCta">
          <G as="a" group="chip" glass={strong} className="pill dark ovBtn" href="#/playground">
            Open the Playground
          </G>
          <G as="a" group="chip" className="pill ovBtn" href="#/builder">
            Tune a look in the Config builder
          </G>
        </div>
      </div>
    </section>
  );
}
