import type { BuildAction } from 'remix/fetch-router'

import { routes } from '../routes.ts'

export const home: BuildAction<'GET', typeof routes.home> = {
  handler() {
    return new Response(null, {
      status: 302,
      headers: { Location: routes.loads.index.href() },
    })
  },
}
