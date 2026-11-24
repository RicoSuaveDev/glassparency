/**
 * =============================================================================
 * src/docs/Docs.jsx — The playground / docs section (everything behind #/…)
 * =============================================================================
 * Rendered by main.jsx instead of the home page (hero, lab, principles) when
 * the URL hash is a docs route (route.js). Same nav, same GlassProvider, same
 * light / dark switch as the home page. Two columns:
 *   sidebar   the config builder, then every playground page by section
 *             (pages.js: the 1.5.1 controls, "New in 1.5.2" and "Setup")
 *   page      Playground (one page) or Builder
 * On phones the sidebar becomes a horizontally scrolling strip above the page.
 * =============================================================================
 */
import { PAGES, SECTIONS } from './pages';
import { hrefFor } from './route';
import Playground from './Playground';
import Builder from './Builder';
import './docs.css';

export default function Docs({ route, theme, setTheme }) {
  const current = route.page === 'playground' ? route.id || PAGES[0].id : 'builder';
  return (
    <div className="docs">
      <div className="wrap docsGrid">
        <nav className="docsSide" aria-label="Docs pages" data-glass-ignore="">
          <a className={`docsSideTop${current === 'builder' ? ' on' : ''}`} href={hrefFor('builder')} aria-current={current === 'builder' ? 'page' : undefined}>
            Config builder
          </a>
          {SECTIONS.map((section) => (
            <div key={section} className="docsSideGroup">
              <span className="docsSideHead">{section}</span>
              {PAGES.filter((c) => c.section === section).map((c) => (
                <a key={c.id} href={hrefFor('playground', c.id)} className={current === c.id ? 'on' : ''} aria-current={current === c.id ? 'page' : undefined}>
                  {c.title}
                </a>
              ))}
            </div>
          ))}
          <a className="docsSideBack" href="#lab">
            ← Back to the UI lab
          </a>
        </nav>

        <div className="docsMain">
          {route.page === 'builder' && <Builder theme={theme} setTheme={setTheme} query={route.query} />}
          {route.page === 'playground' && <Playground id={current} />}
        </div>
      </div>
    </div>
  );
}
