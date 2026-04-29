import type { RemixNode } from 'remix/component'

import * as styles from './styles.ts'

interface DocumentProps {
  title: string
  description?: string
  children: RemixNode
}

const SITE_NAME = 'Morton Delivery, LLC'

export function Document() {
  return ({ title, description, children }: DocumentProps) => (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {description ? <meta name="description" content={description} /> : null}
        <title>{`${title} — ${SITE_NAME}`}</title>
      </head>
      <body mix={[styles.reset, styles.page]}>{children}</body>
    </html>
  )
}
