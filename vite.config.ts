import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    crx({ manifest })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Give each entry a stable, predictable name so the service worker loader
        // always imports the correct file regardless of content hash changes.
        entryFileNames: (chunk) => {
          if (chunk.name === 'index' && chunk.facadeModuleId?.includes('background')) {
            return 'assets/background.js'
          }
          if (chunk.name === 'index' && chunk.facadeModuleId?.includes('content')) {
            return 'assets/content.js'
          }
          return 'assets/[name]-[hash].js'
        },
      },
    },
  },
})
