import React from 'react'
import { createRoot } from 'react-dom/client'
import { MeetingDiagram, decodeMermaidSource } from './MeetingDiagram'
import { defaultOptions, normalizeOptions, type MermaidTldrawOptions } from '../types'

const ROOT_ATTR = 'data-mt-initialized'
const SELECTOR = '.astro-mermaid-tldraw[data-mt-source]'

function asBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function asNumber(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

export function initMermaidTldraw(globalOptions: MermaidTldrawOptions = {}) {
  const normalized = normalizeOptions(globalOptions)
  const containers = document.querySelectorAll<HTMLElement>(SELECTOR)

  for (const container of containers) {
    if (container.hasAttribute(ROOT_ATTR)) continue

    const encoded = container.dataset.mtSource
    const diagramId = container.dataset.mtId
    const sourceHash = container.dataset.mtSourceHash

    if (!encoded || !diagramId || !sourceHash) continue

    const source = decodeMermaidSource(encoded)
    const initialPreviewSvg = container.dataset.mtPreview ? decodeMermaidSource(container.dataset.mtPreview) : undefined
    const height = asNumber(container.dataset.mtHeight, normalized.defaultHeight)
    const initialMode = (container.dataset.mtInitialMode as 'preview' | 'edit' | undefined) ?? normalized.initialMode
    const showToolbar = asBoolean(container.dataset.mtShowToolbar, normalized.showToolbar)
    const persistDrafts = asBoolean(container.dataset.mtPersistDrafts, normalized.persistDrafts)
    const storagePrefix = container.dataset.mtStoragePrefix ?? normalized.storagePrefix

    container.setAttribute(ROOT_ATTR, 'true')

    const root = createRoot(container)
    root.render(
      <MeetingDiagram
        diagramId={diagramId}
        mermaidSource={source}
        initialPreviewSvg={initialPreviewSvg}
        sourceHash={sourceHash}
        height={height}
        initialMode={initialMode}
        showToolbar={showToolbar}
        persistDrafts={persistDrafts}
        storagePrefix={storagePrefix}
      />
    )
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initMermaidTldraw(defaultOptions)
    })
  } else {
    initMermaidTldraw(defaultOptions)
  }
}
