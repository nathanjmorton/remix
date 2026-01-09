#!/bin/bash
#
# Dynamic Provisioning: OAuth Users → S3 Access Control
#
# This script sets up S3 Access Grants with dynamic per-user folders.
# When a user authenticates via Auth0 and is provisioned in Identity Center,
# they automatically get access to their own S3 folder via group membership.
#
# Prerequisites:
# - AWS CLI configured with appropriate permissions
# - IAM Identity Center enabled
# - S3 Access Grants instance created with a location
#
# Usage:
#   chmod +x dynamic_provisioning_oauth_users_s3_access_control.sh
#   ./dynamic_provisioning_oauth_users_s3_access_control.sh

set -euo pipefail

echo "=== Dynamic Provisioning Setup for OAuth Users ==="
echo

# Get account and region info
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
AWS_REGION=$(aws configure get region || echo "us-east-1")
echo "AWS Account: $AWS_ACCOUNT_ID"
echo "AWS Region: $AWS_REGION"

# Get Identity Center instance info
IDENTITY_STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)
IDC_INSTANCE_ARN=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' --output text)
echo "Identity Store ID: $IDENTITY_STORE_ID"
echo "Identity Center Instance: $IDC_INSTANCE_ARN"

# Get the Access Grants location ID (assumes one location exists)
LOCATION_ID=$(aws s3control list-access-grants-locations \
  --account-id "$AWS_ACCOUNT_ID" \
  --query 'AccessGrantsLocationsList[0].AccessGrantsLocationId' --output text)
echo "Access Grants Location ID: $LOCATION_ID"

# Get the S3 bucket/prefix from the location scope
# e.g., "s3://nathanjmorton-s3-test-bucket/sso-demo/*"
LOCATION_SCOPE=$(aws s3control get-access-grants-location \
  --account-id "$AWS_ACCOUNT_ID" \
  --access-grants-location-id "$LOCATION_ID" \
  --query 'LocationScope' --output text)
echo "Location Scope: $LOCATION_SCOPE"

# Extract bucket from location scope
# s3://nathanjmorton-s3-test-bucket/sso-demo/* -> nathanjmorton-s3-test-bucket
S3_BUCKET=$(echo "$LOCATION_SCOPE" | sed 's|s3://||' | cut -d'/' -f1)

# Extract prefix from location scope
# s3://nathanjmorton-s3-test-bucket/sso-demo/* -> sso-demo
# Remove "s3://bucket/" prefix, then remove trailing "/*"
S3_PREFIX=$(echo "$LOCATION_SCOPE" | sed 's|^s3://[^/]*/||; s|/\*$||')

echo "S3 Bucket: $S3_BUCKET"
echo "S3 Prefix: $S3_PREFIX"
echo

# Create a group for all app users (or get existing)
echo "Creating/finding Identity Center group 'App Users'..."
GROUP_ID=$(aws identitystore create-group \
  --identity-store-id "$IDENTITY_STORE_ID" \
  --display-name "App Users" \
  --description "Users who can access their personal S3 folder via the OAuth app" \
  --query 'GroupId' --output text 2>/dev/null || \
  aws identitystore list-groups \
    --identity-store-id "$IDENTITY_STORE_ID" \
    --filters '[{"AttributePath": "DisplayName", "AttributeValue": "App Users"}]' \
    --query 'Groups[0].GroupId' --output text)

echo "Group ID: $GROUP_ID"
echo

# Create a single grant with dynamic per-user folders
# Grant scope: s3://bucket/prefix/${identitystore:UserId}/*
# The ${identitystore:UserId} variable is resolved at runtime to the user's ID
GRANT_SCOPE="s3://${S3_BUCKET}/${S3_PREFIX}/\${identitystore:UserId}/*"
echo "Creating Access Grant with dynamic scope..."
echo "Grant scope: $GRANT_SCOPE"

aws s3control create-access-grant \
  --account-id "$AWS_ACCOUNT_ID" \
  --access-grants-location-id "$LOCATION_ID" \
  --grantee "{\"GranteeType\": \"DIRECTORY_GROUP\", \"GranteeIdentifier\": \"$GROUP_ID\"}" \
  --permission "READWRITE" \
  --grant-scope "$GRANT_SCOPE"

echo
echo "=== Setup Complete ==="
echo
echo "Summary:"
echo "  - Group 'App Users' ID: $GROUP_ID"
echo "  - Grant scope: $GRANT_SCOPE"
echo
echo "Each user added to the 'App Users' group will automatically get access to:"
echo "  s3://$S3_BUCKET/$S3_PREFIX/{their-identity-store-user-id}/*"
echo
echo "=== Next Steps ==="
echo
echo "When a user registers via OAuth, your app should:"
echo
echo "1. Create them in Identity Center:"
echo "   aws identitystore create-user \\"
echo "     --identity-store-id \"$IDENTITY_STORE_ID\" \\"
echo "     --user-name \"user@example.com\" \\"
echo "     --display-name \"User Name\" \\"
echo "     --emails '[{\"Value\": \"user@example.com\", \"Primary\": true}]' \\"
echo "     --external-ids '[{\"Issuer\": \"your-auth0-domain\", \"Id\": \"auth0|user-sub\"}]'"
echo
echo "2. Add the user to the App Users group:"
echo "   aws identitystore create-group-membership \\"
echo "     --identity-store-id \"$IDENTITY_STORE_ID\" \\"
echo "     --group-id \"$GROUP_ID\" \\"
echo "     --member-id '{\"UserId\": \"<user-id-from-step-1>\"}'"
echo
echo "Environment variables for your app:"
echo "  export APP_USERS_GROUP_ID=$GROUP_ID"
echo "  export IDENTITY_STORE_ID=$IDENTITY_STORE_ID"
