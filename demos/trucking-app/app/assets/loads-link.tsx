import { type Handle, clientEntry } from 'remix/component'

export const LAST_WEEK_HREF_STORAGE_KEY = 'truckingApp:lastWeekHref'

/**
 * Validates a stored week href before we trust it on the client. Only paths
 * shaped like `/weeks/<8 digits>` are allowed so a tampered localStorage
 * value can't redirect the user off-site.
 */
export function isValidWeekHref(href: string): boolean {
  return /^\/weeks\/\d{8}$/.test(href)
}

export type LoadsLinkProps = {
  defaultHref: string
  label: string
  className?: string
}

// Server-renders an anchor pointing at `defaultHref` (e.g. /weeks). After
// hydration, queueTask runs on the client, reads the stored last-viewed week
// from localStorage, and re-renders the anchor with the deeper URL so a
// click navigates straight to the previously selected week.
export const LoadsLink = clientEntry(
  import.meta.url,
  function LoadsLink(handle: Handle, setup: LoadsLinkProps) {
    let href = setup.defaultHref

    handle.queueTask(() => {
      try {
        let stored = localStorage.getItem(LAST_WEEK_HREF_STORAGE_KEY)
        if (stored && isValidWeekHref(stored) && stored !== href) {
          href = stored
          handle.update()
        }
      } catch {
        // Ignore storage failures (private mode, missing API, etc.).
      }
    })

    return () => (
      <a href={href} class={setup.className}>
        {setup.label}
      </a>
    )
  },
)
