import { rawSql } from 'remix/data-table'
import type { SqlStatement } from 'remix/data-table'

import {
  findDimension,
  findMeasure,
  type Dimension,
  type Measure,
  type ValueFormat,
} from './catalog.ts'

export interface AnalyticsColumn {
  id: string
  label: string
  kind: 'dimension' | 'measure'
  format: ValueFormat
}

export interface AnalyticsQuery {
  columns: AnalyticsColumn[]
  detailSql: SqlStatement
  // `null` when there are no measures — totals are only meaningful when at
  // least one aggregate is selected.
  totalsSql: SqlStatement | null
  resolvedDimensions: Dimension[]
  resolvedMeasures: Measure[]
}

export interface BuildAnalyticsQueryInput {
  dimensions: string[]
  measures: string[]
}

function uniqueDimensions(ids: string[]): Dimension[] {
  let seen = new Set<string>()
  let out: Dimension[] = []
  for (let id of ids) {
    if (seen.has(id)) continue
    let dim = findDimension(id)
    if (!dim) continue
    seen.add(id)
    out.push(dim)
  }
  return out
}

function uniqueMeasures(ids: string[]): Measure[] {
  let seen = new Set<string>()
  let out: Measure[] = []
  for (let id of ids) {
    if (seen.has(id)) continue
    let measure = findMeasure(id)
    if (!measure) continue
    seen.add(id)
    out.push(measure)
  }
  return out
}

function aliasFor(kind: 'dim' | 'm', index: number): string {
  return `${kind}_${index}`
}

const BASE_FROM = 'FROM loads LEFT JOIN weeks ON weeks.id = loads.week_id'

/**
 * Turns a set of dimension and measure ids into a pair of parameterized SQL
 * statements (detail + totals).
 *
 * Returns `null` when neither dimensions nor measures are selected. The caller
 * should render an empty state instead of executing SQL in that case.
 */
export function buildAnalyticsQuery(input: BuildAnalyticsQueryInput): AnalyticsQuery | null {
  let dimensions = uniqueDimensions(input.dimensions)
  let measures = uniqueMeasures(input.measures)

  if (dimensions.length === 0 && measures.length === 0) return null

  let selectParts: string[] = []
  let columns: AnalyticsColumn[] = []

  dimensions.forEach((dim, index) => {
    let alias = aliasFor('dim', index)
    selectParts.push(`${dim.selectSql} AS ${alias}`)
    columns.push({
      id: dim.id,
      label: dim.label,
      kind: 'dimension',
      format: dim.format,
    })
  })

  measures.forEach((measure, index) => {
    let alias = aliasFor('m', index)
    selectParts.push(`${measure.aggregateSql} AS ${alias}`)
    columns.push({
      id: measure.id,
      label: measure.label,
      kind: 'measure',
      format: measure.format,
    })
  })

  let detailText = `SELECT ${selectParts.join(', ')} ${BASE_FROM}`
  if (dimensions.length > 0) {
    let groupBy = dimensions.map((d) => d.groupBySql).join(', ')
    detailText += ` GROUP BY ${groupBy} ORDER BY ${dimensions[0]!.groupBySql} ASC`
  }

  let totalsSql: SqlStatement | null = null
  if (measures.length > 0) {
    let totalsSelect = measures.map((m, i) => `${m.aggregateSql} AS ${aliasFor('m', i)}`).join(', ')
    totalsSql = rawSql(`SELECT ${totalsSelect} ${BASE_FROM}`)
  }

  return {
    columns,
    detailSql: rawSql(detailText),
    totalsSql,
    resolvedDimensions: dimensions,
    resolvedMeasures: measures,
  }
}

/** Returns the alias used for a given column in the detail/totals result. */
export function aliasForColumn(columns: AnalyticsColumn[], columnIndex: number): string {
  let column = columns[columnIndex]!
  if (column.kind === 'dimension') {
    let dimIndex = columns.slice(0, columnIndex).filter((c) => c.kind === 'dimension').length
    return aliasFor('dim', dimIndex)
  }
  let mIndex = columns.slice(0, columnIndex).filter((c) => c.kind === 'measure').length
  return aliasFor('m', mIndex)
}
