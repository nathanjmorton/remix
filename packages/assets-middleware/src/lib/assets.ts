import * as path from 'node:path'
import type { BuildContext, BuildOptions, BuildResult, OutputFile, Metafile } from 'esbuild'
import * as esbuild from 'esbuild'
import { lookup } from 'mrmime'
import type { AssetsMap, Middleware } from '@remix-run/fetch-router'

export interface AssetsOptions {
  /**
   * The URL path where assets should be served. If not provided, defaults to
   * the outdir with any leading 'public' directory stripped.
   *
   * For example, if outdir is 'public/assets', publicPath defaults to '/assets'.
   */
  publicPath?: string
  /**
   * When true, runs esbuild in watch mode and rebuilds assets on file changes.
   */
  watch?: boolean
}

/**
 * Creates a middleware that builds and serves JavaScript/CSS assets using esbuild.
 *
 * The middleware runs esbuild with the provided configuration on the first request,
 * stores the built files in memory, and serves them with full HTTP semantics.
 *
 * @param config esbuild configuration object
 * @param options (optional) middleware options
 * @returns A middleware function
 */
export function assets(
  config: BuildOptions & { outdir: string },
  options?: AssetsOptions,
): Middleware {
  let outdir = config.outdir
  let absoluteOutdir = path.resolve(outdir)
  let watch = options?.watch ?? false
  let publicPath = options?.publicPath

  // Determine the public path for serving assets
  if (!publicPath) {
    // Strip leading 'public' or 'public/' from the outdir to get the URL path
    publicPath = outdir.replace(/^public\/?/, '/')
    // Ensure it starts with a slash
    if (!publicPath.startsWith('/')) {
      publicPath = '/' + publicPath
    }
  }

  let context: BuildContext | null = null
  let buildPromise: Promise<BuildResult> | null = null
  let assetsMap: AssetsMap = new Map()
  let outputFiles: Map<string, OutputFile> = new Map()

  async function runBuild(): Promise<BuildResult> {
    let buildConfig: BuildOptions = {
      ...config,
      metafile: true,
      write: false,
    }

    if (watch) {
      // In watch mode, create a context and start watching
      if (!context) {
        context = await esbuild.context({
          ...buildConfig,
          plugins: [
            ...(buildConfig.plugins || []),
            {
              name: 'assets-middleware-watcher',
              setup(build) {
                build.onEnd((result) => {
                  updateBuild(result)
                })
              },
            },
          ],
        })

        await context.watch()
      }

      return await context.rebuild()
    }

    return await esbuild.build(buildConfig)
  }

  function updateBuild(result: BuildResult) {
    buildAssetsMap(result.metafile!)
    buildOutputFiles(result.outputFiles!)
  }

  function buildAssetsMap(metafile: Metafile) {
    assetsMap.clear()

    // Calculate the outbase: either the explicit one or the lowest common ancestor
    let outbase: string
    if (config.outbase) {
      outbase = config.outbase
    } else {
      // Calculate the lowest common ancestor of all entry points
      // This matches esbuild's behavior when outbase is not specified
      let entryPoints = Object.values(metafile.outputs)
        .filter((output) => output.entryPoint)
        .map((output) => output.entryPoint!)

      outbase = calculateLowestCommonAncestor(entryPoints)
    }

    for (let [outputPath, output] of Object.entries(metafile.outputs)) {
      // Only include outputs that have an entryPoint (entry points only, no chunks)
      if (!output.entryPoint) continue

      // Calculate the relative path from the outbase
      let entryPointRelative = path.relative(outbase, output.entryPoint)

      // Calculate the output path relative to the outdir
      let outputRelative = path.relative(absoluteOutdir, path.resolve(outputPath))

      let href = publicPath + '/' + outputRelative.replace(/\\/g, '/')
      let size = output.bytes
      let type = lookup(outputPath) || 'application/octet-stream'

      // Add mapping with source extension (e.g., 'entry.tsx')
      let sourceName = entryPointRelative.replace(/\\/g, '/')
      assetsMap.set(sourceName, { name: sourceName, href, size, type })

      // Add mapping with output extension (e.g., 'entry.js')
      let outputName = sourceName.replace(/\.[^.]+$/, path.extname(outputPath))
      assetsMap.set(outputName, { name: sourceName, href, size, type })

      // If there's a corresponding CSS file, add it with .css extension
      if (output.cssBundle) {
        let cssPath = outputPath.replace(/\.[^.]+$/, '.css')
        let cssRelative = path.relative(absoluteOutdir, path.resolve(cssPath))
        let cssHref = publicPath + '/' + cssRelative.replace(/\\/g, '/')
        let cssName = sourceName.replace(/\.[^.]+$/, '.css')

        // Find the CSS file in outputs to get its size
        let cssOutput = metafile.outputs[cssPath]
        let cssSize = cssOutput?.bytes ?? 0
        let cssType = 'text/css'

        assetsMap.set(cssName, {
          name: sourceName,
          href: cssHref,
          size: cssSize,
          type: cssType,
        })
      }
    }
  }

  function buildOutputFiles(files: OutputFile[]) {
    outputFiles.clear()

    for (let file of files) {
      outputFiles.set(file.path, file)
    }
  }

  let middleware: Middleware = async (context, next) => {
    // Trigger build on first request if not already building
    if (!buildPromise) {
      buildPromise = runBuild().then((result) => {
        updateBuild(result)
        return result
      })
    }

    await buildPromise

    // Attach the assets map to context for route handlers to use
    context.assets = assetsMap

    // If the request is not an asset request, send it downstream
    if (!context.url.pathname.startsWith(publicPath)) {
      return next()
    }

    // Try to serve an asset file for this request
    let matchedFile: OutputFile | null = null

    for (let [filePath, file] of outputFiles) {
      if (!filePath.startsWith(absoluteOutdir + path.sep)) continue

      let relativePath = filePath.slice(absoluteOutdir.length)
      let urlPath = publicPath + relativePath

      if (context.url.pathname === urlPath) {
        matchedFile = file
        break
      }
    }

    if (matchedFile) {
      let headers = new Headers({
        'Cache-Control': watch ? 'no-cache' : 'public, max-age=31536000',
        'Content-Length': matchedFile.contents.length.toString(),
        'Content-Type': lookup(matchedFile.path) ?? 'application/octet-stream',
        ETag: `"${matchedFile.hash}"`,
      })

      if (context.request.method === 'HEAD') {
        return new Response(null, { headers })
      }

      return new Response(matchedFile.contents as BlobPart, { headers })
    }
  }

  // Expose a dispose method to clean up resources (mainly for testing)
  ;(middleware as any).dispose = async () => {
    if (context) {
      await context.dispose()
      context = null
    }
  }

  return middleware
}

function calculateLowestCommonAncestor(paths: string[]): string {
  if (paths.length === 0) return '.'
  if (paths.length === 1) return path.dirname(paths[0])

  // Normalize all paths and split into segments
  let segments = paths.map((p) => path.normalize(p).split(path.sep))

  // Find the common prefix of all paths
  let commonSegments: string[] = []
  let minLength = Math.min(...segments.map((s) => s.length))

  for (let i = 0; i < minLength; i++) {
    let segment = segments[0][i]
    if (segments.every((s) => s[i] === segment)) {
      commonSegments.push(segment)
    } else {
      break
    }
  }

  // The LCA is the directory, not the file
  // If we have common segments, join them; otherwise use '.'
  return commonSegments.length > 0 ? commonSegments.join(path.sep) : '.'
}
