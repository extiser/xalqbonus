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

  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? '',
  },
});
