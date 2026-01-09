#!/bin/bash
set -e

STACK_NAME="convert-to-webm-stack"
REGION="us-east-1"
FUNCTION_NAME="convert-to-webm"

echo "=== Deploying CloudFormation stack ==="
aws cloudformation deploy \
  --template-file cloudformation.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION"

echo "=== Building Lambda function ==="
# Install dependencies and bundle
npm install
npx esbuild index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js

echo "=== Packaging Lambda function ==="
cd dist
zip -r ../function.zip index.js
cd ..

echo "=== Updating Lambda function code ==="
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file fileb://function.zip \
  --region "$REGION"

echo "=== Deployment complete ==="
echo "Lambda ARN:"
aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text
