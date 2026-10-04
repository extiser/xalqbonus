/**
 * Шрифты водительского Mini App — Manrope и Unbounded с Google Fonts.
 *
 * Подключаются страницами `/design`, раскладкой `miniapp-next` — экранами приложения,
 * уже переведёнными на новые компоненты, — и раскладкой `web` тёмного веба. Экраны на старой
 * раскладке `miniapp` и светлые служебные экраны их не грузят.
 */
export function useDesignFonts(): void {
  useHead({
    link: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;600;700;800&family=Unbounded:wght@200;300;600;700&display=swap',
      },
    ],
  });
}
