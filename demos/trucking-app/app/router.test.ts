import { test, before } from 'node:test'
import * as assert from 'node:assert/strict'

import { initializeTruckingDatabase } from './data/setup.ts'
import { createTruckingRouter } from './router.ts'

let router: ReturnType<typeof createTruckingRouter>

before(async () => {
  await initializeTruckingDatabase()
  router = createTruckingRouter({ skipAssets: true })
})

function get(path: string) {
  return new Request(`http://localhost${path}`)
}

function post(path: string, fields: Record<string, string>) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  })
}

function del(path: string) {
  return new Request(`http://localhost${path}`, { method: 'DELETE' })
}

// ─── /weeks ──────────────────────────────────────────────────────────────────

test('GET /weeks with no weeks renders the new week form', async () => {
  let res = await router.fetch(get('/weeks'))
  assert.equal(res.status, 200)
  let html = await res.text()
  assert.ok(html.includes('start_date'), 'Should include start_date input')
  assert.ok(html.includes('New Week'), 'Should show New Week heading')
})

test('POST /weeks with a non-Monday date returns a 200 with an error message', async () => {
  // 2026-04-28 is a Tuesday
  let res = await router.fetch(post('/weeks', { start_date: '2026-04-28' }))
  assert.equal(res.status, 200)
  let html = await res.text()
  assert.ok(html.includes('Monday'), 'Should explain the Monday requirement')
})

test('POST /weeks with a Monday date creates the week and redirects', async () => {
  // 2026-04-27 is a Monday
  let res = await router.fetch(post('/weeks', { start_date: '2026-04-27' }))
  assert.equal(res.status, 302)
  let location = res.headers.get('location')
  assert.ok(location?.startsWith('/weeks/'), `Expected /weeks/:id, got ${location}`)
})

test('GET /weeks renders the first week directly (no redirect)', async () => {
  let res = await router.fetch(get('/weeks'))
  assert.equal(res.status, 200)
  let html = await res.text()
  assert.ok(html.includes('Apr 27'), 'Should render the first week label')
  assert.ok(html.includes('week-select'), 'Should render week dropdown')
  assert.ok(html.includes('New Load'), 'Should show New Load button')
})

test('GET /weeks/:weekId renders the week view with week dropdown and load table', async () => {
  let res = await router.fetch(get('/weeks/20260427'))
  assert.equal(res.status, 200)
  let html = await res.text()
  assert.ok(html.includes('week-select'), 'Should render week dropdown')
  assert.ok(html.includes('Apr 27'), 'Should show the week label')
  assert.ok(html.includes('New Load'), 'Should show New Load button')
  assert.ok(html.includes('New Week'), 'Should show New Week link')
})

// ─── /loads/new ──────────────────────────────────────────────────────────────

test('GET /loads/new?weekId=1 renders the simplified create form with date picker', async () => {
  let res = await router.fetch(get('/loads/new?weekId=1'))
  assert.equal(res.status, 200)
  let html = await res.text()
  assert.ok(html.includes('type="date"'), 'Should use native date picker')
  assert.ok(html.includes('name="week_id"'), 'Should embed hidden week_id field')
  assert.ok(html.includes('value="1"'), 'Should pre-fill weekId value')
})

// ─── POST /loads → create ────────────────────────────────────────────────────

test('POST /loads creates a load and redirects to the owning week', async () => {
  let res = await router.fetch(
    post('/loads', {
      week_id: '1',
      date: '2026-04-27',
      pu_city: 'Alma, GA',
      pu_datetime: 'Mon 4/27 0700',
      do_city: 'Edison, NJ',
      do_datetime: 'Tue 4/28 1400',
      miles: '850',
      gross_usd: '2500',
      mpg_est: '7.5',
      fuel_price_est: '5.75',
    }),
  )
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/weeks/20260427')
})

// ─── GET /weeks/20260427 after load creation ──────────────────────────────────

test('GET /weeks/20260427 shows the created load in the table', async () => {
  let res = await router.fetch(get('/weeks/20260427'))
  assert.equal(res.status, 200)
  let html = await res.text()
  assert.ok(html.includes('Alma'), 'Should show pickup city')
  assert.ok(html.includes('Edison'), 'Should show delivery city')
})

// ─── Derived fields ───────────────────────────────────────────────────────────

test('GET /loads/1 shows the load detail with derived weekday and revenue', async () => {
  let res = await router.fetch(get('/loads/1'))
  assert.equal(res.status, 200)
  let html = await res.text()
  // 2026-04-27 is a Monday
  assert.ok(html.includes('Mon'), 'Should derive weekday from the ISO date')
  // net_usd = 2500 * 0.75 = 1875
  assert.ok(html.includes('1875'), 'Should show calculated net revenue')
})

// ─── DELETE /loads/:id ────────────────────────────────────────────────────────

test('DELETE /loads/1 removes the load and redirects to the owning week', async () => {
  let res = await router.fetch(del('/loads/1'))
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/weeks/20260427')
})

test('GET /weeks/20260427 shows empty table after the load is deleted', async () => {
  let res = await router.fetch(get('/weeks/20260427'))
  assert.equal(res.status, 200)
  let html = await res.text()
  assert.ok(html.includes('No loads this week'), 'Should show empty state after deletion')
})
