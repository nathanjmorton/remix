import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { router } from './app/router.ts'
import { routes } from './app/routes.ts'

const projectDir = import.meta.dirname
const outDir = path.resolve(projectDir, 'dist')
const publicDir = path.resolve(projectDir, 'public')

interface Page {
  path: string
  out: string
}

const pages: Page[] = [
  { path: routes.home.href(), out: 'index.html' },
  { path: routes.services.href(), out: 'services/index.html' },
  { path: routes.contact.href(), out: 'contact/index.html' },
]

const baseUrl = 'http://localhost'

async function main() {
  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(outDir, { recursive: true })

  // Copy static assets (favicon, etc.) into the build output.
  await fs.cp(publicDir, outDir, { recursive: true })

  for (let page of pages) {
    let url = new URL(page.path, baseUrl)
    let response = await router.fetch(new Request(url))

    if (!response.ok) {
      throw new Error(`Failed to render ${page.path}: ${response.status} ${response.statusText}`)
    }

    let html = await response.text()
    let outPath = path.resolve(outDir, page.out)
    await fs.mkdir(path.dirname(outPath), { recursive: true })
    await fs.writeFile(outPath, html, 'utf8')

    console.log(`✓ ${page.path} → ${path.relative(projectDir, outPath)}`)
  }

  console.log(`\nBuilt ${pages.length} pages to ${path.relative(projectDir, outDir)}/`)
}

await main()
