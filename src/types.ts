export type DiagramMode = 'preview' | 'edit'

export interface MermaidTldrawOptions {
  /**
   * Height for each transformed Mermaid block.
   *
   * @default 420
   */
  defaultHeight?: number

  /**
   * Initial mode for each diagram.
   *
   * @default 'preview'
   */
  initialMode?: DiagramMode

  /**
   * Prefix used for browser-local draft persistence.
   *
   * @default 'astro-mermaid-tldraw:draft'
   */
  storagePrefix?: string

  /**
   * Show controls (Edit, Reset, etc).
   *
   * @default true
   */
  showToolbar?: boolean

  /**
   * Keep local drafts in browser storage.
   *
   * @default true
   */
  persistDrafts?: boolean

  /**
   * Additional CSS class applied to each diagram wrapper.
   */
  className?: string

  /**
   * Generate static SVG previews at build time.
   *
   * @default true
   */
  staticPreview?: boolean

  /**
   * Base URL for the Mermaid-to-SVG rendering service used at build time.
   *
   * @default 'https://kroki.io'
   */
  staticPreviewServiceUrl?: string
}

export interface NormalizedMermaidTldrawOptions {
  defaultHeight: number
  initialMode: DiagramMode
  storagePrefix: string
  showToolbar: boolean
  persistDrafts: boolean
  className: string
  staticPreview: boolean
  staticPreviewServiceUrl: string
}

export const defaultOptions: NormalizedMermaidTldrawOptions = {
  defaultHeight: 560,
  initialMode: 'preview',
  storagePrefix: 'astro-mermaid-tldraw:draft',
  showToolbar: true,
  persistDrafts: true,
  className: '',
  staticPreview: true,
  staticPreviewServiceUrl: 'https://kroki.io',
}

export function normalizeOptions(options: MermaidTldrawOptions = {}): NormalizedMermaidTldrawOptions {
  return {
    defaultHeight: options.defaultHeight ?? defaultOptions.defaultHeight,
    initialMode: options.initialMode ?? defaultOptions.initialMode,
    storagePrefix: options.storagePrefix ?? defaultOptions.storagePrefix,
    showToolbar: options.showToolbar ?? defaultOptions.showToolbar,
    persistDrafts: options.persistDrafts ?? defaultOptions.persistDrafts,
    className: options.className ?? defaultOptions.className,
    staticPreview: options.staticPreview ?? defaultOptions.staticPreview,
    staticPreviewServiceUrl: options.staticPreviewServiceUrl ?? defaultOptions.staticPreviewServiceUrl,
  }
}
