/**
 * Syncs statement tables and deduction_catalog from trucking.db (SQLite) into
 * trucking.duckdb (DuckDB) and recreates the v_financial_position view.
 *
 * Usage:
 *   pnpm --filter trucking-app-demo run sync:duckdb
 *   # or directly:
 *   tsx demos/trucking-app/db/sync-to-duckdb.ts
 */
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const sqlitePath = `${root}/trucking.db`
const duckdbPath = `${root}/trucking.duckdb`

const TABLES = [
  'statements',
  'statement_trips',
  'statement_deductions',
  'statement_fuel',
  'deduction_catalog',
] as const

// Verify duckdb CLI is available
try {
  execFileSync('duckdb', ['--version'], { stdio: 'pipe' })
} catch {
  console.error('Error: duckdb CLI not found. Install via: brew install duckdb')
  process.exit(1)
}

const sql = `
ATTACH '${sqlitePath}' AS src (TYPE sqlite);

${TABLES.map((t) => `DROP TABLE IF EXISTS ${t};\nCREATE TABLE ${t} AS SELECT * FROM src.${t};`).join('\n\n')}

DETACH src;

CREATE OR REPLACE VIEW v_financial_position AS
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
GROUP BY dc.id, dc.name, dc.frequency, dc.amount_per_period, dc.total_obligation
ORDER BY dc.frequency, dc.name;

SELECT
  'statements'         AS "table", COUNT(*) AS rows FROM statements UNION ALL
SELECT 'statement_trips',          COUNT(*) FROM statement_trips    UNION ALL
SELECT 'statement_deductions',     COUNT(*) FROM statement_deductions UNION ALL
SELECT 'statement_fuel',           COUNT(*) FROM statement_fuel     UNION ALL
SELECT 'deduction_catalog',        COUNT(*) FROM deduction_catalog;
`

console.log('Syncing trucking.db → trucking.duckdb ...')

try {
  const output = execSync(`duckdb '${duckdbPath}'`, {
    input: sql,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  console.log(output.trim())
  console.log('Done. v_financial_position view recreated.')
} catch (err) {
  console.error('Sync failed:', err)
  process.exit(1)
}
