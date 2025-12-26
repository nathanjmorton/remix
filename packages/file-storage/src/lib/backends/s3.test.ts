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
import { afterEach, after, describe, it } from 'node:test'
import { parseFormData } from '@remix-run/form-data-parser'

import { createS3FileStorage } from './s3.ts'
import { cleanupMinio, defaultMinioConfig, setupMinio } from '../testing/minio.ts'

describe('s3 file storage', async () => {
  let available = await setupMinio()

  if (!available) {
    return
  }

  let storage = createS3FileStorage({
    bucket: defaultMinioConfig.bucketName,
    endpoint: `http://localhost:${defaultMinioConfig.port}`,
    region: 'us-east-1',
    accessKeyId: defaultMinioConfig.user,
    secretAccessKey: defaultMinioConfig.password,
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

  describe('multipart upload', () => {
    it('initiates multipart upload and returns presigned URLs for parts', async () => {
      let totalSize = 15 * 1024 * 1024 // 15MB - will be 3 parts at 5MB each
      let partSize = 5 * 1024 * 1024 // 5MB

      let result = await storage.initiateMultipartUpload({
        key: 'multipart-test',
        totalSize,
        partSize,
        contentType: 'application/octet-stream',
      })

      assert.ok(result.uploadId, 'Should have uploadId')
      assert.equal(result.key, 'multipart-test')
      assert.equal(result.parts.length, 3, 'Should have 3 parts')

      // Each part should have correct structure
      result.parts.forEach((part, index) => {
        assert.equal(part.partNumber, index + 1, `Part ${index + 1} should have correct partNumber`)
        assert.ok(part.url, `Part ${index + 1} should have URL`)

        // Verify URL has required query params
        let parsed = new URL(part.url)
        assert.ok(parsed.searchParams.has('partNumber'))
        assert.ok(parsed.searchParams.has('uploadId'))
        assert.ok(parsed.searchParams.has('X-Amz-Signature'))
        assert.equal(parsed.searchParams.get('partNumber'), String(index + 1))
        assert.equal(parsed.searchParams.get('uploadId'), result.uploadId)
      })

      // Clean up: abort the multipart upload
      await storage.abortMultipartUpload({ key: 'multipart-test', uploadId: result.uploadId })
    })

    it('completes multipart upload with uploaded parts', async () => {
      let partSize = 5 * 1024 * 1024 // 5MB minimum
      let part1Content = 'A'.repeat(partSize)
      let part2Content = 'B'.repeat(1024) // Small second part
      let totalSize = part1Content.length + part2Content.length

      keysToCleanup.push('multipart-complete')

      // Initiate multipart upload
      let { uploadId, parts } = await storage.initiateMultipartUpload({
        key: 'multipart-complete',
        totalSize,
        partSize,
        contentType: 'text/plain',
      })

      assert.equal(parts.length, 2, 'Should have 2 parts')

      // Upload parts via presigned URLs and collect ETags
      let completedParts: Array<{ partNumber: number; etag: string }> = []

      // Upload part 1
      let res1 = await fetch(parts[0].url, {
        method: 'PUT',
        body: part1Content,
      })
      assert.ok(res1.ok, `Part 1 upload failed: ${res1.status}`)
      let etag1 = res1.headers.get('ETag')
      assert.ok(etag1, 'Part 1 should have ETag')
      completedParts.push({ partNumber: 1, etag: etag1 })

      // Upload part 2
      let res2 = await fetch(parts[1].url, {
        method: 'PUT',
        body: part2Content,
      })
      assert.ok(res2.ok, `Part 2 upload failed: ${res2.status}`)
      let etag2 = res2.headers.get('ETag')
      assert.ok(etag2, 'Part 2 should have ETag')
      completedParts.push({ partNumber: 2, etag: etag2 })

      // Complete multipart upload
      await storage.completeMultipartUpload({
        key: 'multipart-complete',
        uploadId,
        parts: completedParts,
      })

      // Verify the file exists and has correct content
      let retrieved = await storage.get('multipart-complete')
      assert.ok(retrieved, 'File should exist after multipart upload')

      let content = await retrieved.text()
      assert.equal(content, part1Content + part2Content, 'Content should match uploaded parts')
    })

    it('aborts multipart upload and cleans up parts', async () => {
      let totalSize = 10 * 1024 * 1024 // 10MB
      let partSize = 5 * 1024 * 1024 // 5MB

      // Initiate multipart upload
      let { uploadId, parts } = await storage.initiateMultipartUpload({
        key: 'multipart-abort',
        totalSize,
        partSize,
      })

      // Upload one part
      let partContent = 'X'.repeat(partSize)
      let res = await fetch(parts[0].url, {
        method: 'PUT',
        body: partContent,
      })
      assert.ok(res.ok, 'Part upload should succeed')

      // Abort the upload
      await storage.abortMultipartUpload({ key: 'multipart-abort', uploadId })

      // File should not exist
      let exists = await storage.has('multipart-abort')
      assert.equal(exists, false, 'File should not exist after abort')
    })

    it('clamps partSize to minimum 5MB', async () => {
      let result = await storage.initiateMultipartUpload({
        key: 'multipart-small-part',
        totalSize: 10 * 1024 * 1024, // 10MB
        partSize: 1024, // 1KB - way too small
      })

      // Should be clamped to 5MB, resulting in 2 parts
      assert.equal(result.parts.length, 2, 'Should have 2 parts (10MB / 5MB)')

      await storage.abortMultipartUpload({ key: 'multipart-small-part', uploadId: result.uploadId })
    })

    it('throws error for files requiring more than 10000 parts', async () => {
      // 5MB parts * 10001 parts = ~50TB
      let totalSize = 5 * 1024 * 1024 * 10001
      let partSize = 5 * 1024 * 1024

      await assert.rejects(
        async () => {
          await storage.initiateMultipartUpload({
            key: 'too-many-parts',
            totalSize,
            partSize,
          })
        },
        /maximum is 10,000/,
      )
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
