# Morton Delivery Demo

A small static marketing site for **Morton Delivery, LLC** — a placeholder business — rendered with Remix 3.

It is intentionally tiny: three server-rendered pages (Home, Services, Contact) sharing one layout, plus an inline SVG truck logo and a matching favicon.

## What this demo shows

- Multi-page server rendering with `remix/component` and `renderToStream`
- A typed route table built with `remix/fetch-router/routes`
- Route mapping with `remix/fetch-router`
- Static asset serving via `remix/static-middleware`
- Wrapping the rendered stream with `createHtmlResponse` from `remix/response/html`

## Run

```sh
pnpm -C demos/morton-delivery dev
```

Then open [http://localhost:44100](http://localhost:44100).

## Build a static site

The demo can be prerendered to plain HTML for static hosting:

```sh
pnpm -C demos/morton-delivery build
```

This writes `index.html`, `services/index.html`, `contact/index.html`, and the
`favicon.svg` to `dist/`. The build runs the same router used by the dev server,
so pages stay byte-for-byte identical between dev and production.

Preview the static output locally with any static server, e.g.:

```sh
npx serve demos/morton-delivery/dist
```

## Deploy to Vercel

The project is configured for static deployment on Vercel via `vercel.json`.

1. In the Vercel dashboard, import this repository as a new project.
2. Set **Root Directory** to `demos/morton-delivery`.
3. Enable **Include source files outside of the Root Directory in the Build
   Step** so Vercel can resolve the workspace `remix` dependency from the
   monorepo root.
4. Leave **Framework Preset** as `Other` — `vercel.json` already declares the
   build command (`pnpm build`), install command (`pnpm install --frozen-lockfile`),
   and output directory (`dist`).
5. Deploy.

Alternatively, from a local checkout, deploy from the **monorepo root** so
Vercel includes `pnpm-workspace.yaml` and `pnpm-lock.yaml` in the build:

```sh
# From the monorepo root, NOT from demos/morton-delivery
cd /path/to/remix
npx vercel
```

When prompted:

- **Set up and deploy?** yes
- **Link to existing project?** yes (if one exists) or no to create a new one
- **What's your project's name?** `morton-delivery`
- **In which directory is your code located?** `demos/morton-delivery`

That last answer sets the project's *Root Directory* to the demo while still
shipping the workspace lockfile, which is required to resolve
`remix: workspace:*`. Subsequent deploys: `npx vercel --prod` from the same
monorepo root.

> Do **not** run `vercel` from inside `demos/morton-delivery`. The CLI will
> only upload that subdirectory and the install step will fail with
> `Headless installation requires a pnpm-lock.yaml file` because the lockfile
> lives at the monorepo root.

## Layout

```
app/
  router.ts            — fetch-router with staticFiles + page routes
  routes.ts            — typed route table
  controllers/
    home.tsx           — "/" controller + page
    services.tsx       — "/services" controller + page
    contact.tsx        — "/contact" controller + page
    ui/
      document.tsx     — <html> shell
      layout.tsx       — header, nav, footer
      truck-logo.tsx   — inline SVG brand mark
      styles.ts        — shared `css(...)` styles
  utils/
    render.tsx         — renderToStream + createHtmlResponse helper
public/
  favicon.svg          — truck favicon
```
