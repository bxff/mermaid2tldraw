import { defineConfig } from 'astro/config'
import { mermaidTldraw } from '../dist/index.js'

export default defineConfig({
  integrations: [
    mermaidTldraw({
      initialMode: 'preview',
      defaultHeight: 500,
      storagePrefix: 'astro-mermaid-tldraw-demo',
      showToolbar: true,
      persistDrafts: true,
    }),
  ],
})
