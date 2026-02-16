import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  DefaultSpinner,
  Tldraw,
  createTLStore,
  getSnapshot,
  loadSnapshot,
  serializeTldrawJsonBlob,
  toRichText,
  type Editor,
  type TLStore,
  type TLEditorSnapshot,
} from 'tldraw'
import 'tldraw/tldraw.css'
import type { DiagramMode } from '../types'

const PREVIEW_ERROR = 'Unable to render Mermaid preview.'
const STORAGE_VERSION = 'v6-native-shapes-arc-oval'
const MERMAID_FONT_SIZE_PX = 22
let mermaidReady = false

const ACTION_BOX_STYLE: React.CSSProperties = {
  all: 'unset',
  display: 'inline-grid',
  placeItems: 'center',
  alignSelf: 'center',
  height: '1.75rem',
  minWidth: 'auto',
  padding: '0 var(--spacing-3, 0.5rem)',
  border: '1px solid var(--text, #111)',
  borderRadius: 'var(--spacing-1, 2px)',
  background: 'var(--text, #111)',
  color: 'var(--background, #fff)',
  cursor: 'pointer',
  lineHeight: 1,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  fontSize: 'var(--font-size-2, 1rem)',
  fontWeight: 500,
  transform: 'translateY(-0.5px)',
  textDecoration: 'none',
}

type InternalLoadState =
  | { status: 'loading' }
  | { status: 'ready'; store: TLStore; hasDraft: boolean }
  | { status: 'error'; message: string }

export interface MeetingDiagramProps {
  diagramId: string
  mermaidSource: string
  initialPreviewSvg?: string
  sourceHash: string
  height: number
  initialMode: DiagramMode
  showToolbar: boolean
  persistDrafts: boolean
  storagePrefix: string
}

function throttle(fn: () => void, waitMs: number) {
  let lastRun = 0
  let timer: number | null = null

  return () => {
    const now = Date.now()
    const remaining = waitMs - (now - lastRun)

    if (remaining <= 0) {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      lastRun = now
      fn()
      return
    }

    if (timer === null) {
      timer = window.setTimeout(() => {
        lastRun = Date.now()
        timer = null
        fn()
      }, remaining)
    }
  }
}

function decodeBase64Url(value: string): string {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const padLength = (4 - (base64.length % 4)) % 4
  const padded = `${base64}${'='.repeat(padLength)}`
  return decodeURIComponent(
    Array.from(window.atob(padded))
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
  )
}

function enhanceSvgForPreview(svgMarkup: string): string {
  try {
    const doc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml')
    const svg = doc.querySelector('svg')
    if (!svg) return svgMarkup

    const widthAttr = svg.getAttribute('width')
    const heightAttr = svg.getAttribute('height')
    const parsedWidth = widthAttr ? Number.parseFloat(widthAttr) : Number.NaN
    const parsedHeight = heightAttr ? Number.parseFloat(heightAttr) : Number.NaN
    const hasViewBox = Boolean(svg.getAttribute('viewBox'))

    if (!hasViewBox && Number.isFinite(parsedWidth) && Number.isFinite(parsedHeight)) {
      svg.setAttribute('viewBox', `0 0 ${Math.round(parsedWidth)} ${Math.round(parsedHeight)}`)
    }

    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet')

    const existingStyle = svg.getAttribute('style') ?? ''
    const normalizedStyle = `${existingStyle};display:block;width:100%;height:auto;max-width:100%;`
    svg.setAttribute('style', normalizedStyle)

    svg.removeAttribute('width')

    return svg.outerHTML
  } catch {
    return svgMarkup
  }
}

function ActionLink(props: { label: string; onClick: () => void }) {
  const { label, onClick } = props

  return (
    <a
      href="#"
      className="astro-mermaid-tldraw-action"
      style={ACTION_BOX_STYLE}
      onClick={(event) => {
        event.preventDefault()
        onClick()
      }}
    >
      {label}
    </a>
  )
}

function getStorageKey(storagePrefix: string, diagramId: string, sourceHash: string): string {
  return `${storagePrefix}:${STORAGE_VERSION}:${window.location.pathname}:${diagramId}:${sourceHash}`
}

function createDownloadFilename(diagramId: string): string {
  const path = window.location.pathname
    .replace(/^\/+|\/+$/g, '')
    .replaceAll('/', '-')
    .replace(/[^a-zA-Z0-9-]/g, '')

  const pagePart = path.length > 0 ? path : 'page'
  return `${pagePart}-${diagramId}.tldr`
}

function createStoreFromLocal(storageKey: string, persistDrafts: boolean): InternalLoadState {
  const store = createTLStore()

  if (!persistDrafts) {
    return { status: 'ready', store, hasDraft: false }
  }

  const raw = window.localStorage.getItem(storageKey)
  if (!raw) {
    return { status: 'ready', store, hasDraft: false }
  }

  try {
    const snapshot = JSON.parse(raw) as TLEditorSnapshot
    loadSnapshot(store, snapshot)
    return { status: 'ready', store, hasDraft: true }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Invalid local draft',
    }
  }
}

async function getMermaidApi() {
  const mermaid = (await import('mermaid')).default
  if (!mermaidReady) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'default',
      themeVariables: {
        fontSize: `${MERMAID_FONT_SIZE_PX}px`,
      },
    })
    mermaidReady = true
  }
  return mermaid
}

async function renderMermaidSvg(source: string, id: string): Promise<string> {
  const mermaid = await getMermaidApi()
  const renderId = `${id}-${Math.random().toString(36).slice(2, 8)}`
  const result = await mermaid.render(renderId, source)
  return result.svg
}

function parseTranslate(transform: string | null | undefined): { x: number; y: number } {
  if (!transform) return { x: 0, y: 0 }
  const match = transform.match(/translate\(([^,\s)]+)(?:[,\s]+([^\s)]+))?\)/)
  if (!match) return { x: 0, y: 0 }
  const x = Number.parseFloat(match[1] ?? '0')
  const y = Number.parseFloat(match[2] ?? '0')
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  }
}

function parseCssRgb(value: string): { r: number; g: number; b: number } | null {
  const match = value.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i)
  if (!match) return null
  const r = Number.parseInt(match[1], 10)
  const g = Number.parseInt(match[2], 10)
  const b = Number.parseInt(match[3], 10)
  if (![r, g, b].every(Number.isFinite)) return null
  return { r, g, b }
}

function rgbToHue({ r, g, b }: { r: number; g: number; b: number }): number {
  const nr = r / 255
  const ng = g / 255
  const nb = b / 255
  const max = Math.max(nr, ng, nb)
  const min = Math.min(nr, ng, nb)
  const delta = max - min
  if (delta === 0) return 0
  if (max === nr) return ((ng - nb) / delta) * 60
  if (max === ng) return ((nb - nr) / delta) * 60 + 120
  return ((nr - ng) / delta) * 60 + 240
}

function parsePathFirstAndLastPoint(d: string): { start: { x: number; y: number }; end: { x: number; y: number } } | null {
  const values = d
    .replaceAll(/[A-Za-z]/g, ' ')
    .split(/[\s,]+/)
    .map((token) => Number.parseFloat(token))
    .filter((value) => Number.isFinite(value))

  if (values.length < 4) return null

  return {
    start: { x: values[0], y: values[1] },
    end: { x: values[values.length - 2], y: values[values.length - 1] },
  }
}

function decodeDataPoints(dataPoints: string | null): Array<{ x: number; y: number }> {
  if (!dataPoints) return []
  try {
    const decoded = window.atob(dataPoints)
    const value = JSON.parse(decoded) as Array<{ x?: number; y?: number }>
    return value
      .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  } catch {
    return []
  }
}

function getNodeLabel(node: Element): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function getNodeShapeKind(primitive: Element):
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'oval'
  | 'triangle'
  | 'hexagon' {
  const tag = primitive.tagName.toLowerCase()
  if (tag === 'polygon') {
    const rawPoints = primitive.getAttribute('points') ?? ''
    const points = rawPoints
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(',').map((n) => Number.parseFloat(n)))
      .filter((pair) => pair.length === 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]))

    if (points.length === 3) return 'triangle'
    if (points.length === 4) return 'diamond'
    if (points.length === 6) return 'hexagon'
    return 'diamond'
  }
  if (tag === 'ellipse' || tag === 'circle') return 'ellipse'
  // Mermaid uses <path> for some special nodes (e.g. database-like nodes).
  // Tldraw has no native cylinder geo, and 'oval' looks too stylized here,
  // so ellipse is the closest neutral match.
  if (tag === 'path') return 'oval'
  return 'rectangle'
}

function getElementBBox(element: Element): { x: number; y: number; w: number; h: number } | null {
  const asGraphics = element as SVGGraphicsElement
  if (typeof asGraphics.getBBox !== 'function') return null

  try {
    const box = asGraphics.getBBox()
    return { x: box.x, y: box.y, w: Math.max(1, box.width), h: Math.max(1, box.height) }
  } catch {
    return null
  }
}

function mapThemeStrokeToTldrawColor(stroke: string | null | undefined):
  | 'black'
  | 'grey'
  | 'light-blue'
  | 'green'
  | 'violet' {
  const value = (stroke ?? '').toLowerCase()
  if (value.includes('a855f7') || value.includes('9333ea') || value.includes('purple')) return 'violet'
  if (value.includes('0ea5e9') || value.includes('0284c7') || value.includes('blue')) return 'light-blue'
  if (value.includes('16a34a') || value.includes('22c55e') || value.includes('green')) return 'green'
  if (value.includes('6b7280') || value.includes('71717a') || value.includes('gray')) return 'grey'

  const rgb = parseCssRgb(value)
  if (rgb) {
    const max = Math.max(rgb.r, rgb.g, rgb.b)
    const min = Math.min(rgb.r, rgb.g, rgb.b)
    if (max < 90) return 'black'
    if (max - min < 18) return 'grey'

    const hue = rgbToHue(rgb)
    const normalizedHue = hue < 0 ? hue + 360 : hue
    if (normalizedHue >= 85 && normalizedHue <= 165) return 'green'
    if (normalizedHue >= 190 && normalizedHue <= 245) return 'light-blue'
    if (normalizedHue >= 255 && normalizedHue <= 320) return 'violet'
  }

  return 'black'
}

function mapFillToTldrawFill(fill: string | null | undefined): 'none' | 'semi' | 'solid' {
  const value = (fill ?? '').toLowerCase()
  if (!value || value === 'none' || value === 'transparent') return 'none'
  if (value.includes('ec') || value.includes('f') || value.includes('light')) return 'semi'
  return 'solid'
}

function mapStrokeWidthToSize(strokeWidth: string | null | undefined): 's' | 'm' | 'l' {
  const parsed = Number.parseFloat(strokeWidth ?? '')
  if (!Number.isFinite(parsed)) return 'm'
  if (parsed <= 1.2) return 's'
  if (parsed <= 2.4) return 'm'
  return 'l'
}

function mapDashStyle(strokeDasharray: string | null | undefined): 'solid' | 'dashed' | 'dotted' {
  const value = (strokeDasharray ?? '').trim().toLowerCase()
  if (!value || value === 'none') return 'solid'

  const numbers = value
    .split(/[\s,]+/)
    .map((token) => Number.parseFloat(token))
    .filter((n) => Number.isFinite(n))

  if (numbers.length === 0) return 'solid'
  const first = numbers[0]
  return first <= 2 ? 'dotted' : 'dashed'
}

function mapDashStyleFromClassAndStroke(
  className: string | null | undefined,
  strokeDasharray: string | null | undefined
): 'solid' | 'dashed' | 'dotted' {
  const cls = (className ?? '').toLowerCase()
  if (cls.includes('edge-pattern-dashed')) return 'dashed'
  if (cls.includes('edge-pattern-dotted')) return 'dotted'
  if (cls.includes('edge-pattern-solid')) return 'solid'
  return mapDashStyle(strokeDasharray)
}

function getNodeBoundingBox(group: Element, primitive: Element): { x: number; y: number; w: number; h: number } | null {
  const asGraphics = primitive as SVGGraphicsElement

  if (typeof asGraphics.getBBox === 'function') {
    try {
      const box = asGraphics.getBBox()
      const matrix = asGraphics.getCTM()
      if (matrix) {
        const corners = [
          new DOMPoint(box.x, box.y),
          new DOMPoint(box.x + box.width, box.y),
          new DOMPoint(box.x, box.y + box.height),
          new DOMPoint(box.x + box.width, box.y + box.height),
        ].map((point) => point.matrixTransform(matrix))

        const xs = corners.map((point) => point.x)
        const ys = corners.map((point) => point.y)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)

        if ([minX, maxX, minY, maxY].every(Number.isFinite)) {
          return {
            x: minX,
            y: minY,
            w: Math.max(1, maxX - minX),
            h: Math.max(1, maxY - minY),
          }
        }
      }
    } catch {
      // Fall through to translated bbox fallback.
    }
  }

  const primitiveBox = getElementBBox(primitive)
  if (!primitiveBox) return null

  const groupTranslate = parseTranslate(group.getAttribute('transform'))
  return {
    x: primitiveBox.x + groupTranslate.x,
    y: primitiveBox.y + groupTranslate.y,
    w: primitiveBox.w,
    h: primitiveBox.h,
  }
}

async function seedEditorFromMermaid(editor: Editor, source: string, sourceHash: string, seedSvg?: string): Promise<void> {
  const svgMarkup = seedSvg && seedSvg.trim().length > 0 ? seedSvg : await renderMermaidSvg(source, `mermaid-seed-${sourceHash}`)
  const svgDoc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml')
  const svgEl = svgDoc.querySelector('svg')

  if (!svgEl) {
    throw new Error('Invalid Mermaid SVG')
  }

  const sandbox = document.createElement('div')
  sandbox.style.position = 'fixed'
  sandbox.style.left = '-10000px'
  sandbox.style.top = '-10000px'
  sandbox.style.width = '1px'
  sandbox.style.height = '1px'
  sandbox.style.overflow = 'hidden'
  sandbox.style.opacity = '0'
  sandbox.style.pointerEvents = 'none'
  const mountedSvg = svgEl.cloneNode(true) as SVGSVGElement
  sandbox.appendChild(mountedSvg)
  document.body.appendChild(sandbox)

  try {
    const nodeShapes: any[] = []
    const arrowShapes: any[] = []

    const edgeLabels = Array.from(mountedSvg.querySelectorAll('g.edgeLabel'))
      .map((label) => {
        const text = (label.textContent ?? '').replace(/\s+/g, ' ').trim()
        const { x, y } = parseTranslate(label.getAttribute('transform'))
        return text ? { x, y, text, used: false } : null
      })
      .filter((item): item is { x: number; y: number; text: string; used: boolean } => Boolean(item))

    const nodeGroups = Array.from(mountedSvg.querySelectorAll('g.node.default'))
    for (const group of nodeGroups) {
      const primitive = group.querySelector('rect,polygon,ellipse,circle,path')
      if (!primitive) continue

      const box = getNodeBoundingBox(group, primitive)
      if (!box) continue

      const primitiveStyles = window.getComputedStyle(primitive)
      const labelStyles = window.getComputedStyle(group)

      const stroke = primitive.getAttribute('stroke') ?? primitiveStyles.stroke
      const fill = primitive.getAttribute('fill') ?? primitiveStyles.fill
      const strokeDasharray = primitive.getAttribute('stroke-dasharray') ?? primitiveStyles.strokeDasharray
      const strokeWidth = primitive.getAttribute('stroke-width') ?? primitiveStyles.strokeWidth
      const text = getNodeLabel(group)

      const shapeColor = mapThemeStrokeToTldrawColor(stroke)
      const labelColor = mapThemeStrokeToTldrawColor(labelStyles.fill || stroke)

      nodeShapes.push({
        type: 'geo',
        x: box.x,
        y: box.y,
        props: {
          geo: getNodeShapeKind(primitive),
          w: box.w,
          h: box.h,
          richText: toRichText(text),
          color: shapeColor,
          labelColor,
          fill: mapFillToTldrawFill(fill),
          dash: mapDashStyleFromClassAndStroke(primitive.getAttribute('class'), strokeDasharray),
          size: mapStrokeWidthToSize(strokeWidth),
          align: 'middle-legacy',
          verticalAlign: 'middle',
          font: 'sans',
          scale: 1,
          growY: 0,
          url: '',
        },
      })
    }

    const edgePaths = Array.from(mountedSvg.querySelectorAll('g.edgePaths path[data-edge="true"], g.edgePaths path.flowchart-link'))
    for (const path of edgePaths) {
      const pathStyles = window.getComputedStyle(path)
      const points = decodeDataPoints(path.getAttribute('data-points'))
      const fallback = parsePathFirstAndLastPoint(path.getAttribute('d') ?? '')

      const start = points[0] ?? fallback?.start
      const end = points[points.length - 1] ?? fallback?.end

      if (!start || !end) continue

      const x = Math.min(start.x, end.x)
      const y = Math.min(start.y, end.y)
      const nearestLabel = (() => {
        const mid = points[Math.floor(points.length / 2)] ?? {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
        }

        let bestIdx = -1
        let bestDist = Number.POSITIVE_INFINITY

        for (let idx = 0; idx < edgeLabels.length; idx++) {
          const label = edgeLabels[idx]
          if (label.used) continue
          const dx = label.x - mid.x
          const dy = label.y - mid.y
          const dist = Math.hypot(dx, dy)
          if (dist < bestDist) {
            bestDist = dist
            bestIdx = idx
          }
        }

        if (bestIdx < 0 || bestDist > 140) return ''
        edgeLabels[bestIdx].used = true
        return edgeLabels[bestIdx].text
      })()

      const markerEnd = path.getAttribute('marker-end') ?? ''
      const markerStart = path.getAttribute('marker-start') ?? ''
      const arrowheadEnd = markerEnd.includes('pointEnd') ? 'arrow' : markerEnd.includes('circleEnd') ? 'dot' : 'none'
      const arrowheadStart = markerStart.includes('pointStart') ? 'arrow' : markerStart.includes('circleStart') ? 'dot' : 'none'
      const pathStroke = path.getAttribute('stroke') ?? pathStyles.stroke
      const pathDasharray = path.getAttribute('stroke-dasharray') ?? pathStyles.strokeDasharray
      const pathStrokeWidth = path.getAttribute('stroke-width') ?? pathStyles.strokeWidth

      arrowShapes.push({
        type: 'arrow',
        x,
        y,
        props: {
          kind: 'elbow',
          start: { x: start.x - x, y: start.y - y },
          end: { x: end.x - x, y: end.y - y },
          bend: 0,
          richText: toRichText(nearestLabel),
          labelPosition: 0.5,
          color: mapThemeStrokeToTldrawColor(pathStroke),
          labelColor: mapThemeStrokeToTldrawColor(pathStroke),
          fill: 'none',
          dash: mapDashStyleFromClassAndStroke(path.getAttribute('class'), pathDasharray),
          size: mapStrokeWidthToSize(pathStrokeWidth),
          arrowheadStart,
          arrowheadEnd,
          font: 'sans',
          scale: 1,
          elbowMidPoint: 0.5,
        },
      })
    }

    if (nodeShapes.length === 0 && arrowShapes.length === 0) {
      throw new Error('No native shapes were produced from Mermaid SVG')
    }

    editor.createShapes([...arrowShapes, ...nodeShapes] as any)
    editor.zoomToFit({ animation: { duration: 200 } })
  } finally {
    sandbox.remove()
  }
}

export function MeetingDiagram(props: MeetingDiagramProps) {
  const { diagramId, mermaidSource, initialPreviewSvg, sourceHash, height, initialMode, showToolbar, persistDrafts, storagePrefix } =
    props

  const storageKey = useMemo(
    () => getStorageKey(storagePrefix, diagramId, sourceHash),
    [storagePrefix, diagramId, sourceHash]
  )

  const [mode, setMode] = useState<DiagramMode>(initialMode)
  const [loadState, setLoadState] = useState<InternalLoadState>({ status: 'loading' })
  const [previewSvg, setPreviewSvg] = useState<string>(initialPreviewSvg ? enhanceSvgForPreview(initialPreviewSvg) : '')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const seededRef = useRef(false)
  const previewScrollRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Editor | null>(null)

  useEffect(() => {
    if (!expanded) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previous
    }
  }, [expanded])

  useEffect(() => {
    setLoadState(createStoreFromLocal(storageKey, persistDrafts))
    seededRef.current = false
  }, [storageKey, persistDrafts])

  useEffect(() => {
    if (loadState.status !== 'ready' || !persistDrafts) return

    const persistNow = throttle(() => {
      const snapshot = getSnapshot(loadState.store)
      window.localStorage.setItem(storageKey, JSON.stringify(snapshot))
    }, 400)

    const cleanup = loadState.store.listen(persistNow, {
      source: 'user',
      scope: 'document',
    })

    return cleanup
  }, [loadState, storageKey, persistDrafts])

  useEffect(() => {
    if (mode !== 'preview') return
    if (previewSvg) return

    let cancelled = false

    const run = async () => {
      try {
        const svg = await renderMermaidSvg(mermaidSource, `mermaid-preview-${sourceHash}`)
        if (!cancelled) {
          setPreviewSvg(enhanceSvgForPreview(svg))
          setPreviewError(null)
        }
      } catch {
        if (!cancelled) {
          setPreviewError(PREVIEW_ERROR)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [mode, mermaidSource, sourceHash])

  useEffect(() => {
    if (mode !== 'preview') return
    if (!previewScrollRef.current) return
    previewScrollRef.current.scrollLeft = 0
    window.requestAnimationFrame(() => {
      if (previewScrollRef.current) {
        previewScrollRef.current.scrollLeft = 0
      }
    })

    const t1 = window.setTimeout(() => {
      if (previewScrollRef.current) previewScrollRef.current.scrollLeft = 0
    }, 120)

    const t2 = window.setTimeout(() => {
      if (previewScrollRef.current) previewScrollRef.current.scrollLeft = 0
    }, 320)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [mode, previewSvg])

  useEffect(() => {
    if (mode !== 'edit' && expanded) {
      setExpanded(false)
    }
  }, [mode, expanded])

  useEffect(() => {
    if (mode === 'edit' && !expanded) {
      setExpanded(true)
    }
  }, [mode, expanded])

  const openEditMode = () => {
    setMode('edit')
    setExpanded(true)
  }

  const closeLargeCanvas = () => {
    setExpanded(false)
    setMode('preview')
  }

  const downloadTldrawFile = () => {
    const run = async () => {
      if (!editorRef.current) return

      const blob = await serializeTldrawJsonBlob(editorRef.current)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = createDownloadFilename(diagramId)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    }

    void run()
  }

  const resetDraft = () => {
    if (persistDrafts) {
      window.localStorage.removeItem(storageKey)
    }
    setLoadState(createStoreFromLocal(storageKey, false))
    seededRef.current = false
  }

  const onEditorMount = (editor: Editor) => {
    editorRef.current = editor

    if (loadState.status !== 'ready') return
    if (loadState.hasDraft || seededRef.current) return

    seededRef.current = true

    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        void (async () => {
          try {
            await seedEditorFromMermaid(editor, mermaidSource, sourceHash, initialPreviewSvg)
          } catch {
            const center = editor.getViewportPageBounds().center
            await editor.putExternalContent({
              type: 'text',
              text: 'Unable to convert Mermaid. You can still edit freely here.',
              point: center,
            })
          }
        })()
      }, 0)
    })
  }

  const renderEditPane = () => {
    if (loadState.status === 'loading') {
      return (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <DefaultSpinner />
        </div>
      )
    }

    if (loadState.status === 'error') {
      return <div style={{ padding: 16, color: '#b91c1c' }}>Failed to load local draft: {loadState.message}</div>
    }

    return (
      <div className="tldraw__editor" style={{ position: 'relative', inset: 0, height: '100%' }}>
        <Tldraw store={loadState.store} onMount={onEditorMount} />
      </div>
    )
  }

  return (
    <section
      className="border-1 border-solid border-brand rounded-1 background"
      style={{
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {showToolbar ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 background-brand text">
          <span
            className="font-size-2"
            style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, transform: 'translateY(-0.5px)' }}
          >
            mermaid meeting canvas
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', transform: 'translateY(-0.5px)' }}>
            {mode === 'preview' ? <ActionLink label="Open in tldraw" onClick={openEditMode} /> : null}
          </div>
        </div>
      ) : null}

      <div>
        {mode === 'preview' ? (
          previewError ? (
            <div style={{ padding: 16, color: '#b91c1c', background: 'var(--background, #fff)' }}>
              <p style={{ marginTop: 0 }}>{previewError}</p>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{mermaidSource}</pre>
            </div>
          ) : previewSvg ? (
            <div
              ref={previewScrollRef}
              className="background p-3"
              style={{
                width: '100%',
                overflowX: 'hidden',
                overflowY: 'hidden',
                boxSizing: 'border-box',
                scrollbarWidth: 'thin',
              }}
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
          ) : (
            <div style={{ height: 136, display: 'grid', placeItems: 'center' }}>
              <DefaultSpinner />
            </div>
          )
        ) : (
          <div style={{ minHeight: 1, background: 'var(--background, #fff)' }} />
        )}
      </div>

      {mode === 'edit' && expanded ? (
        <div
          className="border-1 border-solid border-brand rounded-1 background"
          style={{
            position: 'fixed',
            inset: '0.7rem',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: 'none',
          }}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 background-brand text">
            <span
              className="font-size-2"
              style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, transform: 'translateY(-0.5px)' }}
            >
              mermaid meeting canvas
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', transform: 'translateY(-0.5px)' }}>
              <ActionLink label="Save .tldr" onClick={downloadTldrawFile} />
              <ActionLink label="Reset" onClick={resetDraft} />
              <ActionLink label="Close" onClick={closeLargeCanvas} />
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {renderEditPane()}
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function decodeMermaidSource(encoded: string): string {
  return decodeBase64Url(encoded)
}
