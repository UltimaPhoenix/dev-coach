# devcoach — documentation website

The devcoach documentation site, built with [Docusaurus](https://docusaurus.io/) and deployed to
GitHub Pages at https://ultimaphoenix.github.io/dev-coach/.

## Local development

```bash
npm install
npm start      # dev server at http://localhost:3000
npm run build  # static output → build/
```

Source pages live in `../docs/` (Docusaurus `docs` directory). The site config is in
`docusaurus.config.ts`. Deployment is automated by `.github/workflows/docs.yml` on every push to
`main` that touches `docs/**` or `website/**`.

## Structure

```
website/
├── docusaurus.config.ts   # site config (nav, footer, theme, plugins)
├── sidebars.ts            # sidebar structure
├── src/
│   ├── components/        # shared React components (ThemedShot, etc.)
│   └── pages/             # non-docs pages (if any)
└── static/                # static assets (favicon, og image, etc.)
```

The documentation source (`../docs/`) is separate from this directory so it can be read directly
on GitHub without the Docusaurus layer.
