import { type Handle, clientEntry, on } from 'remix/component'

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
export const WeekSelect = clientEntry(import.meta.url, function WeekSelect(_handle: Handle) {
  return ({ options }: WeekSelectProps) => (
    <select
      class="week-select"
      mix={[
        on<HTMLSelectElement, 'change'>('change', (event) => {
          let value = event.currentTarget.value
          if (value) window.location.href = value
        }),
      ]}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} selected={opt.selected}>
          {opt.label}
        </option>
      ))}
    </select>
  )
})
