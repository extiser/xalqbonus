/**
 * Тема графиков веба для ECharts (issue #373) — одна на все графики дашборда, собирается
 * из токенов веба (`--color-web-*`, `--font-manrope` в `app/assets/css/tailwind.css`):
 * кодекс `_reference/design/web/codex.html`, раздел «График».
 *
 * Сетка — горизонтали цветом `line`, ось и подписи — `axis` Manrope 12 / 500, подсказка
 * наведения — поверхность `raised` со скруглением 12 и текстом `text`. Цвета рядов тема
 * не задаёт: их выбирает график по смыслу ряда.
 *
 * Токены читаются с корня документа, а не переписываются сюда числами: вторая копия палитры
 * разошлась бы с первой на первой же правке цвета. Поэтому тема собирается только в браузере —
 * график и рисуется только там.
 */

/** Цвет или шрифт токена веба: `readWebToken('color-web-axis')` → `#566E74`. */
export const readWebToken = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();

/** Подпись оси и подсказки — Manrope 12 / 500. */
const LABEL_SIZE = 12;
const LABEL_WEIGHT = 500;

export type WebChartTheme = Record<string, unknown>;

export const webChartTheme = (): WebChartTheme => {
  const font = readWebToken('font-manrope');
  const axis = readWebToken('color-web-axis');
  const line = readWebToken('color-web-line');
  const label = { color: axis, fontFamily: font, fontSize: LABEL_SIZE, fontWeight: LABEL_WEIGHT };

  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: font },
    categoryAxis: {
      axisLine: { show: true, lineStyle: { color: axis } },
      axisTick: { show: false },
      axisLabel: label,
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: label,
      splitLine: { show: true, lineStyle: { color: line } },
    },
    tooltip: {
      backgroundColor: readWebToken('color-web-raised'),
      borderWidth: 0,
      padding: [10, 14],
      extraCssText: 'border-radius: 12px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);',
      textStyle: {
        color: readWebToken('color-web-text'),
        fontFamily: font,
        fontSize: 13,
        fontWeight: LABEL_WEIGHT,
      },
      axisPointer: { type: 'shadow', shadowStyle: { color: line } },
    },
  };
};
