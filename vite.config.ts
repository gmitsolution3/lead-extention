import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    crx({ manifest })
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Give each entry a stable, predictable name so the service worker loader
        // always imports the correct file regardless of content hash changes.
        entryFileNames: (chunk) => {
          const id = (chunk.facadeModuleId || '').replace(/\\/g, '/')
          if (id.includes('background') || chunk.name.includes('background')) {
            return 'assets/background.js'
          }
          if (id.includes('content') || chunk.name.includes('content')) {
            return 'assets/content.js'
          }
          return 'assets/[name]-[hash].js'
        },
        chunkFileNames: (chunk) => {
          const id = (chunk.facadeModuleId || '').replace(/\\/g, '/')
          if (id.includes('background') || chunk.name.includes('background')) {
            return 'assets/background.js'
          }
          if (id.includes('content') || chunk.name.includes('content')) {
            return 'assets/content.js'
          }
          return 'assets/[name]-[hash].js'
        },
      },
    },
  },
})
