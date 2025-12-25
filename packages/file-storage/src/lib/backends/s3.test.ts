/**
 * S3 File Storage Tests
 *
 * These tests require Docker to be running. The test will automatically:
 * 1. Start a MinIO container (if not already running)
 * 2. Create a test bucket
 * 3. Run the tests
 *
 * Run with:
 * ```sh
 * node --disable-warning=ExperimentalWarning --test './packages/file-storage/src/lib/backends/s3.test.ts'
 * ```
 *
 * ## MinIO Console
 *
 * You can view uploaded files at http://localhost:9001
 * Login: minioadmin / minioadmin
 *
 * ## Manual Cleanup (if needed)
 *
 * ```sh
 * docker stop minio-test && docker rm minio-test
 * ```
 */

import * as assert from 'node:assert/strict'
import { exec } from 'node:child_process'
import { afterEach, after, before, describe, it } from 'node:test'
import { promisify } from 'node:util'
import { parseFormData } from '@remix-run/form-data-parser'

import { createS3FileStorage } from './s3.ts'

let execAsync = promisify(exec)

let CONTAINER_NAME = 'minio-test'
let MINIO_PORT = 9000
let MINIO_CONSOLE_PORT = 9001
let MINIO_USER = 'minioadmin'
let MINIO_PASSWORD = 'minioadmin'
let BUCKET_NAME = 'test-bucket'

async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker info')
    return true
  } catch {
    return false
  }
}

async function cleanupMinio(): Promise<void> {
  try {
    // Stop and remove our test container
    await execAsync(`docker stop ${CONTAINER_NAME} 2>/dev/null || true`)
    await execAsync(`docker rm ${CONTAINER_NAME} 2>/dev/null || true`)
    // Also clean up any container using our ports (e.g., old 'minio' container)
    let { stdout } = await execAsync(
      `docker ps --filter "publish=${MINIO_PORT}" --format '{{.Names}}' 2>/dev/null || true`,
    )
    let containers = stdout.trim().split('\n').filter(Boolean)
    for (let container of containers) {
      await execAsync(`docker stop ${container} 2>/dev/null || true`)
      await execAsync(`docker rm ${container} 2>/dev/null || true`)
    }
  } catch {
    // Ignore errors during cleanup
  }
}

async function isMinioRunning(): Promise<boolean> {
  try {
    let { stdout } = await execAsync(`docker ps --filter name=${CONTAINER_NAME} --format '{{.Names}}'`)
    return stdout.trim() === CONTAINER_NAME
  } catch {
    return false
  }
}

async function isMinioHealthy(): Promise<boolean> {
  try {
    let response = await fetch(`http://localhost:${MINIO_PORT}/minio/health/live`)
    return response.ok
  } catch {
    return false
  }
}

async function startMinio(): Promise<void> {
  // Check if container exists but is stopped
  try {
    let { stdout } = await execAsync(
      `docker ps -a --filter name=${CONTAINER_NAME} --format '{{.Names}}'`,
    )
    if (stdout.trim() === CONTAINER_NAME) {
      // Container exists, start it
      await execAsync(`docker start ${CONTAINER_NAME}`)
    } else {
      // Create new container
      await execAsync(
        `docker run -d ` +
          `--name ${CONTAINER_NAME} ` +
          `-p ${MINIO_PORT}:9000 ` +
          `-p ${MINIO_CONSOLE_PORT}:9001 ` +
          `-e MINIO_ROOT_USER=${MINIO_USER} ` +
          `-e MINIO_ROOT_PASSWORD=${MINIO_PASSWORD} ` +
          `minio/minio server /data --console-address ":9001"`,
      )
    }
  } catch (error) {
    throw new Error(`Failed to start MinIO container: ${error}`)
  }

  // Wait for MinIO to be healthy
  let attempts = 0
  let maxAttempts = 30
  while (attempts < maxAttempts) {
    if (await isMinioHealthy()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    attempts++
  }
  throw new Error('MinIO failed to become healthy')
}

async function createBucket(): Promise<void> {
  try {
    await execAsync(
      `docker exec ${CONTAINER_NAME} mc alias set local http://localhost:9000 ${MINIO_USER} ${MINIO_PASSWORD}`,
    )
    await execAsync(`docker exec ${CONTAINER_NAME} mc mb local/${BUCKET_NAME} --ignore-existing`)
  } catch (error) {
    throw new Error(`Failed to create bucket: ${error}`)
  }
}

async function setupMinio(): Promise<boolean> {
  if (!(await isDockerAvailable())) {
    console.log('⚠️  Skipping S3 tests: Docker is not available')
    return false
  }

  // Clean up any existing container first
  console.log('🧹 Cleaning up existing MinIO container...')
  await cleanupMinio()

  console.log('🚀 Starting MinIO container...')
  await startMinio()

  await createBucket()
  return true
}

describe('s3 file storage', async () => {
  let available = await setupMinio()

  if (!available) {
    return
  }

  let storage = createS3FileStorage({
    bucket: BUCKET_NAME,
    endpoint: `http://localhost:${MINIO_PORT}`,
    region: 'us-east-1',
    accessKeyId: MINIO_USER,
    secretAccessKey: MINIO_PASSWORD,
    prefix: `test-${Date.now()}`, // Use unique prefix to avoid conflicts
  })

  let keysToCleanup: string[] = []

  afterEach(async () => {
    // Clean up any files created during tests
    for (let key of keysToCleanup) {
      try {
        await storage.remove(key)
      } catch {
        // Ignore errors during cleanup
      }
    }
    keysToCleanup = []
  })

  after(async () => {
    // Clean up MinIO container after all tests
    console.log('🧹 Cleaning up MinIO container...')
    await cleanupMinio()
  })

  it('stores and retrieves files', async () => {
    let lastModified = Date.now()
    let file = new File(['Hello, world!'], 'hello.txt', {
      type: 'text/plain',
      lastModified,
    })

    keysToCleanup.push('hello')
    await storage.set('hello', file)

    assert.ok(await storage.has('hello'))

    let retrieved = await storage.get('hello')

    assert.ok(retrieved)
    assert.equal(retrieved.name, 'hello.txt')
    assert.equal(retrieved.type, 'text/plain')
    assert.equal(retrieved.lastModified, lastModified)
    assert.equal(retrieved.size, 13)

    let text = await retrieved.text()

    assert.equal(text, 'Hello, world!')

    await storage.remove('hello')
    keysToCleanup = keysToCleanup.filter((k) => k !== 'hello')

    assert.ok(!(await storage.has('hello')))
    assert.equal(await storage.get('hello'), null)
  })

  it('lists files with pagination', async () => {
    let allKeys = ['a', 'b', 'c', 'd', 'e']

    await Promise.all(
      allKeys.map((key) => {
        keysToCleanup.push(key)
        return storage.set(key, new File([`Hello ${key}!`], `hello.txt`, { type: 'text/plain' }))
      }),
    )

    let { files } = await storage.list()
    assert.equal(files.length, 5)
    assert.deepEqual(files.map((f) => f.key).sort(), allKeys)

    let { cursor: cursor2, files: files2 } = await storage.list({ limit: 2 })
    assert.equal(files2.length, 2)

    if (cursor2) {
      let { files: files3 } = await storage.list({ cursor: cursor2 })
      assert.equal(files3.length, 3)
      assert.deepEqual([...files2, ...files3].map((f) => f.key).sort(), allKeys)
    }
  })

  it('lists files by key prefix', async () => {
    let allKeys = ['prefix-a', 'prefix-b', 'other-c']

    await Promise.all(
      allKeys.map((key) => {
        keysToCleanup.push(key)
        return storage.set(key, new File([`Hello ${key}!`], `hello.txt`, { type: 'text/plain' }))
      }),
    )

    let { files } = await storage.list({ prefix: 'prefix-' })
    assert.equal(files.length, 2)
    assert.deepEqual(files.map((f) => f.key).sort(), ['prefix-a', 'prefix-b'])
  })

  it('lists files with metadata', async () => {
    let allKeys = ['meta-a', 'meta-b', 'meta-c']

    await Promise.all(
      allKeys.map((key) => {
        keysToCleanup.push(key)
        return storage.set(key, new File([`Hello ${key}!`], `hello.txt`, { type: 'text/plain' }))
      }),
    )

    let { files } = await storage.list({ includeMetadata: true })
    assert.ok(files.length >= 3)

    let metaFiles = files.filter((f) => f.key.startsWith('meta-'))
    assert.equal(metaFiles.length, 3)
    metaFiles.forEach((f) => assert.ok('lastModified' in f))
    metaFiles.forEach((f) => assert.ok('name' in f))
    metaFiles.forEach((f) => assert.ok('size' in f))
    metaFiles.forEach((f) => assert.ok('type' in f))
  })

  it('puts files and returns the stored file', async () => {
    let lastModified = Date.now()
    let file = new File(['Hello, world!'], 'hello.txt', {
      type: 'text/plain',
      lastModified,
    })

    keysToCleanup.push('put-test')
    let retrieved = await storage.put('put-test', file)

    assert.ok(await storage.has('put-test'))
    assert.ok(retrieved)
    assert.equal(retrieved.name, 'hello.txt')
    assert.equal(retrieved.type, 'text/plain')
    assert.equal(retrieved.lastModified, lastModified)
  })

  it('returns null for non-existent keys', async () => {
    let result = await storage.get('non-existent-key-12345')
    assert.equal(result, null)
  })

  it('returns false for has() on non-existent keys', async () => {
    let result = await storage.has('non-existent-key-12345')
    assert.equal(result, false)
  })

  it('handles remove() on non-existent keys gracefully', async () => {
    // Should not throw
    await storage.remove('non-existent-key-12345')
  })

  describe('integration with form-data-parser', () => {
    it('stores and lists file uploads', async () => {
      let boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
      let request = new Request('http://example.com', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: [
          `--${boundary}`,
          'Content-Disposition: form-data; name=\"upload\"; filename=\"upload.txt\"',
          'Content-Type: text/plain',
          '',
          'Hello from form upload!',
          `--${boundary}--`,
        ].join('\r\n'),
      })

      keysToCleanup.push('form-upload')

      await parseFormData(request, async (file) => {
        await storage.set('form-upload', file)
      })

      assert.ok(await storage.has('form-upload'))

      let { files } = await storage.list({ prefix: 'form-upload', includeMetadata: true })

      assert.equal(files.length, 1)
      assert.equal(files[0].key, 'form-upload')
      assert.equal(files[0].name, 'upload.txt')
      assert.equal(files[0].size, 23)
      assert.equal(files[0].type, 'text/plain')
      assert.ok(files[0].lastModified)
    })
  })

  describe('presigned URLs', () => {
    it('generates presigned GET URL for downloading', async () => {
      let file = new File(['Presigned download content'], 'presigned.txt', { type: 'text/plain' })

      keysToCleanup.push('presign-get')
      await storage.set('presign-get', file)

      let url = await storage.getSignedUrl({ key: 'presign-get', method: 'GET' })

      // URL should be usable without additional auth
      let response = await fetch(url)
      assert.ok(response.ok, `Expected OK response, got ${response.status}`)
      assert.equal(await response.text(), 'Presigned download content')
    })

    it('generates presigned PUT URL for uploading', async () => {
      keysToCleanup.push('presign-put')

      let url = await storage.getSignedUrl({ key: 'presign-put', method: 'PUT', expiresIn: 300 })

      // Direct upload without SDK credentials
      let response = await fetch(url, {
        method: 'PUT',
        body: 'Uploaded via presigned URL',
        headers: {
          'Content-Type': 'text/plain',
        },
      })
      assert.ok(response.ok, `Expected OK response, got ${response.status}`)

      // Verify it was stored
      let retrieved = await storage.get('presign-put')
      assert.ok(retrieved)
      assert.equal(await retrieved.text(), 'Uploaded via presigned URL')
    })

    it('includes required query parameters in presigned URL', async () => {
      let url = await storage.getSignedUrl({ key: 'test-params', method: 'GET', expiresIn: 600 })
      let parsed = new URL(url)

      assert.ok(parsed.searchParams.has('X-Amz-Algorithm'))
      assert.ok(parsed.searchParams.has('X-Amz-Credential'))
      assert.ok(parsed.searchParams.has('X-Amz-Date'))
      assert.ok(parsed.searchParams.has('X-Amz-Expires'))
      assert.ok(parsed.searchParams.has('X-Amz-SignedHeaders'))
      assert.ok(parsed.searchParams.has('X-Amz-Signature'))
      assert.equal(parsed.searchParams.get('X-Amz-Expires'), '600')
    })

    it('defaults to GET method and 1 hour expiration', async () => {
      let url = await storage.getSignedUrl({ key: 'test-defaults' })
      let parsed = new URL(url)

      assert.equal(parsed.searchParams.get('X-Amz-Expires'), '3600')
    })

    it('clamps expiration to valid range', async () => {
      // Test max clamping (7 days = 604800 seconds)
      let urlMax = await storage.getSignedUrl({ key: 'test', expiresIn: 1000000 })
      let parsedMax = new URL(urlMax)
      assert.equal(parsedMax.searchParams.get('X-Amz-Expires'), '604800')

      // Test min clamping (1 second)
      let urlMin = await storage.getSignedUrl({ key: 'test', expiresIn: 0 })
      let parsedMin = new URL(urlMin)
      assert.equal(parsedMin.searchParams.get('X-Amz-Expires'), '1')
    })
  })
})

describe('presigned URLs with session token', () => {
  it('includes X-Amz-Security-Token in presigned URL when session token is configured', async () => {
    let storageWithToken = createS3FileStorage({
      bucket: 'test-bucket',
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      sessionToken: 'FwoGZXIvYXdzEBYaDK...',
    })

    let url = await storageWithToken.getSignedUrl({ key: 'test-file', method: 'GET' })
    let parsed = new URL(url)

    assert.ok(parsed.searchParams.has('X-Amz-Security-Token'))
    assert.equal(parsed.searchParams.get('X-Amz-Security-Token'), 'FwoGZXIvYXdzEBYaDK...')
  })

  it('does not include X-Amz-Security-Token when session token is not configured', async () => {
    let storageWithoutToken = createS3FileStorage({
      bucket: 'test-bucket',
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    })

    let url = await storageWithoutToken.getSignedUrl({ key: 'test-file', method: 'GET' })
    let parsed = new URL(url)

    assert.ok(!parsed.searchParams.has('X-Amz-Security-Token'))
  })
})
