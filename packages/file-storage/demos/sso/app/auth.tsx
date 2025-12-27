import type { Controller } from '@remix-run/fetch-router'
import { createRedirectResponse as redirect } from '@remix-run/response/redirect'

import { routes } from './routes.ts'
import { Document } from './layout.tsx'
import { render } from './utils/render.ts'
import {
  getAuth0Config,
  generateState,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getUserInfo,
} from './utils/auth0.ts'

export default {
  middleware: [],
  actions: {
    // Initiate OAuth login flow
    login({ session }) {
      try {
        let config = getAuth0Config()
        let state = generateState()

        // Store state in session for CSRF protection
        session.set('oauth_state', state)

        let authUrl = getAuthorizationUrl(config, state)
        return redirect(authUrl)
      } catch (error) {
        return render(
          <Document>
            <div class="container">
              <div class="card">
                <h2>Configuration Error</h2>
                <div class="alert alert-error">
                  {error instanceof Error ? error.message : 'Unknown error'}
                </div>
                <p style="margin-top: 1rem;">
                  <a href={routes.home.href()} class="btn btn-secondary">
                    Back to Home
                  </a>
                </p>
              </div>
            </div>
          </Document>,
          { status: 500 },
        )
      }
    },

    // OAuth callback handler
    async callback({ session, url }) {
      let code = url.searchParams.get('code')
      let state = url.searchParams.get('state')
      let error = url.searchParams.get('error')
      let errorDescription = url.searchParams.get('error_description')

      // Handle OAuth errors
      if (error) {
        return render(
          <Document>
            <div class="container">
              <div class="card">
                <h2>Authentication Error</h2>
                <div class="alert alert-error">
                  <strong>{error}</strong>
                  {errorDescription ? `: ${errorDescription}` : ''}
                </div>
                <p style="margin-top: 1rem;">
                  <a href={routes.auth.login.href()} class="btn">
                    Try Again
                  </a>
                </p>
              </div>
            </div>
          </Document>,
          { status: 400 },
        )
      }

      // Validate state to prevent CSRF
      let storedState = session.get('oauth_state')
      if (!state || state !== storedState) {
        return render(
          <Document>
            <div class="container">
              <div class="card">
                <h2>Invalid State</h2>
                <div class="alert alert-error">
                  The OAuth state parameter is invalid or expired. Please try logging in again.
                </div>
                <p style="margin-top: 1rem;">
                  <a href={routes.auth.login.href()} class="btn">
                    Try Again
                  </a>
                </p>
              </div>
            </div>
          </Document>,
          { status: 400 },
        )
      }

      // Clear the stored state
      session.unset('oauth_state')

      if (!code) {
        return render(
          <Document>
            <div class="container">
              <div class="card">
                <h2>Missing Authorization Code</h2>
                <div class="alert alert-error">No authorization code received from Auth0.</div>
                <p style="margin-top: 1rem;">
                  <a href={routes.auth.login.href()} class="btn">
                    Try Again
                  </a>
                </p>
              </div>
            </div>
          </Document>,
          { status: 400 },
        )
      }

      try {
        let config = getAuth0Config()

        // Exchange code for tokens
        let tokens = await exchangeCodeForTokens(config, code)

        // Fetch user info
        let userInfo = await getUserInfo(config, tokens.access_token)

        // Store tokens and user info in session
        session.regenerateId(true)
        session.set('access_token', tokens.access_token)
        session.set('id_token', tokens.id_token)
        session.set('token_expires_at', Date.now() + tokens.expires_in * 1000)
        session.set('user', {
          sub: userInfo.sub,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
        })

        return redirect(routes.files.index.href())
      } catch (error) {
        console.error('Token exchange error:', error)

        return render(
          <Document>
            <div class="container">
              <div class="card">
                <h2>Token Exchange Failed</h2>
                <div class="alert alert-error">
                  {error instanceof Error ? error.message : 'Failed to exchange authorization code'}
                </div>
                <p style="margin-top: 1rem;">
                  <a href={routes.auth.login.href()} class="btn">
                    Try Again
                  </a>
                </p>
              </div>
            </div>
          </Document>,
          { status: 500 },
        )
      }
    },

    // Logout
    logout({ session }) {
      session.destroy()
      return redirect(routes.home.href())
    },
  },
} satisfies Controller<typeof routes.auth>
