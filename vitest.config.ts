import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: [{ find: '../../supabaseClient.js', replacement: fileURLToPath(new URL('./demo/syllabus/supabaseClient.js', import.meta.url)) }] },
  test: {
    include: ['src/features/challenges/**/*.test.ts', 'server/**/*.test.js', 'src/features/syllabus/**/*.test.jsx'],
  },
});
