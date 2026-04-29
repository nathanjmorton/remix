import type { BuildAction } from 'remix/fetch-router'

import { routes } from '../routes.ts'
import { render } from '../utils/render.tsx'
import { Layout } from './ui/layout.tsx'
import * as styles from './ui/styles.ts'

const CONTACTS = [
  { label: 'Phone', value: '(555) 555-0142' },
  { label: 'Email', value: 'dispatch@example.com' },
  { label: 'Hours', value: 'Mon–Fri, 7am–6pm' },
]

export const contact: BuildAction<'GET', typeof routes.contact> = {
  handler() {
    return render(<ContactPage />)
  },
}

function ContactPage() {
  return () => (
    <Layout
      title="Contact"
      description="Get in touch with Morton Delivery, LLC for quotes, scheduling, and dispatch."
    >
      <h1 mix={styles.sectionTitle}>Get in touch</h1>
      <p mix={styles.lead}>
        Call dispatch for quotes and scheduling, or send an email and we&rsquo;ll get back the same
        business day.
      </p>
      <div mix={styles.contactBlock}>
        {CONTACTS.map((entry) => (
          <div key={entry.label} mix={styles.contactItem}>
            <p mix={styles.contactLabel}>{entry.label}</p>
            <p mix={styles.contactValue}>{entry.value}</p>
          </div>
        ))}
      </div>
      <p mix={styles.placeholderNote}>
        These contact details are placeholder values for the demo site.{' '}
        <a href={routes.home.href()}>Back to home</a>.
      </p>
    </Layout>
  )
}
