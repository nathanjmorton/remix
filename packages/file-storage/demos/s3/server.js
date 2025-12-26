/**
 * S3 Presigned URL Demo
 *
 * This demo shows how to use presigned URLs for direct client-to-S3 uploads:
 * - Simple presigned PUT URL for small files
 * - Multipart upload with presigned URLs for large files
 *
 * It always runs MinIO locally, and optionally connects to AWS S3 if env vars are set.
 *
 * ## MinIO only:
 * ```sh
 * node packages/file-storage/demos/s3/server.js
 * ```
 *
 * ## MinIO + AWS:
 * ```sh
 * AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
 *   node packages/file-storage/demos/s3/server.js
 * ```
 *
 * Then open http://localhost:44100 in your browser.
 *
 * Requires Docker for MinIO. MinIO console at http://localhost:9001 (minioadmin/minioadmin)
 */

import * as http from 'node:http'

import { createS3FileStorage } from '@remix-run/file-storage/s3'
import { createRequestListener } from '@remix-run/node-fetch-server'

import { cleanupMinio, defaultMinioConfig, setupMinio } from '../../src/lib/testing/minio.ts'

const PORT = 44100

// Storage instances
let minioStorage
let awsStorage = null

// Start MinIO
let minioAvailable = await setupMinio()
if (!minioAvailable) {
  console.error('Failed to start MinIO. Make sure Docker is running.')
  process.exit(1)
}

minioStorage = createS3FileStorage({
  bucket: defaultMinioConfig.bucketName,
  endpoint: `http://localhost:${defaultMinioConfig.port}`,
  region: 'us-east-1',
  accessKeyId: defaultMinioConfig.user,
  secretAccessKey: defaultMinioConfig.password,
  prefix: 'uploads',
})

console.log(`📦 MinIO ready: ${defaultMinioConfig.bucketName}`)
console.log(`🖥️  MinIO Console: http://localhost:${defaultMinioConfig.consolePort}`)

// Setup AWS if env vars are provided
let awsEnabled = false
let awsRegion = 'us-east-1'
let awsBucket = 'nathanjmorton-s3-test-bucket'

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  awsStorage = createS3FileStorage({
    bucket: awsBucket,
    endpoint: `https://s3.${awsRegion}.amazonaws.com`,
    region: awsRegion,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    prefix: 'uploads',
  })
  awsEnabled = true
  console.log(`☁️  AWS ready: ${awsBucket} (${awsRegion})`)
} else {
  console.log(
    '☁️  AWS not configured (set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN if using sso)',
  )
}

function html(content) {
  return new Response(content, {
    headers: { 'Content-Type': 'text/html' },
  })
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let server = http.createServer(
  createRequestListener(async (request) => {
    let url = new URL(request.url)

    // Serve the main page
    if (request.method === 'GET' && url.pathname === '/') {
      return html(`<!DOCTYPE html>
<html>
<head>
  <title>S3 Presigned PUT URL Demo</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
    .panels { display: grid; grid-template-columns: ${awsEnabled ? '1fr 1fr' : '1fr'}; gap: 2rem; }
    .panel { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; }
    .panel h2 { margin-top: 0; display: flex; align-items: center; gap: 0.5rem; }
    .panel.minio { border-color: #f6931e; }
    .panel.aws { border-color: #ff9900; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; background: #28a745; }
    .upload-box { border: 2px dashed #ccc; padding: 1.5rem; text-align: center; margin: 1rem 0; border-radius: 4px; }
    .upload-box.dragover { border-color: #007bff; background: #f0f7ff; }
    button { background: #007bff; color: white; border: none; padding: 0.5rem 1rem; cursor: pointer; border-radius: 4px; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .status { margin-top: 0.5rem; padding: 0.5rem; border-radius: 4px; font-size: 0.9rem; }
    .status.success { background: #d4edda; color: #155724; }
    .status.error { background: #f8d7da; color: #721c24; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 1rem; }
    th, td { padding: 0.4rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; }
  </style>
</head>
<body>
  <h1>S3 Presigned URL Demo</h1>
  <p>Upload files directly to S3-compatible storage using presigned URLs.</p>
  <p style="font-size: 0.85rem; color: #666;">Files ≤5MB use simple PUT. Files >5MB use multipart upload.</p>

  <div class="panels">
    <!-- MinIO Panel -->
    <div class="panel minio">
      <h2><span class="status-dot"></span> MinIO (Local)</h2>
      <p style="font-size: 0.85rem; color: #666;">Console: <a href="http://localhost:9001" target="_blank">localhost:9001</a></p>
      
      <div class="upload-box" id="minio-dropzone">
        <p>Drag & drop or select file</p>
        <input type="file" id="minio-file" />
      </div>
      <button id="minio-upload" disabled>Upload to MinIO</button>
      <div id="minio-status" class="status" style="display:none;"></div>
      
      <table>
        <thead><tr><th>Key</th><th>Size</th><th></th></tr></thead>
        <tbody id="minio-files"></tbody>
      </table>
    </div>

    ${
      awsEnabled
        ? `<!-- AWS Panel -->
    <div class="panel aws">
      <h2><span class="status-dot"></span> AWS S3</h2>
      <p style="font-size: 0.85rem; color: #666;">Bucket: ${awsBucket} (${awsRegion})</p>
      
      <div class="upload-box" id="aws-dropzone">
        <p>Drag & drop or select file</p>
        <input type="file" id="aws-file" />
      </div>
      <button id="aws-upload" disabled>Upload to AWS</button>
      <div id="aws-status" class="status" style="display:none;"></div>
      
      <table>
        <thead><tr><th>Key</th><th>Size</th><th></th></tr></thead>
        <tbody id="aws-files"></tbody>
      </table>
    </div>`
        : ''
    }
  </div>

  <script>
    let minioFile = null
    setupUploader('minio', () => minioFile, f => minioFile = f)

    ${
      awsEnabled
        ? `let awsFile = null
    setupUploader('aws', () => awsFile, f => awsFile = f)`
        : ''
    }

    function setupUploader(backend, getFile, setFile) {
      let dropzone = document.getElementById(backend + '-dropzone')
      let fileInput = document.getElementById(backend + '-file')
      let uploadBtn = document.getElementById(backend + '-upload')
      let statusEl = document.getElementById(backend + '-status')

      fileInput.onchange = e => {
        setFile(e.target.files[0])
        uploadBtn.disabled = !getFile()
      }

      dropzone.ondragover = e => { e.preventDefault(); dropzone.classList.add('dragover') }
      dropzone.ondragleave = () => dropzone.classList.remove('dragover')
      dropzone.ondrop = e => {
        e.preventDefault()
        dropzone.classList.remove('dragover')
        setFile(e.dataTransfer.files[0])
        fileInput.files = e.dataTransfer.files
        uploadBtn.disabled = !getFile()
      }

      uploadBtn.onclick = async () => {
        let file = getFile()
        if (!file) return
        uploadBtn.disabled = true
        statusEl.style.display = 'block'
        statusEl.className = 'status'
        
        let key = 'file-' + Date.now()
        let MULTIPART_THRESHOLD = 5 * 1024 * 1024 // 5MB

        try {
          if (file.size <= MULTIPART_THRESHOLD) {
            // Simple upload for small files
            statusEl.textContent = 'Getting presigned URL...'
            let res = await fetch('/api/' + backend + '/presign?key=' + encodeURIComponent(key))
            if (!res.ok) throw new Error('Failed to get presigned URL')
            let { url } = await res.json()

            statusEl.textContent = 'Uploading...'
            let uploadRes = await fetch(url, {
              method: 'PUT',
              body: file,
              headers: { 'Content-Type': file.type || 'application/octet-stream' }
            })
            if (!uploadRes.ok) throw new Error('Upload failed: ' + uploadRes.status)
          } else {
            // Multipart upload for large files
            statusEl.textContent = 'Initiating multipart upload...'
            let initRes = await fetch('/api/' + backend + '/multipart/initiate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                key,
                totalSize: file.size,
                contentType: file.type || 'application/octet-stream'
              })
            })
            if (!initRes.ok) throw new Error('Failed to initiate multipart upload')
            let { uploadId, parts } = await initRes.json()

            // Upload each part
            let completedParts = []
            let partSize = Math.ceil(file.size / parts.length)
            
            for (let i = 0; i < parts.length; i++) {
              let start = i * partSize
              let end = Math.min(start + partSize, file.size)
              let blob = file.slice(start, end)
              
              statusEl.textContent = 'Uploading part ' + (i + 1) + '/' + parts.length + '...'
              
              let uploadRes = await fetch(parts[i].url, {
                method: 'PUT',
                body: blob
              })
              if (!uploadRes.ok) throw new Error('Part ' + (i + 1) + ' upload failed: ' + uploadRes.status)
              
              let etag = uploadRes.headers.get('ETag')
              if (!etag) throw new Error('No ETag in part ' + (i + 1) + ' response')
              completedParts.push({ partNumber: parts[i].partNumber, etag })
            }

            // Complete multipart upload
            statusEl.textContent = 'Completing upload...'
            let completeRes = await fetch('/api/' + backend + '/multipart/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key, uploadId, parts: completedParts })
            })
            if (!completeRes.ok) throw new Error('Failed to complete multipart upload')
          }

          statusEl.textContent = 'Done! Key: ' + key + (file.size > MULTIPART_THRESHOLD ? ' (multipart)' : '')
          statusEl.className = 'status success'
          loadFiles(backend)
          setFile(null)
          fileInput.value = ''
          uploadBtn.disabled = true
        } catch (err) {
          statusEl.textContent = 'Error: ' + err.message
          statusEl.className = 'status error'
          uploadBtn.disabled = false
        }
      }
    }

    async function loadFiles(backend) {
      try {
        let res = await fetch('/api/' + backend + '/files')
        if (!res.ok) return
        let { files } = await res.json()
        document.getElementById(backend + '-files').innerHTML = files.map(f =>
          '<tr><td>' + f.key + '</td><td>' + (f.size ? Math.round(f.size/1024) + 'KB' : '-') + '</td>' +
          '<td><a href="/api/' + backend + '/download?key=' + encodeURIComponent(f.key) + '" target="_blank">↓</a></td></tr>'
        ).join('')
      } catch (e) { console.error(e) }
    }

    loadFiles('minio')
    ${awsEnabled ? "loadFiles('aws')" : ''}
  </script>
</body>
</html>`)
    }

    // MinIO API endpoints
    if (url.pathname.startsWith('/api/minio/')) {
      let action = url.pathname.replace('/api/minio/', '')
      return handleStorageRequest(action, url, minioStorage, request)
    }

    // AWS API endpoints
    if (url.pathname.startsWith('/api/aws/')) {
      if (!awsStorage) {
        return json(
          {
            error:
              'AWS not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optionally AWS_SESSION_TOKEN env vars.',
          },
          400,
        )
      }
      let action = url.pathname.replace('/api/aws/', '')
      return handleStorageRequest(action, url, awsStorage, request)
    }

    return new Response('Not Found', { status: 404 })
  }),
)

async function handleStorageRequest(action, url, storage, request) {
  if (action === 'presign') {
    let key = url.searchParams.get('key')
    if (!key) return json({ error: 'Missing key' }, 400)
    let presignedUrl = await storage.getSignedUrl({ key, method: 'PUT', expiresIn: 300 })
    return json({ url: presignedUrl, key })
  }

  if (action === 'files') {
    let { files } = await storage.list({ includeMetadata: true })
    return json({ files })
  }

  if (action === 'download') {
    let key = url.searchParams.get('key')
    if (!key) return json({ error: 'Missing key' }, 400)
    let presignedUrl = await storage.getSignedUrl({ key, method: 'GET', expiresIn: 60 })
    return Response.redirect(presignedUrl, 302)
  }

  // Multipart upload endpoints
  if (action === 'multipart/initiate') {
    let body = await request.json()
    let { key, totalSize, contentType } = body
    if (!key || !totalSize) return json({ error: 'Missing key or totalSize' }, 400)

    let result = await storage.initiateMultipartUpload({
      key,
      totalSize,
      contentType: contentType || 'application/octet-stream',
      expiresIn: 3600, // 1 hour
    })
    return json(result)
  }

  if (action === 'multipart/complete') {
    let body = await request.json()
    let { key, uploadId, parts } = body
    if (!key || !uploadId || !parts) return json({ error: 'Missing key, uploadId, or parts' }, 400)

    await storage.completeMultipartUpload({ key, uploadId, parts })
    return json({ success: true })
  }

  if (action === 'multipart/abort') {
    let body = await request.json()
    let { key, uploadId } = body
    if (!key || !uploadId) return json({ error: 'Missing key or uploadId' }, 400)

    await storage.abortMultipartUpload({ key, uploadId })
    return json({ success: true })
  }

  return json({ error: 'Unknown action' }, 404)
}

// Handle clean shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...')
  server.close()
  await cleanupMinio()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  server.close()
  await cleanupMinio()
  process.exit(0)
})

server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`)
})
