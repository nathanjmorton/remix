/**
 * AWS S3 Access Grants utilities using IAM Identity Center Trusted Identity Propagation.
 *
 * This module implements the flow:
 * 1. Exchange Auth0 JWT for Identity Center token (CreateTokenWithIAM)
 * 2. Assume role with identity context (AssumeRole with ProvidedContexts)
 * 3. Get S3 credentials from Access Grants (GetDataAccess)
 */

import {
  SSOOIDCClient,
  CreateTokenWithIAMCommand,
  type CreateTokenWithIAMCommandOutput,
} from '@aws-sdk/client-sso-oidc'
import { STSClient, AssumeRoleCommand, type Credentials } from '@aws-sdk/client-sts'
import { S3ControlClient, GetDataAccessCommand } from '@aws-sdk/client-s3-control'

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: Date
}

export interface S3AccessGrantsConfig {
  region: string
  identityCenterApplicationArn: string
  identityBearerRoleArn: string
  accountId: string
  s3Prefix: string
}

export function getS3AccessGrantsConfig(): S3AccessGrantsConfig {
  return {
    region: process.env.AWS_REGION || 'us-east-1',
    identityCenterApplicationArn:
      process.env.IDC_APPLICATION_ARN ||
      'arn:aws:sso::073343495859:application/ssoins-72235fb3eb13c6e1/apl-72233601699985f9',
    identityBearerRoleArn:
      process.env.IDENTITY_BEARER_ROLE_ARN ||
      'arn:aws:iam::073343495859:role/S3AccessGrantsIdentityBearerRole',
    accountId: process.env.AWS_ACCOUNT_ID || '073343495859',
    s3Prefix: process.env.S3_PREFIX || 's3://nathanjmorton-s3-test-bucket/sso-demo/*',
  }
}

/**
 * Step 1: Exchange Auth0 JWT for IAM Identity Center token.
 *
 * This calls the sso-oidc:CreateTokenWithIAM API with the JWT Bearer grant type
 * to exchange the Auth0 token for an Identity Center token.
 */
export async function exchangeTokenWithIdentityCenter(
  config: S3AccessGrantsConfig,
  auth0Token: string,
): Promise<CreateTokenWithIAMCommandOutput> {
  // Log the JWT payload for debugging
  let jwtPayload = decodeJwtPayload(auth0Token)
  console.log('Auth0 JWT payload:', JSON.stringify(jwtPayload, null, 2))

  let client = new SSOOIDCClient({ region: config.region })

  let command = new CreateTokenWithIAMCommand({
    clientId: config.identityCenterApplicationArn,
    grantType: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: auth0Token,
  })

  try {
    return await client.send(command)
  } catch (error) {
    console.error('CreateTokenWithIAM error:', error)
    if (error instanceof Error) {
      throw new Error(`CreateTokenWithIAM failed: ${error.name} - ${error.message}`)
    }
    throw error
  }
}

/**
 * Decode a JWT payload without verification.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  let parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')
  let payload = Buffer.from(parts[1], 'base64url').toString('utf-8')
  return JSON.parse(payload)
}

/**
 * Step 2: Assume the Identity Bearer role with the identity context.
 *
 * This calls sts:AssumeRole with the ProvidedContexts parameter to
 * attach the user's identity from Identity Center to the role session.
 */
export async function assumeRoleWithIdentityContext(
  config: S3AccessGrantsConfig,
  identityCenterToken: string,
): Promise<Credentials> {
  // Decode the Identity Center token to get the identity context
  let tokenPayload = decodeJwtPayload(identityCenterToken)
  let identityContext = tokenPayload['sts:identity_context'] as string

  if (!identityContext) {
    throw new Error('Identity Center token missing sts:identity_context claim')
  }

  let client = new STSClient({ region: config.region })

  let command = new AssumeRoleCommand({
    RoleArn: config.identityBearerRoleArn,
    RoleSessionName: `s3-access-grants-${Date.now()}`,
    ProvidedContexts: [
      {
        ProviderArn: 'arn:aws:iam::aws:contextProvider/IdentityCenter',
        ContextAssertion: identityContext,
      },
    ],
  })

  let response = await client.send(command)

  if (!response.Credentials) {
    throw new Error('AssumeRole did not return credentials')
  }

  return response.Credentials
}

/**
 * Step 3: Get S3 credentials from Access Grants.
 *
 * This calls s3:GetDataAccess with the identity-enhanced credentials
 * to get temporary S3 credentials scoped to the user's grants.
 */
export async function getS3DataAccess(
  config: S3AccessGrantsConfig,
  identityBearerCredentials: Credentials,
  permission: 'READ' | 'WRITE' | 'READWRITE' = 'READWRITE',
): Promise<AwsCredentials> {
  let client = new S3ControlClient({
    region: config.region,
    credentials: {
      accessKeyId: identityBearerCredentials.AccessKeyId!,
      secretAccessKey: identityBearerCredentials.SecretAccessKey!,
      sessionToken: identityBearerCredentials.SessionToken,
      expiration: identityBearerCredentials.Expiration,
    },
  })

  let command = new GetDataAccessCommand({
    AccountId: config.accountId,
    Target: config.s3Prefix,
    Permission: permission,
  })

  let response = await client.send(command)

  if (!response.Credentials) {
    throw new Error('GetDataAccess did not return credentials')
  }

  return {
    accessKeyId: response.Credentials.AccessKeyId!,
    secretAccessKey: response.Credentials.SecretAccessKey!,
    sessionToken: response.Credentials.SessionToken!,
    expiration: new Date(response.Credentials.Expiration!),
  }
}

/**
 * Complete flow: Exchange Auth0 token for S3 credentials via Access Grants.
 *
 * This orchestrates the full flow:
 * 1. Exchange Auth0 JWT for Identity Center token
 * 2. Assume Identity Bearer role with identity context
 * 3. Get S3 credentials from Access Grants
 *
 * Returns both:
 * - credentials: Access Grants credentials for object operations (get/put/delete)
 * - listCredentials: Identity Bearer credentials for listing (has s3:ListBucket)
 */
export async function getS3CredentialsViaAccessGrants(
  config: S3AccessGrantsConfig,
  auth0Token: string,
): Promise<{
  credentials: AwsCredentials
  listCredentials: AwsCredentials
  matchedGrantTarget: string | undefined
}> {
  // Step 1: Exchange Auth0 token for Identity Center token
  let tokenResponse = await exchangeTokenWithIdentityCenter(config, auth0Token)

  if (!tokenResponse.idToken) {
    throw new Error('CreateTokenWithIAM did not return an idToken')
  }

  // Step 2: Assume role with identity context
  let identityBearerCreds = await assumeRoleWithIdentityContext(config, tokenResponse.idToken)

  // Convert identity bearer creds to AwsCredentials format (for listing)
  let listCredentials: AwsCredentials = {
    accessKeyId: identityBearerCreds.AccessKeyId!,
    secretAccessKey: identityBearerCreds.SecretAccessKey!,
    sessionToken: identityBearerCreds.SessionToken!,
    expiration: new Date(identityBearerCreds.Expiration!),
  }

  // Step 3: Get S3 credentials from Access Grants
  let client = new S3ControlClient({
    region: config.region,
    credentials: {
      accessKeyId: identityBearerCreds.AccessKeyId!,
      secretAccessKey: identityBearerCreds.SecretAccessKey!,
      sessionToken: identityBearerCreds.SessionToken,
      expiration: identityBearerCreds.Expiration,
    },
  })

  let command = new GetDataAccessCommand({
    AccountId: config.accountId,
    Target: config.s3Prefix,
    Permission: 'READWRITE',
  })

  let response = await client.send(command)

  if (!response.Credentials) {
    throw new Error('GetDataAccess did not return credentials')
  }

  return {
    credentials: {
      accessKeyId: response.Credentials.AccessKeyId!,
      secretAccessKey: response.Credentials.SecretAccessKey!,
      sessionToken: response.Credentials.SessionToken!,
      expiration: new Date(response.Credentials.Expiration!),
    },
    listCredentials,
    matchedGrantTarget: response.MatchedGrantTarget,
  }
}

// Legacy exports for backward compatibility
export { getS3AccessGrantsConfig as getAssumeRoleConfig }
export { getS3CredentialsViaAccessGrants as assumeRoleWithWebIdentity }
