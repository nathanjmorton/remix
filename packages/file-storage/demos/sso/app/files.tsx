import type { Controller } from '@remix-run/fetch-router'
import { createRedirectResponse as redirect } from '@remix-run/response/redirect'
import { createS3FileStorage } from '@remix-run/file-storage/s3'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'

import { routes } from './routes.ts'
import { Layout, Document } from './layout.tsx'
import { render } from './utils/render.ts'
import {
  getS3AccessGrantsConfig,
  getS3CredentialsViaAccessGrants,
  type AwsCredentials,
} from './utils/identity-center.ts'

// Cache AWS credentials per user session to avoid re-redeeming the JWT
// Key: user sub, Value: { credentials, listCredentials, identityStoreUserId, matchedGrantTarget }
let awsCredentialsCache = new Map<
  string,
  {
    credentials: AwsCredentials
    listCredentials: AwsCredentials
    identityStoreUserId: string
    matchedGrantTarget: string | undefined
  }
>()

// Buffer time before expiration to refresh credentials (5 minutes)
let CREDENTIAL_REFRESH_BUFFER_MS = 5 * 60 * 1000

function getCachedCredentials(userSub: string) {
  let cached = awsCredentialsCache.get(userSub)
  if (!cached) return null

  // Check if credentials are expired or about to expire
  let expirationTime = cached.credentials.expiration.getTime()
  if (Date.now() + CREDENTIAL_REFRESH_BUFFER_MS >= expirationTime) {
    awsCredentialsCache.delete(userSub)
    return null
  }

  return cached
}

function setCachedCredentials(
  userSub: string,
  result: {
    credentials: AwsCredentials
    listCredentials: AwsCredentials
    identityStoreUserId: string
    matchedGrantTarget: string | undefined
  },
) {
  awsCredentialsCache.set(userSub, result)
}

let S3_BUCKET = 'nathanjmorton-s3-test-bucket'
let S3_REGION = 'us-east-1'
let S3_BASE_PREFIX = 'sso-demo'
let CONVERT_LAMBDA_NAME = 'convert-to-webm'

// Video extensions that can be converted to WebM
let CONVERTIBLE_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.m4v']

// SSE: Store for job status updates and connected clients
interface JobStatusEvent {
  jobId: string
  status: string
  percentComplete?: number
  errorMessage?: string
  timestamp: number
}

// Map of jobId -> latest status
let jobStatusStore = new Map<string, JobStatusEvent>()

// Map of jobId -> Set of SSE writers waiting for updates
let sseClients = new Map<string, Set<WritableStreamDefaultWriter<Uint8Array>>>()

function broadcastJobStatus(event: JobStatusEvent) {
  jobStatusStore.set(event.jobId, event)
  let clients = sseClients.get(event.jobId)
  if (clients) {
    let data = `data: ${JSON.stringify(event)}\n\n`
    let encoded = new TextEncoder().encode(data)
    for (let writer of clients) {
      writer.write(encoded).catch(() => {
        // Client disconnected, will be cleaned up
      })
    }
  }
  // Clean up old events after 10 minutes
  setTimeout(() => jobStatusStore.delete(event.jobId), 10 * 60 * 1000)
}

function isConvertibleVideo(key: string): boolean {
  let ext = key.substring(key.lastIndexOf('.')).toLowerCase()
  return CONVERTIBLE_VIDEO_EXTENSIONS.includes(ext)
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Creates S3 storage with per-user folder prefix.
 * Files are stored at: s3://bucket/sso-demo/{identityStoreUserId}/
 */
function createStorageWithCredentials(credentials: AwsCredentials, identityStoreUserId: string) {
  let userPrefix = `${S3_BASE_PREFIX}/${identityStoreUserId}`
  return createS3FileStorage({
    bucket: S3_BUCKET,
    endpoint: `https://s3.${S3_REGION}.amazonaws.com`,
    region: S3_REGION,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
    prefix: userPrefix,
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
      let idToken = session.get('id_token') as string | null

      // Require authentication
      if (!user || !idToken) {
        return redirect(routes.auth.login.href())
      }

      // Try to get AWS credentials via S3 Access Grants (with caching)
      let awsCredentials: AwsCredentials | null = null
      let listCredentials: AwsCredentials | null = null
      let identityStoreUserId: string | null = null
      let awsError: string | null = null
      let matchedGrantTarget: string | undefined

      // Check cache first
      let cached = getCachedCredentials(user.sub)
      if (cached) {
        awsCredentials = cached.credentials
        listCredentials = cached.listCredentials
        identityStoreUserId = cached.identityStoreUserId
        matchedGrantTarget = cached.matchedGrantTarget
      } else {
        try {
          let config = getS3AccessGrantsConfig()
          let result = await getS3CredentialsViaAccessGrants(config, idToken)
          awsCredentials = result.credentials
          listCredentials = result.listCredentials
          identityStoreUserId = result.identityStoreUserId
          matchedGrantTarget = result.matchedGrantTarget
          setCachedCredentials(user.sub, result)
        } catch (error) {
          awsError = error instanceof Error ? error.message : 'Unknown error'
        }
      }

      // List files using listCredentials (Identity Bearer role has s3:ListBucket)
      // Files are scoped to the user's folder: sso-demo/{identityStoreUserId}/
      let files: { key: string; size?: number; lastModified?: number }[] = []
      let listError: string | null = null

      if (listCredentials && identityStoreUserId) {
        try {
          let storage = createStorageWithCredentials(listCredentials, identityStoreUserId)
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
              Bucket: <code>{S3_BUCKET}</code> / Prefix:{' '}
              <code>
                {S3_BASE_PREFIX}/{identityStoreUserId || '...'}/
              </code>
            </p>
          </div>

          <div class="card">
            <h3>S3 Access Grants</h3>
            {awsCredentials ? (
              <>
                <div class="alert alert-success">
                  ✓ Authenticated via Auth0 → Identity Center → S3 Access Grants
                </div>
                <p style="margin: 0.5rem 0; font-size: 0.85rem; color: #666;">
                  Access Key: <code>{awsCredentials.accessKeyId}</code>
                </p>
                <p style="margin: 0.5rem 0; font-size: 0.85rem; color: #666;">
                  Expires: {awsCredentials.expiration.toISOString()}
                </p>
                {matchedGrantTarget ? (
                  <p style="margin: 0.5rem 0; font-size: 0.85rem; color: #666;">
                    Grant: <code>{matchedGrantTarget}</code>
                  </p>
                ) : null}
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
                <p style="font-size: 0.85rem; color: #666; margin-bottom: 1rem;">
                  Files ≤5MB use simple PUT. Files &gt;5MB use multipart upload.
                </p>
                <div class="upload-box" id="dropzone">
                  <p>Drag &amp; drop or select file</p>
                  <input type="file" id="file-input" style="margin-top: 1rem;" />
                </div>
                <button id="upload-btn" class="btn" disabled>
                  Upload to S3
                </button>
                <div id="upload-status" class="status" style="display: none; margin-top: 0.5rem;"></div>
                <div id="progress-container" style="display: none; margin-top: 0.5rem;">
                  <div style="background: #e0e0e0; border-radius: 4px; height: 8px;">
                    <div id="progress-bar" style="background: #007bff; height: 100%; border-radius: 4px; width: 0%; transition: width 0.2s;"></div>
                  </div>
                  <p id="progress-text" style="font-size: 0.85rem; color: #666; margin-top: 0.25rem;"></p>
                </div>
              </div>

              <div class="card">
                <h3>Files</h3>
                {listError ? (
                  <div class="alert alert-error">{listError}</div>
                ) : null}
                {files.length > 0 ? (
                  <div style="margin-bottom: 1rem;">
                    <button
                      id="delete-all-btn"
                      class="btn btn-danger"
                      style="font-size: 0.85rem;"
                    >
                      Delete All Files
                    </button>
                  </div>
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
                  <tbody id="files-tbody">
                    {files.length > 0 ? (
                      files.map((file) => (
                        <tr data-key={file.key}>
                          <td>{file.key}</td>
                          <td>{file.size ? `${Math.round(file.size / 1024)} KB` : '-'}</td>
                          <td>{file.lastModified ? new Date(file.lastModified).toLocaleDateString() : '-'}</td>
                          <td style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <a
                              href={routes.files.download.href() + `?key=${encodeURIComponent(file.key)}`}
                              class="btn btn-secondary"
                              style="padding: 0.25rem 0.5rem; font-size: 0.85rem;"
                            >
                              Download
                            </a>
                            {isConvertibleVideo(file.key) ? (
                              <button
                                class="btn convert-btn"
                                style="padding: 0.25rem 0.5rem; font-size: 0.85rem; background: #6f42c1; color: white;"
                                data-key={file.key}
                              >
                                Convert to WebM
                              </button>
                            ) : null}
                            <button
                              class="btn btn-danger delete-btn"
                              style="padding: 0.25rem 0.5rem; font-size: 0.85rem;"
                              data-key={file.key}
                            >
                              Delete
                            </button>
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

              <script innerHTML={`
                (function() {
                  let selectedFile = null;
                  let dropzone = document.getElementById('dropzone');
                  let fileInput = document.getElementById('file-input');
                  let uploadBtn = document.getElementById('upload-btn');
                  let statusEl = document.getElementById('upload-status');
                  let progressContainer = document.getElementById('progress-container');
                  let progressBar = document.getElementById('progress-bar');
                  let progressText = document.getElementById('progress-text');

                  let MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5MB

                  fileInput.onchange = function(e) {
                    selectedFile = e.target.files[0];
                    uploadBtn.disabled = !selectedFile;
                  };

                  dropzone.ondragover = function(e) {
                    e.preventDefault();
                    dropzone.classList.add('dragover');
                  };
                  dropzone.ondragleave = function() {
                    dropzone.classList.remove('dragover');
                  };
                  dropzone.ondrop = function(e) {
                    e.preventDefault();
                    dropzone.classList.remove('dragover');
                    selectedFile = e.dataTransfer.files[0];
                    fileInput.files = e.dataTransfer.files;
                    uploadBtn.disabled = !selectedFile;
                  };

                  function showStatus(msg, isError) {
                    statusEl.textContent = msg;
                    statusEl.style.display = 'block';
                    statusEl.className = 'status ' + (isError ? 'alert alert-error' : 'alert alert-success');
                  }

                  function showProgress(percent, text) {
                    progressContainer.style.display = 'block';
                    progressBar.style.width = percent + '%';
                    progressText.textContent = text;
                  }

                  function hideProgress() {
                    progressContainer.style.display = 'none';
                  }

                  uploadBtn.onclick = async function() {
                    if (!selectedFile) return;
                    uploadBtn.disabled = true;
                    statusEl.style.display = 'none';
                    hideProgress();

                    let key = Date.now() + '-' + selectedFile.name;

                    try {
                      if (selectedFile.size <= MULTIPART_THRESHOLD) {
                        // Simple presigned PUT for small files
                        showProgress(0, 'Getting presigned URL...');
                        let res = await fetch('${routes.files.presign.href()}?key=' + encodeURIComponent(key));
                        if (!res.ok) {
                          let err = await res.json();
                          throw new Error(err.error || 'Failed to get presigned URL');
                        }
                        let { url } = await res.json();

                        showProgress(50, 'Uploading...');
                        let uploadRes = await fetch(url, {
                          method: 'PUT',
                          body: selectedFile,
                          headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' }
                        });
                        if (!uploadRes.ok) throw new Error('Upload failed: ' + uploadRes.status);
                        showProgress(100, 'Done!');
                      } else {
                        // Multipart upload for large files
                        showProgress(0, 'Initiating multipart upload...');
                        let initRes = await fetch('${routes.files.multipartInitiate.href()}', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            key: key,
                            totalSize: selectedFile.size,
                            contentType: selectedFile.type || 'application/octet-stream'
                          })
                        });
                        if (!initRes.ok) {
                          let err = await initRes.json();
                          throw new Error(err.error || 'Failed to initiate multipart upload');
                        }
                        let { uploadId, parts } = await initRes.json();

                        // Upload each part
                        let completedParts = [];
                        let partSize = Math.ceil(selectedFile.size / parts.length);

                        for (let i = 0; i < parts.length; i++) {
                          let start = i * partSize;
                          let end = Math.min(start + partSize, selectedFile.size);
                          let blob = selectedFile.slice(start, end);

                          let percent = Math.round((i / parts.length) * 90);
                          showProgress(percent, 'Uploading part ' + (i + 1) + '/' + parts.length + '...');

                          let uploadRes = await fetch(parts[i].url, {
                            method: 'PUT',
                            body: blob
                          });
                          if (!uploadRes.ok) throw new Error('Part ' + (i + 1) + ' upload failed: ' + uploadRes.status);

                          let etag = uploadRes.headers.get('ETag');
                          if (!etag) throw new Error('No ETag in part ' + (i + 1) + ' response');
                          completedParts.push({ partNumber: parts[i].partNumber, etag: etag });
                        }

                        // Complete multipart upload
                        showProgress(95, 'Completing upload...');
                        let completeRes = await fetch('${routes.files.multipartComplete.href()}', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ key: key, uploadId: uploadId, parts: completedParts })
                        });
                        if (!completeRes.ok) {
                          let err = await completeRes.json();
                          throw new Error(err.error || 'Failed to complete multipart upload');
                        }
                        showProgress(100, 'Done!');
                      }

                      showStatus('Uploaded: ' + key, false);
                      selectedFile = null;
                      fileInput.value = '';
                      uploadBtn.disabled = true;
                      // Refresh page to show new file
                      setTimeout(function() { window.location.reload(); }, 1000);
                    } catch (err) {
                      showStatus('Error: ' + err.message, true);
                      hideProgress();
                      uploadBtn.disabled = false;
                    }
                  };

                  // Delete single file
                  async function deleteFile(key) {
                    if (!confirm('Delete "' + key + '"?')) return;
                    try {
                      let res = await fetch('${routes.files.delete.href()}', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: key })
                      });
                      if (!res.ok) {
                        let err = await res.json();
                        throw new Error(err.error || 'Delete failed');
                      }
                      window.location.reload();
                    } catch (err) {
                      showStatus('Error: ' + err.message, true);
                    }
                  }

                  // Attach delete handlers to buttons
                  document.querySelectorAll('.delete-btn').forEach(function(btn) {
                    btn.onclick = function() {
                      deleteFile(btn.getAttribute('data-key'));
                    };
                  });

                  // Delete all files
                  let deleteAllBtn = document.getElementById('delete-all-btn');
                  if (deleteAllBtn) {
                    deleteAllBtn.onclick = async function() {
                      if (!confirm('Delete ALL files? This cannot be undone.')) return;
                      deleteAllBtn.disabled = true;
                      try {
                        let res = await fetch('${routes.files.delete.href()}', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ all: true })
                        });
                        if (!res.ok) {
                          let err = await res.json();
                          throw new Error(err.error || 'Delete all failed');
                        }
                        window.location.reload();
                      } catch (err) {
                        showStatus('Error: ' + err.message, true);
                        deleteAllBtn.disabled = false;
                      }
                    };
                  }

                  // Convert video to WebM
                  async function convertFile(key, btn) {
                    if (!confirm('Convert "' + key + '" to WebM? This may take a few minutes.')) return;
                    btn.disabled = true;
                    btn.textContent = 'Starting...';
                    try {
                      let res = await fetch('${routes.files.convert.href()}', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: key })
                      });
                      let data = await res.json();
                      if (!res.ok) {
                        throw new Error(data.error || 'Conversion failed');
                      }
                      // Subscribe to SSE for real-time status updates
                      subscribeToJobStatus(data.jobId, data.outputKey, btn);
                    } catch (err) {
                      showStatus('Error: ' + err.message, true);
                      btn.disabled = false;
                      btn.textContent = 'Convert to WebM';
                      btn.style.background = '#6f42c1';
                    }
                  }

                  // Subscribe to SSE for job status updates
                  function subscribeToJobStatus(jobId, outputKey, btn) {
                    btn.textContent = 'Connecting...';
                    btn.style.background = '#17a2b8';

                    let eventSource = new EventSource('${routes.files.convertEvents.href()}?jobId=' + encodeURIComponent(jobId));
                    let timeout = setTimeout(function() {
                      // Fallback timeout after 10 minutes
                      eventSource.close();
                      btn.textContent = 'Timeout';
                      btn.style.background = '#ffc107';
                      showStatus('Conversion is taking longer than expected. Check back later for: ' + outputKey, false);
                    }, 10 * 60 * 1000);

                    eventSource.onmessage = function(event) {
                      let data = JSON.parse(event.data);
                      let status = data.status;
                      let percent = data.percentComplete || 0;

                      if (status === 'COMPLETE') {
                        clearTimeout(timeout);
                        eventSource.close();
                        btn.textContent = 'Done!';
                        btn.style.background = '#28a745';
                        showStatus('Conversion complete! Output: ' + outputKey, false);
                        setTimeout(function() { window.location.reload(); }, 2000);
                      } else if (status === 'ERROR' || status === 'CANCELED') {
                        clearTimeout(timeout);
                        eventSource.close();
                        showStatus('Error: ' + (data.errorMessage || 'Job ' + status.toLowerCase()), true);
                        btn.disabled = false;
                        btn.textContent = 'Convert to WebM';
                        btn.style.background = '#6f42c1';
                      } else {
                        // Still in progress (SUBMITTED, PROGRESSING)
                        btn.textContent = status + ' ' + percent + '%';
                        btn.style.background = '#17a2b8';
                      }
                    };

                    eventSource.onerror = function() {
                      // Connection error - fall back to one-time status check
                      clearTimeout(timeout);
                      eventSource.close();
                      btn.textContent = 'Checking...';
                      // Do a single status check via the API
                      fetch('${routes.files.convertStatus.href()}?jobId=' + encodeURIComponent(jobId))
                        .then(function(res) { return res.json(); })
                        .then(function(data) {
                          if (data.status === 'COMPLETE') {
                            btn.textContent = 'Done!';
                            btn.style.background = '#28a745';
                            showStatus('Conversion complete! Output: ' + outputKey, false);
                            setTimeout(function() { window.location.reload(); }, 2000);
                          } else if (data.status === 'ERROR' || data.status === 'CANCELED') {
                            showStatus('Error: ' + (data.errorMessage || 'Job failed'), true);
                            btn.disabled = false;
                            btn.textContent = 'Convert to WebM';
                            btn.style.background = '#6f42c1';
                          } else {
                            btn.textContent = data.status + ' ' + (data.percentComplete || 0) + '%';
                            showStatus('SSE connection lost. Refresh to check status.', false);
                          }
                        })
                        .catch(function() {
                          showStatus('Connection lost. Refresh to check conversion status.', false);
                          btn.textContent = 'Check status';
                          btn.style.background = '#ffc107';
                        });
                    };
                  }

                  // Attach convert handlers to buttons
                  document.querySelectorAll('.convert-btn').forEach(function(btn) {
                    btn.onclick = function() {
                      convertFile(btn.getAttribute('data-key'), btn);
                    };
                  });
                })();
              `} />
            </>
          ) : null}

          <details style="margin-top: 1rem;">
            <summary style="cursor: pointer; color: #666;">Debug: Auth0 ID Token</summary>
            <pre style="word-break: break-all; white-space: pre-wrap; font-size: 0.75rem; margin-top: 0.5rem; background: #f5f5f5; padding: 1rem; border-radius: 4px;">
              <code>{JSON.stringify(decodeJwtPayload(idToken), null, 2)}</code>
            </pre>
          </details>
        </Layout>,
      )
    },

    // Handle file upload
    async upload({ session, formData }) {
      let user = session.get('user') as User | null
      let idToken = session.get('id_token') as string | null

      if (!user || !idToken) {
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
        // Check cache first
        let cached = getCachedCredentials(user.sub)
        let credentials: AwsCredentials
        let identityStoreUserId: string
        if (cached) {
          credentials = cached.credentials
          identityStoreUserId = cached.identityStoreUserId
        } else {
          let config = getS3AccessGrantsConfig()
          let result = await getS3CredentialsViaAccessGrants(config, idToken)
          credentials = result.credentials
          identityStoreUserId = result.identityStoreUserId
          setCachedCredentials(user.sub, result)
        }
        let storage = createStorageWithCredentials(credentials, identityStoreUserId)

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

    // Handle file delete (single or all)
    async delete({ session, request }) {
      let user = session.get('user') as User | null
      let idToken = session.get('id_token') as string | null

      if (!user || !idToken) {
        return json({ error: 'Unauthorized' }, 401)
      }

      try {
        let body = await request.json()
        let { key, all } = body as { key?: string; all?: boolean }

        let cached = getCachedCredentials(user.sub)
        let credentials: AwsCredentials
        let identityStoreUserId: string
        if (cached) {
          credentials = cached.credentials
          identityStoreUserId = cached.identityStoreUserId
        } else {
          let config = getS3AccessGrantsConfig()
          let result = await getS3CredentialsViaAccessGrants(config, idToken)
          credentials = result.credentials
          identityStoreUserId = result.identityStoreUserId
          setCachedCredentials(user.sub, result)
        }
        let storage = createStorageWithCredentials(credentials, identityStoreUserId)

        if (all) {
          // Delete all files
          let { files } = await storage.list()
          for (let file of files) {
            await storage.remove(file.key)
          }
          return json({ success: true, deleted: files.length })
        } else if (key) {
          // Delete single file
          await storage.remove(key)
          return json({ success: true })
        } else {
          return json({ error: 'Missing key or all parameter' }, 400)
        }
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Delete failed' }, 500)
      }
    },

    // Handle file download
    async download({ session, url }) {
      let user = session.get('user') as User | null
      let idToken = session.get('id_token') as string | null

      if (!user || !idToken) {
        return redirect(routes.auth.login.href())
      }

      let key = url.searchParams.get('key')
      if (!key) {
        return new Response('Missing key parameter', { status: 400 })
      }

      try {
        // Check cache first
        let cached = getCachedCredentials(user.sub)
        let credentials: AwsCredentials
        let identityStoreUserId: string
        if (cached) {
          credentials = cached.credentials
          identityStoreUserId = cached.identityStoreUserId
        } else {
          let config = getS3AccessGrantsConfig()
          let result = await getS3CredentialsViaAccessGrants(config, idToken)
          credentials = result.credentials
          identityStoreUserId = result.identityStoreUserId
          setCachedCredentials(user.sub, result)
        }
        let storage = createStorageWithCredentials(credentials, identityStoreUserId)

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

    // Get presigned URL for simple PUT upload (small files)
    async presign({ session, url }) {
      let user = session.get('user') as User | null
      let idToken = session.get('id_token') as string | null

      if (!user || !idToken) {
        return json({ error: 'Unauthorized' }, 401)
      }

      let key = url.searchParams.get('key')
      if (!key) {
        return json({ error: 'Missing key parameter' }, 400)
      }

      try {
        let cached = getCachedCredentials(user.sub)
        let credentials: AwsCredentials
        let identityStoreUserId: string
        if (cached) {
          credentials = cached.credentials
          identityStoreUserId = cached.identityStoreUserId
        } else {
          let config = getS3AccessGrantsConfig()
          let result = await getS3CredentialsViaAccessGrants(config, idToken)
          credentials = result.credentials
          identityStoreUserId = result.identityStoreUserId
          setCachedCredentials(user.sub, result)
        }
        let storage = createStorageWithCredentials(credentials, identityStoreUserId)

        let presignedUrl = await storage.getSignedUrl({ key, method: 'PUT', expiresIn: 300 })
        return json({ url: presignedUrl, key })
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Failed to get presigned URL' }, 500)
      }
    },

    // Initiate multipart upload (large files)
    async multipartInitiate({ session, request }) {
      let user = session.get('user') as User | null
      let idToken = session.get('id_token') as string | null

      if (!user || !idToken) {
        return json({ error: 'Unauthorized' }, 401)
      }

      try {
        let body = await request.json()
        let { key, totalSize, contentType } = body as {
          key: string
          totalSize: number
          contentType?: string
        }

        if (!key || !totalSize) {
          return json({ error: 'Missing key or totalSize' }, 400)
        }

        let cached = getCachedCredentials(user.sub)
        let credentials: AwsCredentials
        let identityStoreUserId: string
        if (cached) {
          credentials = cached.credentials
          identityStoreUserId = cached.identityStoreUserId
        } else {
          let config = getS3AccessGrantsConfig()
          let result = await getS3CredentialsViaAccessGrants(config, idToken)
          credentials = result.credentials
          identityStoreUserId = result.identityStoreUserId
          setCachedCredentials(user.sub, result)
        }
        let storage = createStorageWithCredentials(credentials, identityStoreUserId)

        let result = await storage.initiateMultipartUpload({
          key,
          totalSize,
          contentType: contentType || 'application/octet-stream',
          expiresIn: 3600,
        })
        return json(result)
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Failed to initiate multipart upload' }, 500)
      }
    },

    // Complete multipart upload
    async multipartComplete({ session, request }) {
      let user = session.get('user') as User | null
      let idToken = session.get('id_token') as string | null

      if (!user || !idToken) {
        return json({ error: 'Unauthorized' }, 401)
      }

      try {
        let body = await request.json()
        let { key, uploadId, parts } = body as {
          key: string
          uploadId: string
          parts: Array<{ partNumber: number; etag: string }>
        }

        if (!key || !uploadId || !parts) {
          return json({ error: 'Missing key, uploadId, or parts' }, 400)
        }

        let cached = getCachedCredentials(user.sub)
        let credentials: AwsCredentials
        let identityStoreUserId: string
        if (cached) {
          credentials = cached.credentials
          identityStoreUserId = cached.identityStoreUserId
        } else {
          let config = getS3AccessGrantsConfig()
          let result = await getS3CredentialsViaAccessGrants(config, idToken)
          credentials = result.credentials
          identityStoreUserId = result.identityStoreUserId
          setCachedCredentials(user.sub, result)
        }
        let storage = createStorageWithCredentials(credentials, identityStoreUserId)

        await storage.completeMultipartUpload({ key, uploadId, parts })
        return json({ success: true })
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Failed to complete multipart upload' }, 500)
      }
    },

    // Abort multipart upload
    async multipartAbort({ session, request }) {
      let user = session.get('user') as User | null
      let idToken = session.get('id_token') as string | null

      if (!user || !idToken) {
        return json({ error: 'Unauthorized' }, 401)
      }

      try {
        let body = await request.json()
        let { key, uploadId } = body as { key: string; uploadId: string }

        if (!key || !uploadId) {
          return json({ error: 'Missing key or uploadId' }, 400)
        }

        let cached = getCachedCredentials(user.sub)
        let credentials: AwsCredentials
        let identityStoreUserId: string
        if (cached) {
          credentials = cached.credentials
          identityStoreUserId = cached.identityStoreUserId
        } else {
          let config = getS3AccessGrantsConfig()
          let result = await getS3CredentialsViaAccessGrants(config, idToken)
          credentials = result.credentials
          identityStoreUserId = result.identityStoreUserId
          setCachedCredentials(user.sub, result)
        }
        let storage = createStorageWithCredentials(credentials, identityStoreUserId)

        await storage.abortMultipartUpload({ key, uploadId })
        return json({ success: true })
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Failed to abort multipart upload' }, 500)
      }
    },

    // Convert video to WebM via Lambda + MediaConvert
    async convert({ session, request }) {
      let user = session.get('user') as User | null
      let idToken = session.get('id_token') as string | null

      if (!user || !idToken) {
        return json({ error: 'Unauthorized' }, 401)
      }

      try {
        let body = await request.json()
        let { key } = body as { key: string }

        if (!key) {
          return json({ error: 'Missing key parameter' }, 400)
        }

        // Validate it's a convertible video file
        let ext = key.substring(key.lastIndexOf('.')).toLowerCase()
        if (!CONVERTIBLE_VIDEO_EXTENSIONS.includes(ext)) {
          return json({ error: `File type ${ext} cannot be converted to WebM` }, 400)
        }

        // Get the user's identity store ID for the full S3 key
        let cached = getCachedCredentials(user.sub)
        let identityStoreUserId: string
        if (cached) {
          identityStoreUserId = cached.identityStoreUserId
        } else {
          let config = getS3AccessGrantsConfig()
          let result = await getS3CredentialsViaAccessGrants(config, idToken)
          identityStoreUserId = result.identityStoreUserId
          setCachedCredentials(user.sub, result)
        }

        // Construct full S3 key with prefix
        let fullKey = `${S3_BASE_PREFIX}/${identityStoreUserId}/${key}`
        // Output key: same path but with -converted.webm suffix
        let outputKey = fullKey.replace(/\.[^.]+$/, '-converted.webm')

        // Invoke Lambda to create MediaConvert job
        let lambdaClient = new LambdaClient({ region: S3_REGION })
        let command = new InvokeCommand({
          FunctionName: CONVERT_LAMBDA_NAME,
          Payload: JSON.stringify({
            bucket: S3_BUCKET,
            key: fullKey,
            outputKey: outputKey,
          }),
        })

        let response = await lambdaClient.send(command)
        let payload = response.Payload ? JSON.parse(new TextDecoder().decode(response.Payload)) : null

        if (response.FunctionError || (payload && payload.statusCode >= 400)) {
          let errorBody = payload?.body ? JSON.parse(payload.body) : {}
          return json({ error: errorBody.error || 'Lambda invocation failed' }, 500)
        }

        let result = payload?.body ? JSON.parse(payload.body) : payload
        return json({
          success: true,
          jobId: result?.jobId,
          status: result?.status,
          outputKey: key.replace(/\.[^.]+$/, '-converted.webm'),
          message: 'Conversion job started. The converted file will appear shortly.',
        })
      } catch (error) {
        console.error('Convert error:', error)
        return json({ error: error instanceof Error ? error.message : 'Failed to start conversion' }, 500)
      }
    },

    // Get conversion job status
    async convertStatus({ session, url }) {
      let user = session.get('user') as User | null
      let idToken = session.get('id_token') as string | null

      if (!user || !idToken) {
        return json({ error: 'Unauthorized' }, 401)
      }

      let jobId = url.searchParams.get('jobId')
      if (!jobId) {
        return json({ error: 'Missing jobId parameter' }, 400)
      }

      try {
        let lambdaClient = new LambdaClient({ region: S3_REGION })
        let command = new InvokeCommand({
          FunctionName: CONVERT_LAMBDA_NAME,
          Payload: JSON.stringify({
            action: 'status',
            jobId: jobId,
          }),
        })

        let response = await lambdaClient.send(command)
        let payload = response.Payload ? JSON.parse(new TextDecoder().decode(response.Payload)) : null

        if (response.FunctionError || (payload && payload.statusCode >= 400)) {
          let errorBody = payload?.body ? JSON.parse(payload.body) : {}
          return json({ error: errorBody.error || 'Failed to get job status' }, 500)
        }

        let result = payload?.body ? JSON.parse(payload.body) : payload
        return json(result)
      } catch (error) {
        console.error('ConvertStatus error:', error)
        return json({ error: error instanceof Error ? error.message : 'Failed to get job status' }, 500)
      }
    },

    // Webhook for SNS/EventBridge MediaConvert notifications
    async convertWebhook({ request }) {
      try {
        // Handle SNS subscription confirmation
        let messageType = request.headers.get('x-amz-sns-message-type')
        if (messageType === 'SubscriptionConfirmation') {
          let body = await request.json()
          let subscribeUrl = body.SubscribeURL
          if (subscribeUrl) {
            // Confirm the subscription by visiting the URL
            await fetch(subscribeUrl)
            console.log('SNS subscription confirmed')
          }
          return new Response('OK', { status: 200 })
        }

        // Handle EventBridge event (via SNS with RawMessageDelivery)
        let body = await request.json()
        
        // EventBridge MediaConvert event structure
        let detail = body.detail
        if (detail && detail.jobId) {
          let event: JobStatusEvent = {
            jobId: detail.jobId,
            status: detail.status,
            percentComplete: detail.jobProgress?.jobPercentComplete,
            errorMessage: detail.errorMessage,
            timestamp: Date.now(),
          }
          broadcastJobStatus(event)
          console.log('MediaConvert status update:', event.jobId, event.status)
        }

        return new Response('OK', { status: 200 })
      } catch (error) {
        console.error('Webhook error:', error)
        return new Response('Error', { status: 500 })
      }
    },

    // SSE endpoint for real-time job status updates
    async convertEvents({ session, url }) {
      let user = session.get('user') as User | null
      let idToken = session.get('id_token') as string | null

      if (!user || !idToken) {
        return new Response('Unauthorized', { status: 401 })
      }

      let jobId = url.searchParams.get('jobId')
      if (!jobId) {
        return new Response('Missing jobId', { status: 400 })
      }

      // Create a TransformStream for SSE
      let { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
      let writer = writable.getWriter()

      // Register this client for updates
      if (!sseClients.has(jobId)) {
        sseClients.set(jobId, new Set())
      }
      sseClients.get(jobId)!.add(writer)

      // Send initial status if we have it cached
      let cachedStatus = jobStatusStore.get(jobId)
      if (cachedStatus) {
        let data = `data: ${JSON.stringify(cachedStatus)}\n\n`
        writer.write(new TextEncoder().encode(data)).catch(() => {})
      }

      // Clean up when client disconnects
      readable.pipeTo(new WritableStream()).catch(() => {}).finally(() => {
        let clients = sseClients.get(jobId)
        if (clients) {
          clients.delete(writer)
          if (clients.size === 0) {
            sseClients.delete(jobId)
          }
        }
      })

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    },
  },
} satisfies Controller<typeof routes.files>
