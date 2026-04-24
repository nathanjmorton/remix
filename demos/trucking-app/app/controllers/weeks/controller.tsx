import type { Controller } from 'remix/fetch-router'
import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'

import { loads, weeks } from '../../data/schema.ts'
import { routes } from '../../routes.ts'
import { parseId } from '../../utils/ids.ts'
import { render } from '../../utils/render.tsx'
import { NewWeekPage } from './new-page.tsx'
import { WeekPage } from './week-page.tsx'

const textField = f.field(s.defaulted(s.string(), ''))

const weekSchema = f.object({
  start_date: textField,
})

function isMonday(dateStr: string): boolean {
  let parts = dateStr.split('-')
  if (parts.length !== 3) return false
  let year = parseInt(parts[0]!, 10)
  let month = parseInt(parts[1]!, 10)
  let day = parseInt(parts[2]!, 10)
  if (isNaN(year) || isNaN(month) || isNaN(day)) return false
  return new Date(year, month - 1, day).getDay() === 1
}

export default {
  actions: {
    async index({ get }) {
      let db = get(Database)
      let allWeeks = await db.findMany(weeks, { orderBy: ['start_date', 'asc'] })
      if (allWeeks.length > 0) {
        let latest = allWeeks[allWeeks.length - 1]!
        return redirect(routes.weeks.show.href({ weekId: latest.id }))
      }
      return render(
        <NewWeekPage />,
      )
    },

    new() {
      return render(<NewWeekPage />)
    },

    async create({ get }) {
      let db = get(Database)
      let formData = get(FormData)
      let fields = s.parse(weekSchema, formData)
      let startDate = fields.start_date

      if (!startDate) {
        return render(<NewWeekPage error="Start date is required." />)
      }

      if (!isMonday(startDate)) {
        return render(
          <NewWeekPage error="Start date must be a Monday." startDate={startDate} />,
        )
      }

      let week = await db.create(weeks, { start_date: startDate }, { returnRow: true })
      return redirect(routes.weeks.show.href({ weekId: week.id }))
    },

    async show({ get, params }) {
      let db = get(Database)
      let weekId = parseId(params.weekId)
      let week = weekId !== undefined ? await db.find(weeks, weekId) : undefined

      if (!week) {
        return new Response('Week not found', { status: 404 })
      }

      let allWeeks = await db.findMany(weeks, { orderBy: ['start_date', 'asc'] })
      let allLoads = await db.findMany(loads, { orderBy: ['date', 'asc'] })
      let weekLoads = allLoads.filter((l) => l.week_id === week.id)

      return render(<WeekPage weeks={allWeeks} currentWeek={week} loads={weekLoads} />)
    },

    edit({ params }) {
      return redirect(routes.weeks.show.href({ weekId: parseInt(params.weekId, 10) }))
    },

    update({ params }) {
      return redirect(routes.weeks.show.href({ weekId: parseInt(params.weekId, 10) }))
    },

    async destroy({ get, params }) {
      let db = get(Database)
      let weekId = parseId(params.weekId)
      if (weekId !== undefined) {
        await db.delete(weeks, weekId)
      }
      return redirect(routes.weeks.index.href())
    },
  },
} satisfies Controller<typeof routes.weeks>
