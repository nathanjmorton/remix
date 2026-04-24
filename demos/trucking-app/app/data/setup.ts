import { fileURLToPath } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import { createDatabase } from 'remix/data-table'
import { createMigrationRunner } from 'remix/data-table/migrations'
import { loadMigrations } from 'remix/data-table/migrations/node'
import { createSqliteDatabaseAdapter } from 'remix/data-table-sqlite'

import { loads, weeks } from './schema.ts'

let databaseFilePath: string
if (process.env.NODE_ENV === 'test') {
  databaseFilePath = ':memory:'
} else {
  // trucking.db lives at the demo root (2 levels up from this file)
  databaseFilePath = fileURLToPath(new URL('../../trucking.db', import.meta.url))
}

const migrationsDirectoryPath = fileURLToPath(new URL('../../db/migrations/', import.meta.url))

const sqlite = new BetterSqlite3(databaseFilePath)
sqlite.pragma('foreign_keys = ON')
const adapter = createSqliteDatabaseAdapter(sqlite)

export const db = createDatabase(adapter)

let initializePromise: Promise<void> | null = null

export async function initializeTruckingDatabase(): Promise<void> {
  if (!initializePromise) {
    initializePromise = initialize()
  }
  await initializePromise
}

async function initialize(): Promise<void> {
  let migrations = await loadMigrations(migrationsDirectoryPath)
  let migrationRunner = createMigrationRunner(adapter, migrations)
  await migrationRunner.up()
  await backfillWeekIds()
}

// Parses both YYYY-MM-DD and legacy M/D (or M/D/YYYY) date strings, returning
// the ISO date string of the Monday that starts that load's week.
export function getMondayOf(dateStr: string): string | null {
  let date: Date | undefined

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    let parts = dateStr.split('-').map(Number)
    date = new Date(parts[0]!, parts[1]! - 1, parts[2]!)
  } else {
    let parts = dateStr.split('/')
    if (parts.length < 2) return null
    let month = parseInt(parts[0]!, 10)
    let day = parseInt(parts[1]!, 10)
    let year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear()
    if (isNaN(month) || isNaN(day)) return null
    date = new Date(year, month - 1, day)
  }

  if (!date || isNaN(date.getTime())) return null

  // Shift back to the Monday of this date's week (Sun=0 → go back 6, Mon=1 → 0, …)
  let dow = date.getDay()
  let daysBack = dow === 0 ? 6 : dow - 1
  let monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysBack)

  let y = monday.getFullYear()
  let m = String(monday.getMonth() + 1).padStart(2, '0')
  let d = String(monday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Assigns week_id to any load that has a date but no week_id yet.
// Idempotent: subsequent runs exit immediately when all loads are already assigned.
async function backfillWeekIds(): Promise<void> {
  let allLoads = await db.findMany(loads)
  let orphans = allLoads.filter((l) => l.week_id == null && l.date != null)
  if (orphans.length === 0) return

  let allWeeks = await db.findMany(weeks)
  let weeksByDate = new Map(allWeeks.map((w) => [w.start_date, w]))

  for (let load of orphans) {
    let monday = getMondayOf(load.date!)
    if (!monday) continue

    if (!weeksByDate.has(monday)) {
      let week = await db.create(weeks, { start_date: monday }, { returnRow: true })
      weeksByDate.set(monday, week)
    }

    await db.update(loads, load.id, { week_id: weeksByDate.get(monday)!.id })
  }
}
