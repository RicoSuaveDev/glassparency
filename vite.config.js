import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this site from /<repo-name>/; the deploy workflow passes
// that as BASE_PATH. Locally (npm run dev) it's served from /.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  // three.js (the WebGL part) is one ~960 kB chunk, loaded lazily after first paint.
  build: { chunkSizeWarningLimit: 1100 },
});
