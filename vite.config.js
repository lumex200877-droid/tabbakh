import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app', 'localhost'],
    fs: { strict: true },
  },
  preview: { host: '0.0.0.0', allowedHosts: ['.e2b.app', 'localhost'] },
  build: { outDir: 'dist', emptyOutDir: true },
});
