/**
 * AWS STS utilities for assuming roles with web identity tokens.
 *
 * This module uses STS AssumeRoleWithWebIdentity to exchange an Auth0 JWT
 * for temporary AWS credentials that can be used to access S3.
 */

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: Date
}

export interface AssumeRoleConfig {
  roleArn: string
  region: string
}

export function getAssumeRoleConfig(): AssumeRoleConfig {
  return {
    roleArn: process.env.AWS_ROLE_ARN || 'arn:aws:iam::073343495859:role/Auth0-S3-Access',
    region: process.env.AWS_REGION || 'us-east-1',
  }
}

/**
 * Exchange an Auth0 access token for temporary AWS credentials.
 *
 * Uses STS AssumeRoleWithWebIdentity to assume the configured IAM role
 * using the Auth0 JWT as proof of identity.
 */
export async function assumeRoleWithWebIdentity(
  config: AssumeRoleConfig,
  auth0Token: string,
  sessionName?: string,
): Promise<AwsCredentials> {
  let stsEndpoint = `https://sts.${config.region}.amazonaws.com`

  let params = new URLSearchParams({
    Action: 'AssumeRoleWithWebIdentity',
    Version: '2011-06-15',
    RoleArn: config.roleArn,
    RoleSessionName: sessionName || `auth0-session-${Date.now()}`,
    WebIdentityToken: auth0Token,
    DurationSeconds: '3600', // 1 hour
  })

  let response = await fetch(stsEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  let text = await response.text()

  if (!response.ok) {
    // Parse error from XML response
    let errorMatch = text.match(/<Message>([^<]+)<\/Message>/)
    let errorMessage = errorMatch ? errorMatch[1] : text
    throw new Error(`AssumeRoleWithWebIdentity failed: ${errorMessage}`)
  }

  // Parse credentials from XML response
  let accessKeyId = extractXmlValue(text, 'AccessKeyId')
  let secretAccessKey = extractXmlValue(text, 'SecretAccessKey')
  let sessionToken = extractXmlValue(text, 'SessionToken')
  let expiration = extractXmlValue(text, 'Expiration')

  if (!accessKeyId || !secretAccessKey || !sessionToken) {
    throw new Error('Failed to parse credentials from STS response')
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken,
    expiration: new Date(expiration),
  }
}

function extractXmlValue(xml: string, tag: string): string {
  let match = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))
  return match ? match[1] : ''
}
