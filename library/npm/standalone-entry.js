/**
 * =============================================================================
 * glass/npm/standalone-entry.js — Entry of the one-file script build
 * =============================================================================
 * Built by build.mjs into dist/glassparency.standalone.js (an IIFE with
 * React, three.js and everything else inside). Its exports become
 * window.Glassparency. It starts by itself as soon as it loads, with
 * window.GlassparencyConfig (if set) as the config — unless the <script>
 * tag has a data-manual attribute; then call Glassparency.start() yourself.
 * The API itself is in ../standalone.js.
 * =============================================================================
 */
import { start } from '../standalone';

export * from '../standalone';

if (typeof document !== 'undefined') {
  const script = document.currentScript; // (only set while a classic script runs)
  if (!script || !script.hasAttribute('data-manual')) {
    start({ config: typeof window !== 'undefined' ? window.GlassparencyConfig : undefined });
  }
}
