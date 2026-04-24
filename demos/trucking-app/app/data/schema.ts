import { column as c, table } from 'remix/data-table'
import type { TableRow } from 'remix/data-table'

export const loads = table({
  name: 'loads',
  columns: {
    id: c.integer(),
    date: c.text().nullable(),
    weekday: c.text().nullable(),
    pu_city: c.text().nullable(),
    pu_datetime: c.text().nullable(),
    do_city: c.text().nullable(),
    do_datetime: c.text().nullable(),
    miles: c.decimal(10, 4).nullable(),
    gross_usd: c.decimal(10, 4).nullable(),
    net_pct: c.decimal(10, 4).nullable(),
    net_usd: c.decimal(10, 4).nullable(),
    mpg_est: c.decimal(10, 4).nullable(),
    fuel_gal_est: c.decimal(10, 4).nullable(),
    fuel_price_est: c.decimal(10, 4).nullable(),
    fuel_usd_est: c.decimal(10, 4).nullable(),
    rev_net_of_fuel_est: c.decimal(10, 4).nullable(),
    notes_load: c.text().nullable(),
    fuel_usd_act: c.decimal(10, 4).nullable(),
    fuel_notes: c.text().nullable(),
    rev_net_of_fuel_act: c.decimal(10, 4).nullable(),
    rev_notes: c.text().nullable(),
  },
})

export type Load = TableRow<typeof loads>
