import fs from 'node:fs/promises'
import path from 'node:path'
import util from 'node:util'
import * as typedoc from 'typedoc'
import packageJson from '../packages/remix/package.json' with { type: 'json' }

/***** Types *****/

type Comment = FunctionComment | ClassComment

type FunctionComment = {
  docPath: string
  type: 'function'
  name: string
  aliases: string[] | undefined
  description: string
  example: string | undefined
  parameters: Parameter[]
  returns: string | undefined
}

type ClassComment = {
  docPath: string
  type: 'class'
  name: string
  aliases: string[] | undefined
  description: string
  example: string | undefined
  properties: Property[] | undefined
  methods: Method[] | undefined
}

type Parameter = {
  name: string
  description: string
}

type Property = {
  name: string
  description: string
}

type Method = {
  name: string
  description: string
  parameters: Parameter[]
}

type Maps = {
  apiMap: Map<string, typedoc.Reflection> // full name => TypeDoc
  shorthandMap: Map<string, string> // API name => full name
  idMap: Map<number, string> // TypeDoc id => full name
  aliasMap: Map<string, Set<string>> // full name => Set<full name>
  apisToDocument: Set<string> // APIS we should generate docs for
}

/***** CLI *****/

let { values: cliArgs } = util.parseArgs({
  options: {
    // Path to a TypeDoc JSON file to use as the input, instead of running Typedoc
    input: {
      type: 'string',
      short: 'i',
    },
    // Specific module to generate docs for
    module: {
      type: 'string',
      short: 'm',
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

let maps: Maps

async function main() {
  let reflection = await loadTypedocJson()

  maps = createLookupMaps(reflection)

  await fs.mkdir(path.dirname(cliArgs.docsDir), { recursive: true })

  for (let name of maps.apisToDocument) {
    let node = maps.apiMap.get(name)!
    invariant(node.comment, `Expected comment for documented API: ${name}`)
    let comment = getNormalizedComment(name, node, node.comment)
    let mdPath = path.join(cliArgs.docsDir, comment.docPath)
    await fs.mkdir(path.dirname(mdPath), { recursive: true })
    await writeMarkdownFile(node.name, comment, mdPath)
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
  let apisToComment = new Set<string>()
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
  let aliasMap = new Map<string, Set<string>>()

  function traverse(r: typedoc.Reflection, ancestors?: string) {
    r.traverse((c) => {
      let fullName = ancestors ? `${ancestors}.${c.name}` : c.name
      let indent = '  '.repeat(fullName.split('.').length - 1)

      if (cliArgs.module && c.kind === typedoc.ReflectionKind.Module && c.name !== cliArgs.module) {
        log('Skipping module due to --module flag: ' + c.name)
        return
      }

      apiMap.set(fullName, c)
      idMap.set(c.id, fullName)
      shorthandMap.set(c.name, fullName)

      let logApi = (suffix: string) =>
        log(
          `${indent}[${typedoc.ReflectionKind[c.kind]}] ${c.name} - ${fullName} (${c.id}) (${suffix})`,
        )

      // Reference types are aliases - stick them off into a separate map for post-processing
      if (
        c.kind === typedoc.ReflectionKind.Reference &&
        '_target' in c &&
        typeof c._target === 'number'
      ) {
        logApi(`reference to ${c._target}`)
        referenceTargetMap.set(fullName, c._target)
        return
      }

      // Skip nested properties, methods, etc. that we don't intend to document standalone
      if (!allowKinds.has(c.kind)) {
        logApi(`skipped`)
        skippedKinds.add(c.kind)
        return
      }

      if (c.comment) {
        apisToComment.add(fullName)
        logApi(`commenting`)
      } else {
        logApi(`not commenting`)
      }

      traverse(c, fullName)
    })
  }

  traverse(reflection)

  log(
    `\n\nSkipped kinds: ${Array.from(skippedKinds)
      .map((k) => typedoc.ReflectionKind[k])
      .join(', ')}`,
  )

  return { apiMap, shorthandMap, idMap, aliasMap, apisToDocument: apisToComment }
}

function getNormalizedComment(
  fullName: string,
  node: typedoc.Reflection,
  typedocComment: typedoc.Comment,
): Comment {
  // The Function->CallSignature nesting results in a duplication of the
  // function name so confirm and pop off the dup and process the
  // CallSignature which will, just overwrite the Function entry in our maps
  let nameParts = fullName.split('.')
  let docPath =
    nameParts
      .filter((s, i) => nameParts[i - 1] !== s)
      .map((s) => s.replace(/^@/g, ''))
      .map((s) => s.replace(/\//g, '-'))
      .join('/') + '.md'

  let name = node.name
  let description = typedocComment.summary
    .map((part) => ('text' in part ? part.text : ''))
    .join('')
    .trim()

  let comment: Comment

  if (node.isSignature()) {
    let params = node.parameters ?? []

    let returns = node.comment?.getTag('@returns')?.content
    if (!returns) {
      console.warn(`Missing @returns tag for function: ${name}`)
    }

    let example = node.comment?.getTag('@example')?.content

    comment = {
      docPath,
      type: 'function',
      name,
      aliases: undefined,
      description,
      example: example ? combineCommentParts(example) : undefined,
      parameters: params.flatMap((tag) => {
        if (tag.type?.type === 'reference') {
          let shorthand = tag.type.name
          let full = maps.shorthandMap.get(shorthand)
          let api = full ? maps.apiMap.get(full) : null
          if (!(api && 'children' in api && Array.isArray(api.children))) {
            console.warn(`Expected children parameters for ${full}`)
            return []
          }
          return api.children.map((child) => {
            return {
              name: [tag.name, child.name].join('.'),
              description: combineCommentParts(child.comment.summary),
            } satisfies Parameter
          })
        } else {
          if (!tag.comment?.summary) {
            console.warn(`Missing comment for parameter: ${tag.name}`)
            return []
          }
          return [
            {
              name: tag.name,
              description: combineCommentParts(tag.comment.summary),
            },
          ] satisfies Parameter[]
        }
      }),
      returns: returns ? combineCommentParts(returns) : undefined,
    } satisfies FunctionComment
  } else if (node.kind === typedoc.ReflectionKind.Class) {
    comment = {
      docPath,
      type: 'class',
      name,
      aliases: undefined,
      description,
      example: undefined,
      properties: undefined,
      methods: undefined,
    } satisfies ClassComment
  } else {
    console.log('Unimplemented kind for comment:', typedoc.ReflectionKind[node.kind])
    return {
      docPath,
      type: 'function',
      name,
      aliases: undefined,
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

function combineCommentParts(parts: typedoc.CommentDisplayPart[]): string {
  // TODO:
  return parts.reduce((acc, part) => acc + part.text, '')
}

function resolveLinkTags(content: string): string {
  // TODO:
  return content
}

/***** Markdown Generation ****/

async function writeMarkdownFile(name: string, comment: Comment, path: string) {
  let markdown: string

  let h1 = (heading: string) => `# ${heading}`
  let h2 = (heading: string, body: string) => `## ${heading}\n\n${body}`
  let h3 = (heading: string, body: string) => `### ${heading}\n\n${body}`

  if (comment.type === 'function') {
    let sections = [
      `---\ntitle: ${name}\n---`,
      h1(name),
      h2('Summary', comment.description),
      comment.example ? h2('Example', comment.example) : undefined,
      h2('Params', comment.parameters.map((param) => h3(param.name, param.description)).join('')),
      comment.returns ? h2('Returns', comment.returns) : undefined,
    ]

    markdown = sections.filter(Boolean).join('\n\n')
  } else if (comment.type === 'class') {
    let sections = [
      `---\ntitle: ${name}\n---`,
      h1(name),
      h2('Summary', comment.description),
      comment.example ? h2('Example', comment.example) : undefined,
      comment.properties
        ? h2('Properties', comment.properties.map((p) => h3(p.name, p.description)).join(''))
        : undefined,
      comment.methods
        ? // TODO: Document method parameters?
          h2('Methods', comment.methods.map((m) => h3(m.name, m.description)).join(''))
        : undefined,
    ]

    markdown = sections.filter(Boolean).join('\n\n')
  } else {
    throw new Error(`Unknown comment type: ${(comment as any).type}`)
  }

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
