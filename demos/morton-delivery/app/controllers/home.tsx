import type { BuildAction } from 'remix/fetch-router'

import { routes } from '../routes.ts'
import { render } from '../utils/render.tsx'
import { Layout } from './ui/layout.tsx'
import * as styles from './ui/styles.ts'
import { TruckLogo } from './ui/truck-logo.tsx'

const FEATURES = [
  {
    title: 'On-time pickup and delivery',
    body: 'Routes planned around your schedule, with proactive updates from dispatch.',
  },
  {
    title: 'Local and regional reach',
    body: 'Same-day, next-day, and contract freight throughout the region.',
  },
  {
    title: 'Careful with cargo',
    body: 'Trained drivers, secured loads, and equipment matched to the job.',
  },
  {
    title: 'Owner-operated',
    body: 'A small fleet means you talk to the people moving your freight.',
  },
]

export const home: BuildAction<'GET', typeof routes.home> = {
  handler() {
    return render(<HomePage />)
  },
}

function HomePage() {
  return () => (
    <Layout
      title="Reliable trucking and delivery"
      description="Morton Delivery, LLC — placeholder marketing site for a small trucking and delivery business."
    >
      <section mix={styles.hero} aria-labelledby="hero-title">
        <div>
          <p mix={styles.heroEyebrow}>Morton Delivery, LLC</p>
          <h1 id="hero-title" mix={styles.heroTitle}>
            Freight that shows up when you need it.
          </h1>
          <p mix={styles.heroLead}>
            We&rsquo;re a small trucking and delivery outfit moving regional freight, last-mile
            loads, and scheduled routes. This site is a placeholder while the real one is built.
          </p>
          <div mix={styles.buttonRow}>
            <a href={routes.contact.href()} mix={styles.buttonPrimary}>
              Request a quote
            </a>
            <a href={routes.services.href()} mix={styles.buttonSecondary}>
              See what we haul
            </a>
          </div>
        </div>
        <div mix={styles.heroArt} aria-hidden="true">
          <TruckLogo mix={styles.heroArtLogo} />
        </div>
      </section>

      <section aria-labelledby="features-title">
        <h2 id="features-title" mix={styles.sectionTitle}>
          Why shippers choose us
        </h2>
        <p mix={styles.lead}>
          Straightforward service, transparent pricing, and a team that answers the phone.
        </p>
        <div mix={styles.cardGrid}>
          {FEATURES.map((feature) => (
            <article key={feature.title} mix={styles.card}>
              <h3 mix={styles.cardTitle}>{feature.title}</h3>
              <p mix={styles.cardBody}>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>
    </Layout>
  )
}
