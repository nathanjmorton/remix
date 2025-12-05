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
  apiMap: Map<string, typedoc.Reflection> // full name => TypeDoc Reflection
  shorthandMap: Map<string, string> // short name => full name
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
    // Specific api to generate docs for
    api: {
      type: 'string',
      short: 'a',
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

  let comments = [...maps.apisToDocument].map((name) => {
    let node = maps.apiMap.get(name)!
    return getNormalizedComment(name, node, node.comment!)
  })

  await writeMarkdownFiles(comments)
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
  let aliasMap = new Map<string, Set<string>>()
  let referenceTargetMap = new Map<string, number>()

  // Reflections we want to traverse through to find documented APIs
  let traverseKinds = new Set<typedoc.ReflectionKind>([
    typedoc.ReflectionKind.Module,
    typedoc.ReflectionKind.Function,
    typedoc.ReflectionKind.CallSignature,
    typedoc.ReflectionKind.Class,
    // TODO: Not implemented yet - used for interactions like arrowLeft etc. so
    // we eventually will probably want to support
    // typedoc.ReflectionKind.Variable,
  ])

  recurse(reflection)

  return { apiMap, shorthandMap, aliasMap, apisToDocument: apisToComment }

  function recurse(node: typedoc.Reflection) {
    node.traverse((child) => {
      if (
        cliArgs.module &&
        child.kind === typedoc.ReflectionKind.Module &&
        child.name !== cliArgs.module
      ) {
        log('Skipping module due to --module flag: ' + child.name)
        return
      }

      let fullName = child.getFriendlyFullName()
      apiMap.set(fullName, child)
      shorthandMap.set(child.name, fullName)

      let indent = '  '.repeat(child.getFriendlyFullName().split('.').length - 1)
      let logApi = (suffix: string) =>
        log(
          `${indent}[${typedoc.ReflectionKind[child.kind]}] ${child.name} - ${fullName} (${child.id}) (${suffix})`,
        )

      // Reference types are aliases - stick them off into a separate map for post-processing
      if (
        child.kind === typedoc.ReflectionKind.Reference &&
        '_target' in child &&
        typeof child._target === 'number'
      ) {
        logApi(`reference to ${child._target}`)
        referenceTargetMap.set(fullName, child._target)
        return
      }

      // Skip nested properties, methods, etc. that we don't intend to document standalone
      if (!traverseKinds.has(child.kind)) {
        logApi(`skipped`)
        return
      }

      // Grab APIs with JSDoc comments that we should generate docs for
      if (child.comment) {
        apisToComment.add(fullName)
        logApi(`commenting`)
      }

      // No need to traverse past signatures, do that when we generate the comment
      if (!child.isSignature()) {
        recurse(child)
      }
    })
  }
}

function getNormalizedComment(
  fullName: string,
  node: typedoc.Reflection,
  typedocComment: typedoc.Comment,
): Comment {
  try {
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
      let params: Parameter[] = []
      node.traverse((tag) => {
        // Only process params, not type params (generics)
        if (!tag.isParameter()) return
        params = params.concat(getParameters(tag))
      })

      let returns = node.comment?.getTag('@returns')?.content
      if (!returns) {
        warn(`Missing @returns tag for function: ${name}`)
      }

      let example = node.comment?.getTag('@example')?.content

      comment = {
        docPath,
        type: 'function',
        name,
        aliases: undefined,
        description,
        example: example ? combineCommentParts(example) : undefined,
        parameters: params,
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
  } catch (e) {
    throw new Error(`Error normalizing comment for ${fullName}: ${(e as Error).message}`, {
      cause: e,
    })
  }
}

// Get one or more parameters to document for a single function param.
// Results in multiple params when the function param is an object with nested
// fields. For example: `func(options: { a: boolean, b: string })`
function getParameters(node: typedoc.ParameterReflection): Parameter[] {
  if (node.type?.type !== 'reference') {
    let param = getParameter(node)
    return param ? [param] : []
  }

  // Reference params are a bit more complicated because they link off to
  // another class or interface
  let fullName = maps.shorthandMap.get(node.type.name)
  let api = fullName ? resolveReferences(fullName) : undefined

  if (!api) {
    return []
  }

  // For now, we assume the class will be documented on it's own and we can just cross-link
  // TODO: Cross-link to the class
  if (api.kind === typedoc.ReflectionKind.Class) {
    let param = getParameter(node)
    return param ? [param] : []
  }

  // Expand out individual fields of interfaces
  if (api.kind === typedoc.ReflectionKind.Interface) {
    if (!(api && 'children' in api && Array.isArray(api.children))) {
      warn(`Expected children parameters for ${fullName}`)
      return []
    }

    let params: Parameter[] = []
    let param = getParameter(node)
    if (param) {
      params.push(param)
    }

    api.children.forEach((child) => {
      let childParam = getParameter(child, [node.name])
      if (childParam) {
        params.push(childParam)
      } else {
        warn(`Missing comment for parameter: ${child.name} in ${fullName}`)
      }
    })

    return params
  }

  warn(`Unimplemented referenced parameter type kind: ${typedoc.ReflectionKind[api.kind]}`)
  return []
}

function getParameter(
  node: typedoc.ParameterReflection | typedoc.DeclarationReflection,
  prefix: string[] = [],
): Parameter | undefined {
  if (!node.comment?.summary) {
    warn(`Missing comment for parameter: ${node.name}`)
    return
  }
  return {
    name: [...prefix, node.name].join('.'),
    description: combineCommentParts(node.comment.summary),
  }
}

function resolveReferences(name: string) {
  let api = maps.apiMap.get(name)

  if (!api) {
    warn(`Could not resolve referenced parameter type: ${name}`)
  } else if (api.isReference()) {
    return resolveReferences(api.name)
  } else {
    return api
  }
}

function combineCommentParts(parts: typedoc.CommentDisplayPart[]): string {
  return parts.reduce((acc, part) => acc + part.text, '')
}

function resolveLinkTags(content: string): string {
  // TODO:
  return content
}

/***** Markdown Generation ****/

async function writeMarkdownFiles(comments: Comment[]) {
  await fs.mkdir(path.dirname(cliArgs.docsDir), { recursive: true })

  for (let comment of comments) {
    let mdPath = path.join(cliArgs.docsDir, comment.docPath)
    await fs.mkdir(path.dirname(mdPath), { recursive: true })
    await writeMarkdownFile(comment, mdPath)
  }
}

async function writeMarkdownFile(comment: Comment, path: string) {
  let markdown: string

  let h1 = (heading: string) => `# ${heading}`
  let h2 = (heading: string, body: string) => `## ${heading}\n\n${body}`
  let h3 = (heading: string, body: string) => `### ${heading}\n\n${body}`

  if (comment.type === 'function') {
    let sections = [
      `---\ntitle: ${comment.name}\n---`,
      h1(comment.name),
      h2('Summary', comment.description),
      comment.example ? h2('Example', comment.example) : undefined,
      h2(
        'Params',
        comment.parameters.map((param) => h3(param.name, param.description)).join('\n\n'),
      ),
      comment.returns ? h2('Returns', comment.returns) : undefined,
    ]

    markdown = sections.filter(Boolean).join('\n\n')
  } else if (comment.type === 'class') {
    let sections = [
      `---\ntitle: ${comment.name}\n---`,
      h1(comment.name),
      h2('Summary', comment.description),
      comment.example ? h2('Example', comment.example) : undefined,
      comment.properties
        ? h2('Properties', comment.properties.map((p) => h3(p.name, p.description)).join('\n\n'))
        : undefined,
      comment.methods
        ? // TODO: Document method parameters?
          h2('Methods', comment.methods.map((m) => h3(m.name, m.description)).join('\n\n'))
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

function warn(...args: unknown[]) {
  console.warn('⚠️', ...args)
}

function invariant(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? 'Invariant violation')
  }
}

/***** Reference ****/

// export declare enum ReflectionKind {
//     Project = 1,
//     Module = 2,
//     Namespace = 4,
//     Enum = 8,
//     EnumMember = 16,
//     Variable = 32,
//     Function = 64,
//     Class = 128,
//     Interface = 256,
//     Constructor = 512,
//     Property = 1024,
//     Method = 2048,
//     CallSignature = 4096,
//     IndexSignature = 8192,
//     ConstructorSignature = 16384,
//     Parameter = 32768,
//     TypeLiteral = 65536,
//     TypeParameter = 131072,
//     Accessor = 262144,
//     GetSignature = 524288,
//     SetSignature = 1048576,
//     TypeAlias = 2097152,
//     Reference = 4194304,
//     /**
//      * Generic non-ts content to be included in the generated docs as its own page.
//      */
//     Document = 8388608
// }

// export interface ReflectionVariant {
//     declaration: DeclarationReflection;
//     param: ParameterReflection;
//     project: ProjectReflection;
//     reference: ReferenceReflection;
//     signature: SignatureReflection;
//     typeParam: TypeParameterReflection;
//     document: DocumentReflection;
// }
