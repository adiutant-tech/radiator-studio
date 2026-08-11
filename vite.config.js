import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// UWAGA: przy deployu na GitHub Pages ustaw base na '/<nazwa-repo>/'
export default defineConfig({
  plugins: [react()],
  base: './',
})
