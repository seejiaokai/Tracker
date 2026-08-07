import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Serve from /Tracker/ when built for GitHub Pages; root path locally.
  base: process.env.GITHUB_PAGES ? '/Tracker/' : '/',
  plugins: [react()],
  build: {
    // One bundle, no code splitting; quieten Vite's default size warning.
    chunkSizeWarningLimit: 1500,
  },
});
