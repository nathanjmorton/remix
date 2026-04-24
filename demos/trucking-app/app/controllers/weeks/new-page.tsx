import { Layout } from '../../ui/layout.tsx'
import { RestfulForm } from '../../ui/restful-form.tsx'
import { routes } from '../../routes.ts'

export interface NewWeekPageProps {
  error?: string
  startDate?: string
}

export function NewWeekPage() {
  return ({ error, startDate }: NewWeekPageProps) => (
    <Layout title="New Week">
      <h2 style="margin-bottom:1rem;">New Week</h2>
      <div class="card" style="max-width:420px;">
        <RestfulForm method="POST" action={routes.weeks.create.href()}>
          <div class="form-group">
            <label for="start_date">Week Start Date (Monday)</label>
            <input
              type="date"
              id="start_date"
              name="start_date"
              value={startDate ?? ''}
              required
            />
          </div>
          {error && (
            <p style="color:#c0392b; font-size:0.875rem; margin-bottom:1rem;">{error}</p>
          )}
          <div style="margin-top:1rem;">
            <button type="submit" class="btn">Create Week</button>
            <a href={routes.weeks.index.href()} class="btn btn-secondary" style="margin-left:0.5rem;">
              Cancel
            </a>
          </div>
        </RestfulForm>
      </div>
    </Layout>
  )
}
