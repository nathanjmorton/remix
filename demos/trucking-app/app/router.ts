import {
  createRouter,
  type AnyParams,
  type MiddlewareContext,
  type WithParams,
} from 'remix/fetch-router'
import { asyncContext } from 'remix/async-context-middleware'
import { compression } from 'remix/compression-middleware'
import { formData } from 'remix/form-data-middleware'
import { logger } from 'remix/logger-middleware'
import { methodOverride } from 'remix/method-override-middleware'
import { staticFiles } from 'remix/static-middleware'

import loadsController from './controllers/loads/controller.tsx'
import { home } from './controllers/home.tsx'
import { loadDatabase } from './middleware/database.ts'
import { loadAssetEntry } from './middleware/asset-entry.ts'
import { routes } from './routes.ts'
import { assetServer } from './utils/assets.ts'

export type RootMiddleware = [
  ReturnType<typeof formData>,
  ReturnType<typeof loadDatabase>,
]

export type AppContext<params extends AnyParams = AnyParams> = WithParams<
  MiddlewareContext<RootMiddleware>,
  params
>

export function createTruckingRouter() {
  let middleware = []

  if (process.env.NODE_ENV === 'development') {
    middleware.push(logger())
  }

  middleware.push(compression())
  middleware.push(
    staticFiles('./public', {
      cacheControl: 'no-store, must-revalidate',
      etag: false,
      lastModified: false,
    }),
  )
  middleware.push(formData())
  middleware.push(methodOverride())
  middleware.push(asyncContext())
  middleware.push(loadDatabase())
  middleware.push(loadAssetEntry())

  let router = createRouter({ middleware })

  router.get(routes.assets, async ({ request }) => {
    let assetResponse = await assetServer.fetch(request)
    return assetResponse ?? new Response('Not found', { status: 404 })
  })

  router.map(routes.home, home)
  router.map(routes.loads, loadsController)

  return router
}
