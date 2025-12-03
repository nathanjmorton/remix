import fs from 'node:fs/promises'
import path from 'node:path'
import util from 'node:util'
import * as typedoc from 'typedoc'
import packageJson from '../packages/remix/package.json' with { type: 'json' }

/***** Types *****/

type Comment = FunctionComment | ClassComment

type FunctionComment = {
  type: 'function'
  name: string
  aliases?: string[]
  description: string
  example: string
  parameters: Array<{
    name: string
    description: string
  }>
  returns: string
}

type ClassComment = {
  type: 'class'
  name: string
  aliases?: string[]
  description: string
  example?: string
  methods?: Method[]
  returns?: string
}

type Parameter = {
  name: string
  description: string
}

type Method = {
  name: string
  parameters: Parameter[]
}

type Maps = {
  apiMap: Map<string, typedoc.Reflection> // full name => TypeDoc
  shorthandMap: Map<string, string> // API name => full name
  idMap: Map<number, string> // TypeDoc id => full name
  aliasMap: Map<string, Set<string>> // full name => Set<full name>
  commentMap: Map<string, Comment> // full name => parsed JSDoc comment
}

/***** CLI *****/

let { values: cliArgs } = util.parseArgs({
  options: {
    // Path to a TypeDoc JSON file to use as the input, instead of running Typedoc
    input: {
      type: 'string',
      short: 'i',
    },
    // Output directory for generated API markdown files
    docsDir: {
      type: 'string',
      short: 'o',
      default: 'docs/api',
    },
    // Output directory for typedoc JSON (if --input is not specified)
    typedocDir: {
      type: 'string',
      short: 'o',
      default: 'docs/typedoc',
    },
  },
})

main()

async function main() {
  let reflection = await loadTypedocJson()

  let maps = createLookupMaps(reflection)

  for (let [name, comment] of maps.commentMap.entries()) {
    let outDir = path.resolve(process.cwd(), cliArgs.docsDir, ...name.split('.').slice(0, -1))
    await fs.mkdir(outDir, { recursive: true })
    let outPath = path.join(outDir, `${name.split('.').slice(-1)[0]}.md`)
    await writeMarkdownFile(name, comment, outPath)
  }
}

/***** TypeDoc *****/

// Load the TypeDoc JSON representation, either from a JSON file or by running
// TypeDoc against the project
async function loadTypedocJson(): Promise<typedoc.ProjectReflection> {
  if (cliArgs.input) {
    log(`Loading TypeDoc JSON from: ${cliArgs.input}`)

    log(`Generating TypeDoc from project`)
    let app = await typedoc.Application.bootstrap({
      name: packageJson.name,
      entryPoints: [cliArgs.input],
      entryPointStrategy: 'merge',
    })
    let reflection = await app.convert()
    invariant(reflection, 'Failed to generate TypeDoc reflection from JSON file')
    return reflection
  }

  log(`Generating TypeDoc from project`)
  let app = await typedoc.Application.bootstrap({
    name: packageJson.name,
    entryPoints: ['./packages/*'],
    entryPointStrategy: 'packages',
  })
  let reflection = await app.convert()
  invariant(reflection, 'Failed to generate TypeDoc reflection from source code')

  let outPath = path.resolve(process.cwd(), cliArgs.typedocDir)
  await app.renderer.render(reflection!, outPath)
  log(`HTML docs generated at: ${outPath}`)

  let jsonPath = path.join(outPath, 'api.json')
  await app.application.generateJson(reflection, jsonPath)
  log(`JSON docs generated at: ${jsonPath}`)

  return reflection
}

// Walk the TypeDoc reflection and generate a serries of lookup maps we'll use
// for our markdown documentation generation
// TODO: Eventually it would be nice to only return commentMap from this but
// lets see how it shakes out with all the rest
function createLookupMaps(reflection: typedoc.ProjectReflection): Maps {
  let apiMap = new Map<string, typedoc.Reflection>()
  let shorthandMap = new Map<string, string>()
  let idMap = new Map<number, string>()
  let referenceTargetMap = new Map<string, number>()
  let allowKinds = new Set<typedoc.ReflectionKind>([
    typedoc.ReflectionKind.Module,
    typedoc.ReflectionKind.Function,
    typedoc.ReflectionKind.CallSignature,
    typedoc.ReflectionKind.Class,
    // TODO: Currently only used for interactions like arrowLeft etc.
    // typedoc.ReflectionKind.Variable,
  ])
  let skippedKinds = new Set<typedoc.ReflectionKind>()
  let commentMap = new Map<string, Comment>()
  let aliasMap = new Map<string, Set<string>>()

  function traverse(r: typedoc.Reflection, ancestors?: string) {
    r.traverse((c) => {
      let fullName = ancestors ? `${ancestors}.${c.name}` : c.name

      // Reference types are aliases - stick them off into a separate map for post-processing
      if (
        c.kind === typedoc.ReflectionKind.Reference &&
        '_target' in c &&
        typeof c._target === 'number'
      ) {
        referenceTargetMap.set(fullName, c._target)
        return
      }

      // Skip nested properties, methods, etc. that we don't intend to document standalone
      if (!allowKinds.has(c.kind)) {
        skippedKinds.add(c.kind)
        return
      }

      if (
        c.kind === typedoc.ReflectionKind.CallSignature &&
        c.parent?.kind === typedoc.ReflectionKind.Function
      ) {
        // The Function->CallSignature nesting results in a duplication of the
        // function name so confirm and pop off the dup and process the
        // CallSignature which will, just overwrite the Function entry in our maps
        let parts = fullName.split('.')
        invariant(
          parts[parts.length - 1] === c.name,
          `Unexpected difference between function and call signature name: ${fullName}`,
        )
        processReflection(c, parts.slice(0, -1).join('.'))

        // No need to traverse any further
      } else {
        processReflection(c, fullName)
        traverse(c, fullName)
      }
    })
  }

  function processReflection(c: typedoc.Reflection, fullName: string) {
    let indent = '  '.repeat(fullName.split('.').length - 1)

    apiMap.set(fullName, c)
    idMap.set(c.id, fullName)

    if (c.comment) {
      shorthandMap.set(c.name, fullName)
      let comment = getNormalizedComment(c, c.comment)
      commentMap.set(fullName, comment)
      log(
        `${indent}[${typedoc.ReflectionKind[c.kind]}] ${c.name} - ${fullName} (${c.id}) (commented)`,
      )
    } else {
      log(
        `${indent}[${typedoc.ReflectionKind[c.kind]}] ${c.name} - ${fullName} (${c.id}) (not commented)`,
      )
    }
  }

  traverse(reflection)

  log(
    `\n\nSkipped kinds: ${Array.from(skippedKinds)
      .map((k) => typedoc.ReflectionKind[k])
      .join(', ')}`,
  )

  return { apiMap, shorthandMap, idMap, commentMap, aliasMap }
}

function getNormalizedComment(node: typedoc.Reflection, typedocComment: typedoc.Comment): Comment {
  let name = node.name
  let description = typedocComment.summary
    .map((part) => ('text' in part ? part.text : ''))
    .join('')
    .trim()

  let comment: Comment

  if (
    node.kind === typedoc.ReflectionKind.Function ||
    node.kind === typedoc.ReflectionKind.CallSignature
  ) {
    comment = {
      type: 'function',
      name,
      description,
      example: 'TODO:',
      parameters: [
        {
          name: 'TODO:',
          description: 'TODO:',
        },
      ],
      returns: 'TODO:',
    } satisfies FunctionComment
  } else if (node.kind === typedoc.ReflectionKind.Class) {
    comment = {
      type: 'class',
      name,
      description,
    } satisfies ClassComment
  } else {
    console.log('Unimplemented kind for comment:', typedoc.ReflectionKind[node.kind])
    return {
      type: 'function',
      name,
      description,
      example: 'TODO:',
      parameters: [
        {
          name: 'TODO:',
          description: 'TODO:',
        },
      ],
      returns: 'TODO:',
    }
  }

  return comment
}

/***** Markdown Generation ****/

async function writeMarkdownFile(name: string, comment: Comment, path: string) {
  let markdown = `---
title: ${name}
---

# ${name}

## Summary

${comment.description}

## Signature

TODO:

## Params

TODO:

## Returns

TODO:
`

  await fs.writeFile(path, markdown)
}

/***** Utils *****/

function log(...args: unknown[]) {
  console.log(...args)
}

function invariant(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? 'Invariant violation')
  }
}
