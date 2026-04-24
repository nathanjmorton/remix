import type { Load } from '../../data/schema.ts'
import { routes } from '../../routes.ts'
import { Layout } from '../../ui/layout.tsx'
import { RestfulForm } from '../../ui/restful-form.tsx'
import { formatDate } from '../weeks/week-page.tsx'

export interface LoadShowPageProps {
  load: Load
}

function val(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—'
  return String(v)
}

function usd(v: number | null | undefined): string {
  if (v == null) return '—'
  return `$${v.toFixed(2)}`
}

function num(v: number | null | undefined, d = 4): string {
  if (v == null) return '—'
  return v.toFixed(d)
}

export function LoadShowPage() {
  return ({ load }: LoadShowPageProps) => (
    <Layout title={`Load #${load.id}`}>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
        <h2>Load #{load.id}</h2>
        <div class="actions">
          <a href={routes.loads.edit.href({ loadId: load.id })} class="btn">
            Edit
          </a>
          <RestfulForm method="DELETE" action={routes.loads.destroy.href({ loadId: load.id })}>
            <button type="submit" class="btn btn-danger">
              Delete
            </button>
          </RestfulForm>
          <a
            href={
              load.week_id != null
                ? routes.weeks.show.href({ weekId: load.week_id })
                : routes.weeks.index.href()
            }
            class="btn btn-secondary"
          >
            ← Back
          </a>
        </div>
      </div>

      <div class="card">
        <p class="section-title">Trip Info</p>
        <dl class="dl-grid">
          <dt>Date</dt>
          <dd>{formatDate(load.date)}</dd>
          <dt>Weekday</dt>
          <dd>{val(load.weekday)}</dd>
          <dt>Pickup City</dt>
          <dd>{val(load.pu_city)}</dd>
          <dt>Pickup Time</dt>
          <dd>{val(load.pu_datetime)}</dd>
          <dt>Delivery City</dt>
          <dd>{val(load.do_city)}</dd>
          <dt>Delivery Time</dt>
          <dd>{val(load.do_datetime)}</dd>
          <dt>Miles</dt>
          <dd>{num(load.miles, 1)}</dd>
        </dl>

        <p class="section-title">Revenue</p>
        <dl class="dl-grid">
          <dt>Gross</dt>
          <dd>{usd(load.gross_usd)}</dd>
          <dt>Net %</dt>
          <dd>{load.net_pct != null ? `${(load.net_pct * 100).toFixed(1)}%` : '—'}</dd>
          <dt>Net $</dt>
          <dd>{usd(load.net_usd)}</dd>
        </dl>

        <p class="section-title">Fuel Estimates</p>
        <dl class="dl-grid">
          <dt>MPG Est</dt>
          <dd>{num(load.mpg_est, 1)}</dd>
          <dt>Gal Est</dt>
          <dd>{num(load.fuel_gal_est, 2)}</dd>
          <dt>Fuel Price Est</dt>
          <dd>{usd(load.fuel_price_est)}</dd>
          <dt>Fuel $ Est</dt>
          <dd>{usd(load.fuel_usd_est)}</dd>
          <dt>Rev Net of Fuel Est</dt>
          <dd>{usd(load.rev_net_of_fuel_est)}</dd>
        </dl>

        <p class="section-title">Actuals</p>
        <dl class="dl-grid">
          <dt>Fuel $ Actual</dt>
          <dd>{usd(load.fuel_usd_act)}</dd>
          <dt>Fuel Notes</dt>
          <dd>{val(load.fuel_notes)}</dd>
          <dt>Rev Net of Fuel Act</dt>
          <dd>{usd(load.rev_net_of_fuel_act)}</dd>
        </dl>

        {(load.notes_load || load.rev_notes) && (
          <>
            <p class="section-title">Notes</p>
            <dl class="dl-grid">
              {load.notes_load && (
                <>
                  <dt>Load Notes</dt>
                  <dd>{load.notes_load}</dd>
                </>
              )}
              {load.rev_notes && (
                <>
                  <dt>Revenue Notes</dt>
                  <dd>{load.rev_notes}</dd>
                </>
              )}
            </dl>
          </>
        )}
      </div>
    </Layout>
  )
}

export function LoadNotFoundPage() {
  return () => (
    <Layout title="Load Not Found">
      <div class="card">
        <h2>Load not found</h2>
        <p>
          <a href={routes.weeks.index.href()} class="btn btn-secondary" style="margin-top:1rem;">
            ← Back to Loads
          </a>
        </p>
      </div>
    </Layout>
  )
}
