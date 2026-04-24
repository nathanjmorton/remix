import { route, resources } from 'remix/fetch-router/routes'

export const assetsBase = '/assets'

export const routes = route({
  assets: `${assetsBase}/*path`,
  home: '/',
  loads: resources('loads', { param: 'loadId' }),
})
