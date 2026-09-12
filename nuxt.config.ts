import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2026-08-28',
  devtools: { enabled: true },

  typescript: {
    typeCheck: false,
    strict: true,
  },

  css: ['~/assets/css/tailwind.css'],

  // Корень ведёт на список водителей — ежедневную работу всех трёх ролей, а не на экран
  // наблюдаемости, который открыт двум и нужен при разборе. Своей страницы у корня нет:
  // страница, умеющая только перенаправить, — это лишний файл, который однажды забудут
  // удалить.
  routeRules: {
    '/': { redirect: '/drivers' },
  },

  nitro: {
    alias: {
      '#server': fileURLToPath(new URL('./server', import.meta.url)),
    },
  },

  vite: {
    plugins: [tailwindcss()],
    server: {
      // Приложение живёт в контейнере, исходники приезжают томом с хоста — inotify через
      // границу тома на macOS не работает, пересборку запускает только опрос.
      watch: {
        usePolling: true,
        interval: 300,
      },
    },
  },
});
