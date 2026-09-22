/**
 * Шрифты водительского Mini App — Manrope и Unbounded с Google Fonts.
 *
 * Подключаются только страницами `/design`: в раскладку приложения их добавит задача
 * подключения новых компонентов, до неё рабочие экраны лишних файлов не грузят.
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
