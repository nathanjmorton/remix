import type { Load, Week } from '../../data/schema.ts'
import { routes } from '../../routes.ts'
import { Layout } from '../../ui/layout.tsx'
import { RestfulForm } from '../../ui/restful-form.tsx'
import { toWeekId } from '../../utils/weeks.ts'
import { WeekSelect } from '../../assets/week-select.tsx'

export interface WeekPageProps {
  weeks: Week[]
  currentWeek: Week
  loads: Load[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function weekLabel(startDate: string): string {
  let parts = startDate.split('-')
  let year = parseInt(parts[0]!, 10)
  let month = parseInt(parts[1]!, 10)
  let day = parseInt(parts[2]!, 10)
  let start = new Date(year, month - 1, day)
  let end = new Date(year, month - 1, day + 6)
  return `${MONTHS[start.getMonth()]} ${start.getDate()} – ${MONTHS[end.getMonth()]} ${end.getDate()}`
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  let parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  let month = parseInt(parts[1]!, 10)
  let day = parseInt(parts[2]!, 10)
  return `${MONTHS[month - 1]} ${day}`
}

function fmt(val: number | null, decimals = 2): string {
  if (val == null) return '—'
  return val.toFixed(decimals)
}

function fmtUsd(val: number | null): string {
  if (val == null) return '—'
  return `$${val.toFixed(2)}`
}

export function WeekPage() {
  return ({ weeks, currentWeek, loads }: WeekPageProps) => {
    let totalMiles = loads.reduce((sum, l) => sum + (l.miles ?? 0), 0)
    let totalGross = loads.reduce((sum, l) => sum + (l.gross_usd ?? 0), 0)
    let totalNet = loads.reduce((sum, l) => sum + (l.net_usd ?? 0), 0)
    let totalRevNetFuel = loads.reduce((sum, l) => sum + (l.rev_net_of_fuel_est ?? 0), 0)

    return (
      <Layout title={weekLabel(currentWeek.start_date)}>
        <div class="week-nav">
          <WeekSelect
            setup={{
              options: weeks.map((week) => ({
                value: routes.weeks.show.href({ weekId: toWeekId(week.start_date) }),
                label: weekLabel(week.start_date),
                selected: week.id === currentWeek.id,
              })),
            }}
          />
          <a href={routes.weeks.new.href()} class="btn btn-secondary btn-sm">
            + New Week
          </a>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin:1.25rem 0 1rem;">
          <h2>{weekLabel(currentWeek.start_date)}</h2>
          <a href={`${routes.loads.new.href()}?weekId=${currentWeek.id}`} class="btn">
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
                  <td>{formatDate(load.date)}</td>
                  <td>{load.weekday ?? <span class="null-val">—</span>}</td>
                  <td>{load.pu_city ?? <span class="null-val">—</span>}</td>
                  <td>{load.do_city ?? <span class="null-val">—</span>}</td>
                  <td>{fmt(load.miles, 0)}</td>
                  <td>{fmtUsd(load.gross_usd)}</td>
                  <td>{fmtUsd(load.net_usd)}</td>
                  <td>{fmtUsd(load.rev_net_of_fuel_est)}</td>
                  <td>
                    <div class="actions">
                      <a
                        href={routes.loads.show.href({ loadId: load.id })}
                        class="btn btn-secondary btn-sm"
                      >
                        View
                      </a>
                      <a href={routes.loads.edit.href({ loadId: load.id })} class="btn btn-sm">
                        Edit
                      </a>
                      <RestfulForm
                        method="DELETE"
                        action={routes.loads.destroy.href({ loadId: load.id })}
                      >
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
                    No loads this week.{' '}
                    <a href={`${routes.loads.new.href()}?weekId=${currentWeek.id}`}>Add one</a>.
                  </td>
                </tr>
              )}
            </tbody>
            {loads.length > 0 && (
              <tfoot>
                <tr>
                  <td colspan={4} style="text-align:right; font-weight:600; padding-right:0.75rem;">
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
