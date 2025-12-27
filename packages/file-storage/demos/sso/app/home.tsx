import type { BuildAction } from '@remix-run/fetch-router'

import { routes } from './routes.ts'
import { Layout } from './layout.tsx'
import { render } from './utils/render.ts'

export default {
  middleware: [],
  action({ session }) {
    let user = session.get('user') as { email?: string; name?: string; picture?: string } | null

    return render(
      <Layout user={user}>
        <div class="card">
          <h2>AWS SSO with Auth0 + S3</h2>
          <p style="margin: 1rem 0;">
            This demo shows how to use Auth0 as a trusted token issuer for AWS IAM Identity Center,
            enabling secure access to S3 using OAuth 2.0 tokens.
          </p>

          {user ? (
            <div class="alert alert-success">
              ✓ Logged in as <strong>{user.email}</strong>
            </div>
          ) : (
            <div class="alert alert-info">
              Click "Login with Auth0" to authenticate and access S3 files.
            </div>
          )}
        </div>

        <div class="card">
          <h3>How it works</h3>
          <ol style="margin: 1rem 0; padding-left: 1.5rem;">
            <li>
              <strong>Auth0 Authentication</strong> - User authenticates via Auth0 (OAuth 2.0/OIDC)
            </li>
            <li>
              <strong>Token Exchange</strong> - Auth0 access token is exchanged with IAM Identity
              Center
            </li>
            <li>
              <strong>S3 Access</strong> - Identity Center token is used to access S3 via trusted
              identity propagation
            </li>
          </ol>
        </div>

        <div class="card">
          <h3>Setup Required</h3>
          <p style="margin: 0.5rem 0;">Set these environment variables:</p>
          <pre>
            <code>
              {`AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=https://s3.amazonaws.com

AWS_REGION=us-east-1`}
            </code>
          </pre>
        </div>
      </Layout>,
    )
  },
} satisfies BuildAction<'GET', typeof routes.home>
