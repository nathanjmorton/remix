import * as http from 'node:http'
import { createRequestListener } from '@remix-run/node-fetch-server'

import { router } from './app/router.ts'

let server = http.createServer(
  createRequestListener(async (request) => {
    try {
      return await router.fetch(request)
    } catch (error) {
      console.error(error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }),
)

let port = process.env.PORT ? parseInt(process.env.PORT, 10) : 44100

server.listen(port, () => {
  console.log(`SSO S3 Demo is running on http://localhost:${port}`)
  console.log('')
  console.log('Required environment variables:')
  console.log('  AUTH0_DOMAIN       - Your Auth0 tenant domain')
  console.log('  AUTH0_CLIENT_ID    - Your Auth0 application client ID')
  console.log('  AUTH0_CLIENT_SECRET - Your Auth0 application client secret')
  console.log('  AUTH0_AUDIENCE     - The API audience for S3 access')
  console.log('')
})

let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
