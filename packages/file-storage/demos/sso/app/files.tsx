import type { Controller } from '@remix-run/fetch-router'
import { createRedirectResponse as redirect } from '@remix-run/response/redirect'
import { createS3FileStorage } from '@remix-run/file-storage/s3'

import { routes } from './routes.ts'
import { Layout, Document } from './layout.tsx'
import { render } from './utils/render.ts'
import {
  getAssumeRoleConfig,
  assumeRoleWithWebIdentity,
  type AwsCredentials,
} from './utils/identity-center.ts'

let S3_BUCKET = 'nathanjmorton-s3-test-bucket'
let S3_REGION = 'us-east-1'
let S3_PREFIX = 'sso-demo'

function createStorageWithCredentials(credentials: AwsCredentials) {
  return createS3FileStorage({
    bucket: S3_BUCKET,
    endpoint: `https://s3.${S3_REGION}.amazonaws.com`,
    region: S3_REGION,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
    prefix: S3_PREFIX,
  })
}

interface User {
  sub: string
  email?: string
  name?: string
  picture?: string
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    let parts = token.split('.')
    if (parts.length !== 3) return { error: 'Invalid JWT format' }
    let payload = Buffer.from(parts[1], 'base64url').toString('utf-8')
    return JSON.parse(payload)
  } catch {
    return { error: 'Failed to decode token' }
  }
}

export default {
  middleware: [],
  actions: {
    // List files page
    async index({ session }) {
      let user = session.get('user') as User | null
      let accessToken = session.get('access_token') as string | null

      // Require authentication
      if (!user || !accessToken) {
        return redirect(routes.auth.login.href())
      }

      // Try to get AWS credentials
      let awsCredentials: AwsCredentials | null = null
      let awsError: string | null = null

      try {
        let config = getAssumeRoleConfig()
        awsCredentials = await assumeRoleWithWebIdentity(config, accessToken)
      } catch (error) {
        awsError = error instanceof Error ? error.message : 'Unknown error'
      }

      // List files if we have credentials
      let files: { key: string; size?: number; lastModified?: number }[] = []
      let listError: string | null = null

      if (awsCredentials) {
        try {
          let storage = createStorageWithCredentials(awsCredentials)
          let result = await storage.list({ includeMetadata: true })
          files = result.files
        } catch (error) {
          listError = error instanceof Error ? error.message : 'Failed to list files'
        }
      }

      return render(
        <Layout user={user}>
          <div class="card">
            <h2>S3 Files</h2>
            <p style="margin: 1rem 0; color: #666;">
              Bucket: <code>{S3_BUCKET}</code> / Prefix: <code>{S3_PREFIX}/</code>
            </p>
          </div>

          <div class="card">
            <h3>AWS Credentials</h3>
            {awsCredentials ? (
              <>
                <div class="alert alert-success">
                  ✓ Authenticated via Auth0 → STS AssumeRoleWithWebIdentity
                </div>
                <p style="margin: 0.5rem 0; font-size: 0.85rem; color: #666;">
                  Access Key: <code>{awsCredentials.accessKeyId}</code> • 
                  Expires: {awsCredentials.expiration.toISOString()}
                </p>
              </>
            ) : (
              <div class="alert alert-error">
                <strong>Failed to get AWS credentials:</strong> {awsError}
              </div>
            )}
          </div>

          {awsCredentials ? (
            <>
              <div class="card">
                <h3>Upload File</h3>
                <form
                  method="POST"
                  action={routes.files.upload.href()}
                  encType="multipart/form-data"
                  style="margin-top: 1rem;"
                >
                  <div class="upload-box" id="dropzone">
                    <p>Select a file to upload</p>
                    <input type="file" name="file" id="file-input" style="margin-top: 1rem;" required />
                  </div>
                  <button type="submit" class="btn">
                    Upload to S3
                  </button>
                </form>
              </div>

              <div class="card">
                <h3>Files</h3>
                {listError ? (
                  <div class="alert alert-error">{listError}</div>
                ) : null}
                <table>
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Size</th>
                      <th>Modified</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.length > 0 ? (
                      files.map((file) => (
                        <tr>
                          <td>{file.key}</td>
                          <td>{file.size ? `${Math.round(file.size / 1024)} KB` : '-'}</td>
                          <td>{file.lastModified ? new Date(file.lastModified).toLocaleDateString() : '-'}</td>
                          <td>
                            <a
                              href={routes.files.download.href() + `?key=${encodeURIComponent(file.key)}`}
                              class="btn btn-secondary"
                              style="padding: 0.25rem 0.5rem; font-size: 0.85rem;"
                            >
                              Download
                            </a>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} style="text-align: center; color: #999;">
                          No files yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <details style="margin-top: 1rem;">
            <summary style="cursor: pointer; color: #666;">Debug: Auth0 Token</summary>
            <pre style="word-break: break-all; white-space: pre-wrap; font-size: 0.75rem; margin-top: 0.5rem; background: #f5f5f5; padding: 1rem; border-radius: 4px;">
              <code>{JSON.stringify(decodeJwtPayload(accessToken), null, 2)}</code>
            </pre>
          </details>
        </Layout>,
      )
    },

    // Handle file upload
    async upload({ session, formData }) {
      let user = session.get('user') as User | null
      let accessToken = session.get('access_token') as string | null

      if (!user || !accessToken) {
        return redirect(routes.auth.login.href())
      }

      let file = formData.get('file')
      if (!file || !(file instanceof File) || file.size === 0) {
        return render(
          <Document>
            <div class="container">
              <div class="card">
                <h2>Upload Error</h2>
                <div class="alert alert-error">No file selected.</div>
                <p style="margin-top: 1rem;">
                  <a href={routes.files.index.href()} class="btn btn-secondary">
                    Back to Files
                  </a>
                </p>
              </div>
            </div>
          </Document>,
          { status: 400 },
        )
      }

      try {
        let config = getAssumeRoleConfig()
        let credentials = await assumeRoleWithWebIdentity(config, accessToken)
        let storage = createStorageWithCredentials(credentials)

        let key = `${Date.now()}-${file.name}`
        await storage.put(key, file)

        return redirect(routes.files.index.href())
      } catch (error) {
        return render(
          <Document>
            <div class="container">
              <div class="card">
                <h2>Upload Error</h2>
                <div class="alert alert-error">
                  {error instanceof Error ? error.message : 'Upload failed'}
                </div>
                <p style="margin-top: 1rem;">
                  <a href={routes.files.index.href()} class="btn btn-secondary">
                    Back to Files
                  </a>
                </p>
              </div>
            </div>
          </Document>,
          { status: 500 },
        )
      }
    },

    // Handle file download
    async download({ session, url }) {
      let user = session.get('user') as User | null
      let accessToken = session.get('access_token') as string | null

      if (!user || !accessToken) {
        return redirect(routes.auth.login.href())
      }

      let key = url.searchParams.get('key')
      if (!key) {
        return new Response('Missing key parameter', { status: 400 })
      }

      try {
        let config = getAssumeRoleConfig()
        let credentials = await assumeRoleWithWebIdentity(config, accessToken)
        let storage = createStorageWithCredentials(credentials)

        let signedUrl = await storage.getSignedUrl({ key, method: 'GET', expiresIn: 60 })
        return Response.redirect(signedUrl, 302)
      } catch (error) {
        return render(
          <Document>
            <div class="container">
              <div class="card">
                <h2>Download Error</h2>
                <div class="alert alert-error">
                  {error instanceof Error ? error.message : 'Download failed'}
                </div>
                <p style="margin-top: 1rem;">
                  <a href={routes.files.index.href()} class="btn btn-secondary">
                    Back to Files
                  </a>
                </p>
              </div>
            </div>
          </Document>,
          { status: 500 },
        )
      }
    },
  },
} satisfies Controller<typeof routes.files>
