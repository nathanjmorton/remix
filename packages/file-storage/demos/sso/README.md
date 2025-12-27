# SSO S3 Demo

This demo shows how to use Auth0 as a trusted token issuer for AWS IAM Identity Center to access S3 via OAuth 2.0 trusted identity propagation.

## Architecture

```
┌─────────────────┐     ┌─────────────┐     ┌──────────────────┐     ┌─────┐
│ This App        │────▶│ Auth0       │────▶│ IAM Identity     │────▶│ S3  │
│ (requesting app)│     │ (token      │     │ Center           │     │     │
│                 │     │  issuer)    │     │ (token exchange) │     │     │
└─────────────────┘     └─────────────┘     └──────────────────┘     └─────┘
```

## Prerequisites

1. **Auth0 Account** - Sign up at https://auth0.com
2. **AWS Account** with IAM Identity Center enabled
3. **Node.js** 20+

## Setup

### 1. Auth0 Configuration

1. Create a new **Regular Web Application** in Auth0
2. Configure allowed callback URLs: `http://localhost:44100/auth/callback`
3. Configure allowed logout URLs: `http://localhost:44100`
4. Create an **API** in Auth0:
   - Name: `S3 Access` (or similar)
   - Identifier (Audience): `https://s3.amazonaws.com` (or your custom identifier)
   - This identifier will be the `aud` claim in your tokens

### 2. AWS IAM Identity Center Configuration

1. Enable IAM Identity Center in your AWS account
2. Add Auth0 as a **Trusted Token Issuer**:
   - Issuer URL: `https://YOUR_TENANT.auth0.com/`
   - Map the `sub` claim to an Identity Center attribute (e.g., email)
3. Configure user provisioning:
   - Either sync users from Auth0 to Identity Center
   - Or ensure users exist in both systems with matching attributes

### 3. S3 Access Configuration

Option A: **S3 Access Grants** (recommended for fine-grained access)
- Create an S3 Access Grants instance
- Configure grants based on Identity Center user/group identities

Option B: **IAM Policies**
- Create permission sets in Identity Center
- Attach S3 access policies to the permission sets
- Assign users/groups to the permission sets

### 4. Environment Variables

Create a `.env` file or export these variables:

```bash
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=https://s3.amazonaws.com

AWS_REGION=us-east-1
```

### 5. Run the Demo

```bash
# Install dependencies
pnpm install

# Start the server
pnpm dev
```

Open http://localhost:44100 in your browser.

## How It Works

1. **User clicks "Login with Auth0"**
   - App redirects to Auth0's authorization endpoint
   - User authenticates (username/password, social login, etc.)

2. **Auth0 issues tokens**
   - Authorization code is exchanged for access token
   - Access token contains `sub` and `aud` claims

3. **Token Exchange with IAM Identity Center** (TODO)
   - App calls IAM Identity Center's CreateTokenWithIAM API
   - Auth0 token is exchanged for an Identity Center token

4. **S3 Access**
   - Identity Center token is used with S3 Access Grants
   - Or exchanged for temporary AWS credentials via STS

## Files

- `server.ts` - HTTP server entry point
- `app/router.ts` - Route configuration
- `app/auth.tsx` - OAuth login/callback/logout handlers
- `app/files.tsx` - S3 file operations (upload, list, download)
- `app/utils/auth0.ts` - Auth0 OAuth utilities
- `app/utils/identity-center.ts` - IAM Identity Center token exchange (TODO)

## TODO

The token exchange with IAM Identity Center is not yet implemented. To complete the integration:

1. Add `@aws-sdk/client-sso-oidc` dependency
2. Implement `exchangeTokenWithIdentityCenter()` in `identity-center.ts`
3. Use the exchanged token to access S3

## References

- [Setting up a trusted token issuer](https://docs.aws.amazon.com/singlesignon/latest/userguide/setuptrustedtokenissuer.html)
- [CreateTokenWithIAM API](https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/API_CreateTokenWithIAM.html)
- [S3 Access Grants](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-grants.html)
- [Auth0 Authorization Code Flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow)
