import { defineConfig } from 'vite'
import { config } from 'dotenv'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Load root .env so we can inject GOOGLE_CLIENT_ID
config({ path: '../.env' })

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __GOOGLE_CLIENT_ID__: JSON.stringify(process.env.GOOGLE_CLIENT_ID || ''),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
