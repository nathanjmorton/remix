import type { BuildAction } from 'remix/fetch-router'
import { Database } from 'remix/data-table'
import { getContext } from 'remix/async-context-middleware'

import type { routes } from '../../routes.ts'
import { render } from '../../utils/render.tsx'
import { DIMENSIONS, MEASURES, findDimension, findMeasure } from './catalog.ts'
import { buildAnalyticsQuery } from './query-builder.ts'
import { AnalyticsPage } from './analytics-page.tsx'

function readIds(params: URLSearchParams, name: string): string[] {
  return params
    .getAll(name)
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

export const analytics: BuildAction<'GET', typeof routes.analytics> = {
  async handler({ get }) {
    let db = get(Database)
    let request = getContext().request
    let url = new URL(request.url)

    let dimensionIds = readIds(url.searchParams, 'dim')
    let measureIds = readIds(url.searchParams, 'measure')

    // Validate and dedupe against the catalog. Anything we don't recognise is
    // silently dropped so a stale URL doesn't 500.
    let selectedDimensionIds = Array.from(
      new Set(dimensionIds.filter((id) => findDimension(id) != null)),
    )
    let selectedMeasureIds = Array.from(new Set(measureIds.filter((id) => findMeasure(id) != null)))

    let query = buildAnalyticsQuery({
      dimensions: selectedDimensionIds,
      measures: selectedMeasureIds,
    })

    let rows: Record<string, unknown>[] = []
    let totalsRow: Record<string, unknown> | null = null

    if (query) {
      let detailResult = await db.exec(query.detailSql)
      rows = detailResult.rows ?? []
      if (query.totalsSql) {
        let totalsResult = await db.exec(query.totalsSql)
        totalsRow = totalsResult.rows?.[0] ?? null
      }
    }

    return render(
      <AnalyticsPage
        availableDimensions={DIMENSIONS}
        availableMeasures={MEASURES}
        selectedDimensionIds={selectedDimensionIds}
        selectedMeasureIds={selectedMeasureIds}
        columns={query?.columns ?? []}
        rows={rows}
        totalsRow={totalsRow}
      />,
    )
  },
}
