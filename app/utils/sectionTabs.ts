import type { LevelTab } from '~/components/molecules/web/LevelTabs.vue';

/**
 * Наборы вкладок разделов веба для `MoleculesWebLevelTabs`.
 */

/**
 * Уровни дашборда. Выбранный месяц (`month`) переходит со вкладки на вкладку в адресе (issue #373):
 * уровни — разные взгляды на один месяц, и смена вкладки его не сбрасывает.
 */
export const dashboardLevelTabs = (month?: string): LevelTab[] =>
  (
    [
      { key: 'money', label: 'Деньги' },
      { key: 'levers', label: 'Рычаги' },
      { key: 'depth', label: 'Глубина' },
    ] as const
  ).map((level) => ({
    ...level,
    to: { path: `/dashboard/${level.key}`, query: month ? { month } : {} },
  }));

/** Вкладки раздела «Промо» (issue #478): метки и лендинги. */
export const PROMO_TABS: readonly LevelTab[] = [
  { key: 'links', label: 'Метки', to: '/promo' },
  { key: 'landings', label: 'Лендинги', to: '/promo/landings' },
];
