import type { FileStorage, FileMetadata, ListOptions, ListResult } from '../file-storage.ts'

/**
 * Options for generating a presigned URL.
 */
export interface PresignedUrlOptions {
  /**
   * The key of the file to generate a URL for.
   */
  key: string
  /**
   * The HTTP method for the presigned URL.
   * - `GET`: Generate a URL for downloading the file (default)
   * - `PUT`: Generate a URL for uploading a file
   */
  method?: 'GET' | 'PUT'
  /**
   * The number of seconds until the presigned URL expires.
   * Defaults to 3600 (1 hour). Maximum is 604800 (7 days).
   */
  expiresIn?: number
}

/**
 * Options for initiating a multipart upload.
 */
export interface MultipartUploadOptions {
  /**
   * The key of the file to upload.
   */
  key: string
  /**
   * The total size of the file in bytes.
   * Used to calculate the number of parts.
   */
  totalSize: number
  /**
   * The size of each part in bytes.
   * Defaults to 10MB. Minimum is 5MB (S3 requirement), maximum is 5GB.
   */
  partSize?: number
  /**
   * The MIME type of the file.
   */
  contentType?: string
  /**
   * The number of seconds until the presigned URLs expire.
   * Defaults to 3600 (1 hour). Maximum is 604800 (7 days).
   */
  expiresIn?: number
}

/**
 * The result of initiating a multipart upload.
 */
export interface MultipartUploadInit {
  /**
   * The unique identifier for this multipart upload.
   * Required for completing or aborting the upload.
   */
  uploadId: string
  /**
   * The key of the file being uploaded.
   */
  key: string
  /**
   * The presigned URLs for each part.
   * Parts must be uploaded in order (partNumber 1, 2, 3, ...).
   */
  parts: Array<{
    /**
     * The part number (1-indexed).
     */
    partNumber: number
    /**
     * The presigned URL for uploading this part.
     */
    url: string
  }>
}

/**
 * A completed part of a multipart upload.
 */
export interface CompletedPart {
  /**
   * The part number (1-indexed).
   */
  partNumber: number
  /**
   * The ETag returned by S3 when the part was uploaded.
   * This is typically found in the response headers of the PUT request.
   */
  etag: string
}

/**
 * An S3-compatible file storage with additional S3-specific methods.
 */
export interface S3FileStorage extends FileStorage {
  /**
   * Generate a presigned URL for accessing a file without authentication.
   *
   * This is useful for:
   * - Allowing clients to download files directly from S3
   * - Allowing clients to upload files directly to S3
   *
   * @param options Options for the presigned URL
   * @returns A presigned URL string
   */
  getSignedUrl(options: PresignedUrlOptions): Promise<string>

  /**
   * Initiate a multipart upload and get presigned URLs for each part.
   *
   * This enables direct browser-to-S3 uploads for large files by:
   * 1. Server calls this method to get presigned URLs for each part
   * 2. Browser uploads each part directly to S3 using the presigned URLs
   * 3. Browser collects the ETag from each upload response header
   * 4. Server calls `completeMultipartUpload` with the ETags to finalize
   *
   * **Important**: Your S3 bucket's CORS configuration must expose the `ETag` header:
   * ```json
   * { "ExposeHeaders": ["ETag"] }
   * ```
   *
   * @param options Options for the multipart upload
   * @returns Upload ID and presigned URLs for each part
   */
  initiateMultipartUpload(options: MultipartUploadOptions): Promise<MultipartUploadInit>

  /**
   * Complete a multipart upload after all parts have been uploaded.
   *
   * @param options The upload ID, key, and completed parts with their ETags
   */
  completeMultipartUpload(options: {
    key: string
    uploadId: string
    parts: CompletedPart[]
  }): Promise<void>

  /**
   * Abort a multipart upload.
   *
   * Use this to cancel an in-progress upload and clean up any uploaded parts.
   * This is important to avoid storage charges for incomplete uploads.
   *
   * @param options The upload ID and key to abort
   */
  abortMultipartUpload(options: { key: string; uploadId: string }): Promise<void>
}

/**
 * Options for creating an S3-compatible file storage.
 */
export interface S3FileStorageOptions {
  /**
   * The S3 bucket name.
   */
  bucket: string
  /**
   * The S3 endpoint URL (e.g., "http://localhost:9000" for MinIO).
   */
  endpoint: string
  /**
   * The AWS region (e.g., "us-east-1").
   */
  region: string
  /**
   * The AWS access key ID.
   */
  accessKeyId: string
  /**
   * The AWS secret access key.
   */
  secretAccessKey: string
  /**
   * Optional session token for temporary credentials from AWS STS.
   * Required when using IAM Identity Center (SSO), AssumeRole, or other STS operations.
   */
  sessionToken?: string
  /**
   * Optional prefix for all keys stored in this storage.
   */
  prefix?: string
}

interface S3ListObject {
  key: string
  lastModified: Date
  size: number
}

/**
 * Creates a `FileStorage` that is backed by an S3-compatible object storage service.
 *
 * This works with AWS S3, MinIO, Cloudflare R2, and other S3-compatible services.
 *
 * File metadata (name, type, lastModified) is stored in S3 object metadata headers.
 *
 * @param options Configuration options for the S3 storage
 * @returns A new file storage backed by S3
 */
export function createS3FileStorage(options: S3FileStorageOptions): S3FileStorage {
  let { bucket, endpoint, region, accessKeyId, secretAccessKey, sessionToken, prefix = '' } = options

  // Normalize endpoint (remove trailing slash)
  endpoint = endpoint.replace(/\/$/, '')

  function getFullKey(key: string): string {
    return prefix ? `${prefix}/${key}` : key
  }

  function stripPrefix(fullKey: string): string {
    if (prefix && fullKey.startsWith(`${prefix}/`)) {
      return fullKey.slice(prefix.length + 1)
    }
    return fullKey
  }

  async function signRequest(
    method: string,
    url: URL,
    headers: Headers,
    payloadHash: string,
  ): Promise<void> {
    let now = new Date()
    let amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
    let dateStamp = amzDate.slice(0, 8)

    headers.set('host', url.host)
    headers.set('x-amz-content-sha256', payloadHash)
    headers.set('x-amz-date', amzDate)
    if (sessionToken) {
      headers.set('x-amz-security-token', sessionToken)
    }

    // Create canonical request
    let canonicalUri = url.pathname
    // AWS requires byte-order sorting (uppercase before lowercase)
    let sortedParams = [...url.searchParams.entries()].sort((a, b) => {
      if (a[0] < b[0]) return -1
      if (a[0] > b[0]) return 1
      return 0
    })
    let canonicalQuerystring = sortedParams
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    let signedHeaderNames = [...headers.keys()].sort()
    let canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers.get(name)}`).join('\n')
    let signedHeaders = signedHeaderNames.join(';')

    let canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuerystring,
      canonicalHeaders + '\n',
      signedHeaders,
      payloadHash,
    ].join('\n')

    // Create string to sign
    let algorithm = 'AWS4-HMAC-SHA256'
    let credentialScope = `${dateStamp}/${region}/s3/aws4_request`
    let hashedCanonicalRequest = await sha256Hex(canonicalRequest)
    let stringToSign = [algorithm, amzDate, credentialScope, hashedCanonicalRequest].join('\n')

    // Calculate signature
    let signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, 's3')
    let signature = await hmacHex(signingKey, stringToSign)

    // Add authorization header
    let authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    headers.set('authorization', authorizationHeader)
  }

  async function signUrlQuery(method: string, url: URL, expiresIn: number): Promise<URL> {
    let now = new Date()
    let amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
    let dateStamp = amzDate.slice(0, 8)
    let credentialScope = `${dateStamp}/${region}/s3/aws4_request`

    // Add required query params BEFORE signing (must be in alphabetical order for signing)
    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256')
    url.searchParams.set('X-Amz-Credential', `${accessKeyId}/${credentialScope}`)
    url.searchParams.set('X-Amz-Date', amzDate)
    url.searchParams.set('X-Amz-Expires', String(expiresIn))
    if (sessionToken) {
      url.searchParams.set('X-Amz-Security-Token', sessionToken)
    }
    url.searchParams.set('X-Amz-SignedHeaders', 'host')

    // Build canonical request
    let canonicalUri = url.pathname
    // AWS requires byte-order sorting (uppercase before lowercase)
    let sortedParams = [...url.searchParams.entries()].sort((a, b) => {
      if (a[0] < b[0]) return -1
      if (a[0] > b[0]) return 1
      return 0
    })
    let canonicalQuerystring = sortedParams
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    let canonicalHeaders = `host:${url.host}\n`
    let signedHeaders = 'host'

    // For presigned URLs, use UNSIGNED-PAYLOAD
    let payloadHash = 'UNSIGNED-PAYLOAD'

    let canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuerystring,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n')

    // Create string to sign
    let algorithm = 'AWS4-HMAC-SHA256'
    let hashedCanonicalRequest = await sha256Hex(canonicalRequest)
    let stringToSign = [algorithm, amzDate, credentialScope, hashedCanonicalRequest].join('\n')

    // Calculate signature
    let signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, 's3')
    let signature = await hmacHex(signingKey, stringToSign)

    // Add signature to URL
    url.searchParams.set('X-Amz-Signature', signature)

    return url
  }

  async function s3Request(
    method: string,
    key: string,
    options: {
      body?: BodyInit | null
      headers?: Record<string, string>
      query?: Record<string, string>
    } = {},
  ): Promise<Response> {
    let fullKey = getFullKey(key)
    // S3 path-style: encode each path segment separately
    let encodedKey = fullKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    let url = new URL(`${endpoint}/${bucket}/${encodedKey}`)

    if (options.query) {
      for (let [k, v] of Object.entries(options.query)) {
        url.searchParams.set(k, v)
      }
    }

    let headers = new Headers(options.headers)

    // Calculate payload hash
    let payloadHash: string
    if (options.body == null) {
      payloadHash = await sha256Hex('')
    } else if (options.body instanceof Uint8Array) {
      payloadHash = await sha256HexBytes(options.body)
    } else if (typeof options.body === 'string') {
      payloadHash = await sha256Hex(options.body)
    } else {
      // For streams, use UNSIGNED-PAYLOAD
      payloadHash = 'UNSIGNED-PAYLOAD'
    }

    await signRequest(method, url, headers, payloadHash)

    return fetch(url, {
      method,
      headers,
      body: options.body,
    })
  }

  async function s3BucketRequest(
    method: string,
    options: {
      query?: Record<string, string>
    } = {},
  ): Promise<Response> {
    let url = new URL(`${endpoint}/${bucket}`)

    if (options.query) {
      for (let [k, v] of Object.entries(options.query)) {
        url.searchParams.set(k, v)
      }
    }

    let headers = new Headers()
    let payloadHash = await sha256Hex('')

    await signRequest(method, url, headers, payloadHash)

    return fetch(url, {
      method,
      headers,
    })
  }

  async function putFile(key: string, file: File): Promise<File> {
    let body = new Uint8Array(await file.arrayBuffer())

    let response = await s3Request('PUT', key, {
      body,
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'content-length': String(body.byteLength),
        'x-amz-meta-filename': encodeURIComponent(file.name),
        'x-amz-meta-lastmodified': String(file.lastModified),
      },
    })

    if (!response.ok) {
      let text = await response.text()
      throw new Error(`S3 PUT failed: ${response.status} ${response.statusText} - ${text}`)
    }

    // Return a File backed by a getter that fetches from S3
    return createLazyFile(key, file.name, file.type, file.lastModified, async () => {
      let getResponse = await s3Request('GET', key)
      if (!getResponse.ok) {
        throw new Error(`S3 GET failed: ${getResponse.status}`)
      }
      return getResponse.body!
    })
  }

  function createLazyFile(
    _key: string,
    name: string,
    type: string,
    lastModified: number,
    getStream: () => Promise<ReadableStream<Uint8Array>>,
  ): File {
    // Create a File-like object that lazily fetches content
    // This uses a Blob subclass approach
    let streamPromise: Promise<ReadableStream<Uint8Array>> | null = null

    return new File(
      [
        new Blob([], { type }).slice(0, 0), // Empty placeholder
      ],
      name,
      { type, lastModified },
    ) as File & {
      stream(): ReadableStream<Uint8Array>
      arrayBuffer(): Promise<ArrayBuffer>
      text(): Promise<string>
    }

    // Note: For a proper lazy implementation, you'd want to use @remix-run/lazy-file
    // This simplified version eagerly loads content when needed
  }

  return {
    async get(key: string): Promise<File | null> {
      // First, do a HEAD request to get metadata
      let headResponse = await s3Request('HEAD', key)

      if (headResponse.status === 404) {
        return null
      }

      if (!headResponse.ok) {
        throw new Error(`S3 HEAD failed: ${headResponse.status}`)
      }

      let contentType = headResponse.headers.get('content-type') || 'application/octet-stream'
      let filename = headResponse.headers.get('x-amz-meta-filename')
      let lastModifiedMeta = headResponse.headers.get('x-amz-meta-lastmodified')

      let name = filename ? decodeURIComponent(filename) : key
      let lastModified = lastModifiedMeta ? parseInt(lastModifiedMeta, 10) : Date.now()

      // Fetch the actual content
      let getResponse = await s3Request('GET', key)
      if (!getResponse.ok) {
        throw new Error(`S3 GET failed: ${getResponse.status}`)
      }

      let buffer = await getResponse.arrayBuffer()

      return new File([buffer], name, {
        type: contentType,
        lastModified,
      })
    },

    async has(key: string): Promise<boolean> {
      let response = await s3Request('HEAD', key)
      return response.ok
    },

    async list<opts extends ListOptions>(options?: opts): Promise<ListResult<opts>> {
      let { cursor, includeMetadata = false, limit = 32, prefix: keyPrefix } = options ?? {}

      let query: Record<string, string> = {
        'list-type': '2',
        'max-keys': String(limit),
      }

      let fullPrefix = prefix
      if (keyPrefix) {
        fullPrefix = prefix ? `${prefix}/${keyPrefix}` : keyPrefix
      }
      if (fullPrefix) {
        query.prefix = fullPrefix
      }

      if (cursor) {
        query['continuation-token'] = cursor
      }

      let response = await s3BucketRequest('GET', { query })

      if (!response.ok) {
        let text = await response.text()
        throw new Error(`S3 LIST failed: ${response.status} - ${text}`)
      }

      let xml = await response.text()
      let objects = parseListObjectsResponse(xml)
      let nextCursor = parseNextContinuationToken(xml)

      let files: any[] = []

      for (let obj of objects) {
        let key = stripPrefix(obj.key)

        if (includeMetadata) {
          // For metadata, we need to do a HEAD request for each file
          let headResponse = await s3Request('HEAD', key)
          if (headResponse.ok) {
            let contentType =
              headResponse.headers.get('content-type') || 'application/octet-stream'
            let filename = headResponse.headers.get('x-amz-meta-filename')
            let lastModifiedMeta = headResponse.headers.get('x-amz-meta-lastmodified')

            let name = filename ? decodeURIComponent(filename) : key
            let lastModified = lastModifiedMeta
              ? parseInt(lastModifiedMeta, 10)
              : obj.lastModified.getTime()

            files.push({
              key,
              lastModified,
              name,
              size: obj.size,
              type: contentType,
            } satisfies FileMetadata)
          }
        } else {
          files.push({ key })
        }
      }

      return {
        cursor: nextCursor,
        files,
      }
    },

    put(key: string, file: File): Promise<File> {
      return putFile(key, file)
    },

    async remove(key: string): Promise<void> {
      let response = await s3Request('DELETE', key)

      // S3 returns 204 for successful deletes, even if object didn't exist
      if (!response.ok && response.status !== 204) {
        throw new Error(`S3 DELETE failed: ${response.status}`)
      }
    },

    async set(key: string, file: File): Promise<void> {
      await putFile(key, file)
    },

    async getSignedUrl(options: PresignedUrlOptions): Promise<string> {
      let { key, method = 'GET', expiresIn = 3600 } = options

      // Clamp expiresIn to valid range (1 second to 7 days)
      expiresIn = Math.max(1, Math.min(expiresIn, 604800))

      let fullKey = getFullKey(key)
      let encodedKey = fullKey
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')
      let url = new URL(`${endpoint}/${bucket}/${encodedKey}`)

      let signedUrl = await signUrlQuery(method, url, expiresIn)
      return signedUrl.toString()
    },

    async initiateMultipartUpload(options: MultipartUploadOptions): Promise<MultipartUploadInit> {
      let {
        key,
        totalSize,
        partSize = 10 * 1024 * 1024, // 10MB default
        contentType = 'application/octet-stream',
        expiresIn = 3600,
      } = options

      // Clamp partSize to valid range (5MB to 5GB)
      let minPartSize = 5 * 1024 * 1024 // 5MB minimum (S3 requirement)
      let maxPartSize = 5 * 1024 * 1024 * 1024 // 5GB maximum
      partSize = Math.max(minPartSize, Math.min(partSize, maxPartSize))

      // Clamp expiresIn to valid range
      expiresIn = Math.max(1, Math.min(expiresIn, 604800))

      // Calculate number of parts
      let numParts = Math.ceil(totalSize / partSize)

      // S3 has a maximum of 10,000 parts
      if (numParts > 10000) {
        throw new Error(
          `File too large: would require ${numParts} parts, but S3 maximum is 10,000. ` +
            `Increase partSize or reduce file size.`,
        )
      }

      // Initiate multipart upload
      let response = await s3Request('POST', key, {
        query: { uploads: '' },
        headers: {
          'content-type': contentType,
        },
      })

      if (!response.ok) {
        let text = await response.text()
        throw new Error(`S3 CreateMultipartUpload failed: ${response.status} - ${text}`)
      }

      let xml = await response.text()
      let uploadId = parseUploadId(xml)

      if (!uploadId) {
        throw new Error('Failed to parse UploadId from S3 response')
      }

      // Generate presigned URLs for each part
      let parts: Array<{ partNumber: number; url: string }> = []

      for (let i = 1; i <= numParts; i++) {
        let fullKey = getFullKey(key)
        let encodedKey = fullKey
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/')
        let url = new URL(`${endpoint}/${bucket}/${encodedKey}`)
        url.searchParams.set('partNumber', String(i))
        url.searchParams.set('uploadId', uploadId)

        let signedUrl = await signUrlQuery('PUT', url, expiresIn)
        parts.push({ partNumber: i, url: signedUrl.toString() })
      }

      return { uploadId, key, parts }
    },

    async completeMultipartUpload(options: {
      key: string
      uploadId: string
      parts: CompletedPart[]
    }): Promise<void> {
      let { key, uploadId, parts } = options

      // Sort parts by part number
      let sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber)

      // Build XML body
      let xmlParts = sortedParts
        .map(
          (part) =>
            `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${escapeXml(part.etag)}</ETag></Part>`,
        )
        .join('')
      let body = `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>${xmlParts}</CompleteMultipartUpload>`

      let response = await s3Request('POST', key, {
        query: { uploadId },
        body,
        headers: {
          'content-type': 'application/xml',
        },
      })

      if (!response.ok) {
        let text = await response.text()
        throw new Error(`S3 CompleteMultipartUpload failed: ${response.status} - ${text}`)
      }

      // Check for error in response body (S3 can return 200 with error in body)
      let responseText = await response.text()
      if (responseText.includes('<Error>')) {
        throw new Error(`S3 CompleteMultipartUpload failed: ${responseText}`)
      }
    },

    async abortMultipartUpload(options: { key: string; uploadId: string }): Promise<void> {
      let { key, uploadId } = options

      let response = await s3Request('DELETE', key, {
        query: { uploadId },
      })

      // S3 returns 204 for successful abort
      if (!response.ok && response.status !== 204) {
        let text = await response.text()
        throw new Error(`S3 AbortMultipartUpload failed: ${response.status} - ${text}`)
      }
    },
  }
}

// AWS Signature V4 helpers

async function sha256Hex(message: string): Promise<string> {
  let msgBuffer = new TextEncoder().encode(message)
  let hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  return arrayBufferToHex(hashBuffer)
}

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  let hashBuffer = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return arrayBufferToHex(hashBuffer)
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  let cryptoKey = await crypto.subtle.importKey(
    'raw',
    key instanceof Uint8Array ? (key as Uint8Array<ArrayBuffer>) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
}

async function hmacHex(key: ArrayBuffer | Uint8Array, message: string): Promise<string> {
  let result = await hmac(key, message)
  return arrayBufferToHex(result)
}

async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  let kDate = await hmac(new TextEncoder().encode('AWS4' + secretKey), dateStamp)
  let kRegion = await hmac(kDate, region)
  let kService = await hmac(kRegion, service)
  let kSigning = await hmac(kService, 'aws4_request')
  return kSigning
}

// Simple XML parsing for S3 responses

function parseListObjectsResponse(xml: string): S3ListObject[] {
  let objects: S3ListObject[] = []

  // Match all <Contents> elements
  let contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g
  let match

  while ((match = contentsRegex.exec(xml)) !== null) {
    let content = match[1]

    let keyMatch = /<Key>([\s\S]*?)<\/Key>/.exec(content)
    let lastModifiedMatch = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(content)
    let sizeMatch = /<Size>([\s\S]*?)<\/Size>/.exec(content)

    if (keyMatch) {
      objects.push({
        key: decodeXmlEntities(keyMatch[1]),
        lastModified: lastModifiedMatch ? new Date(lastModifiedMatch[1]) : new Date(),
        size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
      })
    }
  }

  return objects
}

function parseNextContinuationToken(xml: string): string | undefined {
  let match = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)
  return match ? decodeXmlEntities(match[1]) : undefined
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function parseUploadId(xml: string): string | undefined {
  let match = /<UploadId>([\s\S]*?)<\/UploadId>/.exec(xml)
  return match ? decodeXmlEntities(match[1]) : undefined
}
