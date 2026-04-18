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
});
