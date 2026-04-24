import type { Load } from '../../data/schema.ts'
import { routes } from '../../routes.ts'
import { Layout } from '../../ui/layout.tsx'
import { RestfulForm } from '../../ui/restful-form.tsx'

export interface LoadsIndexPageProps {
  loads: Load[]
}

function fmt(val: number | null, decimals = 2): string {
  if (val == null) return '—'
  return val.toFixed(decimals)
}

function fmtUsd(val: number | null): string {
  if (val == null) return '—'
  return `$${val.toFixed(2)}`
}

export function LoadsIndexPage() {
  return ({ loads }: LoadsIndexPageProps) => {
    let totalMiles = loads.reduce((sum, l) => sum + (l.miles ?? 0), 0)
    let totalGross = loads.reduce((sum, l) => sum + (l.gross_usd ?? 0), 0)
    let totalNet = loads.reduce((sum, l) => sum + (l.net_usd ?? 0), 0)
    let totalRevNetFuel = loads.reduce((sum, l) => sum + (l.rev_net_of_fuel_est ?? 0), 0)

    return (
    <Layout title="Loads">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
        <h2>Loads</h2>
        <a href={routes.loads.new.href()} class="btn">
          + New Load
        </a>
      </div>

      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th>Pickup</th>
              <th>Delivery</th>
              <th>Miles</th>
              <th>Gross</th>
              <th>Net</th>
              <th>Net % Fuel Est</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((load) => (
              <tr key={load.id}>
                <td>{load.date ?? <span class="null-val">—</span>}</td>
                <td>{load.weekday ?? <span class="null-val">—</span>}</td>
                <td>{load.pu_city ?? <span class="null-val">—</span>}</td>
                <td>{load.do_city ?? <span class="null-val">—</span>}</td>
                <td>{fmt(load.miles, 0)}</td>
                <td>{fmtUsd(load.gross_usd)}</td>
                <td>{fmtUsd(load.net_usd)}</td>
                <td>{fmtUsd(load.rev_net_of_fuel_est)}</td>
                <td>
                  <div class="actions">
                    <a href={routes.loads.show.href({ loadId: load.id })} class="btn btn-secondary btn-sm">
                      View
                    </a>
                    <a href={routes.loads.edit.href({ loadId: load.id })} class="btn btn-sm">
                      Edit
                    </a>
                    <RestfulForm method="DELETE" action={routes.loads.destroy.href({ loadId: load.id })}>
                      <button type="submit" class="btn btn-danger btn-sm">
                        Delete
                      </button>
                    </RestfulForm>
                  </div>
                </td>
              </tr>
            ))}
            {loads.length === 0 && (
              <tr>
                <td colspan={9} style="text-align:center; color:#888; padding:2rem;">
                  No loads yet. <a href={routes.loads.new.href()}>Add one</a>.
                </td>
              </tr>
            )}
          </tbody>
          {loads.length > 0 && (
            <tfoot>
              <tr>
                <td
                  colspan={4}
                  style="text-align:right; font-weight:600; padding-right:0.75rem;"
                >
                  Totals
                </td>
                <td style="font-weight:600;">{fmt(totalMiles, 0)}</td>
                <td style="font-weight:600;">{fmtUsd(totalGross)}</td>
                <td style="font-weight:600;">{fmtUsd(totalNet)}</td>
                <td style="font-weight:600;">{fmtUsd(totalRevNetFuel)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Layout>
    )
  }
}
