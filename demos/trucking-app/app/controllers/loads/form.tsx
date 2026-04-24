import type { Load } from '../../data/schema.ts'
import { Layout } from '../../ui/layout.tsx'
import { RestfulForm } from '../../ui/restful-form.tsx'

export interface LoadFormPageProps {
  title: string
  action: string
  cancelHref: string
  submitLabel: string
  method?: 'POST' | 'PUT'
  load?: Load
}

function strVal(v: number | string | null | undefined): string {
  if (v == null) return ''
  return String(v)
}

export function LoadFormPage() {
  return ({
    title,
    action,
    cancelHref,
    submitLabel,
    method = 'POST',
    load,
  }: LoadFormPageProps) => (
    <Layout title={title}>
      <h2 style="margin-bottom:1rem;">{title}</h2>
      <div class="card">
        <RestfulForm method={method} action={action}>
          <p class="section-title">Trip Info</p>
          <div class="form-row">
            <div class="form-group">
              <label for="date">Date</label>
              <input type="text" id="date" name="date" placeholder="4/27" value={strVal(load?.date)} />
            </div>
            <div class="form-group">
              <label for="weekday">Weekday</label>
              <select id="weekday" name="weekday">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <option key={d} value={d} selected={load?.weekday === d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="pu_city">Pickup City</label>
              <input type="text" id="pu_city" name="pu_city" placeholder="Alma, GA" value={strVal(load?.pu_city)} />
            </div>
            <div class="form-group">
              <label for="pu_datetime">Pickup Date/Time</label>
              <input type="text" id="pu_datetime" name="pu_datetime" placeholder="Mon 4/27 0700-1500" value={strVal(load?.pu_datetime)} />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="do_city">Delivery City</label>
              <input type="text" id="do_city" name="do_city" placeholder="Edison, NJ" value={strVal(load?.do_city)} />
            </div>
            <div class="form-group">
              <label for="do_datetime">Delivery Date/Time</label>
              <input type="text" id="do_datetime" name="do_datetime" placeholder="Tue 4/28 1400" value={strVal(load?.do_datetime)} />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="miles">Miles</label>
              <input type="number" id="miles" name="miles" step="1" value={strVal(load?.miles)} />
            </div>
          </div>

          <p class="section-title">Revenue</p>
          <div class="form-row">
            <div class="form-group">
              <label for="gross_usd">Gross $</label>
              <input type="number" id="gross_usd" name="gross_usd" step="0.01" value={strVal(load?.gross_usd)} />
            </div>
            <div class="form-group">
              <label for="net_pct">Net % (decimal)</label>
              <input type="number" id="net_pct" name="net_pct" step="0.01" placeholder="0.75" value={strVal(load?.net_pct ?? 0.75)} />
            </div>
          </div>
          <p style="font-size:0.8rem; color:#888; margin-top:-0.5rem; margin-bottom:1rem;">
            Net $, fuel estimates, and revenue net of fuel are calculated automatically.
          </p>

          <p class="section-title">Fuel Estimates</p>
          <div class="form-row">
            <div class="form-group">
              <label for="mpg_est">MPG Est</label>
              <input type="number" id="mpg_est" name="mpg_est" step="0.1" placeholder="7.5" value={strVal(load?.mpg_est ?? 7.5)} />
            </div>
            <div class="form-group">
              <label for="fuel_price_est">Fuel Price Est $</label>
              <input type="number" id="fuel_price_est" name="fuel_price_est" step="0.01" placeholder="5.75" value={strVal(load?.fuel_price_est ?? 5.75)} />
            </div>
          </div>

          <p class="section-title">Actuals (optional)</p>
          <div class="form-row">
            <div class="form-group">
              <label for="fuel_usd_act">Fuel $ Actual</label>
              <input type="number" id="fuel_usd_act" name="fuel_usd_act" step="0.01" value={strVal(load?.fuel_usd_act)} />
            </div>
            <div class="form-group">
              <label for="fuel_notes">Fuel Notes</label>
              <input type="text" id="fuel_notes" name="fuel_notes" value={strVal(load?.fuel_notes)} />
            </div>
          </div>

          <p class="section-title">Notes</p>
          <div class="form-group">
            <label for="notes_load">Load Notes</label>
            <textarea id="notes_load" name="notes_load">{strVal(load?.notes_load)}</textarea>
          </div>
          <div class="form-group">
            <label for="rev_notes">Revenue Notes</label>
            <textarea id="rev_notes" name="rev_notes">{strVal(load?.rev_notes)}</textarea>
          </div>

          <div style="margin-top:1.5rem;">
            <button type="submit" class="btn">{submitLabel}</button>
            <a href={cancelHref} class="btn btn-secondary" style="margin-left:0.5rem;">
              Cancel
            </a>
          </div>
        </RestfulForm>
      </div>
    </Layout>
  )
}
