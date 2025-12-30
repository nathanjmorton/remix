# SSO S3 Demo

This demo shows how to use Auth0 as an external identity provider with AWS IAM Identity Center and S3 Access Grants for fine-grained, identity-aware S3 access.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐     ┌───────────────┐     ┌─────┐
│ This App    │────▶│ Auth0       │────▶│ IAM Identity     │────▶│ S3 Access     │────▶│ S3  │
│             │     │ (OIDC)      │     │ Center           │     │ Grants        │     │     │
│             │     │             │     │ (CreateToken     │     │ (GetDataAccess│     │     │
│             │     │             │     │  WithIAM)        │     │  )            │     │     │
└─────────────┘     └─────────────┘     └──────────────────┘     └───────────────┘     └─────┘
```

**Flow:**
1. User authenticates with Auth0
2. Auth0 JWT is exchanged for an Identity Center token via `CreateTokenWithIAM`
3. Identity Bearer role is assumed with the identity context via `AssumeRole` with `ProvidedContexts`
4. S3 Access Grants returns scoped credentials via `GetDataAccess`
5. Scoped credentials are used to access S3

## Prerequisites

1. **Auth0 Account** - Sign up at https://auth0.com
2. **AWS Account** with:
   - AWS CLI configured
   - IAM Identity Center enabled (in the same region as your S3 bucket)
3. **Node.js** 20+
4. **An S3 bucket** for testing

## Setup

### 1. Auth0 Configuration

1. Create a new **Regular Web Application** in Auth0
2. Note your **Domain** and **Client ID** from the application settings
3. Copy the **Client Secret** from the application settings
4. Configure allowed callback URLs: `http://localhost:44100/auth/callback`
5. Configure allowed logout URLs: `http://localhost:44100`

### 2. AWS IAM Identity Center Setup

These steps configure Identity Center to accept Auth0 tokens via Trusted Identity Propagation.

```bash
# Set variables (replace with your values)
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AUTH0_DOMAIN=your-tenant.us.auth0.com
export AUTH0_CLIENT_ID=your-auth0-client-id
export S3_BUCKET=your-bucket-name
export S3_PREFIX=sso-demo
```

#### Step 1: Get Identity Center Instance ARN

```bash
# Get the Identity Center instance ARN
aws sso-admin list-instances --query 'Instances[0].InstanceArn' --output text
```

Save this as `$IDC_INSTANCE_ARN`.

#### Step 2: Create a Trusted Token Issuer for Auth0

```bash
# Create the trusted token issuer
aws sso-admin create-trusted-token-issuer \
  --instance-arn "$IDC_INSTANCE_ARN" \
  --name "Auth0" \
  --trusted-token-issuer-type "OIDC_JWT" \
  --trusted-token-issuer-configuration '{
    "OidcJwtConfiguration": {
      "IssuerUrl": "https://'"$AUTH0_DOMAIN"'/",
      "ClaimAttributePath": "sub",
      "IdentityStoreAttributePath": "externalIds.SCIM",
      "JwksRetrievalOption": "OPEN_ID_DISCOVERY"
    }
  }'
```

Note the `TrustedTokenIssuerArn` in the response.

#### Step 3: Create an Identity Center Application

```bash
# Create application for trusted identity propagation
aws sso-admin create-application \
  --instance-arn "$IDC_INSTANCE_ARN" \
  --name "S3 Access Grants Demo" \
  --application-provider-arn "arn:aws:sso::aws:applicationProvider/custom" \
  --portal-options '{"Visibility": "DISABLED"}'
```

Note the `ApplicationArn` in the response and save as `$IDC_APPLICATION_ARN`.

#### Step 4: Configure Application Authentication

```bash
# Add the trusted token issuer to the application
aws sso-admin put-application-authentication-method \
  --application-arn "$IDC_APPLICATION_ARN" \
  --authentication-method-type "IAM" \
  --authentication-method '{
    "Iam": {
      "ActorPolicy": {
        "Version": "2012-10-17",
        "Statement": [{
          "Effect": "Allow",
          "Principal": {"AWS": "*"},
          "Action": "sts:AssumeRole",
          "Condition": {
            "StringEquals": {
              "aws:PrincipalTag/IdentityBearerRole": "true"
            }
          }
        }]
      }
    }
  }'

# Configure the grant (allows JWT bearer token exchange)
aws sso-admin put-application-grant \
  --application-arn "$IDC_APPLICATION_ARN" \
  --grant-type "urn:ietf:params:oauth:grant-type:jwt-bearer" \
  --grant '{
    "JwtBearer": {
      "AuthorizedTokenIssuers": [{
        "TrustedTokenIssuerArn": "'"$TRUSTED_TOKEN_ISSUER_ARN"'",
        "AuthorizedAudiences": ["'"$AUTH0_CLIENT_ID"'"]
      }]
    }
  }'

# Configure access token settings
aws sso-admin put-application-access-scope \
  --application-arn "$IDC_APPLICATION_ARN" \
  --scope "s3:access_grants:read_write"
```

#### Step 5: Create a User in Identity Center

```bash
# Get the Identity Store ID
IDENTITY_STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)

# Create a user (use the same email as your Auth0 user)
aws identitystore create-user \
  --identity-store-id "$IDENTITY_STORE_ID" \
  --user-name "your-email@example.com" \
  --display-name "Your Name" \
  --emails '[{"Value": "your-email@example.com", "Primary": true}]' \
  --external-ids '[{"Issuer": "'"$AUTH0_DOMAIN"'", "Id": "auth0|YOUR_AUTH0_USER_ID"}]'
```

> **Important**: The `external-ids` `Id` value must match the `sub` claim in your Auth0 tokens exactly (e.g., `auth0|abc123def456`).

### 3. S3 Access Grants Setup

#### Step 1: Create the S3 Access Grants Instance

```bash
# Create the S3 Access Grants instance with Identity Center
aws s3control create-access-grants-instance \
  --account-id "$AWS_ACCOUNT_ID" \
  --identity-center-arn "$IDC_INSTANCE_ARN"
```

#### Step 2: Create the S3 Access Grants Location Role

This role is assumed by S3 Access Grants to vend credentials:

```bash
# Create trust policy
cat > /tmp/location-role-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "access-grants.s3.amazonaws.com"},
    "Action": ["sts:AssumeRole", "sts:SetSourceIdentity"],
    "Condition": {
      "StringEquals": {
        "aws:SourceAccount": "'"$AWS_ACCOUNT_ID"'"
      }
    }
  }]
}
EOF

# Create the role
aws iam create-role \
  --role-name S3AccessGrantsLocationRole \
  --assume-role-policy-document file:///tmp/location-role-trust.json

# Attach S3 permissions
aws iam put-role-policy \
  --role-name S3AccessGrantsLocationRole \
  --policy-name S3AccessPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::'"$S3_BUCKET"'",
        "arn:aws:s3:::'"$S3_BUCKET"'/*"
      ]
    }]
  }'
```

#### Step 3: Register the S3 Location

```bash
# Register the S3 location with Access Grants
aws s3control create-access-grants-location \
  --account-id "$AWS_ACCOUNT_ID" \
  --location-scope "s3://$S3_BUCKET/$S3_PREFIX/*" \
  --iam-role-arn "arn:aws:iam::$AWS_ACCOUNT_ID:role/S3AccessGrantsLocationRole"
```

Note the `AccessGrantsLocationId` in the response.

#### Step 4: Create the Access Grant

```bash
# Get the Identity Center user ID
USER_ID=$(aws identitystore list-users \
  --identity-store-id "$IDENTITY_STORE_ID" \
  --filters '[{"AttributePath": "UserName", "AttributeValue": "your-email@example.com"}]' \
  --query 'Users[0].UserId' --output text)

# Create the grant
aws s3control create-access-grant \
  --account-id "$AWS_ACCOUNT_ID" \
  --access-grants-location-id "$ACCESS_GRANTS_LOCATION_ID" \
  --grantee '{"GranteeType": "DIRECTORY_USER", "GranteeIdentifier": "'"$USER_ID"'"}' \
  --permission "READWRITE" \
  --grant-scope "s3://$S3_BUCKET/$S3_PREFIX/*"
```

### 4. Identity Bearer Role Setup

This role is assumed by your application to call `GetDataAccess`:

```bash
# Create trust policy (allows Identity Center to assume this role)
cat > /tmp/bearer-role-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "sso.amazonaws.com"},
    "Action": ["sts:AssumeRole", "sts:SetContext"],
    "Condition": {
      "StringEquals": {
        "aws:SourceAccount": "'"$AWS_ACCOUNT_ID"'"
      },
      "ArnEquals": {
        "aws:SourceArn": "'"$IDC_APPLICATION_ARN"'"
      }
    }
  }]
}
EOF

# Create the role
aws iam create-role \
  --role-name S3AccessGrantsIdentityBearerRole \
  --assume-role-policy-document file:///tmp/bearer-role-trust.json

# Tag the role for Identity Center authentication
aws iam tag-role \
  --role-name S3AccessGrantsIdentityBearerRole \
  --tags Key=IdentityBearerRole,Value=true

# Attach permissions (GetDataAccess + ListBucket for file listing)
aws iam put-role-policy \
  --role-name S3AccessGrantsIdentityBearerRole \
  --policy-name S3AccessGrantsPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "S3AccessGrantsAccess",
        "Effect": "Allow",
        "Action": "s3:GetDataAccess",
        "Resource": "arn:aws:s3:'"$AWS_REGION"':'"$AWS_ACCOUNT_ID"':access-grants/default"
      },
      {
        "Sid": "S3ListBucketWithPrefix",
        "Effect": "Allow",
        "Action": "s3:ListBucket",
        "Resource": "arn:aws:s3:::'"$S3_BUCKET"'",
        "Condition": {
          "StringLike": {
            "s3:prefix": "'"$S3_PREFIX"'*"
          }
        }
      },
      {
        "Sid": "S3GetObjectForMetadata",
        "Effect": "Allow",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::'"$S3_BUCKET"'/'"$S3_PREFIX"'/*"
      }
    ]
  }'
```

> **Note**: The `ListBucket` and `GetObject` permissions on the Identity Bearer role are required because S3 Access Grants only provides object-level permissions (`GetObject`, `PutObject`, `DeleteObject`), not `ListBucket`. The demo uses the Identity Bearer credentials for listing files.

### 5. Environment Variables

Create a `.env` file or export these variables:

```bash
export AUTH0_DOMAIN=your-tenant.us.auth0.com
export AUTH0_CLIENT_ID=your-auth0-client-id
export AUTH0_CLIENT_SECRET=your-auth0-client-secret
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=123456789012
export IDC_APPLICATION_ARN=arn:aws:sso::123456789012:application/ssoins-xxx/apl-xxx
export IDENTITY_BEARER_ROLE_ARN=arn:aws:iam::123456789012:role/S3AccessGrantsIdentityBearerRole
export S3_PREFIX=s3://your-bucket/sso-demo/*
```

### 6. Run the Demo

```bash
# Install dependencies (from repo root)
pnpm install

# Start the server
pnpm dev
```

Open http://localhost:44100 in your browser.

## How It Works

1. **User clicks "Login with Auth0"**
   - App redirects to Auth0's authorization endpoint
   - User authenticates (username/password, social login, etc.)
   - Auth0 returns an ID token (JWT)

2. **JWT Exchange for Identity Center Token**
   - App calls `sso-oidc:CreateTokenWithIAM` with the Auth0 JWT
   - Identity Center validates the JWT against the trusted token issuer
   - Identity Center maps the `sub` claim to an Identity Center user via `externalIds`
   - Returns an Identity Center token with `sts:identity_context` claim

3. **Assume Identity Bearer Role**
   - App calls `sts:AssumeRole` on the Identity Bearer role
   - Passes the identity context via `ProvidedContexts`
   - Returns credentials with the user's identity attached

4. **Get S3 Credentials from Access Grants**
   - App calls `s3:GetDataAccess` with the Identity Bearer credentials
   - S3 Access Grants evaluates the user's grants
   - Returns scoped credentials for the granted S3 prefix

5. **S3 Access**
   - Scoped credentials are used for object operations (get/put/delete)
   - Identity Bearer credentials are used for listing (has `s3:ListBucket`)

## Troubleshooting

### "JWT is already redeemed" error

Each Auth0 JWT can only be exchanged once with Identity Center. The app caches credentials to avoid this. Log out and log back in to get a fresh token.

### "User not found" or mapping errors

The Identity Center user's `externalIds` must match the Auth0 token's `sub` claim exactly.

```bash
# Check the sub claim in your Auth0 token (shown on the files page)
# Then verify/update the Identity Center user's external ID:
aws identitystore list-users --identity-store-id "$IDENTITY_STORE_ID"
```

### "Access Denied" on ListBucket

S3 Access Grants doesn't include `s3:ListBucket` permission. Ensure the Identity Bearer role has:
- `s3:ListBucket` with `s3:prefix` condition
- `s3:GetObject` for HEAD requests during metadata fetch

### "InvalidGrantException" errors

Check that:
1. The trusted token issuer is configured correctly
2. The application grant includes your Auth0 client ID as an authorized audience
3. The Identity Center user exists and has the correct external ID

## Files

- `server.ts` - HTTP server entry point (port 44100)
- `app/router.ts` - Route configuration with middleware
- `app/auth.tsx` - OAuth login/callback/logout handlers
- `app/files.tsx` - S3 file operations (list, upload, download)
- `app/utils/auth0.ts` - Auth0 OAuth utilities
- `app/utils/identity-center.ts` - Identity Center + Access Grants implementation

## References

- [Trusted Identity Propagation](https://docs.aws.amazon.com/singlesignon/latest/userguide/trustedidentitypropagation.html)
- [S3 Access Grants](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-grants.html)
- [CreateTokenWithIAM](https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/API_CreateTokenWithIAM.html)
- [Auth0 Authorization Code Flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow)
