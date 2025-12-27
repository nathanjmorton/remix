import { createRouter } from '@remix-run/fetch-router'
import { asyncContext } from '@remix-run/async-context-middleware'
import { formData } from '@remix-run/form-data-middleware'
import { session } from '@remix-run/session-middleware'

import { routes } from './routes.ts'
import { sessionCookie, sessionStorage } from './utils/session.ts'

import homeController from './home.tsx'
import authController from './auth.tsx'
import filesController from './files.tsx'

let middleware = [formData(), session(sessionCookie, sessionStorage), asyncContext()]

export let router = createRouter({ middleware })

router.map(routes.home, homeController)
router.map(routes.auth, authController)
router.map(routes.files, filesController)
