/**
 * Metadata for a built asset.
 */
export interface Asset {
  /** The URL path to the asset */
  href: string
  /** The name of the asset source file */
  name: string
  /** The size of the asset in bytes */
  size: number
  /** The MIME type of the asset */
  type: string
}

/**
 * Map of asset names to their metadata.
 */
export type AssetsMap = Map<string, Asset>
