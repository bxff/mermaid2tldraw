import crypto from 'node:crypto'
import { visit } from 'unist-util-visit'
import type { NormalizedMermaidTldrawOptions } from './types'

type MaybeNode = {
  type?: string
  lang?: string
  value?: string
  data?: Record<string, unknown>
}

type ParentNode = {
  children?: unknown[]
}

type MermaidMatch = {
  node: MaybeNode
  index: number
  parent: ParentNode
}

function hashString(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function createWrapperHtml(params: {
  code: string
  diagramId: string
  sourceHash: string
  options: NormalizedMermaidTldrawOptions
  staticPreviewSvg?: string | null
}): string {
  const { code, diagramId, sourceHash, options, staticPreviewSvg } = params
  const source = toBase64Url(code)
  const preview = staticPreviewSvg ? toBase64Url(staticPreviewSvg) : ''
  const className = ['astro-mermaid-tldraw', options.className].filter(Boolean).join(' ')
  const staticShell = staticPreviewSvg
    ? `<section class="border-1 border-solid border-brand rounded-1 background" style="overflow:hidden;position:relative;"><div class="flex items-center justify-between gap-2 px-3 py-2 background-brand text"><span class="font-size-2" style="display:inline-flex;align-items:center;line-height:1;transform:translateY(-0.5px);">mermaid meeting canvas</span><span style="all:unset;display:inline-grid;place-items:center;align-self:center;height:1.75rem;min-width:7.4rem;padding:0 var(--spacing-3, 0.5rem);border:1px solid var(--text, #111);border-radius:var(--spacing-1, 2px);background:var(--text, #111);color:var(--background, #fff);line-height:1;text-align:center;white-space:nowrap;font-size:var(--font-size-2, 1rem);font-weight:500;transform:translateY(-0.5px);">Open in tldraw</span></div><div class="background p-3" style="width:100%;overflow-x:hidden;overflow-y:hidden;box-sizing:border-box;">${staticPreviewSvg}</div></section>`
    : ''

  return [
    `<div class="${className}" data-mt-id="${diagramId}" data-mt-source="${source}" data-mt-preview="${preview}" data-mt-source-hash="${sourceHash}" data-mt-height="${options.defaultHeight}" data-mt-initial-mode="${options.initialMode}" data-mt-show-toolbar="${String(options.showToolbar)}" data-mt-persist-drafts="${String(options.persistDrafts)}" data-mt-storage-prefix="${escapeHtml(options.storagePrefix)}">${staticShell}</div>`,
    `<noscript><pre><code class="language-mermaid">${escapeHtml(code)}</code></pre></noscript>`,
  ].join('')
}

async function generateStaticPreviewSvg(code: string, options: NormalizedMermaidTldrawOptions): Promise<string | null> {
  if (!options.staticPreview) return null

  const base = options.staticPreviewServiceUrl.replace(/\/+$/g, '')
  const url = `${base}/mermaid/svg`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        accept: 'image/svg+xml',
      },
      body: code,
    })

    if (!response.ok) {
      return null
    }

    const svg = (await response.text()).trim()
    if (!svg.startsWith('<svg')) {
      return null
    }

    return svg
  } catch {
    return null
  }
}

export function remarkMermaidTldraw(options: NormalizedMermaidTldrawOptions) {
  return async (tree: unknown, file: { path?: string }) => {
    let mermaidIndex = 0
    const matches: MermaidMatch[] = []

    visit(tree as any, 'code', (node: MaybeNode, index: number | undefined, parent: ParentNode | undefined) => {
      if (!parent || index === undefined || node.lang !== 'mermaid' || typeof node.value !== 'string') {
        return
      }

      matches.push({ node, index, parent })
    })

    if (matches.length === 0) {
      return
    }

    const filePath = file.path ?? 'unknown-file'

    const transformed = await Promise.all(
      matches.map(async ({ node, index, parent }) => {
        mermaidIndex += 1

        const sourceHash = hashString(node.value as string)
        const diagramId = hashString(`${filePath}:${mermaidIndex}:${sourceHash}`).slice(0, 16)
        const staticPreviewSvg = await generateStaticPreviewSvg(node.value as string, options)

        return {
          parent,
          index,
          htmlNode: {
            type: 'html',
            value: createWrapperHtml({
              code: node.value as string,
              diagramId,
              sourceHash,
              options,
              staticPreviewSvg,
            }),
          } as MaybeNode,
        }
      })
    )

    for (const { parent, index, htmlNode } of transformed) {
      if (Array.isArray(parent.children)) {
        parent.children[index] = htmlNode
      }
    }
  }
}
