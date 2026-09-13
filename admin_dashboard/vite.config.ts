import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Respects the port the Claude Code preview harness assigns via PORT
    // when 5173 is already taken by another concurrent session; falls
    // back to Vite's normal default for anyone running `npm run dev`
    // outside the harness.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
