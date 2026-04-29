import { get, route } from 'remix/fetch-router/routes'

export const routes = route({
  home: get('/'),
  services: get('/services'),
  contact: get('/contact'),
})
