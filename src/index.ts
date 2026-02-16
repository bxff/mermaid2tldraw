import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import { remarkMermaidTldraw } from './remark-mermaid-tldraw'
import { normalizeOptions, type MermaidTldrawOptions } from './types'

export type { MermaidTldrawOptions } from './types'

export function mermaidTldraw(options: MermaidTldrawOptions = {}): AstroIntegration {
  const normalized = normalizeOptions(options)
  const clientModulePath = fileURLToPath(new URL('./client/index.js', import.meta.url))

  return {
    name: 'astro-mermaid-tldraw',
    hooks: {
      'astro:config:setup': ({ updateConfig, injectScript }) => {
        updateConfig({
          markdown: {
            remarkPlugins: [[remarkMermaidTldraw, normalized]],
          },
          vite: {
            resolve: {
              alias: {
                'astro-mermaid-tldraw/client': clientModulePath,
              },
            },
            ssr: {
              noExternal: [
                'astro-mermaid-tldraw',
                'tldraw',
                'mermaid',
              ],
            },
          },
        })

        injectScript(
          'page',
          `import { initMermaidTldraw } from 'astro-mermaid-tldraw/client'; initMermaidTldraw(${JSON.stringify(normalized)});`
        )
      },
    },
  }
}

export default mermaidTldraw
