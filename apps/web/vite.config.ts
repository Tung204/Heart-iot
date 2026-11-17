import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

/** Dev dùng source contracts (tránh interop CJS/ESM); build vẫn dùng package exports. */
const contractsSource = fileURLToPath(new URL('../../packages/contracts/src/', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@heart-iot\/contracts\/(.+)$/, replacement: `${contractsSource}$1.ts` },
      { find: '@heart-iot/contracts', replacement: `${contractsSource}core.ts` },
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
    // API dev chạy ở http://localhost:3000; không đổi .env khi dev cục bộ.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    // e2e/ do Playwright sở hữu — không chạy trong test unit.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
