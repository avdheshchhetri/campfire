import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { localApi } from './server/localApi.js';
import { readFileSync } from 'node:fs';

const pages = process.env.VITE_GITHUB_PAGES === 'true';
const publicConfig = pages ? JSON.parse(readFileSync(new URL('./config/public-supabase.json', import.meta.url), 'utf8')) : null;

export default defineConfig({
  base: pages ? '/campfire/' : '/',
  define: pages ? {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(publicConfig.url),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(publicConfig.anonKey),
  } : {},
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
