# Convert to WebM Lambda

This Lambda function converts video files to WebM format using AWS MediaConvert.

## Architecture

```
User clicks "Convert to WebM"
       ↓
App calls POST /files/convert
       ↓
App invokes Lambda (convert-to-webm)
       ↓
Lambda creates MediaConvert job
       ↓
Browser opens SSE connection to GET /files/convert/events?jobId=X
       ↓
MediaConvert processes video, emits state change events
       ↓
EventBridge rule captures state changes → SNS topic
       ↓
SNS delivers to POST /files/convert/webhook
       ↓
App broadcasts status via SSE to connected browser
       ↓
UI updates in real-time: SUBMITTED → PROGRESSING 45% → COMPLETE
```

## Deployment

### Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 20+
- The app's IAM role/user needs `lambda:InvokeFunction` permission
- **Your app must be accessible via HTTPS** for SNS webhook delivery

### Deploy the stack

```bash
cd packages/file-storage/demos/sso/lambda/convert-to-webm

# Deploy CloudFormation stack with your webhook URL
aws cloudformation deploy \
  --template-file cloudformation.yaml \
  --stack-name convert-to-webm-stack \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1 \
  --parameter-overrides WebhookEndpoint=https://your-app.com/files/convert/webhook
```

### Build and deploy Lambda code

```bash
npm install
npx esbuild index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js
cd dist && zip -r ../function.zip index.js && cd ..
aws lambda update-function-code \
  --function-name convert-to-webm \
  --zip-file fileb://function.zip \
  --region us-east-1
```

### Local Development

For local development without a public HTTPS endpoint, the UI falls back to polling
the `/files/convert/status` endpoint if SSE fails to connect.

## IAM Permissions for the App

The app needs permission to invoke the Lambda. Add this to your app's IAM policy:

```json
{
  "Effect": "Allow",
  "Action": "lambda:InvokeFunction",
  "Resource": "arn:aws:lambda:us-east-1:*:function:convert-to-webm"
}
```

If running locally with AWS credentials, ensure your profile has this permission.

## Output

Converted files are placed in the same S3 prefix as the source, with the filename pattern:
- Input: `{prefix}/{filename}.mp4`
- Output: `{prefix}/{filename}-converted.webm`

## MediaConvert Settings

- Video codec: VP9 (Multi-pass HQ)
- Audio codec: Opus (128 kbps, 48 kHz stereo)
- Container: WebM
- Preserves original video dimensions
