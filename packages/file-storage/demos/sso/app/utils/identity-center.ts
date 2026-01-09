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
  InvalidGrantException,
} from '@aws-sdk/client-sso-oidc'
import { STSClient, AssumeRoleCommand, type Credentials } from '@aws-sdk/client-sts'
import { S3ControlClient, GetDataAccessCommand } from '@aws-sdk/client-s3-control'
import {
  IdentitystoreClient,
  CreateUserCommand,
  CreateGroupMembershipCommand,
} from '@aws-sdk/client-identitystore'

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
  // JIT provisioning config
  identityStoreId: string
  appUsersGroupId: string
  idpDomain: string
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
    // JIT provisioning config
    identityStoreId: process.env.IDENTITY_STORE_ID || 'd-90661935bd',
    appUsersGroupId: process.env.APP_USERS_GROUP_ID || '74084498-6031-70d7-9634-db98e2b0285a',
    idpDomain: process.env.AUTH0_DOMAIN || 'dev-hcrd1yoa.us.auth0.com',
  }
}

/**
 * Step 1: Exchange IdP JWT for IAM Identity Center token.
 *
 * This calls the sso-oidc:CreateTokenWithIAM API with the JWT Bearer grant type
 * to exchange the IdP token for an Identity Center token.
 *
 * If the user doesn't exist in Identity Center, JIT provisioning will create them.
 */
export async function exchangeTokenWithIdentityCenter(
  config: S3AccessGrantsConfig,
  idpToken: string,
): Promise<CreateTokenWithIAMCommandOutput> {
  let jwtPayload = decodeJwtPayload(idpToken)
  console.log('IdP JWT payload:', JSON.stringify(jwtPayload, null, 2))

  let client = new SSOOIDCClient({ region: config.region })

  let command = new CreateTokenWithIAMCommand({
    clientId: config.identityCenterApplicationArn,
    grantType: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: idpToken,
  })

  try {
    return await client.send(command)
  } catch (error) {
    // If user doesn't exist in Identity Center, try JIT provisioning
    if (error instanceof InvalidGrantException) {
      console.log('User not found in Identity Center, attempting JIT provisioning...')
      await jitProvisionUser(config, jwtPayload)

      // Retry the token exchange after provisioning
      console.log('User provisioned. Retrying token exchange...')
      try {
        return await client.send(command)
      } catch (retryError) {
        console.error('Token exchange failed after JIT provisioning:', retryError)
        throw new Error(
          'User was provisioned in Identity Center but token exchange still failed. ' +
            'This may be due to propagation delay - please try logging in again.',
        )
      }
    }

    console.error('CreateTokenWithIAM error:', error)
    if (error instanceof Error) {
      throw new Error(`CreateTokenWithIAM failed: ${error.name} - ${error.message}`)
    }
    throw error
  }
}

/**
 * JIT (Just-In-Time) provision a new user in Identity Center.
 *
 * Creates the user with externalIds linking to their IdP identity,
 * then adds them to the App Users group for S3 access.
 *
 * Uses the server's own AWS credentials (not user credentials).
 */
async function jitProvisionUser(
  config: S3AccessGrantsConfig,
  idpPayload: Record<string, unknown>,
): Promise<string> {
  // Uses server's default credentials (AWS_ACCESS_KEY_ID/SECRET or instance profile)
  let client = new IdentitystoreClient({ region: config.region })

  let email = idpPayload.email as string
  let displayName = (idpPayload.name as string) || email
  let sub = idpPayload.sub as string // e.g., "auth0|abc123"

  if (!email || !sub) {
    throw new Error('IdP token missing required claims (email, sub) for JIT provisioning')
  }

  // Parse name into given/family name (Identity Store requires these)
  let nameParts = displayName.split(' ')
  let givenName = nameParts[0] || email.split('@')[0]
  let familyName = nameParts.slice(1).join(' ') || 'User'

  console.log(`JIT provisioning user: ${email} (sub: ${sub})`)
  console.log(`  IdentityStoreId: ${config.identityStoreId}`)
  console.log(`  IdP Domain (Issuer): ${config.idpDomain}`)

  // Create the user in Identity Center with external ID linking to the IdP
  let createUserResponse
  try {
    createUserResponse = await client.send(
      new CreateUserCommand({
        IdentityStoreId: config.identityStoreId,
        UserName: email,
        DisplayName: displayName,
        Name: {
          GivenName: givenName,
          FamilyName: familyName,
        },
        Emails: [{ Value: email, Primary: true }],
        ExternalIds: [
          {
            Issuer: config.idpDomain,
            Id: sub,
          },
        ],
      }),
    )
  } catch (createError) {
    console.error('CreateUser failed:', createError)
    throw createError
  }

  let userId = createUserResponse.UserId!
  console.log(`Created Identity Center user: ${userId}`)

  // Add user to the App Users group for S3 Access Grants
  if (config.appUsersGroupId) {
    try {
      await client.send(
        new CreateGroupMembershipCommand({
          IdentityStoreId: config.identityStoreId,
          GroupId: config.appUsersGroupId,
          MemberId: { UserId: userId },
        }),
      )
      console.log(`Added user ${userId} to App Users group ${config.appUsersGroupId}`)
    } catch (groupError) {
      console.error('CreateGroupMembership failed:', groupError)
      throw groupError
    }
  } else {
    console.warn(
      'APP_USERS_GROUP_ID not configured - user created but will not have S3 access until added to a group',
    )
  }

  return userId
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
 * Returns:
 * - credentials: Access Grants credentials for object operations (get/put/delete)
 * - listCredentials: Identity Bearer credentials for listing (has s3:ListBucket)
 * - identityStoreUserId: The user's Identity Store ID (for per-user folder paths)
 * - matchedGrantTarget: The S3 prefix the grant matched
 */
export async function getS3CredentialsViaAccessGrants(
  config: S3AccessGrantsConfig,
  auth0Token: string,
): Promise<{
  credentials: AwsCredentials
  listCredentials: AwsCredentials
  identityStoreUserId: string
  matchedGrantTarget: string | undefined
}> {
  // Step 1: Exchange Auth0 token for Identity Center token
  let tokenResponse = await exchangeTokenWithIdentityCenter(config, auth0Token)

  if (!tokenResponse.idToken) {
    throw new Error('CreateTokenWithIAM did not return an idToken')
  }

  // Extract the Identity Store user ID from the Identity Center token
  let idTokenPayload = decodeJwtPayload(tokenResponse.idToken)
  console.log('Identity Center ID Token payload:', JSON.stringify(idTokenPayload, null, 2))

  // The sub claim format is typically "user/{userId}" - we need just the userId part
  let sub = idTokenPayload.sub as string
  let identityStoreUserId = idTokenPayload['identitystore:UserId'] as string

  if (!identityStoreUserId && sub) {
    // Extract user ID from sub claim (format: "user/{userId}")
    if (sub.startsWith('user/')) {
      identityStoreUserId = sub.slice(5)
    } else {
      identityStoreUserId = sub
    }
  }

  if (!identityStoreUserId) {
    throw new Error(
      'Identity Center token missing identitystore:UserId and sub claims',
    )
  }

  console.log('Identity Store User ID:', identityStoreUserId)

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
  // Request access to the shared prefix - app enforces per-user paths
  let target = config.s3Prefix
  console.log('GetDataAccess Target:', target)

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
    Target: target,
    Permission: 'READWRITE',
  })

  let response
  try {
    response = await client.send(command)
  } catch (getDataAccessError) {
    console.error('GetDataAccess failed:', getDataAccessError)
    throw getDataAccessError
  }

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
    identityStoreUserId,
    matchedGrantTarget: response.MatchedGrantTarget,
  }
}

// Legacy exports for backward compatibility
export { getS3AccessGrantsConfig as getAssumeRoleConfig }
export { getS3CredentialsViaAccessGrants as assumeRoleWithWebIdentity }
