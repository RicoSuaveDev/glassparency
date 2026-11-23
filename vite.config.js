import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this site from /<repo-name>/; the deploy workflow passes
// that as BASE_PATH. Locally (npm run dev) it's served from /.
//
// GLASS_PKG=/path/to/a/built/package npm run dev — use an unreleased build of
// glassparency (from DashboardPro's client/src/glass/npm/build.mjs) instead of
// the npm one, to try library changes before they're published.
const local = process.env.GLASS_PKG;
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  resolve: local
    ? {
        // (the devtools entry first: an alias to a folder can't follow the package's "exports")
        alias: [
          { find: /^glassparency\/devtools$/, replacement: `${local}/dist/devtools.js` },
          { find: /^glassparency$/, replacement: local },
        ],
        dedupe: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', 'maath', '@zumer/snapdom'] }
    : {},
  // three.js (the WebGL part) is one ~960 kB chunk, loaded lazily after first paint.
  build: { chunkSizeWarningLimit: 1100 },
});
