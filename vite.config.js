import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Serve from /Tracker/ when built for GitHub Pages; root path locally.
  base: process.env.GITHUB_PAGES ? '/Tracker/' : '/',
  plugins: [react()],
  build: {
    // The pristine single-file HTML (used by "Save as new HTML") is bundled
    // as a raw string and is ~550 kB on its own; quieten the size warning.
    chunkSizeWarningLimit: 1500,
  },
});
