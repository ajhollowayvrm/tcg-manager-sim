import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built asset URLs work when served from a GitHub Pages
  // project subpath (https://<user>.github.io/<repo>/) as well as from root.
  base: './',
  plugins: [react()],
})
