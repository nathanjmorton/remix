import { test } from 'node:test'
import * as assert from 'node:assert/strict'

import { getMondayOf } from './setup.ts'

// ─── getMondayOf ─────────────────────────────────────────────────────────────

test('getMondayOf: Monday returns itself', () => {
  assert.equal(getMondayOf('2026-04-27'), '2026-04-27') // already Monday
})

test('getMondayOf: Wednesday maps to the preceding Monday', () => {
  assert.equal(getMondayOf('2026-04-29'), '2026-04-27')
})

test('getMondayOf: Sunday maps to the preceding Monday', () => {
  assert.equal(getMondayOf('2026-05-03'), '2026-04-27')
})

test('getMondayOf: Saturday maps to the preceding Monday', () => {
  assert.equal(getMondayOf('2026-05-02'), '2026-04-27')
})

test('getMondayOf: week spanning a month boundary', () => {
  // 2026-03-31 is a Tuesday; Monday is 2026-03-30
  assert.equal(getMondayOf('2026-03-31'), '2026-03-30')
})

test('getMondayOf: week spanning a year boundary', () => {
  // 2026-01-01 is a Thursday; Monday is 2025-12-29
  assert.equal(getMondayOf('2026-01-01'), '2025-12-29')
})

test('getMondayOf: legacy M/D format (Monday)', () => {
  let year = new Date().getFullYear()
  // 4/27/2026 is a Monday
  assert.equal(getMondayOf('4/27'), `${year}-04-27`)
})

test('getMondayOf: legacy M/D format (Wednesday)', () => {
  let year = new Date().getFullYear()
  assert.equal(getMondayOf('4/29'), `${year}-04-27`)
})

test('getMondayOf: legacy M/D/YYYY format', () => {
  assert.equal(getMondayOf('4/29/2026'), '2026-04-27')
})

test('getMondayOf: strings with no parseable date return null', () => {
  // No separator at all — split gives a single segment, length < 2
  assert.equal(getMondayOf('not-a-date'), null)
  assert.equal(getMondayOf(''), null)
  // Non-numeric month/day produce NaN, guarded by the isNaN checks
  assert.equal(getMondayOf('abc/xyz'), null)
})
