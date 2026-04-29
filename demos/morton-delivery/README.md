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
