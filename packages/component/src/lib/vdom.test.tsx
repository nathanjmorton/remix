import { describe, it, expect } from 'vitest'
import { createRoot } from './vdom.ts'
import { invariant } from './invariant.ts'
import { Catch } from './component.ts'
import type { Dispatched } from '@remix-run/interaction'
import type { Assert, Equal } from './test/utils.ts'

describe('vnode rendering', () => {
  describe('special attributes', () => {
    it.todo('className')
    it.todo('htmlFor')
    it.todo('acceptCharset')
    it.todo('httpEquiv')
    it.todo('xlinkHref')
    it.todo('xmlLang')
    it.todo('xmlSpace')
    it.todo('data-*')
    it.todo('aria-*')
  })

  describe('special props', () => {
    it.todo('style')
    it.todo('value')
    it.todo('defaultValue')
    it.todo('checked')
    it.todo('defaultChecked')
    it.todo('disabled')
  })

  describe('framework props', () => {
    it.todo('does not render key')
    it.todo('does not render on')
    it.todo('does not render css')
    it.todo('does not render children')
    it.todo('does not render tabIndex')
    it.todo('does not render acceptCharset')
  })

  describe('css props', () => {
    it('adds class and styles', async () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(<div css={{ color: 'rgb(255, 0, 0)' }}>Hello</div>)
      let div = container.querySelector('div')
      invariant(div instanceof HTMLDivElement)
      expect(div.className).toMatch(/^rmx-/)
      document.body.appendChild(container)
      expect(getComputedStyle(div).color).toBe('rgb(255, 0, 0)')
    })
  })

  describe('svg', () => {
    it('renders SVG root and children with SVG namespace and attributes', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)

      render(
        <svg viewBox="0 0 24 24" fill="none">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>,
      )

      let svg = container.querySelector('svg')
      let path = container.querySelector('path')
      invariant(svg instanceof SVGSVGElement)
      invariant(path instanceof SVGPathElement)

      expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg')
      expect(path.namespaceURI).toBe('http://www.w3.org/2000/svg')

      // Attribute casing: preserve exceptions and kebab-case general SVG attrs
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
      expect(path.getAttribute('stroke-linecap')).toBe('round')
      expect(path.getAttribute('stroke-linejoin')).toBe('round')
    })

    it('supports xlinkHref -> xlink:href on SVG elements', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)

      render(
        <svg>
          <use xlinkHref="#my-id" />
        </svg>,
      )

      let useEl = container.querySelector('use')
      invariant(useEl instanceof SVGUseElement)

      expect(useEl.getAttribute('xlink:href')).toBe('#my-id')
    })

    it('renders HTML subtree inside foreignObject with HTML namespace', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)

      render(
        <svg>
          <foreignObject>
            <div id="x">Hello</div>
          </foreignObject>
        </svg>,
      )

      let div = container.querySelector('#x')
      invariant(div)
      expect(div instanceof HTMLDivElement).toBe(true)
      expect(div.namespaceURI).toBe('http://www.w3.org/1999/xhtml')
    })

    it('updates and removes SVG attributes', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      root.render(
        <svg>
          <path id="p" strokeLinecap="round" />
        </svg>,
      )
      let path = container.querySelector('#p')
      invariant(path instanceof SVGPathElement)

      // Update value
      root.render(
        <svg>
          <path id="p" strokeLinecap="square" />
        </svg>,
      )
      let updated = container.querySelector('#p')
      invariant(updated instanceof SVGPathElement)
      expect(updated).toBe(path)
      expect(updated.getAttribute('stroke-linecap')).toBe('square')

      // Remove attribute
      root.render(
        <svg>
          <path id="p" />
        </svg>,
      )
      let removed = container.querySelector('#p')
      invariant(removed instanceof SVGPathElement)
      expect(removed.hasAttribute('stroke-linecap')).toBe(false)
    })

    it('attaches events on SVG elements', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      let clicked = false
      root.render(
        <svg>
          <circle
            id="c"
            on={{
              click: () => {
                clicked = true
              },
            }}
          />
        </svg>,
      )
      root.flush() // attach events

      let circle = container.querySelector('#c')
      invariant(circle instanceof SVGCircleElement)
      circle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(clicked).toBe(true)
    })

    it('hydrates existing SVG subtree and preserves nodes', () => {
      let container = document.createElement('div')
      container.innerHTML =
        '<svg viewBox="0 0 24 24"><path id="p" stroke-linecap="round"></path></svg>'

      let root = createRoot(container)
      let preSvg = container.querySelector('svg')
      let prePath = container.querySelector('#p')
      invariant(preSvg instanceof SVGSVGElement && prePath instanceof SVGPathElement)

      root.render(
        <svg viewBox="0 0 24 24">
          <path id="p" strokeLinecap="round" />
        </svg>,
      )

      let postSvg = container.querySelector('svg')
      let postPath = container.querySelector('#p')
      invariant(postSvg instanceof SVGSVGElement && postPath instanceof SVGPathElement)
      expect(postSvg).toBe(preSvg)
      expect(postPath).toBe(prePath)
      // Attribute should remain correct post-hydration
      expect(postPath.getAttribute('stroke-linecap')).toBe('round')
    })
  })

  describe('inserts', () => {
    it('renders text', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render('Hello, world!')
      expect(container.innerHTML).toBe('Hello, world!')
    })

    it('renders number', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(42)
      expect(container.innerHTML).toBe('42')
    })

    it('renders 0', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(0)
      expect(container.innerHTML).toBe('0')
    })

    it('renders bigint', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(BigInt(9007199254740991))
      expect(container.innerHTML).toBe('9007199254740991')
    })

    it('renders true', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(true)
      expect(container.innerHTML).toBe('')
    })

    it('renders false', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(false)
      expect(container.innerHTML).toBe('')
    })

    it('renders null', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(null)
      expect(container.innerHTML).toBe('')
    })

    it('renders undefined', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(undefined)
      expect(container.innerHTML).toBe('')
    })
  })

  describe('elements', () => {
    it('renders basic elements', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(<div>Hello, world!</div>)
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
    })

    it('renders nested elements', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(
        <div>
          Hello, <span>world!</span>
        </div>,
      )
      expect(container.innerHTML).toBe('<div>Hello, <span>world!</span></div>')
    })

    it('renders attributes', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(<input id="hello" value="world" />)
      let input = container.querySelector('input')
      invariant(input instanceof HTMLInputElement)
      expect(input.value).toBe('world')
      expect(container.innerHTML).toBe('<input id="hello">')
    })

    it('renders 0 as a child', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(<div>{0}</div>)
      expect(container.innerHTML).toBe('<div>0</div>')
    })

    it('renders style object via DOM properties; hydration leaves string in place', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(
        <div
          style={{
            marginTop: 12,
            display: 'block',
            lineHeight: Number.NaN,
            '--size': 10,
          }}
        >
          X
        </div>,
      )
      let div = container.querySelector('div')
      invariant(div instanceof HTMLDivElement)
      expect(div.style.marginTop).toBe('12px')
      expect(div.style.display).toBe('block')
      expect(div.getAttribute('style') || '').toContain('--size: 10')
      expect(div.style.lineHeight).toBe('')

      let container2 = document.createElement('div')
      container2.innerHTML = '<div style="color: red">X</div>'
      let root2 = createRoot(container2)
      root2.render(<div style={{ color: 'blue' }}>X</div>)
      let div2 = container2.querySelector('div')
      invariant(div2 instanceof HTMLDivElement)
      expect(div2.style.color).toBe('blue')
    })
  })

  describe('fragments', () => {
    it('inserts fragments', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(
        <>
          <p>Hello</p>
          <p>world!</p>
        </>,
      )
      expect(container.innerHTML).toBe('<p>Hello</p><p>world!</p>')
    })

    it('inserts nested fragments', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(
        <div>
          <>
            <p>Hello</p>
            <p>world!</p>
          </>
          <p>Goodbye</p>
        </div>,
      )
      expect(container.innerHTML).toBe('<div><p>Hello</p><p>world!</p><p>Goodbye</p></div>')
    })

    it('inserts new nodes in a parent', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(
        <div>
          <p>Hello</p>
        </div>,
      )
      expect(container.innerHTML).toBe('<div><p>Hello</p></div>')

      let p = container.querySelector('p')
      invariant(p)
      render(
        <div>
          <p>Hello</p>
          <p>Goodbye</p>
        </div>,
      )
      expect(container.innerHTML).toBe('<div><p>Hello</p><p>Goodbye</p></div>')
      expect(container.querySelector('p')).toBe(p)
    })
  })

  describe('type<-->type updates', () => {
    it('updates a text node', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render('Hello, world!')
      expect(container.innerHTML).toBe('Hello, world!')
      render('Hello, world! 2')
      expect(container.innerHTML).toBe('Hello, world! 2')
    })

    it('updates an element', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(<div>Hello, world!</div>)
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')

      let div = container.querySelector('div')
      render(<div>Hello, world! 2</div>)
      expect(container.innerHTML).toBe('<div>Hello, world! 2</div>')
      expect(container.querySelector('div')).toBe(div)
    })

    it.skip('updates an element with attributes', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(<input id="hello" value="world" />)
      expect(container.innerHTML).toBe('<input id="hello" value="world">')

      let input = container.querySelector('input')
      render(<input id="hello" value="world 2" />)
      expect(container.innerHTML).toBe('<input id="hello" value="world 2">')
      expect(container.querySelector('input')).toBe(input)
    })

    it('updates a fragment', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(
        <>
          <p>Hello</p>
          <p>world!</p>
        </>,
      )
      let pTags = container.querySelectorAll('p')
      invariant(pTags.length === 2)

      expect(container.innerHTML).toBe('<p>Hello</p><p>world!</p>')
      render(
        <>
          <p>Goodbye</p>
          <p>Universe</p>
        </>,
      )
      expect(container.innerHTML).toBe('<p>Goodbye</p><p>Universe</p>')
      let newPTags = container.querySelectorAll('p')
      expect(newPTags.length).toBe(2)
      expect(newPTags[0]).toBe(pTags[0])
      expect(newPTags[1]).toBe(pTags[1])
    })

    it('updates a component', () => {
      let container = document.createElement('div')

      let setupCalls = 0
      function App(this: Remix.Handle) {
        let state = ++setupCalls
        return ({ title }: { title: string }) => (
          <div>
            {title} {state}
          </div>
        )
      }

      let root = createRoot(container)
      root.render(<App title="Hello" />)
      expect(container.innerHTML).toBe('<div>Hello 1</div>')
      root.render(<App title="Goodbye" />)
      expect(container.innerHTML).toBe('<div>Goodbye 1</div>')
    })

    it('updates a component with a fragment', () => {
      let container = document.createElement('div')

      let setupCalls = 0
      function App(this: Remix.Handle) {
        let state = ++setupCalls
        return ({ title }: { title: string }) => (
          <>
            <span>{title}</span>
            <span>{state}</span>
          </>
        )
      }

      let root = createRoot(container)
      root.render(<App title="Hello" />)
      expect(container.innerHTML).toBe('<span>Hello</span><span>1</span>')

      root.render(<App title="Goodbye" />)
      expect(container.innerHTML).toBe('<span>Goodbye</span><span>1</span>')
    })
  })

  describe('removals', () => {
    it('removes a text node', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(<div>Hello, world!</div>)
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      render(<div />)
      expect(container.innerHTML).toBe('<div></div>')
    })

    it('removes an element', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(
        <div>
          <span>Hello, world!</span>
        </div>,
      )
      expect(container.innerHTML).toBe('<div><span>Hello, world!</span></div>')
      render(<div />)
      expect(container.innerHTML).toBe('<div></div>')
    })

    it.skip('removes attributes', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(<input id="hello" value="world" />)
      let input = container.querySelector('input')
      invariant(input instanceof HTMLInputElement)
      expect(input.value).toBe('world')
      expect(container.innerHTML).toBe('<input id="hello">')
      root.render(<input />)
      root.flush()
      expect(input.value).toBe('')
      expect(container.innerHTML).toBe('<input id="">') // FIXME: should be <input>
    })

    it('removes a fragment', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      render(
        <div>
          <>
            <p>Hello</p>
            <p>world!</p>
          </>
        </div>,
      )
      expect(container.innerHTML).toBe('<div><p>Hello</p><p>world!</p></div>')
      render(<div />)
      expect(container.innerHTML).toBe('<div></div>')
    })

    it('removes a component', () => {
      let container = document.createElement('div')
      let { render } = createRoot(container)
      function App() {
        return <div>Hello, world!</div>
      }
      render(
        <div>
          <App />
        </div>,
      )
      expect(container.innerHTML).toBe('<div><div>Hello, world!</div></div>')
      render(<div></div>)
      expect(container.innerHTML).toBe('<div></div>')
    })
  })

  describe('components', () => {
    it.todo('warns when render is called after component is removed')

    it('inserts a component', () => {
      let container = document.createElement('div')
      function App() {
        return <div>Hello, world!</div>
      }
      let { render } = createRoot(container)
      render(<App />)
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
    })

    it('updates a component', () => {
      let container = document.createElement('div')

      let capturedUpdate = () => {}
      function App(this: Remix.Handle) {
        let count = 1
        capturedUpdate = () => {
          count++
          this.update()
        }
        return () => <div>{count}</div>
      }

      let root = createRoot(container)
      root.render(<App />)
      expect(container.innerHTML).toBe('<div>1</div>')
      let div = container.querySelector('div')
      invariant(div instanceof HTMLDivElement)

      capturedUpdate()
      root.flush()
      expect(container.innerHTML).toBe('<div>2</div>')
      expect(container.querySelector('div')).toBe(div)

      capturedUpdate()
      root.flush()
      expect(container.innerHTML).toBe('<div>3</div>')
      expect(container.querySelector('div')).toBe(div)
    })

    it('updates a component with a fragment', () => {
      let container = document.createElement('div')

      let capturedUpdate = () => {}
      function App(this: Remix.Handle) {
        let count = 1
        capturedUpdate = () => {
          count++
          this.update()
        }
        return () => (
          <>
            {Array.from({ length: count }).map((_, i) => (
              <span>{i}</span>
            ))}
          </>
        )
      }

      let root = createRoot(container)
      root.render(<App />)
      expect(container.innerHTML).toBe('<span>0</span>')
      let span = container.querySelector('span')
      invariant(span)

      capturedUpdate()
      root.flush()
      expect(container.innerHTML).toBe('<span>0</span><span>1</span>')
      let newSpanTags = container.querySelectorAll('span')
      expect(newSpanTags.length).toBe(2)
      expect(newSpanTags[0]).toBe(span)

      capturedUpdate()
      root.flush()
      expect(container.innerHTML).toBe('<span>0</span><span>1</span><span>2</span>')
    })

    it('raises errors to catch boundary', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      let capturedRaise: Remix.Handle['raise'] = () => {}

      function App(this: Remix.Handle) {
        capturedRaise = this.raise
        return () => <div>App</div>
      }

      root.render(
        <Catch fallback={<div>Error</div>}>
          <App />
        </Catch>,
      )

      expect(container.innerHTML).toBe('<div>App</div>')
      capturedRaise(new Error('Test'))
      root.flush()
      expect(container.innerHTML).toBe('<div>Error</div>')
    })
  })

  it('runs setup tasks in a microtask', async () => {
    let container = document.createElement('div')
    let root = createRoot(container)

    let taskRan = false
    function App(this: Remix.Handle) {
      this.queueTask(() => {
        taskRan = true
      })
      return () => <div>Hello, world!</div>
    }

    root.render(<App />)
    expect(taskRan).toBe(false)
    await Promise.resolve()
    expect(taskRan).toBe(true)
  })

  it('runs update tasks after updates', () => {
    let container = document.createElement('div')
    let root = createRoot(container)

    let taskRan = false
    let capturedUpdate = () => {}
    function App(this: Remix.Handle) {
      capturedUpdate = () => {
        this.queueTask(() => {
          taskRan = true
        })
        this.update()
      }

      return () => <div>Hello, world!</div>
    }

    root.render(<App />)
    root.flush()
    expect(taskRan).toBe(false)

    capturedUpdate()
    expect(taskRan).toBe(false)
    root.flush()
    expect(taskRan).toBe(true)
  })

  it('runs task provided to render', () => {
    let container = document.createElement('div')
    let root = createRoot(container)

    let taskRan = false
    let capturedUpdate = () => {}
    function App(this: Remix.Handle) {
      capturedUpdate = () => {
        this.update(() => {
          taskRan = true
        })
      }

      return () => <div>Hello, world!</div>
    }

    root.render(<App />)
    root.flush()
    expect(taskRan).toBe(false)

    capturedUpdate()
    expect(taskRan).toBe(false)
    root.flush()
    expect(taskRan).toBe(true)
  })

  describe('simple replacement', () => {
    it('replaces element -> text', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(<div>Hello, world!</div>)
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      root.render('Goodbye, element!')
      expect(container.innerHTML).toBe('Goodbye, element!')
    })

    it('replaces text -> element', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render('Hello, world!')
      expect(container.innerHTML).toBe('Hello, world!')
      root.render(<div>Goodbye, world!</div>)
      expect(container.innerHTML).toBe('<div>Goodbye, world!</div>')
    })

    it('replaces element -> component', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(<div>Hello, world!</div>)
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      function App() {
        return <div>Goodbye, world!</div>
      }
      root.render(<App />)
      expect(container.innerHTML).toBe('<div>Goodbye, world!</div>')
    })

    it('replaces component -> element', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      function App() {
        return <div>Hello, world!</div>
      }
      root.render(<App />)
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      root.render(<div>Goodbye, world!</div>)
      expect(container.innerHTML).toBe('<div>Goodbye, world!</div>')
    })

    it('replaces element -> element', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(<div>Hello, world!</div>)
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      root.render(<nav>Goodbye, world!</nav>)
      expect(container.innerHTML).toBe('<nav>Goodbye, world!</nav>')
    })

    it('replaces component -> component', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      function App() {
        return <div>Hello, world!</div>
      }
      root.render(<App />)
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      function App2() {
        return <div>Goodbye, world!</div>
      }
      root.render(<App2 />)
      expect(container.innerHTML).toBe('<div>Goodbye, world!</div>')
    })

    it('replaces component -> fragment', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      function App() {
        return <div>Hello, world!</div>
      }
      root.render(<App />)
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      root.render(
        <>
          <p>Goodbye</p>
          <p>world!</p>
        </>,
      )
      expect(container.innerHTML).toBe('<p>Goodbye</p><p>world!</p>')
    })

    it('replaces fragment -> component', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(
        <>
          <div>Hello, world!</div>
        </>,
      )
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      function App() {
        return <div>Goodbye, world!</div>
      }
      root.render(<App />)
      expect(container.innerHTML).toBe('<div>Goodbye, world!</div>')
    })

    it('replaces fragment -> element', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(
        <>
          <div>Hello, world!</div>
        </>,
      )
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      root.render(<div>Goodbye, world!</div>)
      expect(container.innerHTML).toBe('<div>Goodbye, world!</div>')
    })

    it('replaces fragment -> text', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(
        <>
          <div>Hello, world!</div>
        </>,
      )
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      root.render('Goodbye, world!')
      expect(container.innerHTML).toBe('Goodbye, world!')
    })

    it('replaces text -> component', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render('Hello, world!')
      expect(container.innerHTML).toBe('Hello, world!')
      function App() {
        return <div>Goodbye, world!</div>
      }
      root.render(<App />)
      expect(container.innerHTML).toBe('<div>Goodbye, world!</div>')
    })
  })

  describe('complex replacements', () => {
    it('preserves siblings', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(
        <div>
          <div>div</div>
          <span>span</span>
          <p>p</p>
        </div>,
      )
      expect(container.innerHTML).toBe('<div><div>div</div><span>span</span><p>p</p></div>')

      let div = container.querySelector('div')
      let p = container.querySelector('p')
      invariant(div && p)
      root.render(
        <div>
          <div>div</div>
          <nav>nav</nav>
          <p>p</p>
        </div>,
      )
      expect(container.innerHTML).toBe('<div><div>div</div><nav>nav</nav><p>p</p></div>')
      expect(container.querySelector('div')).toBe(div)
      expect(container.querySelector('p')).toBe(p)
    })

    it('replaces null children', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(
        <div>
          <div>div</div>
          {null}
          <p>p</p>
        </div>,
      )
      expect(container.innerHTML).toBe('<div><div>div</div><p>p</p></div>')
      let div = container.querySelector('div')
      let p = container.querySelector('p')
      invariant(div && p)

      root.render(
        <div>
          <div>div</div>
          <span>span</span>
          <p>p</p>
        </div>,
      )
      expect(container.innerHTML).toBe('<div><div>div</div><span>span</span><p>p</p></div>')
      expect(container.querySelector('div')).toBe(div)
      expect(container.querySelector('p')).toBe(p)
    })

    it('replaces fragment components', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      function Frag() {
        return (
          <>
            <span>A</span>
            <span>B</span>
          </>
        )
      }
      root.render(
        <div>
          <Frag />
          <main>main</main>
        </div>,
      )
      expect(container.innerHTML).toBe('<div><span>A</span><span>B</span><main>main</main></div>')
      let main = container.querySelector('main')
      invariant(main)

      root.render(
        <div>
          <div>one</div>
          <main>main</main>
        </div>,
      )
      expect(container.innerHTML).toBe('<div><div>one</div><main>main</main></div>')
      expect(container.querySelector('main')).toBe(main)
    })

    it('replaces components within elements', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      function App() {
        return <div>Hello, world!</div>
      }
      root.render(
        <div>
          <App />
        </div>,
      )
      expect(container.innerHTML).toBe('<div><div>Hello, world!</div></div>')

      function App2() {
        return <div>Goodbye, world!</div>
      }
      root.render(
        <div>
          <App2 />
        </div>,
      )
      expect(container.innerHTML).toBe('<div><div>Goodbye, world!</div></div>')
    })
  })

  describe('Catch', () => {
    it('renders as a fragment', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(
        <Catch fallback={<div>Error</div>}>
          <div>Hello, world!</div>
        </Catch>,
      )
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
    })

    it('removes', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(
        <Catch fallback={<div>Error</div>}>
          <div>Hello, world!</div>
        </Catch>,
      )
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      root.render(<div />)
      expect(container.innerHTML).toBe('<div></div>')
    })

    it('renders when descendant throws', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      function Throws() {
        throw new Error('Test')
      }
      root.render(
        <Catch fallback={<div>Error</div>}>
          <Throws />
        </Catch>,
      )
      expect(container.innerHTML).toBe('<div>Error</div>')
    })

    it('removes in progress nodes', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      function Throws() {
        throw new Error('Test')
      }
      root.render(
        <Catch fallback={<div>Error</div>}>
          <h1>orphan</h1>
          <Throws />
          <h2>orphan</h2>
        </Catch>,
      )
      expect(container.innerHTML).toBe('<div>Error</div>')
    })

    it('renders fallback from deeply thrown errors', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      function Throws() {
        throw new Error('Test')
      }

      function App() {
        return (
          <div>
            <h1>App</h1>
            <Throws />
          </div>
        )
      }
      root.render(
        <Catch fallback={<div>Error</div>}>
          <App />
        </Catch>,
      )
      expect(container.innerHTML).toBe('<div>Error</div>')
    })

    it('is cleared by a parent update', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      let count = 0
      function MaybeThrow() {
        count++
        if (count === 1) {
          throw new Error('Test')
        }
        return <div>All good</div>
      }

      root.render(
        <Catch fallback={<div>Error</div>}>
          <MaybeThrow />
        </Catch>,
      )
      expect(container.innerHTML).toBe('<div>Error</div>')
      root.render(
        <Catch fallback={<div>Error</div>}>
          <MaybeThrow />
        </Catch>,
      )
      expect(container.innerHTML).toBe('<div>All good</div>')
    })

    it('retains nodes on happy path updates', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      root.render(
        <Catch fallback={<div>Error</div>}>
          <div>Hello, world!</div>
        </Catch>,
      )
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      let div = container.querySelector('div')
      invariant(div)
      root.render(
        <Catch fallback={<div>Error</div>}>
          <div>Goodbye, world!</div>
        </Catch>,
      )
      expect(container.innerHTML).toBe('<div>Goodbye, world!</div>')
      expect(container.querySelector('div')).toBe(div)
    })

    it('preserves siblings when Catch trips and resets on parent re-render', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      function ThrowsOnce() {
        throw new Error('boom')
      }

      root.render(
        <div>
          <span id="left">A</span>
          <Catch fallback={<b id="fb">E</b>}>
            <ThrowsOnce />
          </Catch>
          <span id="right">B</span>
        </div>,
      )
      expect(container.innerHTML).toBe(
        '<div><span id="left">A</span><b id="fb">E</b><span id="right">B</span></div>',
      )

      let left = container.querySelector('#left')
      let right = container.querySelector('#right')
      invariant(left instanceof HTMLSpanElement && right instanceof HTMLSpanElement)

      function Ok() {
        return <div id="ok">OK</div>
      }
      root.render(
        <div>
          <span id="left">A</span>
          <Catch fallback={<b id="fb">E</b>}>
            <Ok />
          </Catch>
          <span id="right">B</span>
        </div>,
      )
      expect(container.innerHTML).toBe(
        '<div><span id="left">A</span><div id="ok">OK</div><span id="right">B</span></div>',
      )
      expect(container.querySelector('#left')).toBe(left)
      expect(container.querySelector('#right')).toBe(right)
    })

    it('uses nearest Catch on event errors (nested boundaries)', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      function App() {
        return (
          <Catch fallback={<div id="outer">Outer</div>}>
            <div>
              <Catch fallback={<div id="inner">Inner</div>}>
                <button
                  id="btn"
                  on={{
                    click: () => {
                      throw new Error('oops')
                    },
                  }}
                >
                  Click
                </button>
              </Catch>
            </div>
          </Catch>
        )
      }

      root.render(<App />)
      expect(container.innerHTML).toBe('<div><button id="btn">Click</button></div>')
      root.flush()
      let button = container.querySelector('#btn')
      invariant(button instanceof HTMLButtonElement)

      button.click()
      root.flush()

      // Only the inner boundary should trip
      expect(container.innerHTML).toBe('<div><div id="inner">Inner</div></div>')
    })

    it('preserves siblings when Catch trips and resets on parent re-render from events', () => {
      let container = document.createElement('div')
      document.body.appendChild(container)
      let root = createRoot(container)

      root.render(
        <div>
          <span>left</span>
          <Catch fallback={<b>Error</b>}>
            <button
              on={{
                click: () => {
                  throw new Error('oops')
                },
              }}
            >
              Click
            </button>
          </Catch>
          <aside>right</aside>
        </div>,
      )

      expect(container.innerHTML).toBe(
        '<div><span>left</span><button>Click</button><aside>right</aside></div>',
      )

      root.flush() // flush for events to attach
      let button = container.querySelector('button')
      invariant(button)
      button.click()
      expect(container.innerHTML).toBe(
        '<div><span>left</span><b>Error</b><aside>right</aside></div>',
      )

      let left = container.querySelector('span')
      let right = container.querySelector('aside')
      invariant(left && right)

      root.render(
        <div>
          <span>left</span>
          <Catch fallback={<b id="fb">E</b>}>
            <button>Click</button>
          </Catch>
          <aside>right</aside>
        </div>,
      )
      expect(container.innerHTML).toBe(
        '<div><span>left</span><button>Click</button><aside>right</aside></div>',
      )
      expect(container.querySelector('span')).toBe(left)
      expect(container.querySelector('aside')).toBe(right)
    })

    it('clears after an event error', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      root.render(
        <Catch fallback={<div>Error</div>}>
          <button
            on={{
              click: () => {
                throw new Error('oops')
              },
            }}
          >
            Click
          </button>
        </Catch>,
      )
      root.flush()

      let button = container.querySelector('button')
      invariant(button)

      button.click()
      root.flush()
      expect(container.innerHTML).toBe('<div>Error</div>')

      root.render(
        <Catch fallback={<div>Error</div>}>
          <button>Click</button>
        </Catch>,
      )
      root.flush()
      expect(container.innerHTML).toBe('<button>Click</button>')
    })
  })

  describe('events integration', () => {
    it('attaches events', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      let clicked = false
      root.render(
        <button
          on={{
            click: () => {
              clicked = true
            },
          }}
        >
          Click me
        </button>,
      )

      expect(container.innerHTML).toBe('<button>Click me</button>')
      root.flush() // events attachment happens after rendering

      let button = container.querySelector('button')
      invariant(button)
      button.click()
      expect(clicked).toBe(true)
    })

    it('reuses the event container', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      let clickCount = 0
      function App() {
        return (
          <button
            on={{
              click: () => {
                clickCount++
              },
            }}
          >
            Click me
          </button>
        )
      }

      root.render(<App />)
      root.flush()

      let button = container.querySelector('button')
      invariant(button)
      button.click()
      expect(clickCount).toBe(1)

      root.render(<App />)
      root.flush()

      button.click()
      expect(clickCount).toBe(2)
    })

    it('cleans up the event container', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      let clickCount = 0
      root.render(
        <button
          on={{
            click: () => {
              clickCount++
            },
          }}
        >
          Click me
        </button>,
      )
      root.flush()

      let button = container.querySelector('button')
      invariant(button)
      button.click()
      expect(clickCount).toBe(1)

      // remove on prop
      root.render(<button>Click me</button>)
      root.flush()

      button.click()
      expect(clickCount).toBe(1)
    })

    it('renders catch fallback with event errors', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      let clicked = false
      root.render(
        <Catch fallback={<div>Error</div>}>
          <button
            on={{
              click: () => {
                clicked = true
                throw new Error('Test')
              },
            }}
          >
            Click me
          </button>
        </Catch>,
      )
      expect(container.innerHTML).toBe('<button>Click me</button>')
      root.flush()
      let button = container.querySelector('button')
      invariant(button)
      button.click()
      root.flush()
      expect(clicked).toBe(true)
      expect(container.innerHTML).toBe('<div>Error</div>')
    })
  })

  describe('context', () => {
    it('provides and reads context', () => {
      let container = document.createElement('div')

      function App(this: Remix.Handle<{ value: string }>) {
        this.context.set({ value: 'test' })
        return ({ children }: { children: Remix.Node }) => <div>{children}</div>
      }

      function Child(this: Remix.Handle) {
        let { value } = this.context.get(App)
        return () => <main>Child: {value}</main>
      }

      let root = createRoot(container)
      root.render(
        <App>
          <Child />
        </App>,
      )
      expect(container.innerHTML).toContain('Child: test')
    })

    it('provides context on updates', () => {
      let container = document.createElement('div')

      let capturedUpdate = () => {}
      function App(this: Remix.Handle<{ value: string }>) {
        this.context.set({ value: 'test' })
        capturedUpdate = () => {
          this.context.set({ value: 'test2' })
          this.update()
        }
        return ({ children }: { children: Remix.Node }) => <div>{children}</div>
      }

      function Child(this: Remix.Handle) {
        let { value } = this.context.get(App)
        return <main>Child: {value}</main>
      }

      let root = createRoot(container)
      root.render(
        <App>
          <Child />
        </App>,
      )
      expect(container.innerHTML).toContain('Child: test')

      capturedUpdate()
      root.flush()
      expect(container.innerHTML).toContain('Child: test2')
    })

    it('renders descendants in order of appearance', () => {
      let container = document.createElement('div')

      let options: string[] = []
      let renderListbox = () => {}

      function Listbox(this: Remix.Handle<{ registerOption: (option: string) => void }>) {
        this.context.set({
          registerOption: (option: string) => {
            options.push(option)
          },
        })

        renderListbox = this.update

        return ({ children }: { children: Remix.Node }) => {
          options = []
          return <div>{children}</div>
        }
      }

      function Option(this: Remix.Handle) {
        let { registerOption } = this.context.get(Listbox)
        return ({ value }: { value: string }) => {
          registerOption(value)
          return <div>Option</div>
        }
      }

      function App(this: Remix.Handle) {
        return () => (
          <Listbox>
            <Option value="Option 1" />
            <Option value="Option 2" />
            <Option value="Option 3" />
          </Listbox>
        )
      }

      let root = createRoot(container)

      root.render(<App />)
      expect(options).toEqual(['Option 1', 'Option 2', 'Option 3'])

      renderListbox()
      root.flush()
      expect(options).toEqual(['Option 1', 'Option 2', 'Option 3'])
    })
  })

  describe('scheduling', () => {
    it('skips descendant updates if ancestor is scheduled', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      let capturedParentUpdate = () => {}
      let appRenderCount = 0
      function Parent(this: Remix.Handle) {
        capturedParentUpdate = () => {
          this.update()
        }
        return ({ children }: { children: Remix.Node }) => {
          appRenderCount++
          return children
        }
      }

      let childRenderCount = 0
      let capturedChildUpdate = () => {}
      function Child(this: Remix.Handle) {
        capturedChildUpdate = () => {
          this.update()
        }
        return () => {
          childRenderCount++
          return <div>Hello, world!</div>
        }
      }

      root.render(
        <Parent>
          <Child />
        </Parent>,
      )
      expect(container.innerHTML).toBe('<div>Hello, world!</div>')
      expect(appRenderCount).toBe(1)
      expect(childRenderCount).toBe(1)

      capturedChildUpdate()
      capturedParentUpdate()
      root.flush()

      expect(appRenderCount).toBe(2)
      expect(childRenderCount).toBe(2)

      // swap order
      capturedParentUpdate()
      capturedChildUpdate()
      root.flush()

      expect(appRenderCount).toBe(3)
      expect(childRenderCount).toBe(3)
    })

    it('only runs tasks once', async () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      let taskCount = 0
      let capturedUpdate = () => {}
      function App(this: Remix.Handle) {
        this.queueTask(() => {
          taskCount++
        })

        capturedUpdate = () => {
          this.update(() => {
            taskCount++
          })
        }
        return () => null
      }

      root.render(<App />)
      root.flush()
      expect(taskCount).toBe(1)

      capturedUpdate()
      root.flush()
      expect(taskCount).toBe(2)
    })
  })

  describe('signals', () => {
    it('passes signal to render callback and aborts on reentry', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      let capturedSignals: AbortSignal[] = []
      function App(this: Remix.Handle) {
        return (_props: unknown, signal: AbortSignal) => {
          capturedSignals.push(signal)
          return null
        }
      }

      root.render(<App />)
      expect(capturedSignals.length).toBe(1)
      expect(capturedSignals[0].aborted).toBe(false)

      root.render(<App />)
      expect(capturedSignals.length).toBe(2)
      expect(capturedSignals[0].aborted).toBe(true)
      expect(capturedSignals[1].aborted).toBe(false)
    })

    it('provides mounted signal on this.signal', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      let capturedSignal: AbortSignal | undefined
      function App(this: Remix.Handle) {
        capturedSignal = this.signal
        return () => null
      }

      root.render(<App />)
      invariant(capturedSignal)
      expect(capturedSignal).toBeInstanceOf(AbortSignal)
      expect(capturedSignal.aborted).toBe(false)

      root.render(null)
      root.flush()
      expect(capturedSignal.aborted).toBe(true)
    })

    it('provides render signal to tasks and aborts on re-render', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      let signals: AbortSignal[] = []
      function App(this: Remix.Handle) {
        this.queueTask((signal) => {
          signals.push(signal)
        })
        return () => null
      }

      root.render(<App />)
      root.flush()

      expect(signals.length).toBe(1)
      invariant(signals[0])
      expect(signals[0]).toBeInstanceOf(AbortSignal)
      expect(signals[0].aborted).toBe(false)

      root.render(<App />)
      root.flush()
      expect(signals.length).toBe(1)
      invariant(signals[0])
      expect(signals[0].aborted).toBe(true)
    })
  })

  describe('on', () => {
    it('adds event listeners to an event target', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      let clickCount = 0

      function App(this: Remix.Handle) {
        this.on(document, {
          click: () => {
            clickCount++
          },
        })
        return () => <div>App</div>
      }

      root.render(<App />)
      root.flush()

      document.dispatchEvent(new MouseEvent('click'))
      expect(clickCount).toBe(1)

      document.dispatchEvent(new MouseEvent('click'))
      expect(clickCount).toBe(2)
    })

    it('removes event listeners when component is disconnected', () => {
      let container = document.createElement('div')
      let root = createRoot(container)
      let clickCount = 0

      function App(this: Remix.Handle) {
        this.on(document, {
          click: (event) => {
            clickCount++
          },
        })
        return () => <div>App</div>
      }

      root.render(<App />)
      root.flush()

      document.dispatchEvent(new MouseEvent('click'))
      expect(clickCount).toBe(1)

      root.render(null)
      root.flush()

      document.dispatchEvent(new MouseEvent('click'))
      expect(clickCount).toBe(1)
    })

    describe('types', () => {
      it('provides literal event and target types to listeners', () => {
        function App(this: Remix.Handle) {
          this.on(document, {
            keydown: (event) => {
              type test = Assert<Equal<typeof event, Dispatched<KeyboardEvent, Document>>>
            },
          })
          return () => <div>App</div>
        }
      })
    })
  })

  describe('connect', () => {
    it('connects host node lifecycle to component scope', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      let capturedNode: Element | null = null

      function App(this: Remix.Handle) {
        return () => (
          <div
            connect={(node, signal) => {
              capturedNode = node
              signal.addEventListener('abort', () => {
                capturedNode = null
              })
            }}
          >
            Hello, world!
          </div>
        )
      }

      root.render(<App />)
      root.flush()
      expect(capturedNode).toBeInstanceOf(HTMLDivElement)

      root.render(null)
      root.flush()
      expect(capturedNode).toBe(null)
    })
  })

  it('calls connect only once', () => {
    let container = document.createElement('div')
    let root = createRoot(container)

    let capturedUpdate = () => {}
    let connectCalls = 0

    function App(this: Remix.Handle) {
      capturedUpdate = () => this.update()
      return () => (
        <div
          connect={() => {
            connectCalls++
          }}
        >
          Hello, world!
        </div>
      )
    }
    root.render(<App />)
    root.flush()
    expect(connectCalls).toBe(1)

    capturedUpdate()
    root.flush()
    expect(connectCalls).toBe(1)
  })

  describe('keys', () => {
    it('maintains component state when items are reordered', () => {
      let container = document.createElement('div')
      let root = createRoot(container)

      // Component with internal counter state
      function Counter(
        this: Remix.Handle,
        { id, initialCount }: { id: string; initialCount: number },
      ) {
        let count = initialCount
        let updateCounter = () => {
          count++
          this.update()
        }

        return () => (
          <div data-id={id}>
            <span>
              {id}: {count}
            </span>
            <button
              on={{
                click: updateCounter,
              }}
            >
              +
            </button>
          </div>
        )
      }

      // Render initial list: A, B, C
      root.render(
        <div>
          <Counter key="a" id="a" initialCount={1} />
          <Counter key="b" id="b" initialCount={2} />
          <Counter key="c" id="c" initialCount={3} />
        </div>,
      )
      root.flush()

      expect(container.innerHTML).toContain('a: 1')
      expect(container.innerHTML).toContain('b: 2')
      expect(container.innerHTML).toContain('c: 3')

      // Get references to buttons
      let buttonA = container.querySelector('[data-id="a"] button')
      let buttonB = container.querySelector('[data-id="b"] button')
      let buttonC = container.querySelector('[data-id="c"] button')
      invariant(buttonA instanceof HTMLButtonElement)
      invariant(buttonB instanceof HTMLButtonElement)
      invariant(buttonC instanceof HTMLButtonElement)

      // Increment counters: A once, B twice, C once
      buttonA.click()
      root.flush()
      buttonB.click()
      root.flush()
      buttonB.click()
      root.flush()
      buttonC.click()
      root.flush()

      expect(container.innerHTML).toContain('a: 2')
      expect(container.innerHTML).toContain('b: 4')
      expect(container.innerHTML).toContain('c: 4')

      // Get DOM references before reorder
      let divA = container.querySelector('[data-id="a"]')
      let divB = container.querySelector('[data-id="b"]')
      let divC = container.querySelector('[data-id="c"]')
      invariant(divA instanceof HTMLDivElement)
      invariant(divB instanceof HTMLDivElement)
      invariant(divC instanceof HTMLDivElement)

      // Verify initial DOM order: A, B, C
      let parentDiv = container.querySelector('div')
      invariant(parentDiv instanceof HTMLDivElement)
      let children = Array.from(parentDiv.children)
      expect(children[0]).toBe(divA)
      expect(children[1]).toBe(divB)
      expect(children[2]).toBe(divC)

      // Reorder: C, A, B
      root.render(
        <div>
          <Counter key="c" id="c" initialCount={3} />
          <Counter key="a" id="a" initialCount={1} />
          <Counter key="b" id="b" initialCount={2} />
        </div>,
      )
      root.flush()

      // State should be preserved: A=2, B=4, C=4
      expect(container.innerHTML).toContain('a: 2')
      expect(container.innerHTML).toContain('b: 4')
      expect(container.innerHTML).toContain('c: 4')

      // DOM nodes should be reused (same references)
      let newDivA = container.querySelector('[data-id="a"]')
      let newDivB = container.querySelector('[data-id="b"]')
      let newDivC = container.querySelector('[data-id="c"]')
      invariant(newDivA instanceof HTMLDivElement)
      invariant(newDivB instanceof HTMLDivElement)
      invariant(newDivC instanceof HTMLDivElement)

      expect(newDivA).toBe(divA)
      expect(newDivB).toBe(divB)
      expect(newDivC).toBe(divC)

      // Verify DOM order changed: C, A, B
      let newChildren = Array.from(parentDiv.children)
      expect(newChildren[0]).toBe(divC)
      expect(newChildren[1]).toBe(divA)
      expect(newChildren[2]).toBe(divB)

      // Buttons should still work after reorder
      let newButtonA = container.querySelector('[data-id="a"] button')
      let newButtonB = container.querySelector('[data-id="b"] button')
      invariant(newButtonA instanceof HTMLButtonElement)
      invariant(newButtonB instanceof HTMLButtonElement)

      newButtonA.click()
      root.flush()
      newButtonB.click()
      root.flush()

      expect(container.innerHTML).toContain('a: 3')
      expect(container.innerHTML).toContain('b: 5')
      expect(container.innerHTML).toContain('c: 4')
    })

    it('preserves input values and focus when items are reordered', () => {
      let container = document.createElement('div')
      document.body.appendChild(container)
      let root = createRoot(container)

      // Render initial list: A, B, C inputs
      root.render(
        <div>
          {/* @ts-expect-error - key is handled by JSX runtime */}
          <input key="a" data-id="a" defaultValue="initial-a" />
          {/* @ts-expect-error - key is handled by JSX runtime */}
          <input key="b" data-id="b" defaultValue="initial-b" />
          {/* @ts-expect-error - key is handled by JSX runtime */}
          <input key="c" data-id="c" defaultValue="initial-c" />
        </div>,
      )
      root.flush()

      // Get references to inputs
      let inputA = container.querySelector('[data-id="a"]')
      let inputB = container.querySelector('[data-id="b"]')
      let inputC = container.querySelector('[data-id="c"]')
      invariant(inputA instanceof HTMLInputElement)
      invariant(inputB instanceof HTMLInputElement)
      invariant(inputC instanceof HTMLInputElement)

      // Type into inputs to set values
      inputA.value = 'typed-a'
      inputB.value = 'typed-b'
      inputC.value = 'typed-c'

      // Focus input B
      inputB.focus()
      expect(document.activeElement).toBe(inputB)

      // Get DOM references before reorder
      let div = container.querySelector('div')
      invariant(div instanceof HTMLDivElement)
      let children = Array.from(div.children)
      expect(children[0]).toBe(inputA)
      expect(children[1]).toBe(inputB)
      expect(children[2]).toBe(inputC)

      // Reorder: C, A, B
      root.render(
        <div>
          {/* @ts-expect-error - key is handled by JSX runtime */}
          <input key="c" data-id="c" defaultValue="initial-c" />
          {/* @ts-expect-error - key is handled by JSX runtime */}
          <input key="a" data-id="a" defaultValue="initial-a" />
          {/* @ts-expect-error - key is handled by JSX runtime */}
          <input key="b" data-id="b" defaultValue="initial-b" />
        </div>,
      )
      root.flush()

      // Verify input values are preserved
      expect(inputA.value).toBe('typed-a')
      expect(inputB.value).toBe('typed-b')
      expect(inputC.value).toBe('typed-c')

      // Verify DOM nodes are reused (same references)
      let newInputA = container.querySelector('[data-id="a"]')
      let newInputB = container.querySelector('[data-id="b"]')
      let newInputC = container.querySelector('[data-id="c"]')
      invariant(newInputA instanceof HTMLInputElement)
      invariant(newInputB instanceof HTMLInputElement)
      invariant(newInputC instanceof HTMLInputElement)

      expect(newInputA).toBe(inputA)
      expect(newInputB).toBe(inputB)
      expect(newInputC).toBe(inputC)

      // Verify DOM order changed: C, A, B
      let newChildren = Array.from(div.children)
      expect(newChildren[0]).toBe(inputC)
      expect(newChildren[1]).toBe(inputA)
      expect(newChildren[2]).toBe(inputB)

      // Verify focus is preserved on input B
      expect(document.activeElement).toBe(inputB)

      // Verify cursor position is preserved (if we had set selection)
      // Note: selection range might be lost, but the element should still be focused
      if (document.activeElement === inputB) {
        // Can still interact with the focused input
        inputB.setSelectionRange(3, 3)
        expect(inputB.selectionStart).toBe(3)
      }

      document.body.removeChild(container)
    })

    it('preserves nested input values when keyed items move to the end of the list', () => {
      type Item = {
        id: string
        label: string
      }

      let container = document.createElement('div')
      document.body.appendChild(container)
      let root = createRoot(container)

      let items: Item[] = [
        { id: 'a', label: 'Item A' },
        { id: 'b', label: 'Item B' },
        { id: 'c', label: 'Item C' },
      ]

      function render() {
        root.render(
          <div>
            {items.map((item) => (
              // @ts-expect-error - key is handled by JSX runtime
              <div key={item.id} data-id={item.id} className="list-item">
                <input type="text" placeholder={item.label} defaultValue={item.label} />
              </div>
            ))}
          </div>,
        )
        root.flush()
      }

      render()

      // Find the input for item A and type into it
      let itemADiv = container.querySelector('[data-id="a"]')
      invariant(itemADiv instanceof HTMLDivElement)
      let inputA = itemADiv.querySelector('input')
      invariant(inputA instanceof HTMLInputElement)

      inputA.value = 'typed-a'

      // Move A down once (A, B, C -> B, A, C)
      let moveDown = (id: string) => {
        let index = items.findIndex((item) => item.id === id)
        if (index === -1 || index === items.length - 1) return
        let newItems = [...items]
        ;[newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]]
        items = newItems
      }

      moveDown('a')
      render()

      itemADiv = container.querySelector('[data-id="a"]')
      invariant(itemADiv instanceof HTMLDivElement)
      inputA = itemADiv.querySelector('input')
      invariant(inputA instanceof HTMLInputElement)
      expect(inputA.value).toBe('typed-a')

      // Move A down again so it becomes the last item (B, A, C -> B, C, A)
      moveDown('a')
      render()

      itemADiv = container.querySelector('[data-id="a"]')
      invariant(itemADiv instanceof HTMLDivElement)
      inputA = itemADiv.querySelector('input')
      invariant(inputA instanceof HTMLInputElement)

      // The bug: when the item becomes last, the value is reset to the default.
      // This assertion documents the intended behavior (value should be preserved)
      expect(inputA.value).toBe('typed-a')

      document.body.removeChild(container)
    })
    it.todo('handles prepending items with keys')
    it.todo('handles appending items with keys')
    it.todo('handles removing items with keys')
    it.todo('handles inserting items with keys')
    it.todo('handles swapping adjacent items with keys')
    it.todo('handles reversing list order with keys')
    it.todo('handles complex reordering with keys')
    it.todo('replaces nodes when keys match but type differs')
    it.todo('handles mixed keyed and unkeyed children') // what does preact do?
    it.todo('handles duplicate keys (last one wins)') // what does preact do? warn probably
    it.todo('allows any type to be a key')
    it.todo('handles keys in fragments')
  })
})
