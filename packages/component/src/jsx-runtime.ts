import type { Remix } from './lib/component.ts'
import type { EventListeners } from '@remix-run/interaction'

import type { HTMLElements } from './lib/html-types.ts'

import { createElement } from './lib/component.ts'
import type { EnhancedStyleProperties, StyleProperties } from './lib/style/index.ts'
export { Fragment } from './lib/component.ts'

// Only export the JSX runtime functions required by TypeScript
export function jsx(type: string, props: Remix.ElementProps, key?: Remix.Key): Remix.RemixElement
export function jsx<T extends (props: unknown) => unknown>(
  type: T,
  props: Remix.ComponentProps<T>,
  key?: Remix.Key,
): Remix.RemixElement
export function jsx(type: any, props: any, key?: any): Remix.RemixElement {
  return jsxAdapter(type, props, key)
}

export function jsxs(type: string, props: Remix.ElementProps, key?: Remix.Key): Remix.RemixElement
export function jsxs<T extends (props: unknown) => unknown>(
  type: T,
  props: Remix.ComponentProps<T>,
  key?: Remix.Key,
): Remix.RemixElement
export function jsxs(type: any, props: any, key?: any): Remix.RemixElement {
  return jsxAdapter(type, props, key)
}

export function jsxDEV(type: string, props: Remix.ElementProps, key?: Remix.Key): Remix.RemixElement
export function jsxDEV<T extends (props: unknown) => unknown>(
  type: T,
  props: Remix.ComponentProps<T>,
  key?: Remix.Key,
): Remix.RemixElement
export function jsxDEV(type: any, props: any, key?: any): Remix.RemixElement {
  return jsxAdapter(type, props, key)
}

function jsxAdapter(type: any, props: any, key: any): Remix.RemixElement {
  if (key !== undefined) {
    props = { ...props, key }
  }
  return createElement(type, props)
}

declare global {
  namespace JSX {
    interface IntrinsicAttributes {
      key?: Remix.Key
      css?: EnhancedStyleProperties
      style?: StyleProperties
    }

    /**
     * The type that may be returned from a JSX component.
     */
    type Element = ReturnType<Remix.Component> | any

    /**
     * The types of props that are available to various JSX components.
     */
    interface IntrinsicElements extends Remix.BuiltinElements, HTMLElements {
      // Allow any unlisted elements as fallback
      [elemName: string]: any
    }

    /**
     * Map component props so two-phase components require render props inferred
     * from their return type. This keeps JSX attribute checking aligned with
     * `Remix.ComponentProps<C>`.
     */
    type LibraryManagedAttributes<C, P> = C extends (...args: any[]) => any
      ? Remix.ComponentProps<C>
      : P
  }
}
