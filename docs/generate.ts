import fs from 'node:fs/promises'
import path from 'node:path'
import util from 'node:util'
import * as typedoc from 'typedoc'
import packageJson from '../packages/remix/package.json' with { type: 'json' }
import * as prettier from 'prettier'

// TODO:
// - Handle preferring exports from remix package versus others

/***** Types *****/

// Function parameter or Class property
type ParameterOrProperty = {
  name: string
  type: string
  description: string
}

// Class Method
type Method = {
  name: string
  signature: string
  description: string
  parameters: ParameterOrProperty[]
  returns: string | undefined
}

// Documented function API
type DocumentedFunction = Method & {
  type: 'function'
  path: string
  aliases: string[] | undefined
  example: string | undefined
}

// Documented class API
type DocumentedClass = {
  type: 'class'
  path: string
  name: string
  aliases: string[] | undefined
  description: string
  example: string | undefined
  constructor: Method | undefined
  properties: ParameterOrProperty[] | undefined
  methods: Method[] | undefined
}

type DocumentedAPI = DocumentedFunction | DocumentedClass

type Maps = {
  comments: Map<string, typedoc.Reflection> // full name => TypeDoc Reflection
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
    // Output directory for typedoc JSON (if --input is not specified)
    websiteDocsPath: {
      type: 'string',
      short: 'w',
      default: '/docs',
    },
  },
})

main()

async function main() {
  // Load the full TypeDoc project and walk it to create a lookup map and
  // determine which APIs we want to generate documentation for
  let project = await loadTypedocJson()
  let { comments, apisToDocument } = createLookupMaps(project)

  // Parse JSDocs into DocumentedAPI instances we can write out to markdown
  let documentedAPIs = [...apisToDocument].map((name) => getDocumentedAPI(comments.get(name)!))

  // Write out docs
  await writeMarkdownFiles(documentedAPIs)
}

/***** TypeDoc *****/

// Load the TypeDoc JSON representation, either from a JSON file or by running
// TypeDoc against the project
async function loadTypedocJson(): Promise<typedoc.ProjectReflection> {
  if (cliArgs.input) {
    log(`Loading TypeDoc JSON from: ${cliArgs.input}`)
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

// Walk the TypeDoc reflection and collect all APIs we wish to document as well
// as generate a full lookup map of JSDoc comments by API name
function createLookupMaps(reflection: typedoc.ProjectReflection): Maps {
  let comments = new Map<string, typedoc.Reflection>()
  let apisToDocument = new Set<string>()
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

  return { comments, apisToDocument }

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

      comments.set(child.getFriendlyFullName(), child)

      let indent = '  '.repeat(child.getFriendlyFullName().split('.').length - 1)
      let logApi = (suffix: string) =>
        log(
          [
            `${indent}[${typedoc.ReflectionKind[child.kind]}]`,
            child.getFriendlyFullName(),
            `(${child.id})`,
            `(${suffix})`,
          ].join(' '),
        )

      // Reference types are aliases - stick them off into a separate map for post-processing
      if (
        child.kind === typedoc.ReflectionKind.Reference &&
        '_target' in child &&
        typeof child._target === 'number'
      ) {
        logApi(`reference to ${child._target}`)
        referenceTargetMap.set(child.getFriendlyFullName(), child._target)
        return
      }

      // Skip nested properties, methods, etc. that we don't intend to document standalone
      if (!traverseKinds.has(child.kind)) {
        logApi(`skipped`)
        return
      }

      // Grab APIs with JSDoc comments that we should generate docs for
      if (child.comment && (!cliArgs.api || child.name === cliArgs.api)) {
        apisToDocument.add(child.getFriendlyFullName())
        logApi(`commenting`)
      }

      // No need to traverse past signatures, do that when we generate the comment
      if (!child.isSignature()) {
        recurse(child)
      }
    })
  }
}

// Convert a typedoc reflection for a given node into a documentable instance
function getDocumentedAPI(node: typedoc.Reflection): DocumentedAPI {
  try {
    if (node.isSignature()) {
      return getDocumentedFunction(node)
    }

    if (node.isDeclaration() && node.kind === typedoc.ReflectionKind.Class) {
      return getDocumentedClass(node)
    }

    throw new Error(`Unsupported documented API kind: ${typedoc.ReflectionKind[node.kind]}`)
  } catch (e) {
    throw new Error(
      `Error normalizing comment for ${node.getFriendlyFullName()}: ${(e as Error).message}`,
      {
        cause: e,
      },
    )
  }
}

function getDocumentedFunction(node: typedoc.SignatureReflection): DocumentedFunction {
  let method = getMethod(node)
  invariant(method, `Failed to get method for function: ${node.getFriendlyFullName()}`)
  return {
    type: 'function',
    path: getDocumentedApiPath(node),
    aliases: undefined,
    example: node.comment?.getTag('@example')?.content
      ? processComment(node.comment.getTag('@example')!.content)
      : undefined,
    ...method,
  } satisfies DocumentedFunction
}

function getDocumentedClass(node: typedoc.DeclarationReflection): DocumentedClass {
  let constructor: Method | undefined
  let properties: ParameterOrProperty[] = []
  let methods: Method[] = []
  node.traverse((child) => {
    if (child.isDeclaration()) {
      if (child.kind === typedoc.ReflectionKind.Constructor) {
        let signature = child.getAllSignatures()[0]
        invariant(
          signature,
          `Missing constructor signature for class: ${node.getFriendlyFullName()}`,
        )
        constructor = getMethod(signature)
      } else if (child.kind === typedoc.ReflectionKind.Property) {
        let property = getParameterOrProperty(child)
        if (property) {
          properties.push(property)
        }
      } else if (child.kind === typedoc.ReflectionKind.Accessor) {
        let property = getParameterOrProperty(child.getSignature)
        if (property) {
          properties.push(property)
        }
      } else if (child.kind === typedoc.ReflectionKind.Method) {
        let signature = child.getAllSignatures()[0]
        invariant(`Missing method signature for class: ${child.getFriendlyFullName()}`)
        let method = getMethod(signature)
        if (method) {
          methods.push(method)
        }
      } else {
        unimplemented(
          `class child kind: ${typedoc.ReflectionKind[child.kind]} ${node.getFriendlyFullName()}`,
        )
      }
    }
  })

  return {
    type: 'class',
    aliases: undefined,
    example: undefined,
    path: getDocumentedApiPath(node),
    name: node.name,
    description: getDocumentedApiDescription(node.comment!),
    constructor,
    properties,
    methods,
  }
}

function getDocumentedApiPath(node: typedoc.Reflection): string {
  let nameParts = node.getFriendlyFullName().split('.')
  return (
    nameParts
      .map((s) => s.replace(/^@remix-run\//g, ''))
      .map((s) => s.replace(/\//g, '-'))
      .join('/') + '.md'
  )
}

function getDocumentedApiDescription(typedocComment: typedoc.Comment): string {
  let description = typedocComment.summary
    .map((part) => ('text' in part ? part.text : ''))
    .join('')
    .trim()
  return description
}

function getMethod(node: typedoc.SignatureReflection): Method | undefined {
  let parameters: ParameterOrProperty[] = []
  node.traverse((child) => {
    // Only process params, not type params (generics)
    if (child.isParameter()) {
      parameters = parameters.concat(getParametersOrProperties(child))
    } else if (child.isSignature()) {
      child.traverse((param) => {
        // Only process params, not type params (generics)
        if (param.isParameter()) {
          parameters = parameters.concat(getParametersOrProperties(param))
        }
      })
    }
  })

  if (!node.comment) {
    warn(`missing comment for signature: ${node.getFriendlyFullName()}`)
  } else if (!node.comment.summary) {
    warn(`missing summary for signature: ${node.getFriendlyFullName()}`)
  }

  let returnType = node.type ? node.type.toString() : 'void'
  let signatureParams = parameters.map((p) => `${p.name}: ${p.type}`).join(', ')
  let signature = `${node.name}(${signatureParams}): ${returnType}`

  if (node.parent.kind === typedoc.ReflectionKind.Function) {
    signature = `function ${signature}`
  }

  return {
    name: node.name,
    signature,
    description: node.comment?.summary ? processComment(node.comment.summary) : '',
    parameters,
    returns: node.comment?.getTag('@returns')?.content
      ? processComment(node.comment.getTag('@returns')!.content)
      : undefined,
  }
}

// Get one or more parameters to document for a single function param.
// Results in multiple params when the function param is an object with nested
// fields. For example: `func(options: { a: boolean, b: string })`
function getParametersOrProperties(
  node: typedoc.ParameterReflection | typedoc.ReferenceReflection,
): ParameterOrProperty[] {
  if (!node.isReference()) {
    let param = getParameterOrProperty(node)
    return param ? [param] : []
  }

  let api = node.getTargetReflectionDeep()

  if (!api || api.kind === typedoc.ReflectionKind.TypeParameter) {
    return []
  }

  // For now, we assume the class will be documented on it's own and we can just cross-link
  // TODO: Cross-link to the class
  if (api.kind === typedoc.ReflectionKind.Class) {
    let param = getParameterOrProperty(node)
    return param ? [param] : []
  }

  // Expand out individual fields of interfaces
  if (api.kind === typedoc.ReflectionKind.Interface) {
    let params: ParameterOrProperty[] = []
    let param = getParameterOrProperty(node)
    if (param) {
      params.push(param)
    }

    api.traverse((child) => {
      if (child.isDeclaration()) {
        let childParam = getParameterOrProperty(child, [node.name])
        if (childParam) {
          params.push(childParam)
        } else {
          warn(`Missing comment for parameter: ${child.name} in ${api.getFriendlyFullName()}`)
        }
      }
    })

    return params
  }

  if (api.kind === typedoc.ReflectionKind.TypeAlias) {
    let param = getParameterOrProperty(node)
    return param ? [param] : []
  }

  throw new Error(`Unhandled parameter kind: ${typedoc.ReflectionKind[api.kind]}`)
}

function getParameterOrProperty(
  node:
    | typedoc.ParameterReflection
    | typedoc.DeclarationReflection
    | typedoc.SignatureReflection
    | undefined,
  prefix: string[] = [],
): ParameterOrProperty | undefined {
  invariant(node, 'Invalid node for comment')
  return {
    name: [...prefix, node.name].join('.'),
    type: node.type ? node.type.toString() : 'unknown',
    description: node.comment?.summary ? processComment(node.comment.summary) : '',
  }
}

function processComment(parts: typedoc.CommentDisplayPart[]): string {
  return parts.reduce((acc, part) => {
    let text = part.text
    if (part.kind === 'inline-tag' && part.tag === '@link') {
      let target = part.target
      invariant(
        target && target instanceof typedoc.Reflection,
        `Missing/invalid target for @link content: ${part.text}`,
      )
      let path = getDocumentedApiPath(target).replace(/\.md$/, '')
      let href = `${cliArgs.websiteDocsPath}/${path}`
      text = `[\`${part.text}\`](${href})`
    }
    return acc + text
  }, '')
}

/***** Markdown Generation ****/

async function writeMarkdownFiles(comments: DocumentedAPI[]) {
  for (let comment of comments) {
    let mdPath = path.join(cliArgs.docsDir, comment.path)
    await fs.mkdir(path.dirname(mdPath), { recursive: true })
    log('✅ Writing markdown file:', mdPath)
    if (comment.type === 'function') {
      await fs.writeFile(mdPath, await getFunctionMarkdown(comment))
    } else if (comment.type === 'class') {
      await fs.writeFile(mdPath, await getClassMarkdown(comment))
    }
  }
}

const h = (level: number, heading: string, body?: string) =>
  `${'#'.repeat(level)} ${heading}${body ? `\n\n${body}` : ''}`
const h1 = (heading: string) => h(1, heading)
const h2 = (heading: string, body: string) => h(2, heading, body)
const h3 = (heading: string, body: string) => h(3, heading, body)
const h4 = (heading: string, body: string) => h(4, heading, body)
const code = (content: string) => `\`${content}\``
const pre = async (content: string, lang = 'ts') => {
  try {
    content = await prettier.format(content, { parser: 'typescript' })
  } catch (e) {
    warn(
      'Failed to format code block, using unformatted content: ',
      content.length > 30 ? content.substring(0, 30) + '...' : content,
    )
    warn(e)
  }
  return `\`\`\`${lang}\n${content}\n\`\`\``
}

async function getFunctionMarkdown(comment: DocumentedFunction): Promise<string> {
  return [
    `---\ntitle: ${comment.name}\n---`,
    h1(comment.name),
    h2('Summary', comment.description),
    h2('Signature', await pre(comment.signature)),
    comment.example
      ? h2(
          'Example',
          comment.example.trim().startsWith('```') ? comment.example : await pre(comment.example),
        )
      : undefined,
    h2(
      'Params',
      comment.parameters.map((param) => h3(code(param.name), param.description)).join('\n\n'),
    ),
    comment.returns ? h2('Returns', comment.returns) : undefined,
  ]
    .filter(Boolean)
    .join('\n\n')
}

async function getClassMarkdown(comment: DocumentedClass): Promise<string> {
  return [
    `---\ntitle: ${comment.name}\n---`,
    h1(comment.name),
    h2('Summary', comment.description),
    comment.example ? h2('Example', comment.example) : undefined,
    comment.constructor
      ? h2(
          'Constructor',
          [
            comment.constructor.description,
            ...comment.constructor.parameters.map((p) => h3(code(p.name), p.description)),
          ]
            .filter(Boolean)
            .join('\n\n'),
        )
      : undefined,
    comment.properties
      ? h2(
          'Properties',
          comment.properties.map((p) => h3(code(p.name), p.description)).join('\n\n'),
        )
      : undefined,
    comment.methods
      ? h2(
          'Methods',
          comment.methods
            .map((m) =>
              [
                h3(code(m.signature), m.description),
                ...m.parameters.map((p) => h4(p.name, p.description)),
              ].join('\n\n'),
            )
            .join('\n\n'),
        )
      : undefined,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/***** Utils *****/

function log(...args: unknown[]) {
  console.log(...args)
}

function warn(...args: unknown[]) {
  console.warn('⚠️', ...args)
}

function unimplemented(...args: unknown[]) {
  console.error('‼️', 'Unimplemented:', ...args)
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
