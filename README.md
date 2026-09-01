# ROACHWORLD

A personal journal / magazine, built around
[`@chenglou/pretext`](https://github.com/chenglou/pretext) — a text-measurement
and line-breaking library that does its own layout instead of leaning on the
browser.

Astro static site + a canvas typesetter. Risograph look: two spot inks
(fluorescent pink, medium blue) over black on newsprint.

## Running it

```sh
npm install
npm run dev        # http://localhost:4321/roachworld
npm run build      # → dist/
npm run preview    # serve the build locally
```

Node 22.12+.

## How the magazine view works

Every entry ships as plain semantic HTML — that's the default reading mode, and
the accessible version. A toggle re-typesets the *same DOM* onto `<canvas>`:

```
src/lib/pretext/
  fonts.ts         font-readiness gate + resolves Astro's hashed family names
  parseDom.ts      rendered article HTML  →  ordered block list
  magazine.ts      block list  →  paginated, multi-column page of draw ops
  render.ts        draw ops  →  per-ink layers  →  composited canvas
  riso.ts          off-register ink layers, grain, duotone images
  masthead.ts      the cover wordmark
  fitHeadline.ts   binary-search a font size to fill N lines exactly
  magazineView.ts  orchestration: parse → layout → paint → paginate → resize
```

`magazine.ts` is the core. pretext's `layoutNextLineRange` accepts a different
max-width on every call, so body text can narrow around a drop cap, a
pull-quote, or an inset figure and widen again once past it — the thing CSS
columns can't do.

`magazineView.ts` mounts on `[data-magazine-view]` (see
`src/components/MagazineView.astro`). Keyboard: ← → to page, Esc to exit.
`#magazine` in the URL opens straight into it.

## Content

Entries live in `src/content/journal/*.mdx`. Frontmatter schema is in
`src/content.config.ts` (`title`, `dek`, `kicker`, `issue`, `pubDate`,
`byline`, `heroImage`, `tags`, `draft`).

Figures accept a span via class: `<figure class="wide">` (full-bleed banner),
`class="inset"` (floats, body wraps around), default is column-width.
`<blockquote>` becomes a pull-quote; `<cite>` inside it becomes the attribution.

## Deploying to GitHub Pages

1. In `astro.config.mjs`, set `site` / `base` for your target:
   - project page → `site: 'https://<user>.github.io'`, `base: '/roachworld'`
   - user page `<user>.github.io` → `base: '/'`
   - custom domain → `base: '/'`
2. Repo Settings → Pages → Source: **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` builds and deploys.

## Notes

- pretext is v0.0.x — the API may move; it's pinned in `package.json`.
- The Astro dev toolbar (bottom-center in dev) is not part of the site and is
  absent from the build.
