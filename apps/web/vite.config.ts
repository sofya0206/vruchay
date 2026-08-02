import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Свой воркер: помимо кэша оболочки в нём живёт обработка push.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        // Страница печати в PDF не должна попадать в кэш: её всегда открывает
        // браузер воркера со свежим токеном.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
      },
      manifest: {
        name: 'Вручай — наградные документы',
        short_name: 'Вручай',
        description: 'Сертификаты, грамоты и дипломы: создание и рассылка участникам',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#FBFAF7',
        theme_color: '#1F5D3F',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
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
