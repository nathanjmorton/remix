import type { BuildAction } from 'remix/fetch-router'

import { routes } from '../routes.ts'
import { render } from '../utils/render.tsx'
import { Layout } from './ui/layout.tsx'
import * as styles from './ui/styles.ts'

const SERVICES = [
  {
    title: 'Local delivery',
    body: 'Door-to-door pickup and drop-off across town, billed by stop or by the hour.',
  },
  {
    title: 'Regional freight',
    body: 'Less-than-truckload and full-load runs throughout the surrounding region.',
  },
  {
    title: 'Scheduled routes',
    body: 'Recurring pickup and delivery windows for businesses with steady volume.',
  },
  {
    title: 'Same-day rush',
    body: 'Time-critical loads picked up and delivered the same business day.',
  },
  {
    title: 'Pallet moves',
    body: 'Liftgate service and pallet-jack-friendly stops for warehouses and shops.',
  },
  {
    title: 'Custom contracts',
    body: 'Dedicated trucks and drivers for shippers who need predictable capacity.',
  },
]

export const services: BuildAction<'GET', typeof routes.services> = {
  handler() {
    return render(<ServicesPage />)
  },
}

function ServicesPage() {
  return () => (
    <Layout
      title="Services"
      description="Local delivery, regional freight, scheduled routes, and same-day rush jobs from Morton Delivery, LLC."
    >
      <h1 mix={styles.sectionTitle}>What we haul</h1>
      <p mix={styles.lead}>
        A short list of the things we do most often. If your job isn&rsquo;t on this list, ask
        anyway &mdash; we may still be a fit.
      </p>
      <div mix={styles.cardGrid}>
        {SERVICES.map((service) => (
          <article key={service.title} mix={styles.card}>
            <h2 mix={styles.cardTitle}>{service.title}</h2>
            <p mix={styles.cardBody}>{service.body}</p>
          </article>
        ))}
      </div>
      <p mix={styles.placeholderNote}>
        Pricing and coverage details are placeholder content while we finalize the live site.{' '}
        <a href={routes.contact.href()}>Reach out</a> for current rates and availability.
      </p>
    </Layout>
  )
}
