# Glassparency showcase

The demo page for [glassparency](https://www.npmjs.com/package/glassparency): liquid glass for the web.

**Live:** https://ricosuavedev.github.io/glassparency/

It installs the published npm package like any other site would. Everything glass on the page (the lens,
the media player, the settings rows, the liquid drops) comes from `glassparency`; the page only adds its
own looks through the config in `src/main.jsx`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5300
```

## Deploy

Every push to `main` builds the page and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`). To show a newer release of the library:

```bash
npm install glassparency@latest
git commit -am "Update glassparency" && git push
```
