import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// (v1.11.102) Bundle visualizer is opt-in: ANALYZE=1 vite build emits
// web/stats.html (treemap, gzip-aware). Stays out of plugins[] otherwise
// so dev/test/normal-build flows are unaffected. See CHANGELOG 1.11.102.
const analyze = process.env['ANALYZE'] === '1';

export default defineConfig({
  plugins: [
    react(),
    ...(analyze
      ? [
          visualizer({
            filename: 'stats.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
            sourcemap: false,
          }),
        ]
      : []),
  ],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx,js,jsx}',
        'src/test/**',
        'src/main.tsx',
      ],
    },
    // Two projects:
    //   - unit:    jsdom + RTL + MSW. Fast, headless, no chromium.
    //              Pattern: src/**/*.{test,spec}.{ts,tsx}
    //   - browser: real Chromium via playwright (vitest-browser-react).
    //              Visual / screenshot tests live here.
    //              Pattern: src/**/*.browser.{test,spec}.{ts,tsx}
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
          exclude: [
            'src/**/*.browser.{test,spec}.{ts,tsx,js,jsx}',
            'node_modules/**',
          ],
          css: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.browser.{test,spec}.{ts,tsx,js,jsx}'],
          setupFiles: ['./src/test/setup.browser.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
          css: true,
        },
      },
    ],
  },
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
