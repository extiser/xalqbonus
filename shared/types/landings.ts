import type { ApplicationScreenTexts } from './miniapp';

/**
 * Ответы ручек лендингов «Промо» (issue #478). Моменты — строки ISO.
 */

/** Пункт проверки архива: `index.html` в корне, поле имени, кнопка отправки, картинки. */
export type LandingCheckKey = 'index' | 'name_field' | 'submit_button' | 'images';

export type LandingCheck = {
  key: LandingCheckKey;
  ok: boolean;
  /** Что не так — строками для человека. У прошедшего пункта пусто. */
  problems: string[];
};

/** Итог проверки архива без записи — `POST /api/promo/landings/check`. */
export type LandingCheckResult = {
  checks: LandingCheck[];
  /** Все четыре пункта прошли. */
  passed: boolean;
};

export type LandingCreated = {
  id: string;
  passed: boolean;
};

export type LandingVersionAdded = {
  number: number;
  passed: boolean;
};

export type LandingArchived = {
  archived: boolean;
};

/** Строка вкладки «Лендинги». */
export type LandingRow = {
  id: string;
  name: string;
  /** Первая загрузка. */
  createdAt: string;
  /** Последняя версия; `null` — версия одна, замен не было. */
  updatedAt: string | null;
  /** Сколько меток показывают этот лендинг. */
  labelCount: number;
  archived: boolean;
  /** Когда убран в архив; `null` — не в архиве. */
  archivedAt: string | null;
  /** Можно выбрать у новой метки: есть прошедшая проверку версия, и лендинг не в архиве. */
  selectable: boolean;
  /** Прошла ли проверку последняя версия. */
  lastPassed: boolean;
};

/** Метка, у которой стоит лендинг, — ссылка в её карточку. */
export type LandingLabel = {
  code: string;
  name: string;
};

/** Экран заявки по умолчанию — первая строка вкладки: он встроен в приложение и не загружается. */
export type DefaultLandingScreen = {
  /** Метки рекламы со входом «Приложение» без лендинга. */
  labelCount: number;
  labels: LandingLabel[];
  /** Русские тексты экрана заявки — из того же словаря, что у Mini App. */
  texts: ApplicationScreenTexts;
};

export type LandingList = {
  /** Сначала не в архиве, потом в архиве; внутри — новые сверху. */
  landings: LandingRow[];
  defaultScreen: DefaultLandingScreen;
};

export type LandingVersionView = {
  number: number;
  createdAt: string;
  passed: boolean;
  checks: LandingCheck[];
  /** Разметка версии после очистки; пути картинок — как в архиве. */
  html: string;
  /** Откуда грузить картинки версии: `/uploads/landings/<id версии>/`. */
  imageBase: string;
};

export type LandingCard = LandingRow & {
  labels: LandingLabel[];
  lastVersion: LandingVersionView;
  /** Действующая — последняя из прошедших проверку; `null` — ни одна не прошла. */
  liveVersion: LandingVersionView | null;
};

/** Лендинг в выборе у метки. */
export type LandingOption = {
  id: string;
  name: string;
};
