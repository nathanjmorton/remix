/**
 * S3 Presigned PUT URL Demo
 *
 * This demo shows how to use presigned PUT URLs for direct client-to-S3 uploads.
 * It uses MinIO as a local S3-compatible server.
 *
 * Run with:
 * ```sh
 * npx tsx packages/file-storage/demos/s3/presigned-put-url.ts
 * ```
 *
 * Then open http://localhost:44100 in your browser.
 *
 * ## How it works:
 * 1. User selects a file in the browser
 * 2. Browser requests a presigned PUT URL from the server
 * 3. Server generates the presigned URL using S3FileStorage.getSignedUrl()
 * 4. Browser uploads the file directly to MinIO using the presigned URL
 * 5. Server can later access the file using the storage key
 *
 * ## MinIO Console
 *
 * You can view uploaded files at http://localhost:9001
 * Login: minioadmin / minioadmin
 */

import * as http from 'node:http'

import { createS3FileStorage } from '@remix-run/file-storage/s3'
import { createRequestListener } from '@remix-run/node-fetch-server'

import { cleanupMinio, defaultMinioConfig, setupMinio } from '../../src/lib/testing/minio.ts'

const PORT = 44100

let storage = createS3FileStorage({
  bucket: defaultMinioConfig.bucketName,
  endpoint: `http://localhost:${defaultMinioConfig.port}`,
  region: 'us-east-1',
  accessKeyId: defaultMinioConfig.user,
  secretAccessKey: defaultMinioConfig.password,
  prefix: 'uploads',
})

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

    // Serve the upload form
    if (request.method === 'GET' && url.pathname === '/') {
      return html(`<!DOCTYPE html>
<html>
  <head>
    <title>S3 Presigned PUT URL Demo</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
      .upload-box { border: 2px dashed #ccc; padding: 2rem; text-align: center; margin: 1rem 0; }
      .upload-box.dragover { border-color: #007bff; background: #f0f7ff; }
      button { background: #007bff; color: white; border: none; padding: 0.5rem 1rem; cursor: pointer; }
      button:disabled { background: #ccc; }
      #status { margin-top: 1rem; padding: 1rem; border-radius: 4px; }
      #status.success { background: #d4edda; color: #155724; }
      #status.error { background: #f8d7da; color: #721c24; }
      #files { margin-top: 2rem; }
      #files table { width: 100%; border-collapse: collapse; }
      #files th, #files td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #ddd; }
    </style>
  </head>
  <body>
    <h1>S3 Presigned PUT URL Demo</h1>
    <p>Upload files directly to S3 (MinIO) using presigned PUT URLs.</p>

    <div class="upload-box" id="dropzone">
      <p>Drag and drop a file here, or:</p>
      <input type="file" id="fileInput" />
    </div>

    <button id="uploadBtn" disabled>Upload to S3</button>
    <div id="status"></div>

    <div id="files">
      <h2>Uploaded Files</h2>
      <table>
        <thead><tr><th>Key</th><th>Name</th><th>Size</th><th>Actions</th></tr></thead>
        <tbody id="fileList"></tbody>
      </table>
    </div>

    <script>
      let selectedFile = null
      let fileInput = document.getElementById('fileInput')
      let uploadBtn = document.getElementById('uploadBtn')
      let status = document.getElementById('status')
      let dropzone = document.getElementById('dropzone')
      let fileList = document.getElementById('fileList')

      // Load existing files
      loadFiles()

      fileInput.addEventListener('change', (e) => {
        selectedFile = e.target.files[0]
        uploadBtn.disabled = !selectedFile
      })

      // Drag and drop
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault()
        dropzone.classList.add('dragover')
      })
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover')
      })
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault()
        dropzone.classList.remove('dragover')
        selectedFile = e.dataTransfer.files[0]
        fileInput.files = e.dataTransfer.files
        uploadBtn.disabled = !selectedFile
      })

      uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) return

        uploadBtn.disabled = true
        status.textContent = 'Getting presigned URL...'
        status.className = ''

        try {
          // Step 1: Get presigned PUT URL from server
          let key = 'file-' + Date.now()
          let res = await fetch('/presign?key=' + encodeURIComponent(key) + '&filename=' + encodeURIComponent(selectedFile.name) + '&contentType=' + encodeURIComponent(selectedFile.type))
          if (!res.ok) throw new Error('Failed to get presigned URL')
          let { url } = await res.json()

          status.textContent = 'Uploading to S3...'

          // Step 2: Upload directly to S3 using presigned URL
          let uploadRes = await fetch(url, {
            method: 'PUT',
            body: selectedFile,
            headers: {
              'Content-Type': selectedFile.type || 'application/octet-stream',
            },
          })

          if (!uploadRes.ok) throw new Error('Upload failed: ' + uploadRes.status)

          status.textContent = 'Upload complete! File key: ' + key
          status.className = 'success'

          // Refresh file list
          loadFiles()

          // Reset
          selectedFile = null
          fileInput.value = ''
          uploadBtn.disabled = true
        } catch (err) {
          status.textContent = 'Error: ' + err.message
          status.className = 'error'
          uploadBtn.disabled = false
        }
      })

      async function loadFiles() {
        try {
          let res = await fetch('/files')
          let { files } = await res.json()
          fileList.innerHTML = files.map(f =>
            '<tr>' +
              '<td>' + f.key + '</td>' +
              '<td>' + (f.name || '-') + '</td>' +
              '<td>' + (f.size ? Math.round(f.size / 1024) + ' KB' : '-') + '</td>' +
              '<td><a href="/download?key=' + encodeURIComponent(f.key) + '" target="_blank">Download</a></td>' +
            '</tr>'
          ).join('')
        } catch (err) {
          console.error('Failed to load files:', err)
        }
      }
    </script>
  </body>
</html>`)
    }

    // Generate presigned PUT URL
    if (request.method === 'GET' && url.pathname === '/presign') {
      let key = url.searchParams.get('key')
      if (!key) {
        return json({ error: 'Missing key parameter' }, 400)
      }

      let presignedUrl = await storage.getSignedUrl({
        key,
        method: 'PUT',
        expiresIn: 300, // 5 minutes
      })

      return json({ url: presignedUrl, key })
    }

    // List files
    if (request.method === 'GET' && url.pathname === '/files') {
      let { files } = await storage.list({ includeMetadata: true })
      return json({ files })
    }

    // Download file using presigned GET URL
    if (request.method === 'GET' && url.pathname === '/download') {
      let key = url.searchParams.get('key')
      if (!key) {
        return json({ error: 'Missing key parameter' }, 400)
      }

      let presignedUrl = await storage.getSignedUrl({
        key,
        method: 'GET',
        expiresIn: 60,
      })

      return Response.redirect(presignedUrl, 302)
    }

    return new Response('Not Found', { status: 404 })
  }),
)

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

// Start MinIO and server
let available = await setupMinio()
if (!available) {
  console.error('Failed to start MinIO. Make sure Docker is running.')
  process.exit(1)
}

console.log('✅ MinIO is ready')
console.log(`📦 Bucket: ${defaultMinioConfig.bucketName}`)
console.log(`🖥️  MinIO Console: http://localhost:${defaultMinioConfig.consolePort}`)

server.listen(PORT, () => {
  console.log(`\n🚀 Server listening on http://localhost:${PORT}`)
})
