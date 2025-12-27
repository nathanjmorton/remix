import { get, post, route } from '@remix-run/fetch-router'

export let routes = route({
  // Home page
  home: '/',

  // Auth routes (Auth0 OAuth)
  auth: {
    login: get('/auth/login'),
    callback: get('/auth/callback'),
    logout: post('/auth/logout'),
  },

  // S3 operations (protected)
  files: {
    index: get('/files'),
    upload: post('/files/upload'),
    download: get('/files/download'),
  },
})
