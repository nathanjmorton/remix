import type { RemixNode } from 'remix/component'

import { routes } from '../../routes.ts'
import { Document } from './document.tsx'
import * as styles from './styles.ts'
import { TruckLogo } from './truck-logo.tsx'

interface LayoutProps {
  title: string
  description?: string
  children: RemixNode
}

export function Layout() {
  return ({ title, description, children }: LayoutProps) => (
    <Document title={title} description={description}>
      <header mix={styles.header}>
        <div mix={[styles.container, styles.headerInner]}>
          <a href={routes.home.href()} mix={styles.brand}>
            <TruckLogo mix={styles.brandMark} />
            <span mix={styles.brandText}>
              <span mix={styles.brandName}>Morton Delivery</span>
              <span mix={styles.brandTag}>Trucking &amp; Logistics</span>
            </span>
          </a>
          <nav mix={styles.nav} aria-label="Primary">
            <a href={routes.home.href()} mix={styles.navLink}>
              Home
            </a>
            <a href={routes.services.href()} mix={styles.navLink}>
              Services
            </a>
            <a href={routes.contact.href()} mix={styles.navLink}>
              Contact
            </a>
          </nav>
        </div>
      </header>
      <main mix={styles.main}>
        <div mix={styles.container}>{children}</div>
      </main>
      <footer mix={styles.footer}>
        <div mix={[styles.container, styles.footerInner]}>
          <span>&copy; {new Date().getFullYear()} Morton Delivery, LLC. All rights reserved.</span>
          <span>Placeholder marketing site.</span>
        </div>
      </footer>
    </Document>
  )
}
