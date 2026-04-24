import { fileURLToPath } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import { createDatabase } from 'remix/data-table'
import { createMigrationRunner } from 'remix/data-table/migrations'
import { loadMigrations } from 'remix/data-table/migrations/node'
import { createSqliteDatabaseAdapter } from 'remix/data-table-sqlite'

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
}
