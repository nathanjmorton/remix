import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type AssetsMap, createRouter } from '@remix-run/fetch-router'

import { fixtures } from '../../test/fixtures/utils.ts'
import { assets } from './assets.ts'

describe('assets middleware', () => {
  describe('serving assets', () => {
    it('builds and serves a single JavaScript file', async () => {
      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page],
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      let response = await router.fetch('https://remix.run/assets/page.js')

      assert.equal(response.status, 200)
      assert.equal(response.headers.get('Content-Type'), 'text/javascript')

      let text = await response.text()
      assert.ok(text.includes('Page initialized'))
    })

    it('builds and serves multiple entry points', async () => {
      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page, fixtures.app],
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      let pageResponse = await router.fetch('https://remix.run/assets/page.js')
      assert.equal(pageResponse.status, 200)
      assert.equal(pageResponse.headers.get('Content-Type'), 'text/javascript')

      let appResponse = await router.fetch('https://remix.run/assets/app.js')
      assert.equal(appResponse.status, 200)
      assert.equal(appResponse.headers.get('Content-Type'), 'text/javascript')
    })

    it('builds and serves CSS files', async () => {
      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.styles],
            outdir: 'public/assets',
            bundle: true,
          }),
        ],
      })

      let response = await router.fetch('https://remix.run/assets/styles.css')

      assert.equal(response.status, 200)
      assert.equal(response.headers.get('Content-Type'), 'text/css')

      let text = await response.text()
      assert.ok(text.includes('font-family'))
    })

    it('bundles dependencies correctly', async () => {
      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.app],
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      let response = await router.fetch('https://remix.run/assets/app.js')

      assert.equal(response.status, 200)

      let text = await response.text()
      // Should include the bundled greeting function from utils.ts
      assert.ok(text.includes('greeting') || text.includes('Hello'))
    })

    it('falls through to next handler when file not found', async () => {
      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page],
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      let response = await router.fetch('https://remix.run/assets/nonexistent.js')

      assert.equal(response.status, 404)
    })

    it('falls through for non-asset paths', async () => {
      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page],
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      let response = await router.fetch('https://remix.run/some/other/path')

      assert.equal(response.status, 404)
    })

    it('sets immutable cache headers in production mode', async () => {
      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page],
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      let response = await router.fetch('https://remix.run/assets/page.js')

      assert.equal(response.status, 200)
      assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000')
    })

    it('sets no-cache headers in watch mode', async () => {
      let middleware = assets(
        {
          entryPoints: [fixtures.page],
          outdir: 'public/assets',
          bundle: true,
          format: 'esm',
        },
        {
          watch: true,
        },
      )

      let router = createRouter({
        middleware: [middleware],
      })

      let response = await router.fetch('https://remix.run/assets/page.js')

      assert.equal(response.status, 200)
      assert.equal(response.headers.get('Cache-Control'), 'no-cache')

      // Clean up the watcher to prevent hanging
      await (middleware as any).dispose()
    })

    it('supports HEAD requests', async () => {
      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page],
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      let response = await router.fetch('https://remix.run/assets/page.js', {
        method: 'HEAD',
      })

      assert.equal(response.status, 200)
      assert.equal(response.headers.get('Content-Type'), 'text/javascript')
      assert.equal(await response.text(), '')
    })

    it('serves JavaScript with correct content type', async () => {
      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page],
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      let response = await router.fetch('https://remix.run/assets/page.js')

      assert.equal(response.headers.get('Content-Type'), 'text/javascript')
    })

    it('serves CSS with correct content type', async () => {
      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.styles],
            outdir: 'public/assets',
            bundle: true,
          }),
        ],
      })

      let response = await router.fetch('https://remix.run/assets/styles.css')

      assert.equal(response.headers.get('Content-Type'), 'text/css')
    })
  })

  describe('context.assets', () => {
    it('populates context.assets with entry point mappings', async () => {
      let assetsMap: AssetsMap | undefined

      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page, fixtures.app],
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      router.get('/', (context) => {
        assetsMap = context.assets
        return new Response('OK')
      })

      await router.fetch('https://remix.run/')

      assert.ok(assetsMap instanceof Map, 'context.assets should be a Map')
      assert.ok(assetsMap.size > 0, 'context.assets should have entries')
    })

    it('maps assets with source extension', async () => {
      let assetsMap: AssetsMap | undefined

      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page],
            outbase: 'test/fixtures/assets',
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      router.get('/', (context) => {
        assetsMap = context.assets
        return new Response('OK')
      })

      await router.fetch('https://remix.run/')

      assert.ok(assetsMap, 'context.assets should exist')
      assert.ok(assetsMap.has('page.ts'), 'Should map source extension (page.ts)')

      let asset = assetsMap.get('page.ts')
      assert.ok(asset, 'Asset should exist')
      assert.equal(asset.name, 'page.ts')
      assert.equal(asset.href, '/assets/page.js')
      assert.equal(asset.type, 'text/javascript')
      assert.ok(asset.size > 0, 'Asset should have a size')
    })

    it('maps assets with output extension', async () => {
      let assetsMap: AssetsMap | undefined

      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page],
            outbase: 'test/fixtures/assets',
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      router.get('/', (context) => {
        assetsMap = context.assets
        return new Response('OK')
      })

      await router.fetch('https://remix.run/')

      assert.ok(assetsMap, 'context.assets should exist')
      assert.ok(assetsMap.has('page.js'), 'Should map output extension (page.js)')

      let asset = assetsMap.get('page.js')
      assert.ok(asset, 'Asset should exist')
      assert.equal(asset.name, 'page.ts', 'Name should be source file name')
      assert.equal(asset.href, '/assets/page.js')
      assert.equal(asset.type, 'text/javascript')
      assert.ok(asset.size > 0, 'Asset should have a size')
    })

    it('works with hashed filenames', async () => {
      let assetsMap: AssetsMap | undefined

      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page],
            outbase: 'test/fixtures/assets',
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
            entryNames: '[name]-[hash]',
          }),
        ],
      })

      router.get('/', (context) => {
        assetsMap = context.assets
        return new Response('OK')
      })

      await router.fetch('https://remix.run/')

      assert.ok(assetsMap)
      assert.ok(assetsMap.has('page.ts'))
      assert.ok(assetsMap.has('page.js'))

      let asset = assetsMap.get('page.js')
      assert.ok(asset, 'Asset should exist')
      assert.equal(asset.name, 'page.ts')
      assert.ok(asset.href.includes('-'))
      assert.ok(asset.href.startsWith('/assets/page-'))
      assert.ok(asset.href.endsWith('.js'))
      assert.equal(asset.type, 'text/javascript')
      assert.ok(asset.size > 0)
    })

    it('includes CSS outputs when generated', async () => {
      let assetsMap: AssetsMap | undefined

      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.styles],
            outbase: 'test/fixtures/assets',
            outdir: 'public/assets',
            bundle: true,
          }),
        ],
      })

      router.get('/', (context) => {
        assetsMap = context.assets
        return new Response('OK')
      })

      await router.fetch('https://remix.run/')

      assert.ok(assetsMap)

      let asset = assetsMap.get('styles.css')
      assert.ok(asset)
      assert.equal(asset.name, 'styles.css')
      assert.equal(asset.href, '/assets/styles.css')
      assert.equal(asset.type, 'text/css')
      assert.ok(asset.size > 0)
    })

    it('persists across requests', async () => {
      let assetsMap1: AssetsMap | undefined
      let assetsMap2: AssetsMap | undefined

      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page],
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      router.get('/', (context) => {
        if (!assetsMap1) {
          assetsMap1 = context.assets
        } else {
          assetsMap2 = context.assets
        }
        return new Response('OK')
      })

      await router.fetch('https://remix.run/')
      await router.fetch('https://remix.run/')

      assert.ok(assetsMap1 && assetsMap2, 'Both requests should have assets')
      assert.strictEqual(assetsMap1, assetsMap2, 'Should be the same Map instance')
    })
  })

  describe('outbase handling', () => {
    it('uses lowest common directory when outbase is not specified', async () => {
      let assetsMap: AssetsMap | undefined

      let router = createRouter({
        middleware: [
          assets({
            // Both files are in test/fixtures/assets, so that should be the outbase
            entryPoints: [fixtures.page, fixtures.app],
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      router.get('/', (context) => {
        assetsMap = context.assets
        return new Response('OK')
      })

      await router.fetch('https://remix.run/')

      assert.ok(assetsMap, 'context.assets should exist')

      // Without explicit outbase, esbuild uses the lowest common directory
      // which is test/fixtures/assets for these files
      // So keys should be just the filenames, not paths
      assert.ok(assetsMap.has('page.ts'), 'Should have page.ts')
      assert.ok(assetsMap.has('app.tsx'), 'Should have app.tsx')
      assert.ok(!assetsMap.has('assets/page.ts'), 'Should not have assets/ prefix')
    })

    it('uses entry point paths relative to explicit outbase', async () => {
      let assetsMap: AssetsMap | undefined

      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page, fixtures.app],
            outbase: 'test/fixtures/assets',
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      router.get('/', (context) => {
        assetsMap = context.assets
        return new Response('OK')
      })

      await router.fetch('https://remix.run/')

      assert.ok(assetsMap, 'context.assets should exist')
      assert.ok(assetsMap.has('page.ts'), 'Should map page.ts')
      assert.ok(assetsMap.has('page.js'), 'Should map page.js')
      assert.ok(assetsMap.has('app.tsx'), 'Should map app.tsx')
      assert.ok(assetsMap.has('app.js'), 'Should map app.js')
    })

    it('handles outbase higher than entry points', async () => {
      let assetsMap: AssetsMap | undefined

      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page],
            outbase: 'test/fixtures', // One level up from assets/
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      router.get('/', (context) => {
        assetsMap = context.assets
        return new Response('OK')
      })

      await router.fetch('https://remix.run/')

      assert.ok(assetsMap, 'context.assets should exist')

      // With outbase at test/fixtures, the entry point is at assets/page.ts
      assert.ok(assetsMap.has('assets/page.ts'), 'Should have assets/page.ts')
      assert.ok(assetsMap.has('assets/page.js'), 'Should have assets/page.js')

      let asset = assetsMap.get('assets/page.ts')
      assert.ok(asset, 'Asset should exist')
      assert.equal(asset.href, '/assets/assets/page.js')
    })

    it('handles entry points in nested directories with explicit outbase', async () => {
      let assetsMap: AssetsMap | undefined

      let router = createRouter({
        middleware: [
          assets({
            entryPoints: [fixtures.page, fixtures.app],
            outbase: 'test',
            outdir: 'public/assets',
            bundle: true,
            format: 'esm',
          }),
        ],
      })

      router.get('/', (context) => {
        assetsMap = context.assets
        return new Response('OK')
      })

      await router.fetch('https://remix.run/')

      assert.ok(assetsMap, 'context.assets should exist')

      // With outbase at test/, entry points should include fixtures/assets/ prefix
      assert.ok(assetsMap.has('fixtures/assets/page.ts'), 'Should have fixtures/assets/page.ts')
      assert.ok(assetsMap.has('fixtures/assets/page.js'), 'Should have fixtures/assets/page.js')
      assert.ok(assetsMap.has('fixtures/assets/app.tsx'), 'Should have fixtures/assets/app.tsx')
      assert.ok(assetsMap.has('fixtures/assets/app.js'), 'Should have fixtures/assets/app.js')
    })
  })
})
