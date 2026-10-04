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

  // Графики веба — ECharts (docs/decisions.md → «Веб в стиле бенто»). Модуль подключает только
  // перечисленные части: дашборду пока нужны столбики, сетка и подсказка наведения (issue #373).
  // Рисует SVG: подписи осей остаются текстом и не размываются на экране с плотными точками.
  modules: ['nuxt-echarts'],

  echarts: {
    renderer: 'svg',
    charts: ['BarChart'],
    components: ['GridComponent', 'TooltipComponent'],
  },

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
