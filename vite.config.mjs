import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteApiPlugin } from './server/vite-api-plugin.mjs'

export default defineConfig({
  plugins: [react(), tailwindcss(), viteApiPlugin()],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  server: {
    port: 5173,
    strictPort: false,
    open: true,
  },
})
