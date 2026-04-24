import { test } from 'node:test'
import * as assert from 'node:assert/strict'

import { weekLabel, formatDate } from './week-page.tsx'

test('weekLabel: Mon-Sun within same month', () => {
  assert.equal(weekLabel('2026-04-27'), 'Apr 27 – May 3')
})

test('weekLabel: week spanning a month boundary', () => {
  assert.equal(weekLabel('2026-03-30'), 'Mar 30 – Apr 5')
})

test('weekLabel: December into January', () => {
  assert.equal(weekLabel('2025-12-29'), 'Dec 29 – Jan 4')
})

test('formatDate: YYYY-MM-DD formats as Mon D', () => {
  assert.equal(formatDate('2026-04-27'), 'Apr 27')
  assert.equal(formatDate('2026-01-01'), 'Jan 1')
  assert.equal(formatDate('2026-12-31'), 'Dec 31')
})

test('formatDate: null returns em dash', () => {
  assert.equal(formatDate(null), '—')
})

test('formatDate: undefined returns em dash', () => {
  assert.equal(formatDate(undefined), '—')
})

test('formatDate: non-ISO string passes through unchanged', () => {
  assert.equal(formatDate('4/27'), '4/27')
})
