import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Forward /api/* unchanged so the daemon's resolveApiRoute() still
      // sees the /api prefix. The auth middleware only runs the JWT check
      // when isApiPrefixed is true; stripping /api here would skip it and
      // make every authed route 401 even with a valid token.
      '/api': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
    },
  },
  build: {
    // (v1.10.510) Vendor manual chunks. The default Vite chunker
    // emits one giant index.js bundling app + vendor, which trips
    // the "chunks larger than 500 kB" warning. Splitting vendor
    // (react / xterm / lucide) keeps the cache hit rate high
    // across releases — vendor chunk only changes when
    // node_modules update.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (id.includes('xterm')) return 'vendor-xterm';
          if (id.includes('lucide-react')) return 'vendor-lucide';
          if (id.includes('react-dom')) return 'vendor-react-dom';
          if (id.match(/[\\/]react[\\/]/)) return 'vendor-react';
          return 'vendor';
        },
      },
    },
  },
});
