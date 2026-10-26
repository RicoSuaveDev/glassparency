#!/usr/bin/env node
/**
 * =============================================================================
 * glass/npm/build.mjs — Compile the Liquid Glass library into an npm package
 * =============================================================================
 * The library's source of truth is client/src/glass (the code DashboardPro
 * runs). This script compiles THAT code — nothing is copied by hand — into a
 * ready-to-publish package folder OUTSIDE the DashboardPro git tree:
 *
 *   <out>/package.json              from package.template.json (+ version)
 *   <out>/README.md, CHANGELOG.md, LICENSE      (from this folder; README gets
 *                                   the version filled into its image links)
 *   <out>/media/*.webp              promo images the README shows (npm/media)
 *   <out>/dist/index.js             ES module (React apps; "use client")
 *   <out>/dist/index.cjs            CommonJS (require(), Jest, older tools)
 *   <out>/dist/GlassCanvas-*.js|cjs the WebGL part, loaded lazily
 *   <out>/dist/index.d.ts / .d.cts  TypeScript types (index.d.ts here)
 *   <out>/dist/glassparency.standalone.js   one-file script for any site
 *                                   (React + three.js inside, window.Glassparency)
 *   <out>/dist/glass.css            the CSS (injected automatically; this
 *                                   copy is for strict-CSP sites)
 *   <out>/dist/glass.config.json    the built-in config (presets), readable
 *
 * The built-in config is DashboardPro's glass.config.json without the
 * app-only settings (APP_ONLY_GLOBALS below: its #root element and its exact
 * page background) — other sites get the generic defaults for those.
 *
 * After building it smoke-tests the result (see smokeTest): the package is
 * imported the way Node / a server renderer would (ESM and CommonJS), which
 * proves it loads without a browser and exports everything it should.
 *
 * Usage (from anywhere; the release script calls this):
 *   node client/src/glass/npm/build.mjs build [--out <dir>] [--version <x.y.z>]
 *   node client/src/glass/npm/build.mjs info          → name + version (JSON)
 *   node client/src/glass/npm/build.mjs bump <x.y.z> <notes-file>
 *        sets the template's version and adds the notes to CHANGELOG.md
 *
 * Output folder: --out, else $GLASS_OUT_DIR, else "glassparency-npm" next to
 * the DashboardPro folder. It must be outside the git tree, and an existing
 * folder is only cleared if a previous build made it (marker file).
 *
 * Two places it runs from:
 *   - inside DashboardPro (client/src/glass): Vite, React and three.js come
 *     from the client's node_modules;
 *   - STANDALONE, in the public source repo (github.com/RicoSuaveDev/glassparency,
 *     folder library/ — scripts/glass-release.sh mirrors this folder there
 *     with its own package.json, made from npm/repo.package.json). There
 *     `npm install && npm run build` uses library/node_modules and builds
 *     into library/build/ (git-ignored) unless --out says otherwise.
 *   Standalone = this folder has its own node_modules/vite.
 * =============================================================================
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Paths -----------------------------------------------------------------------------
const NPM_DIR = dirname(fileURLToPath(import.meta.url)); // client/src/glass/npm
const GLASS_DIR = resolve(NPM_DIR, '..'); // client/src/glass  (the library)
const CLIENT_DIR = resolve(GLASS_DIR, '../..'); // client           (has vite + deps)
const REPO_DIR = resolve(CLIENT_DIR, '..'); // DashboardPro     (the git tree)
// Standalone (the public source repo): the library folder has its own deps.
const STANDALONE = existsSync(join(GLASS_DIR, 'node_modules/vite'));
const DEPS_DIR = STANDALONE ? GLASS_DIR : CLIENT_DIR; // whose node_modules build + test with
const TEMPLATE = join(NPM_DIR, 'package.template.json');
const CHANGELOG = join(NPM_DIR, 'CHANGELOG.md');
const MARKER = '.glassparency-build'; // "this folder was made by build.mjs"
const README_NAME = 'glassparency'; // the package name README.md is written with

/** Globals that only make sense for DashboardPro (left out of the package's presets). */
const APP_ONLY_GLOBALS = ['root', 'background'];

// --- Small helpers ----------------------------------------------------------------------
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}
/** Is `child` inside (or equal to) `parent`? */
const inside = (child, parent) => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

// --- Commands ---------------------------------------------------------------------------
const command = process.argv[2];
if (command === 'info') {
  const t = readJson(TEMPLATE);
  console.log(JSON.stringify({ name: t.name, version: t.version, out: outDir() }));
} else if (command === 'bump') {
  bump(process.argv[3], process.argv[4]);
} else if (command === 'build') {
  await buildAll();
} else {
  console.log('Usage: node build.mjs build [--out <dir>] [--version <x.y.z>] | info | bump <x.y.z> <notes-file>');
  process.exit(command ? 1 : 0);
}

/** The output folder (see the header). */
function outDir() {
  const fallback = STANDALONE ? join(GLASS_DIR, 'build') : join(REPO_DIR, '..', 'glassparency-npm');
  return resolve(arg('--out') || process.env.GLASS_OUT_DIR || fallback);
}

/** Set the template's version and add a CHANGELOG.md entry for it. */
function bump(version, notesFile) {
  if (!SEMVER.test(version || '')) fail(`"${version}" is not a version like 1.2.3`);
  if (!notesFile || !existsSync(notesFile)) fail('bump needs a file with the release notes');
  const notes = readFileSync(notesFile, 'utf8').trim();
  if (!notes) fail('the release notes are empty');
  const t = readJson(TEMPLATE);
  t.version = version;
  writeJson(TEMPLATE, t);
  // Newest first, under the title. Each note line becomes a bullet unless
  // it already is one (or is a sub-heading / indented continuation).
  const body = notes
    .split('\n')
    .map((l) => (l.trim() === '' || /^\s*([-*]|#)/.test(l) || /^\s{2,}/.test(l) ? l : `- ${l.trim()}`))
    .join('\n');
  const date = new Date().toISOString().slice(0, 10);
  const old = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, 'utf8') : '# Changelog\n';
  const [title, ...rest] = old.split('\n');
  writeFileSync(CHANGELOG, `${title}\n\n## ${version} — ${date}\n\n${body}\n${rest.join('\n').replace(/^\n*/, '\n')}`);
  console.log(`✔ version ${version} + CHANGELOG.md entry written`);
}

// --- Build ------------------------------------------------------------------------------
async function buildAll() {
  const template = readJson(TEMPLATE);
  const version = arg('--version') || template.version;
  if (!SEMVER.test(version)) fail(`"${version}" is not a version like 1.2.3`);
  const out = outDir();
  // DashboardPro: never inside its git tree (a build must not get committed
  // there). Standalone: anywhere but the source folder itself.
  if (!STANDALONE && inside(out, REPO_DIR)) fail(`the output folder must be OUTSIDE the DashboardPro git tree:\n  ${out}`);
  if (inside(GLASS_DIR, out)) fail(`the output folder can't be (or contain) the library's source folder:\n  ${out}`);
  prepareOut(out);

  // Vite + the React plugin: the DashboardPro client's own node_modules (the
  // same versions the app builds with), or the standalone repo's.
  const { build } = await import(join(DEPS_DIR, 'node_modules/vite/dist/node/index.js'));
  const { default: react } = await import(join(DEPS_DIR, 'node_modules/@vitejs/plugin-react/dist/index.js'));
  const dist = join(out, 'dist');
  const presets = packageConfig();

  // The built-in config: config.js imports ./glass.config.json — in the
  // package that import gets the presets (the app config minus app-only keys).
  const presetPlugin = {
    name: 'glassparency-presets',
    enforce: 'pre',
    load(id) {
      if (id.split('?')[0] === join(GLASS_DIR, 'glass.config.json')) return JSON.stringify(presets); // (Vite's JSON plugin turns it into a module)
      return null;
    },
  };
  // Everything a site already has (React, three.js…) or installs with the
  // package stays an import — never bundled twice.
  const deps = [...Object.keys(template.peerDependencies), ...Object.keys(template.dependencies)];
  const external = (id) => deps.some((d) => id === d || id.startsWith(`${d}/`)) || id === 'react/jsx-runtime';
  const common = {
    configFile: false,
    root: GLASS_DIR,
    logLevel: 'warn',
    plugins: [presetPlugin, react()],
    define: { __LIQUID_GLASS_VERSION__: JSON.stringify(version) },
  };

  // 1. The library: ES module, then CommonJS (one build each, so each
  // format's lazy chunks get the right extension: .js = ESM, .cjs = CJS in
  // a "type": "module" package). The three.js part is split off (lazy).
  for (const [format, ext] of [
    ['es', 'js'],
    ['cjs', 'cjs'],
  ]) {
    console.log(`• compiling the library (${format === 'es' ? 'ES module' : 'CommonJS'})…`);
    await build({
      ...common,
      build: {
        outDir: dist,
        emptyOutDir: format === 'es',
        target: 'es2020',
        minify: false, // readable in the browser's debugger; apps minify it themselves
        cssMinify: true, // (the glass.css string the provider injects: no comments)
        sourcemap: true,
        lib: {
          entry: { index: join(GLASS_DIR, 'index.js') },
          formats: [format],
          fileName: (_f, name) => `${name}.${ext}`,
        },
        rolldownOptions: {
          external,
          output: {
            // Next.js App Router & co.: the library uses hooks and the DOM.
            banner: "'use client';",
            chunkFileNames: `chunks/[name]-[hash].${ext}`,
            // The source's comments are written for DashboardPro (where the
            // library lives); the published code ships without them. Its
            // source maps keep line mapping but not the original source.
            comments: { legal: true, annotation: true, jsdoc: false },
            sourcemapExcludeSources: true,
            // Map entries name the source file only ("glassparency/src/config.js"),
            // never the absolute path on the machine that built the package.
            sourcemapPathTransform: (rel, mapPath) => `${template.name}/src/${relative(GLASS_DIR, resolve(dirname(mapPath), rel)).split('?')[0]}`,
          },
        },
      },
    });
  }

  // 2. The one-file script for any site (everything bundled).
  console.log('• compiling the standalone script (React + three.js inside)…');
  await build({
    ...common,
    define: { ...common.define, 'process.env.NODE_ENV': '"production"' },
    build: {
      outDir: dist,
      emptyOutDir: false,
      target: 'es2020',
      minify: true,
      sourcemap: false, // (its map is 6 MB — most of a download for a debugging aid; the library build keeps its maps)
      lib: {
        entry: join(NPM_DIR, 'standalone-entry.js'),
        formats: ['iife'],
        name: 'Glassparency',
        fileName: () => 'glassparency.standalone.js',
      },
      // (an IIFE is always one file: the lazy parts are inlined)
    },
  });

  // 3. The rest of the package.
  const pkg = { ...template, version };
  delete pkg.$comment;
  writeJson(join(out, 'package.json'), pkg);
  for (const f of ['CHANGELOG.md', 'LICENSE']) cpSync(join(NPM_DIR, f), join(out, f));
  // The README is written with the template's default name: swap in the real
  // one (install commands, import lines, CDN links).
  // README: the real package name, and this version in the image links
  // ({{VERSION}} → e.g. 1.0.2: jsDelivr serves media/ from that published
  // version, so each npm page shows the pictures shipped with it).
  const readme = readFileSync(join(NPM_DIR, 'README.md'), 'utf8').replaceAll(README_NAME, pkg.name).replaceAll('{{VERSION}}', version);
  writeFileSync(join(out, 'README.md'), readme);
  // Promo images (npm/media → <out>/media), and every image the README links to must be there.
  cpSync(join(NPM_DIR, 'media'), join(out, 'media'), { recursive: true });
  const linked = [...readme.matchAll(/\/npm\/[^/@\s]+@[^/\s]+\/media\/([^)\s"']+)/g)].map((m) => m[1]);
  const missing = linked.filter((f) => !existsSync(join(out, 'media', f)));
  if (missing.length) fail(`README.md links to images that aren't in npm/media: ${missing.join(', ')}`);
  const left = readme.match(/\{\{[A-Z_]+\}\}/); // (JSX like glass={{ … }} in examples is fine)
  if (left) fail(`README.md still has the placeholder ${left[0]}`);
  cpSync(join(NPM_DIR, 'index.d.ts'), join(dist, 'index.d.ts'));
  cpSync(join(NPM_DIR, 'index.d.ts'), join(dist, 'index.d.cts'));
  cpSync(join(GLASS_DIR, 'glass.css'), join(dist, 'glass.css'));
  writeJson(join(dist, 'glass.config.json'), presets);

  checkOutput(dist);
  smokeTest(out, pkg);
  console.log(`\n✔ ${pkg.name}@${version} built in ${out}`);
}

/** Make the output folder ready: create it, or clear a previous build. */
function prepareOut(out) {
  if (existsSync(out)) {
    const files = readdirSync(out);
    if (files.length && !files.includes(MARKER)) {
      fail(`${out} exists and was not made by this build (no ${MARKER} file).\nPick another folder with --out or GLASS_OUT_DIR, or empty it yourself.`);
    }
    // Only what a build creates — anything else the user put there stays.
    // (the marker stays: a build that fails half-way must not lock the folder)
    for (const f of ['dist', 'media', 'package.json', 'README.md', 'CHANGELOG.md', 'LICENSE']) rmSync(join(out, f), { recursive: true, force: true });
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, MARKER), `Built by build.mjs — ${new Date().toISOString()} (marks this folder as a build output; not published)\n`);
}

/** The package's built-in config: the app's glass.config.json minus the app-only globals. */
function packageConfig() {
  const cfg = readJson(join(GLASS_DIR, 'glass.config.json'));
  for (const k of APP_ONLY_GLOBALS) delete cfg.global?.[k];
  cfg.$comment =
    'Liquid Glass built-in config (presets). Pass your own config to <GlassProvider config={…}> or configureGlass() — it is deep-merged over this one, so list only what you change. Every property is explained in the README.';
  return cfg;
}

/** The build must not contain anything that only exists in DashboardPro. */
function checkOutput(dist) {
  const files = readdirSync(dist, { recursive: true }).filter((f) => /\.(c?js|map|ts|css|json)$/.test(f));
  const bad = [];
  for (const f of files) {
    const code = readFileSync(join(dist, f), 'utf8');
    // (real imports only — comments may mention DashboardPro files)
    if (/(?:from\s*|import\(\s*|require\(\s*)['"][^'"]*\/(components|pages|context|theme)\//.test(code)) bad.push(`${f}: imports a DashboardPro file`);
    if (/import\.meta\.hot\.accept/.test(code)) bad.push(`${f}: contains dev-only hot-reload code`);
    if (/DashboardPro|DenPro/i.test(code)) bad.push(`${f}: mentions DashboardPro / DenPro`);
  }
  for (const need of ['index.js', 'index.cjs', 'glassparency.standalone.js']) if (!files.includes(need)) bad.push(`missing dist/${need}`);
  if (bad.length) fail(`the build is not clean:\n  ${bad.join('\n  ')}`);
  console.log('✔ build output checked (no app-only code, all entry files present)');
}

/**
 * Load the package like a site's server / test runner would: a temporary
 * project whose node_modules link the package and its dependencies (the
 * DashboardPro client's copies, or the standalone repo's), then `import` (ESM) and `require` (CJS) it
 * with Node — no browser, so this also proves nothing touches `window` or
 * `document` while loading (server rendering safety).
 */
function smokeTest(out, pkg) {
  const tmp = mkdtempSync(join(tmpdir(), 'glassparency-test-'));
  try {
    const nm = join(tmp, 'node_modules');
    mkdirSync(nm);
    const link = (name, target) => {
      const dest = join(nm, name);
      mkdirSync(dirname(dest), { recursive: true });
      symlinkSync(target, dest, 'dir');
    };
    link(pkg.name, out);
    for (const d of [...Object.keys(pkg.peerDependencies), ...Object.keys(pkg.dependencies), 'scheduler']) {
      const src = join(DEPS_DIR, 'node_modules', d);
      if (existsSync(src)) link(d, src);
    }
    const expected = [
      'GlassProvider', 'GlassLayerHost', 'Glass', 'useGlass', 'attachGlass', 'setGlassProps', 'configureGlass',
      'getGlassConfig', 'requestGlassRender', 'reserveSnapshotArea', 'GLASS_SCHEMA', 'GLASS_LAYERS', 'resolveGlass',
      'GlassSwitch', 'GlassSlider', 'createSwitch', 'createSlider',
      'createShapeSpring', 'useShapeSpring', 'glassMorph', 'useGlassMorph', 'getGlassProps', 'mergeGlassProps',
      'defineGlassElement', 'GLASS_ELEMENT', 'addGlassPresets',
    ];
    const check = `
      const missing = ${JSON.stringify(expected)}.filter((k) => !(k in m));
      if (missing.length) { console.error('missing exports: ' + missing.join(', ')); process.exit(1); }
      const r = m.resolveGlass('button');
      if (!r || typeof r.thickness !== 'number') { console.error('resolveGlass("button") did not resolve'); process.exit(1); }
    `;
    // ESM also renders the provider + a <Glass> on the "server" (react-dom/server):
    // it must give plain HTML (children only) without touching the DOM.
    const ssr = `
      const { createElement: h } = await import('react');
      const { renderToString } = await import('react-dom/server');
      const html = renderToString(h(m.GlassProvider, null, h(m.Glass, { as: 'button', group: 'button' }, 'Hello glass')));
      if (!/<button[^>]*>Hello glass<\\/button>/.test(html)) { console.error('server render gave: ' + html); process.exit(1); }
    `;
    writeFileSync(join(tmp, 'esm.mjs'), `import * as m from ${JSON.stringify(pkg.name)};\n${check}\n${ssr}\nconsole.log('ESM + server render ok');`);
    writeFileSync(join(tmp, 'cjs.cjs'), `const m = require(${JSON.stringify(pkg.name)});\n${check}\nconsole.log('CJS ok');`);
    const run = (file) =>
      execFileSync(process.execPath, ['--preserve-symlinks', '--no-warnings', join(tmp, file)], { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    for (const f of ['esm.mjs', 'cjs.cjs']) {
      try {
        console.log(`✔ smoke test: ${run(f)} (loads in Node without a browser)`);
      } catch (err) {
        fail(`smoke test ${f} failed:\n${err.stderr || err.message}`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
