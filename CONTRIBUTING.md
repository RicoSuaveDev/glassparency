# Contributing to Glassparency

Thanks for helping! Bug reports, fixes, docs and new presets are all welcome.

## Where things are

- **`library/`** — the source of the `glassparency` npm package. This is where library changes go.
  - `*.js` / `*.jsx` — the library itself (start with `index.js`, `GlassProvider.jsx`, `useGlass.js`).
  - `glass.config.json` — the built-in presets (groups) and defaults.
  - `npm/` — the build script (`build.mjs`), TypeScript types (`index.d.ts`, hand-written — keep them in step with
    `index.js`), the package README, changelog and license.
- **`src/`, `index.html`** — the demo page. It uses the *published* package from npm, not `library/`.

## Building and testing a change

```bash
cd library
npm install
npm run build          # → library/build/: the package exactly as it would be published
```

The build compiles the ES module, the CommonJS build and the one-file script, checks the output, and loads the
result in Node (ESM, CommonJS and a server render). **A pull request must build** — the "Library build" check runs
the same command on every pull request that touches `library/`.

To try your build in a real page, install it into another project:

```bash
npm install /path/to/glassparency/library/build
```

Please test what you changed in a browser — in **Chrome** (floating glass is drawn live there) **and Safari or
Firefox** (the WebGL route) — and say which browsers you tried in the pull request. If your change affects motion
or performance, a note on the device / GPU helps.

## Guidelines

- Keep pull requests small and focused: one fix or feature per pull request.
- Match the surrounding code: plain JavaScript, comments that explain *why*, no new dependencies without a reason.
- Public API changes (new exports, props, config keys) need the README and `npm/index.d.ts` updated too.
- Don't bump the version or edit `npm/CHANGELOG.md` — that happens when a release is made; describe your change in
  the pull request instead.
- New presets should be generic looks (a card, a chip, a toolbar), not one app's feature.

## Reporting bugs

Open an issue with: what you expected, what happened, the browser + OS, and ideally a small page that shows it
(a CodePen / StackBlitz link is perfect). `getGlassStatus()` in the console tells whether the glass is running or
fell back to CSS, and why — include its output.

Security problems: please **don't** open a public issue — see [SECURITY.md](SECURITY.md).

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
