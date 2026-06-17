import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path is overridable via DEPLOY_BASE so CI can publish a preview build under a
// /preview/ subpath of the same GitHub Pages site without disturbing the live root deploy.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.DEPLOY_BASE ?? '/Where-to-live-in-London-v3/',
  plugins: [react()],
})
