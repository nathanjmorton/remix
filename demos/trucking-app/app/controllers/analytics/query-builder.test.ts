import { test } from 'node:test'
import * as assert from 'node:assert/strict'

import { buildAnalyticsQuery } from './query-builder.ts'

test('buildAnalyticsQuery: returns null for empty selection', () => {
  let result = buildAnalyticsQuery({ dimensions: [], measures: [] })
  assert.equal(result, null)
})

test('buildAnalyticsQuery: drops unknown ids', () => {
  let result = buildAnalyticsQuery({
    dimensions: ['week_id', 'not_a_real_dim'],
    measures: ['total_gross', 'nope'],
  })
  assert.ok(result)
  assert.equal(result.resolvedDimensions.length, 1)
  assert.equal(result.resolvedDimensions[0]!.id, 'week_id')
  assert.equal(result.resolvedMeasures.length, 1)
  assert.equal(result.resolvedMeasures[0]!.id, 'total_gross')
})

test('buildAnalyticsQuery: dedupes repeated ids preserving order', () => {
  let result = buildAnalyticsQuery({
    dimensions: ['week_id', 'weekday', 'week_id'],
    measures: ['total_gross', 'total_gross', 'load_count'],
  })
  assert.ok(result)
  assert.deepEqual(
    result.resolvedDimensions.map((d) => d.id),
    ['week_id', 'weekday'],
  )
  assert.deepEqual(
    result.resolvedMeasures.map((m) => m.id),
    ['total_gross', 'load_count'],
  )
})

test('buildAnalyticsQuery: produces detail SQL with GROUP BY + ORDER BY', () => {
  let result = buildAnalyticsQuery({
    dimensions: ['week_id'],
    measures: ['total_gross'],
  })
  assert.ok(result)
  let detail = result.detailSql.text
  assert.match(detail, /SELECT /)
  assert.match(detail, /REPLACE\(weeks\.start_date, '-', ''\) AS dim_0/)
  assert.match(detail, /SUM\(loads\.gross_usd\) AS m_0/)
  assert.match(detail, /FROM loads LEFT JOIN weeks ON weeks\.id = loads\.week_id/)
  assert.match(detail, /GROUP BY REPLACE\(weeks\.start_date, '-', ''\)/)
  assert.match(detail, /ORDER BY REPLACE\(weeks\.start_date, '-', ''\) ASC/)
})

test('buildAnalyticsQuery: totals SQL omits GROUP BY and dimensions', () => {
  let result = buildAnalyticsQuery({
    dimensions: ['week_id'],
    measures: ['total_gross', 'load_count'],
  })
  assert.ok(result)
  assert.ok(result.totalsSql)
  let totals = result.totalsSql.text
  assert.doesNotMatch(totals, /GROUP BY/)
  assert.doesNotMatch(totals, /dim_0/)
  assert.match(totals, /SUM\(loads\.gross_usd\) AS m_0/)
  assert.match(totals, /COUNT\(\*\) AS m_1/)
})

test('buildAnalyticsQuery: measures-only query has no GROUP BY', () => {
  let result = buildAnalyticsQuery({
    dimensions: [],
    measures: ['total_gross'],
  })
  assert.ok(result)
  assert.doesNotMatch(result.detailSql.text, /GROUP BY/)
  assert.doesNotMatch(result.detailSql.text, /ORDER BY/)
  assert.match(result.detailSql.text, /SUM\(loads\.gross_usd\) AS m_0/)
})

test('buildAnalyticsQuery: dimensions-only query still groups and orders', () => {
  let result = buildAnalyticsQuery({
    dimensions: ['weekday'],
    measures: [],
  })
  assert.ok(result)
  assert.equal(result.totalsSql, null)
  assert.match(result.detailSql.text, /GROUP BY loads\.weekday/)
  assert.match(result.detailSql.text, /ORDER BY loads\.weekday ASC/)
})

test('buildAnalyticsQuery: week_start_date dimension groups by weeks.start_date', () => {
  let result = buildAnalyticsQuery({
    dimensions: ['week_start_date'],
    measures: ['total_gross'],
  })
  assert.ok(result)
  assert.match(result.detailSql.text, /weeks\.start_date AS dim_0/)
  assert.match(result.detailSql.text, /GROUP BY weeks\.start_date/)
  assert.match(result.detailSql.text, /ORDER BY weeks\.start_date ASC/)
})

test('buildAnalyticsQuery: columns preserve order (dimensions first, then measures)', () => {
  let result = buildAnalyticsQuery({
    dimensions: ['weekday', 'week_id'],
    measures: ['load_count', 'total_miles'],
  })
  assert.ok(result)
  assert.deepEqual(
    result.columns.map((c) => ({ id: c.id, kind: c.kind })),
    [
      { id: 'weekday', kind: 'dimension' },
      { id: 'week_id', kind: 'dimension' },
      { id: 'load_count', kind: 'measure' },
      { id: 'total_miles', kind: 'measure' },
    ],
  )
})
