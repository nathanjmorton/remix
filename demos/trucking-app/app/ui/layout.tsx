import type { RemixNode } from 'remix/component'

import { routes } from '../routes.ts'
import { Document } from './document.tsx'

export interface LayoutProps {
  title?: string
  children?: RemixNode
}

export function Layout() {
  return ({ title, children }: LayoutProps) => (
    <Document title={title}>
      <header>
        <div class="container">
          <h1>
            <a href={routes.home.href()}>🚛 Trucking App</a>
          </h1>
          <nav>
            <a href={routes.loads.index.href()}>Loads</a>
            <a href={routes.loads.new.href()}>+ New Load</a>
          </nav>
        </div>
      </header>
      <main>
        <div class="container">{children}</div>
      </main>
      <footer>
        <div class="container">
          <p>Trucking App &mdash; built with Remix</p>
        </div>
      </footer>
    </Document>
  )
}
