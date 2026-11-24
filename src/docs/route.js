/**
 * =============================================================================
 * src/docs/route.js — The tiny hash router for the playground / docs pages
 * =============================================================================
 * The showcase is one static page (GitHub Pages, no server routes), so the
 * docs live behind the URL hash:
 *   #/playground            the playground's first control
 *   #/playground/<id>       one control's page (src/docs/controls.jsx ids)
 *   #/builder               the online config builder (src/docs/Builder.jsx)
 *   #/builder?group=switch  …opened on one config group
 * Every other hash (#lab, #principles, #top…) is a plain anchor on the home
 * page, exactly as before — useRoute() returns null for those, and once the
 * home page is back on screen it scrolls to that anchor (the browser's own
 * jump ran before the home page was rendered, so it found nothing).
 * No dependency: hashchange + useSyncExternalStore.
 * =============================================================================
 */
import { useEffect, useSyncExternalStore } from 'react';

const subscribe = (fn) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};
const read = () => (typeof location === 'undefined' ? '' : location.hash);

/**
 * The docs route for the current hash, or null on the home page.
 * Anything after "?" is the page's query (URLSearchParams).
 * @returns {{ page: 'playground'|'builder', id: string|null, query: URLSearchParams }|null}
 */
export function parseRoute(hash) {
  if (!hash.startsWith('#/')) return null;
  const [path, search = ''] = hash.slice(2).split('?');
  const [page, id] = path.split('/');
  if (page === 'playground' || page === 'builder') return { page, id: id ? decodeURIComponent(id) : null, query: new URLSearchParams(search) };
  return null;
}

/** React hook: the current docs route (re-renders on hashchange). */
export function useRoute() {
  const hash = useSyncExternalStore(subscribe, read, () => '');
  const route = parseRoute(hash);
  const key = route ? `${route.page}/${route.id || ''}` : hash;

  useEffect(() => {
    if (route) {
      // A new docs page starts at the top (like a real page load).
      window.scrollTo(0, 0);
      return;
    }
    // Back on the home page with an anchor (#lab…): jump to it once it exists.
    if (hash.length > 1) {
      const id = decodeURIComponent(hash.slice(1));
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    }
    // (route is derived from hash; key covers both)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return route;
}

/** The href for a docs page. */
export const hrefFor = (page, id) => `#/${page}${id ? `/${encodeURIComponent(id)}` : ''}`;
