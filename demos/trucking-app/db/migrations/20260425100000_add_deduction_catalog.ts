import { column as c, createMigration } from 'remix/data-table/migrations'
import { table } from 'remix/data-table'

export default createMigration({
  async up({ schema }) {
    let deductionCatalog = table({
      name: 'deduction_catalog',
      columns: {
        id: c.integer().primaryKey().autoIncrement(),
        // Human-readable name
        name: c.text(),
        // Substring matched against statement_deductions.description for paid-to-date rollups
        match_key: c.text(),
        // 'weekly' | 'monthly' | 'annual' | 'one-time'
        frequency: c.text(),
        // Dollar amount per period (NULL if variable/prorated)
        amount_per_period: c.decimal(10, 2).nullable(),
        // Total finite obligation (NULL for open-ended recurring items)
        total_obligation: c.decimal(10, 2).nullable(),
        notes: c.text().nullable(),
      },
    })
    await schema.createTable(deductionCatalog, { ifNotExists: true })
  },

  async down({ schema }) {
    await schema.dropTable('deduction_catalog', { ifExists: true })
  },
})
