/** Converts a stored start_date ('YYYY-MM-DD') to the URL week identifier ('YYYYMMDD'). */
export function toWeekId(startDate: string): string {
  return startDate.replace(/-/g, '')
}

/** Converts a URL week identifier ('YYYYMMDD') back to a start_date ('YYYY-MM-DD'), or null if invalid. */
export function fromWeekId(weekId: string): string | null {
  if (!/^\d{8}$/.test(weekId)) return null
  return `${weekId.slice(0, 4)}-${weekId.slice(4, 6)}-${weekId.slice(6, 8)}`
}
