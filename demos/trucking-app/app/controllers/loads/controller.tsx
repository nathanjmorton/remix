import type { Controller } from 'remix/fetch-router'
import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'

import { loads } from '../../data/schema.ts'
import { routes } from '../../routes.ts'
import { parseId } from '../../utils/ids.ts'
import { render } from '../../utils/render.tsx'
import { LoadFormPage } from './form.tsx'
import { LoadsIndexPage } from './index-page.tsx'
import { LoadNotFoundPage, LoadShowPage } from './show-page.tsx'

const textField = f.field(s.defaulted(s.string(), ''))
const optionalTextField = f.field(s.optional(s.string()))
const numericField = f.field(s.defaulted(s.string(), ''))

const loadSchema = f.object({
  date: textField,
  weekday: textField,
  pu_city: optionalTextField,
  pu_datetime: optionalTextField,
  do_city: optionalTextField,
  do_datetime: optionalTextField,
  miles: numericField,
  gross_usd: numericField,
  net_pct: numericField,
  mpg_est: numericField,
  fuel_price_est: numericField,
  fuel_usd_act: optionalTextField,
  fuel_notes: optionalTextField,
  notes_load: optionalTextField,
  rev_notes: optionalTextField,
})

function parseNum(v: string | undefined | null): number | null {
  if (!v || v.trim() === '') return null
  let n = parseFloat(v)
  return isNaN(n) ? null : n
}

function buildLoadValues(fields: ReturnType<typeof s.parse<typeof loadSchema>>) {
  let miles = parseNum(fields.miles)
  let gross_usd = parseNum(fields.gross_usd)
  let net_pct = parseNum(fields.net_pct) ?? 0.75
  let mpg_est = parseNum(fields.mpg_est) ?? 7.5
  let fuel_price_est = parseNum(fields.fuel_price_est) ?? 5.75
  let fuel_usd_act = parseNum(fields.fuel_usd_act ?? null)

  let net_usd = gross_usd != null ? gross_usd * net_pct : null
  let fuel_gal_est = miles != null && mpg_est > 0 ? miles / mpg_est : null
  let fuel_usd_est = fuel_gal_est != null ? fuel_gal_est * fuel_price_est : null
  let rev_net_of_fuel_est =
    net_usd != null && fuel_usd_est != null ? net_usd - fuel_usd_est : null
  let rev_net_of_fuel_act =
    net_usd != null ? net_usd - (fuel_usd_act ?? 0) : null

  return {
    date: fields.date || null,
    weekday: fields.weekday || null,
    pu_city: fields.pu_city || null,
    pu_datetime: fields.pu_datetime || null,
    do_city: fields.do_city || null,
    do_datetime: fields.do_datetime || null,
    miles,
    gross_usd,
    net_pct,
    net_usd,
    mpg_est,
    fuel_gal_est,
    fuel_price_est,
    fuel_usd_est,
    rev_net_of_fuel_est,
    notes_load: fields.notes_load || null,
    fuel_usd_act,
    fuel_notes: fields.fuel_notes || null,
    rev_net_of_fuel_act,
    rev_notes: fields.rev_notes || null,
  }
}

export default {
  actions: {
    async index({ get }) {
      let db = get(Database)
      let allLoads = await db.findMany(loads, { orderBy: ['id', 'asc'] })
      return render(<LoadsIndexPage loads={allLoads} />)
    },

    async show({ get, params }) {
      let db = get(Database)
      let loadId = parseId(params.loadId)
      let load = loadId === undefined ? undefined : await db.find(loads, loadId)

      if (!load) {
        return render(<LoadNotFoundPage />, { status: 404 })
      }

      return render(<LoadShowPage load={load} />)
    },

    new() {
      return render(
        <LoadFormPage
          title="New Load"
          action={routes.loads.create.href()}
          cancelHref={routes.loads.index.href()}
          submitLabel="Create Load"
        />,
      )
    },

    async create({ get }) {
      let db = get(Database)
      let formData = get(FormData)
      let fields = s.parse(loadSchema, formData)
      await db.create(loads, buildLoadValues(fields))
      return redirect(routes.loads.index.href())
    },

    async edit({ get, params }) {
      let db = get(Database)
      let loadId = parseId(params.loadId)
      let load = loadId === undefined ? undefined : await db.find(loads, loadId)

      if (!load) {
        return render(<LoadNotFoundPage />, { status: 404 })
      }

      return render(
        <LoadFormPage
          title={`Edit Load #${load.id}`}
          action={routes.loads.update.href({ loadId: load.id })}
          cancelHref={routes.loads.show.href({ loadId: load.id })}
          submitLabel="Save Changes"
          method="PUT"
          load={load}
        />,
      )
    },

    async update({ get, params }) {
      let db = get(Database)
      let formData = get(FormData)
      let loadId = parseId(params.loadId)
      let load = loadId === undefined ? undefined : await db.find(loads, loadId)

      if (!load) {
        return new Response('Load not found', { status: 404 })
      }

      let fields = s.parse(loadSchema, formData)
      await db.update(loads, load.id, buildLoadValues(fields))
      return redirect(routes.loads.show.href({ loadId: load.id }))
    },

    async destroy({ get, params }) {
      let db = get(Database)
      let loadId = parseId(params.loadId)
      let load = loadId === undefined ? undefined : await db.find(loads, loadId)

      if (load) {
        await db.delete(loads, load.id)
      }

      return redirect(routes.loads.index.href())
    },
  },
} satisfies Controller<typeof routes.loads>
