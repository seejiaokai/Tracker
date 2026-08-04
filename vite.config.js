import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // The pristine single-file HTML (used by "Save as new HTML") is bundled
    // as a raw string and is ~550 kB on its own; quieten the size warning.
    chunkSizeWarningLimit: 1500,
  },
});
