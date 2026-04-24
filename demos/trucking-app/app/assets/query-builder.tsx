import { type Handle, clientEntry, on } from 'remix/component'

import { routes } from '../routes.ts'

export type ColumnRef = {
  id: string
  label: string
}

type ChipKind = 'dimension' | 'measure'

export type QueryBuilderProps = {
  dimensions: ColumnRef[]
  measures: ColumnRef[]
  selectedDimensionIds: string[]
  selectedMeasureIds: string[]
}

// dataTransfer payload shape:
//   "<source>:<kind>:<id>"
// source = "library" or "zone". This lets us distinguish adding vs. moving,
// and reject drops into the wrong zone (dimension chips into measures, etc.).
const DATA_TYPE = 'application/x-analytics-chip'

interface DropPayload {
  source: 'library' | 'zone'
  kind: ChipKind
  id: string
}

function encode(payload: DropPayload): string {
  return `${payload.source}:${payload.kind}:${payload.id}`
}

function decode(raw: string): DropPayload | null {
  let [source, kind, id] = raw.split(':')
  if (!source || !kind || !id) return null
  if (source !== 'library' && source !== 'zone') return null
  if (kind !== 'dimension' && kind !== 'measure') return null
  return { source, kind, id }
}

function buildHref(selectedDimensionIds: string[], selectedMeasureIds: string[]): string {
  let params = new URLSearchParams()
  for (let id of selectedDimensionIds) params.append('dim', id)
  for (let id of selectedMeasureIds) params.append('measure', id)
  let base = routes.analytics.href()
  let qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

function removeId(ids: string[], id: string): string[] {
  return ids.filter((existing) => existing !== id)
}

function moveId(ids: string[], id: string, targetIndex: number): string[] {
  let filtered = ids.filter((existing) => existing !== id)
  let clamped = Math.max(0, Math.min(targetIndex, filtered.length))
  return [...filtered.slice(0, clamped), id, ...filtered.slice(clamped)]
}

function insertAtIndex(ids: string[], id: string, targetIndex: number): string[] {
  if (ids.includes(id)) return moveId(ids, id, targetIndex)
  let clamped = Math.max(0, Math.min(targetIndex, ids.length))
  return [...ids.slice(0, clamped), id, ...ids.slice(clamped)]
}

// Walks up the DOM from the drop target to find the closest chip index within
// the zone. Returns the total number of chips (i.e. append at end) when the
// user drops on the empty area.
function computeDropIndex(zone: HTMLElement, target: EventTarget | null): number {
  let chips = Array.from(zone.querySelectorAll<HTMLElement>('[data-chip]'))
  if (!(target instanceof Node)) return chips.length
  for (let i = 0; i < chips.length; i++) {
    if (chips[i]!.contains(target)) return i
  }
  return chips.length
}

export const QueryBuilder = clientEntry(
  import.meta.url,
  function QueryBuilder(handle: Handle, setup: QueryBuilderProps) {
    let dimensions = setup.dimensions
    let measures = setup.measures
    let selectedDim: string[] = [...setup.selectedDimensionIds]
    let selectedMeasure: string[] = [...setup.selectedMeasureIds]
    let dragOverZone: ChipKind | null = null

    let dimensionById = new Map(dimensions.map((d) => [d.id, d]))
    let measureById = new Map(measures.map((m) => [m.id, m]))

    let navigate = () => {
      // GET-based navigation keeps the URL as the source of truth so the
      // back/forward buttons work and the server is always authoritative.
      let href = buildHref(selectedDim, selectedMeasure)
      window.location.href = href
    }

    let onDragStart =
      (kind: ChipKind, id: string, source: 'library' | 'zone') => (event: DragEvent) => {
        if (!event.dataTransfer) return
        // `move` for both sources keeps `effectAllowed` and the zone's
        // `dropEffect` compatible; a mismatch (e.g. 'copy' vs 'move') makes
        // the browser reject the drop and animate the chip back to its
        // origin.
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData(DATA_TYPE, encode({ source, kind, id }))
        // Anchors also add a default 'text/uri-list' entry; the custom MIME
        // above is what the drop zone keys off of.
      }

    let onZoneDragOver = (kind: ChipKind) => (event: DragEvent) => {
      if (!event.dataTransfer) return
      // Always `preventDefault()` so the zone is a valid drop target; we
      // validate the custom MIME type on `drop` (some browsers hide
      // `dataTransfer.types` contents during dragover for privacy).
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      if (dragOverZone !== kind) {
        dragOverZone = kind
        handle.update()
      }
    }

    let onZoneDragLeave = (kind: ChipKind) => (event: DragEvent) => {
      // Only clear when leaving to something outside the zone.
      let related = event.relatedTarget
      let zone = event.currentTarget as HTMLElement
      if (related instanceof Node && zone.contains(related)) return
      if (dragOverZone === kind) {
        dragOverZone = null
        handle.update()
      }
    }

    let onZoneDrop = (zoneKind: ChipKind) => (event: DragEvent) => {
      // Always prevent the default link/URL drop the browser would perform.
      event.preventDefault()
      if (!event.dataTransfer) return
      let raw = event.dataTransfer.getData(DATA_TYPE)
      let payload = decode(raw)
      if (!payload) {
        dragOverZone = null
        handle.update()
        return
      }
      // Reject cross-kind drops to keep dimensions and measures separate.
      if (payload.kind !== zoneKind) {
        dragOverZone = null
        handle.update()
        return
      }
      let targetIndex = computeDropIndex(event.currentTarget as HTMLElement, event.target)
      if (zoneKind === 'dimension') {
        selectedDim = insertAtIndex(selectedDim, payload.id, targetIndex)
      } else {
        selectedMeasure = insertAtIndex(selectedMeasure, payload.id, targetIndex)
      }
      dragOverZone = null
      navigate()
    }

    let onRemove = (kind: ChipKind, id: string) => (event: MouseEvent) => {
      event.preventDefault()
      if (kind === 'dimension') {
        selectedDim = removeId(selectedDim, id)
      } else {
        selectedMeasure = removeId(selectedMeasure, id)
      }
      navigate()
    }

    let onAddFromLibrary = (kind: ChipKind, id: string) => (event: MouseEvent) => {
      event.preventDefault()
      if (kind === 'dimension') {
        if (!selectedDim.includes(id)) selectedDim = [...selectedDim, id]
      } else {
        if (!selectedMeasure.includes(id)) selectedMeasure = [...selectedMeasure, id]
      }
      navigate()
    }

    return () => {
      // Setup holds the authoritative state. When navigate() runs, the page
      // reloads and a fresh setup runs with the new URL-derived selection.
      // handle.update() between navigations just re-renders with the local
      // mutations of `selectedDim` / `selectedMeasure` / `dragOverZone`.
      let dims = dimensions
      let ms = measures

      let selectedDimSet = new Set(selectedDim)
      let selectedMeasureSet = new Set(selectedMeasure)

      let renderLibraryChip = (kind: ChipKind, col: ColumnRef) => {
        let isSelected =
          kind === 'dimension' ? selectedDimSet.has(col.id) : selectedMeasureSet.has(col.id)
        return (
          <a
            key={`${kind}:${col.id}`}
            href={buildHref(
              kind === 'dimension' ? [...selectedDim, col.id] : selectedDim,
              kind === 'measure' ? [...selectedMeasure, col.id] : selectedMeasure,
            )}
            class={`column-chip column-chip--${kind}${isSelected ? ' column-chip--selected' : ''}`}
            draggable={!isSelected}
            data-chip-id={col.id}
            data-chip-kind={kind}
            mix={[
              on<HTMLAnchorElement, 'dragstart'>('dragstart', onDragStart(kind, col.id, 'library')),
              on<HTMLAnchorElement, 'click'>('click', onAddFromLibrary(kind, col.id)),
            ]}
            aria-disabled={isSelected}
          >
            <span class="column-chip__label">{col.label}</span>
            {isSelected ? <span class="column-chip__badge">✓</span> : null}
          </a>
        )
      }

      let renderSelectedChip = (kind: ChipKind, id: string, index: number, ids: string[]) => {
        let lookup = kind === 'dimension' ? dimensionById : measureById
        let entry = lookup.get(id)
        let label = entry?.label ?? id
        let removedIds = removeId(ids, id)
        let href =
          kind === 'dimension'
            ? buildHref(removedIds, selectedMeasure)
            : buildHref(selectedDim, removedIds)
        return (
          <div
            key={`${kind}:${id}:${index}`}
            class={`column-chip column-chip--${kind} column-chip--selected`}
            draggable={true}
            data-chip
            data-chip-id={id}
            data-chip-kind={kind}
            mix={[on<HTMLDivElement, 'dragstart'>('dragstart', onDragStart(kind, id, 'zone'))]}
          >
            <input type="hidden" name={kind === 'dimension' ? 'dim' : 'measure'} value={id} />
            <span class="column-chip__label">{label}</span>
            <a
              href={href}
              class="column-chip__remove"
              aria-label={`Remove ${label}`}
              mix={[on<HTMLAnchorElement, 'click'>('click', onRemove(kind, id))]}
            >
              ×
            </a>
          </div>
        )
      }

      let dimChips = selectedDim.map((id, i) => renderSelectedChip('dimension', id, i, selectedDim))
      let measureChips = selectedMeasure.map((id, i) =>
        renderSelectedChip('measure', id, i, selectedMeasure),
      )

      return (
        <form class="analytics-form" method="GET" action={routes.analytics.href()}>
          <div class="analytics-layout">
            <aside class="column-library">
              <h3 class="column-library__heading">Dimensions</h3>
              <div class="column-library__group">
                {dims.map((col) => renderLibraryChip('dimension', col))}
              </div>
              <h3 class="column-library__heading">Measures</h3>
              <div class="column-library__group">
                {ms.map((col) => renderLibraryChip('measure', col))}
              </div>
              <p class="column-library__hint">Drag onto the template or click to add.</p>
            </aside>

            <section class="template">
              <div
                class={`drop-zone drop-zone--dim${
                  dragOverZone === 'dimension' ? ' drop-zone--drag-over' : ''
                }`}
                mix={[
                  on<HTMLDivElement, 'dragover'>('dragover', onZoneDragOver('dimension')),
                  on<HTMLDivElement, 'dragleave'>('dragleave', onZoneDragLeave('dimension')),
                  on<HTMLDivElement, 'drop'>('drop', onZoneDrop('dimension')),
                ]}
              >
                <h4 class="drop-zone__heading">Dimensions</h4>
                <div class="drop-zone__items">
                  {dimChips.length > 0 ? (
                    dimChips
                  ) : (
                    <p class="drop-zone__empty">Drop dimensions here to group by.</p>
                  )}
                </div>
              </div>

              <div
                class={`drop-zone drop-zone--measure${
                  dragOverZone === 'measure' ? ' drop-zone--drag-over' : ''
                }`}
                mix={[
                  on<HTMLDivElement, 'dragover'>('dragover', onZoneDragOver('measure')),
                  on<HTMLDivElement, 'dragleave'>('dragleave', onZoneDragLeave('measure')),
                  on<HTMLDivElement, 'drop'>('drop', onZoneDrop('measure')),
                ]}
              >
                <h4 class="drop-zone__heading">Measures</h4>
                <div class="drop-zone__items">
                  {measureChips.length > 0 ? (
                    measureChips
                  ) : (
                    <p class="drop-zone__empty">Drop measures here to aggregate.</p>
                  )}
                </div>
              </div>

              <div class="template__actions">
                <button type="submit" class="btn">
                  Run Query
                </button>
                <a href={routes.analytics.href()} class="btn btn-secondary btn-sm">
                  Reset
                </a>
              </div>
            </section>
          </div>
        </form>
      )
    }
  },
)
