import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react'
          if (id.includes('node_modules/recharts')) return 'charts'
          if (id.includes('node_modules/write-excel-file')) return 'excel'
          return undefined
        },
      },
    },
  },
})
