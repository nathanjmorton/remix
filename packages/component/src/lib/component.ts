import type { EventListeners } from '@remix-run/interaction'

export namespace Remix {
  /**
   * Any valid element type accepted by JSX or `createElement`.
   * - `string` for host elements (e.g., 'div')
   * - `Function` for user components
   */
  export type ElementType = string | Function

  /**
   * Generic bag of props passed to elements/components.
   * Consumers should define specific prop types on their components; this is the
   * renderer's normalized shape used throughout reconciler/SSR code.
   */
  export type ElementProps = Record<string, any>

  /**
   * A virtual element produced by JSX/`createElement` describing UI.  Carries a
   * `$rmx` brand used to distinguish it from plain objects at runtime.
   */
  export interface RemixElement {
    type: ElementType
    props: ElementProps
    $rmx: true
  }

  /**
   * Any single value Remix can render. Booleans render as empty text.
   */
  export type Renderable = RemixElement | string | number | bigint | boolean | null | undefined

  /**
   * Anything that Remix can render, including arrays of renderable values.
   * Particularly useful for `props.children`.
   *
   * ```tsx
   * function MyComponent({ children }: { children: RemixNode }) {}
   * ```
   */
  export type RemixNode = Renderable | Renderable[]

  export type Task = (signal: AbortSignal) => void

  export interface Handle<C = Record<string, never>> {
    /**
     * Stable identifier per component instance. Useful for HTML APIs like
     * htmlFor, aria-owns, etc. so consumers don't have to supply an id.
     */
    id: string

    /**
     * Set and get values in an element tree for indirect ancestor/descendant
     * communication.
     */
    context: Context<C>

    /**
     * Schedules an update for the component to render again.
     *
     * @param task A render task to run after the update completes
     */
    update(task?: Task): void

    /**
     * Schedules a task to run after the next update.
     *
     * @param task
     */
    queueTask(task: Task): void

    /**
     * Raises an error the closest Catch boundary. Useful when running outside
     * of a framework-controlled scope (ie outside of rendering or events).
     *
     * @param error The raised error
     *
     * @example
     * ```tsx
     * this.raise(new Error("Oops"))
     * ```
     */
    raise(error: unknown): void

    /**
     * The component's closest frame
     */
    frame: FrameHandle

    /**
     * A signal indicating the connected status of the component. When the
     * component is disconnected from the tree the signal will be aborted.
     * Useful for setup scope cleanup.
     *
     * @example Clear a timer
     * ```ts
     * function Clock() {
     *   let interval = setInterval(() => {
     *     if (this.signal.aborted) {
     *       clearInterval(interval)
     *       return
     *     }
     *     this.render()
     *   }, 1000)
     *   return () => <span>{new Date().toString()}</span>
     * }
     * ```
     *
     * Because signals are event targets, you can also add an event instead.
     * ```ts
     * function Clock() {
     *   let interval = setInterval(this.render)
     *   this.signal.addEventListener("abort", () => clearInterval(interval))
     *   return () => <span>{new Date().toString()}</span>
     * }
     * ```
     *
     * @discussion
     * You don't need to check both this.signal and a render/event signal as
     * render/event signals are aborted when the component disconnects
     */
    signal: AbortSignal
  }

  /**
   * Default Handle context so types must be declared explicitly.
   */
  export type NoContext = Record<string, never>

  export type Component<
    Context = NoContext,
    SetupProps = ElementProps,
    RenderProps = ElementProps,
  > = (this: Handle<Context>, props: SetupProps) => RemixNode | ((props: RenderProps) => RemixNode)

  export type ContextFrom<ComponentType> =
    ComponentType extends Component<infer Provided, any, any>
      ? Provided
      : ComponentType extends (this: Handle<infer Provided>, ...args: any[]) => any
        ? Provided
        : never

  export interface Context<C> {
    set(values: C): void
    get<ComponentType>(component: ComponentType): ContextFrom<ComponentType>
    get(component: ElementType | symbol): unknown | undefined
  }

  // export type FrameContent = RemixElement | Element | DocumentFragment | ReadableStream | string
  export type FrameContent = DocumentFragment | string

  export type FrameHandle = EventTarget & {
    reload(): Promise<void>
    replace(content: FrameContent): Promise<void>
  }

  export interface FrameProps {
    name?: string
    src: string
    fallback?: Renderable
    on?: EventListeners
  }

  export type ComponentProps<T> = T extends {
    (props: infer Setup): infer R
  }
    ? R extends (props: infer Render) => any
      ? Setup & Render
      : Setup
    : never

  export interface CatchProps {
    children?: RemixNode
    fallback?: RemixNode | ((error: Error) => RemixNode)
  }

  export interface FragmentProps {
    children?: RemixNode
  }

  export interface BuiltinElements {
    Catch: CatchProps
    Fragment: FragmentProps
    Frame: FrameProps
  }

  export type Key = string | number | bigint
}

/**
 * Create a `RemixElement` (JSX runtime helper). Prefer JSX over calling this directly.
 */
export function createElement(
  type: Remix.ElementType,
  props: Remix.ElementProps,
  ...children: Remix.RemixNode[]
): Remix.RemixElement {
  // move rest children to props.children
  if (children.length > 0) {
    props.children = children
  }

  return { type, props, $rmx: true }
}

type ComponentConfig = {
  id: string
  type: Function
  frame: Remix.FrameHandle
  raise: (error: unknown) => void
  getContext: (type: Remix.Component) => unknown
}

export type ComponentHandle = ReturnType<typeof createComponent>

export function createComponent<C = Remix.NoContext>(config: ComponentConfig) {
  let taskQueue: Remix.Task[] = []
  let renderCtrl = new AbortController()
  let connectedCtrl = new AbortController()
  let contextValue: C | undefined = undefined

  let getContent: null | ((props: Remix.ElementProps) => Remix.RemixNode) = null
  let scheduleUpdate: (task?: Remix.Task) => void = () => {
    throw new Error('scheduleUpdate not implemented')
  }

  let context: Remix.Context<C> = {
    set: (value: C) => {
      contextValue = value
    },
    get: (type: Remix.Component) => {
      return config.getContext(type)
    },
  }

  let handle: Remix.Handle<C> = {
    id: config.id,
    update: (task?: Remix.Task) => {
      if (task) taskQueue.push(task)
      scheduleUpdate()
    },
    queueTask: (task: Remix.Task) => {
      taskQueue.push(task)
    },
    raise: config.raise,
    frame: config.frame,
    context: context,
    signal: connectedCtrl.signal,
  }

  function dequeueTasks() {
    return taskQueue.splice(0, taskQueue.length).map((task) => task.bind(handle, renderCtrl.signal))
  }

  function render(props: Remix.ElementProps): [Remix.RemixNode, Array<() => void>] {
    if (connectedCtrl.signal.aborted) {
      console.warn('render called after component was removed, potential application memory leak')
      return [null, []]
    }

    renderCtrl.abort()
    renderCtrl = new AbortController()

    if (!getContent) {
      let result = config.type.call(handle, props)
      if (typeof result === 'function') {
        getContent = (props) => result.call(handle, props, renderCtrl.signal)
      } else {
        getContent = (props) => config.type.call(handle, props)
      }
    }

    let node = getContent(props)
    return [node, dequeueTasks()]
  }

  function remove(): (() => void)[] {
    connectedCtrl.abort()
    return dequeueTasks()
  }

  function setScheduleUpdate(_scheduleUpdate: (task?: Remix.Task) => void) {
    scheduleUpdate = _scheduleUpdate
  }

  function getContextValue(): C | undefined {
    return contextValue
  }

  return { render, remove, setScheduleUpdate, frame: config.frame, getContextValue }
}

export function Frame(this: Remix.Handle<Remix.FrameHandle>, _: Remix.FrameProps) {
  return null // reconciler renders
}

export function Fragment(_: Remix.FragmentProps) {
  return null // reconciler renders
}

export function Catch(_: Remix.CatchProps) {
  return null // reconciler renders
}

export function createFrameHandle(
  def?: Partial<{
    src: string
    replace: Remix.FrameHandle['replace']
    reload: Remix.FrameHandle['reload']
  }>,
): Remix.FrameHandle {
  return Object.assign(
    new EventTarget(),
    {
      src: '/',
      replace: notImplemented('replace not implemented'),
      reload: notImplemented('reload not implemented'),
    },
    def,
  )
}

function notImplemented(msg: string) {
  return (): never => {
    throw new Error(msg)
  }
}
