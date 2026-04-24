// Catalog of dimensions and measures available in the analytics dashboard.
//
// All SQL fragments here are hard-coded against the fixed loads/weeks schema.
// The controller only accepts ids from this catalog, which keeps the SQL
// parameter surface small and prevents injection via query-string input.

export type ValueFormat = 'usd' | 'number' | 'percent' | 'text' | 'date' | 'integer'

export interface Dimension {
  id: string
  label: string
  // SQL expression used in SELECT (with alias). Do not include the alias here.
  selectSql: string
  // SQL expression used in GROUP BY / ORDER BY.
  groupBySql: string
  format: ValueFormat
}

export interface Measure {
  id: string
  label: string
  // SQL aggregate expression used in SELECT (with alias). Do not include alias.
  aggregateSql: string
  format: ValueFormat
}

export const DIMENSIONS: readonly Dimension[] = [
  {
    id: 'week_id',
    label: 'Week ID',
    // Surface the URL-style YYYYMMDD week id rather than the internal integer
    // FK so values match the rest of the app (e.g. 20260420 instead of 1).
    selectSql: "REPLACE(weeks.start_date, '-', '')",
    groupBySql: "REPLACE(weeks.start_date, '-', '')",
    format: 'integer',
  },
  {
    id: 'week_start_date',
    label: 'Week Start Date',
    selectSql: 'weeks.start_date',
    groupBySql: 'weeks.start_date',
    format: 'date',
  },
  {
    id: 'date',
    label: 'Date',
    selectSql: 'loads.date',
    groupBySql: 'loads.date',
    format: 'date',
  },
  {
    id: 'weekday',
    label: 'Weekday',
    selectSql: 'loads.weekday',
    groupBySql: 'loads.weekday',
    format: 'text',
  },
  {
    id: 'pu_city',
    label: 'Pickup City',
    selectSql: 'loads.pu_city',
    groupBySql: 'loads.pu_city',
    format: 'text',
  },
  {
    id: 'do_city',
    label: 'Delivery City',
    selectSql: 'loads.do_city',
    groupBySql: 'loads.do_city',
    format: 'text',
  },
]

// Note: `avg_net_pct`'s totals row is a global average across all matching
// loads, not an average of the per-group averages. If future measures need
// different totals semantics, this shape can grow a dedicated totals field.
export const MEASURES: readonly Measure[] = [
  {
    id: 'total_gross',
    label: 'Total Gross',
    aggregateSql: 'SUM(loads.gross_usd)',
    format: 'usd',
  },
  {
    id: 'total_net',
    label: 'Total Net',
    aggregateSql: 'SUM(loads.net_usd)',
    format: 'usd',
  },
  {
    id: 'total_rev_net_of_fuel_est',
    label: 'Total Rev Net of Fuel (Est)',
    aggregateSql: 'SUM(loads.rev_net_of_fuel_est)',
    format: 'usd',
  },
  {
    id: 'total_miles',
    label: 'Total Miles',
    aggregateSql: 'SUM(loads.miles)',
    format: 'number',
  },
  {
    id: 'load_count',
    label: 'Load Count',
    aggregateSql: 'COUNT(*)',
    format: 'integer',
  },
  {
    id: 'avg_net_pct',
    label: 'Avg Net %',
    aggregateSql: 'AVG(loads.net_pct)',
    format: 'percent',
  },
]

const DIMENSIONS_BY_ID = new Map(DIMENSIONS.map((d) => [d.id, d]))
const MEASURES_BY_ID = new Map(MEASURES.map((m) => [m.id, m]))

export function findDimension(id: string): Dimension | undefined {
  return DIMENSIONS_BY_ID.get(id)
}

export function findMeasure(id: string): Measure | undefined {
  return MEASURES_BY_ID.get(id)
}

export function formatValue(value: unknown, format: ValueFormat): string {
  if (value == null) return '—'

  switch (format) {
    case 'usd': {
      let n = typeof value === 'number' ? value : Number(value)
      if (!isFinite(n)) return '—'
      return `$${n.toFixed(2)}`
    }
    case 'number': {
      let n = typeof value === 'number' ? value : Number(value)
      if (!isFinite(n)) return '—'
      return n.toFixed(2)
    }
    case 'integer': {
      let n = typeof value === 'number' ? value : Number(value)
      if (!isFinite(n)) return '—'
      return Math.round(n).toString()
    }
    case 'percent': {
      let n = typeof value === 'number' ? value : Number(value)
      if (!isFinite(n)) return '—'
      return `${(n * 100).toFixed(1)}%`
    }
    case 'date':
    case 'text':
    default:
      return String(value)
  }
}
