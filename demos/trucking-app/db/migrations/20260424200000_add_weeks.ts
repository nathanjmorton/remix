import { column as c, createMigration } from 'remix/data-table/migrations'
import { table } from 'remix/data-table'

export default createMigration({
  async up({ schema }) {
    let weeks = table({
      name: 'weeks',
      columns: {
        id: c.integer().primaryKey().autoIncrement(),
        start_date: c.text(),
      },
    })
    await schema.createTable(weeks, { ifNotExists: true })

    let hasColumn = await schema.hasColumn('loads', 'week_id')
    if (!hasColumn) {
      await schema.alterTable('loads', (t) => {
        t.addColumn('week_id', c.integer().nullable())
      })
    }
  },

  async down({ schema }) {
    await schema.alterTable('loads', (t) => {
      t.dropColumn('week_id', { ifExists: true })
    })
    await schema.dropTable('weeks', { ifExists: true })
  },
})
