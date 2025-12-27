# SSO S3 Demo

This demo shows how to use Auth0 as an OAuth 2.0 identity provider to access S3 via AWS STS `AssumeRoleWithWebIdentity`.

## Architecture

```
┌─────────────────┐     ┌─────────────┐     ┌──────────────────┐     ┌─────┐
│ This App        │────▶│ Auth0       │────▶│ AWS STS          │────▶│ S3  │
│ (requesting app)│     │ (OIDC       │     │ (AssumeRole      │     │     │
│                 │     │  provider)  │     │  WithWebIdentity)│     │     │
└─────────────────┘     └─────────────┘     └──────────────────┘     └─────┘
```

## Prerequisites

1. **Auth0 Account** - Sign up at https://auth0.com
2. **AWS Account** with AWS CLI configured
3. **Node.js** 20+
4. **An S3 bucket** for testing

## Setup

### 1. Auth0 Configuration

1. Create a new **Regular Web Application** in Auth0
2. Note your **Domain** and **Client ID** from the application settings
3. Copy the **Client Secret** from the application settings
4. Configure allowed callback URLs: `http://localhost:44100/auth/callback`
5. Configure allowed logout URLs: `http://localhost:44100`

### 2. AWS CLI Setup

The following commands set up the AWS resources needed for Auth0 → STS → S3 integration.

#### Step 1: Create an IAM OIDC Identity Provider for Auth0

```bash
# Replace YOUR_AUTH0_DOMAIN with your Auth0 tenant domain (e.g., dev-abc123.us.auth0.com)
aws iam create-open-id-connect-provider \
  --url "https://YOUR_AUTH0_DOMAIN/" \
  --client-id-list "placeholder" \
  --thumbprint-list "0000000000000000000000000000000000000000"
```

> Note: The thumbprint is ignored for most OIDC providers - AWS fetches the certificate automatically.

#### Step 2: Add your Auth0 Client ID to the OIDC Provider

The `aud` claim in Auth0 tokens can vary. Add all possible audience values:

```bash
# Get your AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Add the Auth0 Management API audience
aws iam add-client-id-to-open-id-connect-provider \
  --open-id-connect-provider-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/YOUR_AUTH0_DOMAIN/" \
  --client-id "https://YOUR_AUTH0_DOMAIN/api/v2/"

# Add the userinfo audience
aws iam add-client-id-to-open-id-connect-provider \
  --open-id-connect-provider-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/YOUR_AUTH0_DOMAIN/" \
  --client-id "https://YOUR_AUTH0_DOMAIN/userinfo"

# Add your Auth0 application's Client ID (the azp claim)
aws iam add-client-id-to-open-id-connect-provider \
  --open-id-connect-provider-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/YOUR_AUTH0_DOMAIN/" \
  --client-id "YOUR_AUTH0_CLIENT_ID"
```

#### Step 3: Create an IAM Role with Trust Policy

Create a trust policy that allows Auth0 users to assume the role:

```bash
# Get your AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Create the trust policy file
cat > /tmp/auth0-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/YOUR_AUTH0_DOMAIN/"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "YOUR_AUTH0_DOMAIN/:aud": "YOUR_AUTH0_CLIENT_ID"
        }
      }
    }
  ]
}
EOF

# Create the role
aws iam create-role \
  --role-name Auth0-S3-Access \
  --assume-role-policy-document file:///tmp/auth0-trust-policy.json \
  --description "Role for Auth0 authenticated users to access S3"
```

> **Important**: The condition key format is `YOUR_AUTH0_DOMAIN/:aud` (with the trailing slash from the OIDC provider URL, then `:aud`). The value should be your Auth0 **Client ID** (the `azp` claim in the token), not a URL.

#### Step 4: Attach S3 Permissions to the Role

```bash
# Option A: Full S3 access (for testing only)
aws iam attach-role-policy \
  --role-name Auth0-S3-Access \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# Option B: Create a custom policy for specific bucket access (recommended for production)
cat > /tmp/s3-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR_BUCKET_NAME",
        "arn:aws:s3:::YOUR_BUCKET_NAME/*"
      ]
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name Auth0-S3-Access \
  --policy-name S3BucketAccess \
  --policy-document file:///tmp/s3-policy.json
```

#### Step 5: Verify the Setup

```bash
# List OIDC providers
aws iam list-open-id-connect-providers

# Check the OIDC provider configuration
aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/YOUR_AUTH0_DOMAIN/"

# Check the role's trust policy
aws iam get-role --role-name Auth0-S3-Access --query "Role.AssumeRolePolicyDocument"
```

### 3. Environment Variables

Create a `.env` file or export these variables:

```bash
export AUTH0_DOMAIN=your-tenant.auth0.com
export AUTH0_CLIENT_ID=your-client-id
export AUTH0_CLIENT_SECRET=your-client-secret
export AWS_ROLE_ARN=arn:aws:iam::YOUR_ACCOUNT_ID:role/Auth0-S3-Access
export AWS_REGION=us-east-1
```

### 4. Run the Demo

```bash
# Install dependencies (from repo root)
pnpm install

# Start the server
AUTH0_CLIENT_SECRET=your-secret pnpm dev
```

Open http://localhost:44100 in your browser.

## How It Works

1. **User clicks "Login with Auth0"**
   - App redirects to Auth0's authorization endpoint
   - User authenticates (username/password, social login, etc.)

2. **Auth0 issues a JWT access token**
   - Authorization code is exchanged for tokens
   - Access token contains `iss`, `sub`, `aud`, and `azp` claims

3. **App exchanges JWT for AWS credentials**
   - App calls STS `AssumeRoleWithWebIdentity` with the Auth0 JWT
   - AWS validates the JWT against the OIDC provider
   - AWS returns temporary credentials (access key, secret key, session token)

4. **S3 Access**
   - Temporary credentials are used to create an S3 client
   - Files can be listed, uploaded, and downloaded

## Troubleshooting

### "Incorrect token audience" error

This means the `aud` claim in your Auth0 token isn't in the OIDC provider's client ID list.

1. Decode your Auth0 token (the app shows this on the files page)
2. Check the `aud` array values
3. Add each value to the OIDC provider:
   ```bash
   aws iam add-client-id-to-open-id-connect-provider \
     --open-id-connect-provider-arn "arn:aws:iam::ACCOUNT:oidc-provider/DOMAIN/" \
     --client-id "THE_AUD_VALUE"
   ```

### "Not authorized to perform sts:AssumeRoleWithWebIdentity" error

This means the trust policy condition doesn't match your token.

1. Decode your Auth0 token and find the `azp` (authorized party) claim
2. Update the trust policy to use that value:
   ```bash
   # The condition should use azp value, not aud URL
   "YOUR_AUTH0_DOMAIN/:aud": "YOUR_AUTH0_CLIENT_ID_FROM_AZP"
   ```

### Token expired errors

Auth0 access tokens expire. Log out and log back in to get a fresh token.

## Files

- `server.ts` - HTTP server entry point (port 44100)
- `app/router.ts` - Route configuration with middleware
- `app/auth.tsx` - OAuth login/callback/logout handlers
- `app/files.tsx` - S3 file operations (list, upload, download)
- `app/utils/auth0.ts` - Auth0 OAuth utilities
- `app/utils/identity-center.ts` - STS AssumeRoleWithWebIdentity implementation

## References

- [Creating an OIDC Identity Provider](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
- [AssumeRoleWithWebIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html)
- [Auth0 Authorization Code Flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow)
