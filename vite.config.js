import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { localApi } from './server/localApi.js';

export default defineConfig({
  plugins: [react(), tailwindcss(), localApi()],
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        challengeDemo: fileURLToPath(new URL('./challenge-demo.html', import.meta.url)),
      },
    },
  },
  test: { environment: 'jsdom', include: ['src/**/*.spec.{js,jsx}'] },
});
