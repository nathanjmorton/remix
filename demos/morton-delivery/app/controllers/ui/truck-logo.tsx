import type { MixValue } from 'remix/component'

interface TruckLogoProps {
  mix?: MixValue<SVGSVGElement>
  title?: string
}

/**
 * Placeholder Morton Delivery brand mark: a flat-style box truck.
 *
 * Decorative by default. Pass a `title` to expose an accessible name when this
 * logo is the primary descriptor of an element (e.g. when used standalone).
 */
export function TruckLogo() {
  return ({ mix, title = 'Morton Delivery box truck logo' }: TruckLogoProps) => (
    <svg
      mix={mix}
      viewBox="0 0 96 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Ground line */}
      <line x1="2" y1="56" x2="94" y2="56" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" />
      {/* Cargo box */}
      <rect x="6" y="20" width="52" height="32" rx="3" fill="#ffffff" stroke="#0f172a" stroke-width="2.5" />
      <rect x="14" y="28" width="36" height="16" rx="1.5" fill="#fef2f2" stroke="#b91c1c" stroke-width="2" />
      {/* Cab */}
      <path
        d="M58 28 L74 28 L86 38 L86 52 L58 52 Z"
        fill="#b91c1c"
        stroke="#0f172a"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      {/* Cab window */}
      <path d="M62 30 L74 30 L82 38 L62 38 Z" fill="#bfdbfe" stroke="#0f172a" stroke-width="2" stroke-linejoin="round" />
      {/* Headlight */}
      <rect x="82" y="44" width="4" height="4" rx="1" fill="#facc15" stroke="#0f172a" stroke-width="1.5" />
      {/* Wheels */}
      <circle cx="22" cy="54" r="6" fill="#0f172a" />
      <circle cx="22" cy="54" r="2.5" fill="#cbd5e1" />
      <circle cx="70" cy="54" r="6" fill="#0f172a" />
      <circle cx="70" cy="54" r="2.5" fill="#cbd5e1" />
    </svg>
  )
}
