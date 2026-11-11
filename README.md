# ferrocore-site <img src="assets/favicon.svg" alt="ferrocore logo" align="right" width="96" />

> A 5G Core in Rust. Every run is a dataset.

[![Deploy to GitHub Pages](https://github.com/aruizrab/ferrocore-site/actions/workflows/pages.yml/badge.svg)](https://github.com/aruizrab/ferrocore-site/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-a3381a.svg)](LICENSE)
[![Static site](https://img.shields.io/badge/build-none%20%28static%29-1c675b.svg)](#local-preview)

**The landing page for ferrocore, a 3GPP Release 17 5G Core written in Rust for R&D and ML / LLM-agent training.** It explains what ferrocore is, its architecture and how it is built, and shows live build progress read from `progress.json`.

Live at **https://aruizrab.github.io/ferrocore-site/**

![ferrocore social card](assets/og.png)

## What is in this repo

| Path | Purpose |
| --- | --- |
| `index.html` | The whole page: hero, what it is, capabilities, architecture, process, roadmap, progress |
| `css/style.css` | Styles and the colour tokens (light and dark) |
| `js/hero.js` | Animated 5G core in the hero (canvas, honours `prefers-reduced-motion`) |
| `js/progress.js` | Fetches and renders `progress.json` |
| `js/main.js`, `js/theme-init.js` | Theme toggle and mobile navigation |
| `assets/` | Favicon, social card (`og.svg` is the source of `og.png`) |
| `progress.json` | Progress data shown on the page |
| `.github/workflows/pages.yml` | Deploys the repository root to GitHub Pages |
| `.github/scripts/check_site.py` | Pre-deploy checks: `progress.json` schema, local links, no e-mail addresses |

No build step, no npm, no external fonts or scripts. All URLs are relative, so the page works under `/ferrocore-site/` (or any other repo name). The only absolute URLs are the canonical and Open Graph tags in `index.html`, which must name the published address.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

Open the page through the server, not as a `file://` URL: the progress section fetches `progress.json`, which browsers block on `file://`.

Run the same checks CI runs before deploying:

```bash
python3 .github/scripts/check_site.py
```

## How `progress.json` is updated

The file in this repo starts as a placeholder (`"placeholder": true`), and the page shows a "Placeholder data" banner while that flag is set.

Once ferrocore's progress metric lands, ferrocore's CI will compute progress on every push to its `main` branch (`cargo xtask progress --json`) and commit the result here as `progress.json`, authenticated with a deploy key that has write access to this repository (the private half is stored in ferrocore as the `SITE_DEPLOY_KEY` secret). That push to `main` triggers the Pages workflow, which redeploys the site.

Schema version 1:

```json
{
  "schema": 1,
  "placeholder": false,
  "generatedAt": "2026-11-11T12:00:00Z",
  "commit": "abc1234",
  "method": "one line describing how the numbers are computed",
  "overall": 42.5,
  "milestones": [{ "id": "M0", "name": "Foundations", "percent": 80, "features": 10 }],
  "features": [{ "id": "F001", "name": "Workspace foundations", "milestone": "M0", "stage": "merged", "percent": 100 }]
}
```

`stage` is one of `merged`, `implementing`, `tests`, `planned`, `spec-approved`, `spec-draft`, `not-started`. Percentages are 0 to 100. If the file is missing or invalid the page says so and keeps the rest of the content.

## Deployment

`.github/workflows/pages.yml` runs on every push to `main` and on manual dispatch. It checks the site, then uploads the repository root with `actions/upload-pages-artifact` and publishes it with `actions/deploy-pages`. Deployments share the `pages` concurrency group, so a newer push cancels an older one still in flight.

In the repository settings, **Pages > Build and deployment > Source** must be set to **GitHub Actions**.

## Publishing rules

This page is public; ferrocore's source is not yet. Keep it that way: no 3GPP specification text, no keys or secrets, no e-mail addresses, no links to private repositories and no internal file paths. The pre-deploy check catches e-mail addresses and broken local links; the rest is on review.

## Licence

MIT, see [LICENSE](LICENSE). ferrocore itself is dual-licensed Apache-2.0 OR MIT.
