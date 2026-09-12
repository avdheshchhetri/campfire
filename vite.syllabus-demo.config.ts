import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [{ find: '../../supabaseClient.js', replacement: fileURLToPath(new URL('./demo/syllabus/supabaseClient.js', import.meta.url)) }],
  },
  build: { outDir: 'dist-syllabus-demo', rollupOptions: { input: 'syllabus-demo.html' } },
});
