# assets-middleware

Middleware for building and serving JavaScript/CSS assets with [esbuild](https://esbuild.github.io/) for use with [`fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router).

This middleware runs esbuild in the same process as your server and serves the built assets directly from memory without writing to disk.

## Installation

```sh
npm install @remix-run/assets-middleware
```

## Usage

```ts
import { createRouter } from '@remix-run/fetch-router'
import { assets } from '@remix-run/assets-middleware'

let router = createRouter({
  middleware: [
    assets({
      entryPoints: ['app/assets/**/*'],
      outdir: 'public/assets',
      bundle: true,
      minify: true,
      splitting: true,
      format: 'esm',
    }),
  ],
})
```

The middleware accepts an esbuild configuration object as the first argument. The `outdir` option is **required** and determines both the output file structure and the URL path for serving assets. The middleware runs the build once on the first request and serves the built files from memory (they are never written to disk).

The built assets will be served from the URL path corresponding to the `outdir`. For example, with `outdir: 'public/assets'`, you can reference the built files in your HTML:

```html
<script type="module" src="/assets/app.js"></script>
<link rel="stylesheet" href="/assets/styles.css" />
```

### Development Mode

Use the `watch: true` option to enable watch mode for development:

```ts
let router = createRouter({
  middleware: [
    assets(
      {
        entryPoints: ['app/assets/app.tsx'],
        outdir: 'public/assets',
        bundle: true,
        splitting: true,
        format: 'esm',
        sourcemap: true,
      },
      {
        watch: true,
      },
    ),
  ],
})
```

In watch mode, esbuild will rebuild the assets whenever source files change, and the middleware will serve the updated files on the next request. The built assets are served with `Cache-Control: no-cache` headers in watch mode to ensure browsers always fetch the latest version.

```html
<script type="module" src="/assets/app.js"></script>
```

### Asset Manifest via Context

The middleware populates `context.assets` with a Map that maps asset names to metadata about each asset. This allows you to reference assets by their source filenames, even when using content hashing for long-term caching.

```ts
import { createRouter } from '@remix-run/fetch-router'
import { assets } from '@remix-run/assets-middleware'

let router = createRouter({
  middleware: [
    assets({
      entryPoints: ['app/assets/app.tsx', 'app/assets/admin.tsx'],
      outbase: 'app/assets',
      outdir: 'public/assets',
      bundle: true,
      format: 'esm',
      entryNames: '[name]-[hash]', // Enable content hashing
    }),
  ],
})

router.get('/', (context) => {
  // Access asset metadata from context
  let appAsset = context.assets.get('app.tsx')
  // => { name: 'app.tsx', href: '/assets/app-ABC123.js', type: 'text/javascript', size: 12345 }

  return new Response(`
    <html>
      <head>
        <script type="module" src="${appAsset.href}"></script>
      </head>
      <body>...</body>
    </html>
  `)
})
```

#### Asset Info Structure

Each asset in the map includes the following metadata:

- `name`: The asset name (same as the map key)
- `href`: The URL path to the asset
- `type`: The MIME type (e.g., `'text/javascript'`, `'text/css'`)
- `size`: The size of the asset in bytes

#### Asset Name Resolution

Assets can be referenced by both their source extension and output extension:

```ts
// Both work and return the same AssetInfo:
context.assets.get('app.tsx') // => { name: 'app.tsx', href: '/assets/app-ABC123.js', ... }
context.assets.get('app.js') // => { name: 'app.js', href: '/assets/app-ABC123.js', ... }
```

For CSS outputs generated from JavaScript/TypeScript entry points, use the `.css` extension:

```ts
context.assets.get('app.css') // => { name: 'app.css', href: '/assets/app-ABC123.css', type: 'text/css', ... }
```

The asset names are relative to the `outbase` directory. If `outbase` is `'app/assets'` and your entry point is `'app/assets/dashboard/admin.tsx'`, the asset name would be `'dashboard/admin.tsx'`.

## Related Packages

- [`fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router) - Router for the web Fetch API
- [`static-middleware`](https://github.com/remix-run/remix/tree/main/packages/static-middleware) - Middleware for serving static files

## License

See [LICENSE](https://github.com/remix-run/remix/blob/main/LICENSE)
