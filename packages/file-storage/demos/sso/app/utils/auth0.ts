/**
 * Auth0 OAuth utilities for the SSO demo.
 *
 * Required environment variables:
 * - AUTH0_DOMAIN: Your Auth0 tenant domain (e.g., your-tenant.auth0.com)
 * - AUTH0_CLIENT_ID: Your Auth0 application client ID
 * - AUTH0_CLIENT_SECRET: Your Auth0 application client secret
 * - AUTH0_AUDIENCE: The API audience for S3 access (configured in Auth0)
 */

export interface Auth0Config {
  domain: string
  clientId: string
  clientSecret: string
  audience: string
  redirectUri: string
}

export interface TokenResponse {
  access_token: string
  id_token?: string
  token_type: string
  expires_in: number
  scope?: string
}

export interface UserInfo {
  sub: string
  email?: string
  name?: string
  picture?: string
}

export function getAuth0Config(): Auth0Config {
  let domain = process.env.AUTH0_DOMAIN || 'dev-hcrd1yoa.us.auth0.com'
  let clientId = process.env.AUTH0_CLIENT_ID || 'wmQwzIJm7PsbgO1FohJ66inuJCP258Cj'
  let clientSecret =
    process.env.AUTH0_CLIENT_SECRET ||
    '_l-w953nYE8tq-PuzHJ-QIBdkR1Uf3XVpSIUIl45ms5DSuc64LnsyHvDxhG2FMPN'
  let audience = process.env.AUTH0_AUDIENCE || `https://${domain}/api/v2/`

  if (!clientSecret) {
    throw new Error(
      'Missing AUTH0_CLIENT_SECRET environment variable. ' +
        'Get it from Auth0 Dashboard → Applications → Your App → Settings → Client Secret',
    )
  }

  return {
    domain,
    clientId,
    clientSecret,
    audience,
    redirectUri: `http://localhost:44100/auth/callback`,
  }
}

/**
 * Generate a random state parameter for CSRF protection.
 */
export function generateState(): string {
  let array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Build the Auth0 authorization URL.
 */
export function getAuthorizationUrl(config: Auth0Config, state: string): string {
  let params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'openid profile email',
    audience: config.audience,
    state,
  })

  return `https://${config.domain}/authorize?${params}`
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(
  config: Auth0Config,
  code: string,
): Promise<TokenResponse> {
  let response = await fetch(`https://${config.domain}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  })

  if (!response.ok) {
    let error = await response.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  return response.json()
}

/**
 * Fetch user info from Auth0.
 */
export async function getUserInfo(config: Auth0Config, accessToken: string): Promise<UserInfo> {
  let response = await fetch(`https://${config.domain}/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    let error = await response.text()
    throw new Error(`Failed to fetch user info: ${error}`)
  }

  return response.json()
}
