import { type Handle, clientEntry, on } from 'remix/component'

import { LAST_WEEK_HREF_STORAGE_KEY, isValidWeekHref } from './loads-link.tsx'

export type WeekOption = {
  value: string
  label: string
  selected: boolean
}

export type WeekSelectProps = {
  options: WeekOption[]
}

// Wrapping the <select> in a client entry ensures the change handler is
// re-attached after Remix's frame reloads patch the DOM. Inline <script>
// tags inserted via DOM mutation don't re-execute, so a plain
// addEventListener-in-a-script approach can't survive client-side
// navigations.
export const WeekSelect = clientEntry(
  import.meta.url,
  function WeekSelect(handle: Handle, setup: WeekSelectProps) {
    // Record the currently-displayed week so the global Loads link can
    // restore it on later soft navigations. queueTask runs only on the
    // client, so this is a no-op during SSR.
    handle.queueTask(() => {
      let selected = setup.options.find((option) => option.selected)
      if (!selected) return
      if (!isValidWeekHref(selected.value)) return
      try {
        localStorage.setItem(LAST_WEEK_HREF_STORAGE_KEY, selected.value)
      } catch {
        // Ignore storage failures (private mode, quota, etc.).
      }
    })

    return () => (
      <select
        class="week-select"
        mix={[
          on<HTMLSelectElement, 'change'>('change', (event) => {
            let value = event.currentTarget.value
            if (value) window.location.href = value
          }),
        ]}
      >
        {setup.options.map((opt) => (
          <option key={opt.value} value={opt.value} selected={opt.selected}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  },
)
