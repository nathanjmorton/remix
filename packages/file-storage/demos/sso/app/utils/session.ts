import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCookie } from '@remix-run/cookie'
import { createFsSessionStorage } from '@remix-run/session/fs-storage'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Session cookie configuration.
 */
export let sessionCookie = createCookie('sso-session', {
  secrets: ['sso-demo-secret-key'],
  httpOnly: true,
  sameSite: 'Lax',
  maxAge: 86400, // 24 hours
  path: '/',
})

/**
 * Filesystem-based session storage.
 */
export let sessionStorage = createFsSessionStorage(
  path.resolve(__dirname, '..', '..', 'tmp', 'sessions'),
)
