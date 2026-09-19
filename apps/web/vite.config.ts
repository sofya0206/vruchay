import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

/**
 * Куда проксировать API. Переопределяется переменной окружения, чтобы
 * второй стенд (из worktree, на другом порту) не спорил с основным
 * за localhost:3000.
 */
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

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
        // Шрифты грамот — исключение: их больше сотни файлов и 3,4 МБ, а нужны
        // они только в редакторе. Без этой строки каждый посетитель посадочной
        // страницы качал бы весь набор заранее, ни разу его не открыв.
        // Браузер возьмёт нужное начертание при первом показе и оставит
        // в обычном кэше — Caddy отдаёт их с годичным сроком хранения.
        //
        // Jost остаётся: это шрифт самого интерфейса, он нужен на каждой
        // странице и в том числе без сети, когда кабинет открыт с рабочего
        // стола. Начертаний у него пятнадцать на 268 КБ — против сотни
        // файлов у остальных.
        globIgnores: ['**/fonts/!(jost-*)'],
      },
      manifest: {
        // Постоянный идентификатор приложения: без него браузер считает
        // приложением адрес start_url, и смена стартовой страницы превратила
        // бы установленное «Вручай» в чужое, второе.
        id: '/',
        name: 'Вручай — наградные документы',
        short_name: 'Вручай',
        description: 'Сертификаты, грамоты и дипломы: создание и рассылка участникам',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#4A3FCE',
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
        // Долгое нажатие на значок на телефоне: сразу туда, куда ходят
        // чаще всего, минуя главную.
        shortcuts: [
          {
            name: 'Документы',
            url: '/documents',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Реестр выданного',
            short_name: 'Реестр',
            url: '/registry',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/health': API_TARGET,
    },
  },
  // Тот же прокси для просмотра собранной версии: нужен, чтобы проверять
  // поведение без горячей перезагрузки, которая маскирует часть ошибок.
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/health': API_TARGET,
    },
  },
});
