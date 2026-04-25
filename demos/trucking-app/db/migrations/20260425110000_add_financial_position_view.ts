import { createMigration } from 'remix/data-table/migrations'

export default createMigration({
  async up({ schema }) {
    await schema.plan(`
      CREATE VIEW IF NOT EXISTS v_financial_position AS
      SELECT
        dc.name,
        dc.frequency,
        dc.amount_per_period,
        dc.total_obligation,
        ROUND(SUM(ABS(sd.amount)), 2) AS paid_to_date,
        CASE
          WHEN dc.total_obligation IS NOT NULL AND SUM(sd.amount) IS NOT NULL
          THEN ROUND(SUM(ABS(sd.amount)) / dc.total_obligation * 100, 1)
        END AS pct_complete
      FROM deduction_catalog dc
      LEFT JOIN statement_deductions sd
        ON LOWER(sd.description) LIKE '%' || LOWER(dc.match_key) || '%'
      GROUP BY dc.id
      ORDER BY dc.frequency, dc.name
    `)
  },

  async down({ schema }) {
    await schema.plan(`DROP VIEW IF EXISTS v_financial_position`)
  },
})
