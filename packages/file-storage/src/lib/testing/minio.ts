/**
 * MinIO Test Utility
 *
 * Provides functions to start, stop, and manage a MinIO container for testing and demos.
 * Requires Docker to be running.
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

import { exec } from 'node:child_process'
import { promisify } from 'node:util'

let execAsync = promisify(exec)

export interface MinioConfig {
  containerName: string
  port: number
  consolePort: number
  user: string
  password: string
  bucketName: string
}

export let defaultMinioConfig: MinioConfig = {
  containerName: 'minio',
  port: 9000,
  consolePort: 9001,
  user: 'minioadmin',
  password: 'minioadmin',
  bucketName: 'nathanjmorton-s3-test-bucket',
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker info')
    return true
  } catch {
    return false
  }
}

export async function cleanupMinio(config: MinioConfig = defaultMinioConfig): Promise<void> {
  try {
    // Stop and remove our test container
    await execAsync(`docker stop ${config.containerName} 2>/dev/null || true`)
    await execAsync(`docker rm ${config.containerName} 2>/dev/null || true`)
    // Also clean up any container using our ports (e.g., old 'minio' container)
    let { stdout } = await execAsync(
      `docker ps --filter "publish=${config.port}" --format '{{.Names}}' 2>/dev/null || true`,
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

export async function isMinioRunning(config: MinioConfig = defaultMinioConfig): Promise<boolean> {
  try {
    let { stdout } = await execAsync(
      `docker ps --filter name=${config.containerName} --format '{{.Names}}'`,
    )
    return stdout.trim() === config.containerName
  } catch {
    return false
  }
}

export async function isMinioHealthy(config: MinioConfig = defaultMinioConfig): Promise<boolean> {
  try {
    let response = await fetch(`http://localhost:${config.port}/minio/health/live`)
    return response.ok
  } catch {
    return false
  }
}

export async function startMinio(config: MinioConfig = defaultMinioConfig): Promise<void> {
  // Check if container exists but is stopped
  try {
    let { stdout } = await execAsync(
      `docker ps -a --filter name=${config.containerName} --format '{{.Names}}'`,
    )
    if (stdout.trim() === config.containerName) {
      // Container exists, start it
      await execAsync(`docker start ${config.containerName}`)
    } else {
      // Create new container
      await execAsync(
        `docker run -d ` +
          `--name ${config.containerName} ` +
          `-p ${config.port}:9000 ` +
          `-p ${config.consolePort}:9001 ` +
          `-e MINIO_ROOT_USER=${config.user} ` +
          `-e MINIO_ROOT_PASSWORD=${config.password} ` +
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
    if (await isMinioHealthy(config)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    attempts++
  }
  throw new Error('MinIO failed to become healthy')
}

export async function createBucket(config: MinioConfig = defaultMinioConfig): Promise<void> {
  try {
    await execAsync(
      `docker exec ${config.containerName} mc alias set local http://localhost:9000 ${config.user} ${config.password}`,
    )
    await execAsync(
      `docker exec ${config.containerName} mc mb local/${config.bucketName} --ignore-existing`,
    )
  } catch (error) {
    throw new Error(`Failed to create bucket: ${error}`)
  }
}

/**
 * Set up MinIO for testing or demos.
 *
 * This will:
 * 1. Check if Docker is available
 * 2. Clean up any existing MinIO container
 * 3. Start a new MinIO container
 * 4. Create the test bucket
 *
 * @returns true if MinIO was set up successfully, false if Docker is not available
 */
export async function setupMinio(config: MinioConfig = defaultMinioConfig): Promise<boolean> {
  if (!(await isDockerAvailable())) {
    console.log('⚠️  Skipping: Docker is not available')
    return false
  }

  console.log('🧹 Cleaning up existing MinIO container...')
  await cleanupMinio(config)

  console.log('🚀 Starting MinIO container...')
  await startMinio(config)

  await createBucket(config)
  return true
}
