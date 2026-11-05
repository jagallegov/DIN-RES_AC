import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': process.env.TABLERO_API_URL ?? 'http://localhost:8000' }
  },
  build: {
    chunkSizeWarningLimit: 1300
  },
  test: {
    environment: 'node',
    include: ['pruebas/**/*.test.ts']
  }
});
