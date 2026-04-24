import { Layout } from '../../ui/layout.tsx'
import { QueryBuilder } from '../../assets/query-builder.tsx'
import { type Dimension, type Measure, formatValue } from './catalog.ts'
import type { AnalyticsColumn } from './query-builder.ts'
import { aliasForColumn } from './query-builder.ts'

export interface AnalyticsPageProps {
  availableDimensions: readonly Dimension[]
  availableMeasures: readonly Measure[]
  selectedDimensionIds: string[]
  selectedMeasureIds: string[]
  columns: AnalyticsColumn[]
  rows: Record<string, unknown>[]
  totalsRow: Record<string, unknown> | null
}

export function AnalyticsPage() {
  return ({
    availableDimensions,
    availableMeasures,
    selectedDimensionIds,
    selectedMeasureIds,
    columns,
    rows,
    totalsRow,
  }: AnalyticsPageProps) => {
    let hasSelection = columns.length > 0

    let firstDimensionColumnIndex = columns.findIndex((c) => c.kind === 'dimension')

    return (
      <Layout title="Analytics">
        <div class="analytics">
          <div class="analytics__header">
            <h2>Analytics</h2>
            <p class="analytics__subtitle">
              Drag columns onto the template to build an ad-hoc report.
            </p>
          </div>

          <QueryBuilder
            setup={{
              dimensions: availableDimensions.map((d) => ({ id: d.id, label: d.label })),
              measures: availableMeasures.map((m) => ({ id: m.id, label: m.label })),
              selectedDimensionIds,
              selectedMeasureIds,
            }}
          />

          <div class="analytics__results">
            {!hasSelection && (
              <div class="analytics__empty">
                <p>
                  No columns selected yet. Drag at least one dimension or measure from the library
                  onto the template to run a query.
                </p>
              </div>
            )}

            {hasSelection && (
              <div style="overflow-x:auto;">
                <table class="analytics-grid">
                  <thead>
                    <tr>
                      {columns.map((col) => (
                        <th key={col.id} class={`analytics-grid__col--${col.kind}`}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {columns.map((col, colIndex) => {
                          let alias = aliasForColumn(columns, colIndex)
                          return (
                            <td key={col.id} class={`analytics-grid__col--${col.kind}`}>
                              {formatValue(row[alias], col.format)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td
                          colspan={columns.length}
                          style="text-align:center; color:#888; padding:2rem;"
                        >
                          No rows match this query.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {totalsRow && rows.length > 0 && (
                    <tfoot>
                      <tr>
                        {columns.map((col, colIndex) => {
                          if (col.kind === 'dimension') {
                            let isFirstDim = colIndex === firstDimensionColumnIndex
                            return (
                              <td
                                key={col.id}
                                class={`analytics-grid__col--${col.kind}`}
                                style="font-weight:600;"
                              >
                                {isFirstDim ? 'Totals' : ''}
                              </td>
                            )
                          }
                          let alias = aliasForColumn(columns, colIndex)
                          return (
                            <td
                              key={col.id}
                              class={`analytics-grid__col--${col.kind}`}
                              style="font-weight:600;"
                            >
                              {formatValue(totalsRow[alias], col.format)}
                            </td>
                          )
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>
      </Layout>
    )
  }
}
