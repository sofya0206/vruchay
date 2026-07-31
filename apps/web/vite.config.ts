import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/health': 'http://localhost:3000',
    },
  },
  // Тот же прокси для просмотра собранной версии: нужен, чтобы проверять
  // поведение без горячей перезагрузки, которая маскирует часть ошибок.
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/health': 'http://localhost:3000',
    },
  },
});
