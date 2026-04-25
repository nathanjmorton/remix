import { column as c, createMigration } from 'remix/data-table/migrations'
import { table } from 'remix/data-table'

export default createMigration({
  async up({ schema }) {
    let statements = table({
      name: 'statements',
      columns: {
        id: c.integer().primaryKey().autoIncrement(),
        statement_date: c.text(),
        check_amount: c.decimal(10, 2),
      },
    })
    await schema.createTable(statements, { ifNotExists: true })

    let statementTrips = table({
      name: 'statement_trips',
      columns: {
        id: c.integer().primaryKey().autoIncrement(),
        statement_id: c.integer(),
        trip_no: c.integer(),
        description: c.text(),
        mileage: c.integer(),
        freight_amount: c.decimal(10, 2),
        date: c.text(),
        amount: c.decimal(10, 2),
      },
    })
    await schema.createTable(statementTrips, { ifNotExists: true })

    let statementDeductions = table({
      name: 'statement_deductions',
      columns: {
        id: c.integer().primaryKey().autoIncrement(),
        statement_id: c.integer(),
        description: c.text(),
        date: c.text(),
        amount: c.decimal(10, 2),
      },
    })
    await schema.createTable(statementDeductions, { ifNotExists: true })

    let statementFuel = table({
      name: 'statement_fuel',
      columns: {
        id: c.integer().primaryKey().autoIncrement(),
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
    await schema.createTable(statementFuel, { ifNotExists: true })
  },

  async down({ schema }) {
    await schema.dropTable('statement_fuel', { ifExists: true })
    await schema.dropTable('statement_deductions', { ifExists: true })
    await schema.dropTable('statement_trips', { ifExists: true })
    await schema.dropTable('statements', { ifExists: true })
  },
})
