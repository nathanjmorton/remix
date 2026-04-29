import { createRouter } from 'remix/fetch-router'
import { staticFiles } from 'remix/static-middleware'

import { contact } from './controllers/contact.tsx'
import { home } from './controllers/home.tsx'
import { services } from './controllers/services.tsx'
import { routes } from './routes.ts'

const middleware = []
middleware.push(staticFiles('./public'))

export const router = createRouter({ middleware })

router.map(routes.home, home)
router.map(routes.services, services)
router.map(routes.contact, contact)
