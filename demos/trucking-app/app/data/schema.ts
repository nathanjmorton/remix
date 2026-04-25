import { column as c, table } from 'remix/data-table'
import type { TableRow } from 'remix/data-table'

export const weeks = table({
  name: 'weeks',
  columns: {
    id: c.integer(),
    start_date: c.text(),
  },
})

export type Week = TableRow<typeof weeks>

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
    week_id: c.integer().nullable(),
  },
})

export type Load = TableRow<typeof loads>

export const statements = table({
  name: 'statements',
  columns: {
    id: c.integer(),
    statement_date: c.text(),
    check_amount: c.decimal(10, 2),
  },
})

export type Statement = TableRow<typeof statements>

export const statementTrips = table({
  name: 'statement_trips',
  columns: {
    id: c.integer(),
    statement_id: c.integer(),
    trip_no: c.integer(),
    description: c.text(),
    mileage: c.integer(),
    freight_amount: c.decimal(10, 2),
    date: c.text(),
    amount: c.decimal(10, 2),
  },
})

export type StatementTrip = TableRow<typeof statementTrips>

export const statementDeductions = table({
  name: 'statement_deductions',
  columns: {
    id: c.integer(),
    statement_id: c.integer(),
    description: c.text(),
    date: c.text(),
    amount: c.decimal(10, 2),
  },
})

export type StatementDeduction = TableRow<typeof statementDeductions>

export const statementFuel = table({
  name: 'statement_fuel',
  columns: {
    id: c.integer(),
    statement_id: c.integer(),
    city: c.text(),
    state: c.text(),
    gallons: c.decimal(10, 4),
    fuel_usd: c.decimal(10, 2),
    advance_usd: c.decimal(10, 2),
    misc_usd: c.decimal(10, 2),
    date: c.text(),
    amount: c.decimal(10, 2),
  },
})

export type StatementFuel = TableRow<typeof statementFuel>

export const deductionCatalog = table({
  name: 'deduction_catalog',
  columns: {
    id: c.integer(),
    name: c.text(),
    match_key: c.text(),
    frequency: c.text(),
    amount_per_period: c.decimal(10, 2).nullable(),
    total_obligation: c.decimal(10, 2).nullable(),
    notes: c.text().nullable(),
  },
})

export type DeductionCatalog = TableRow<typeof deductionCatalog>
