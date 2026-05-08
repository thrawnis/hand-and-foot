import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'dev'; }
})();

export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
  },
})
