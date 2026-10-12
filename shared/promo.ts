import type { WebLanguage } from './denials';
import { LANDING_MAX_ARCHIVE_MB, LANDING_NAME_MAX_LENGTH } from './landings';
import type { PromoEntry, PromoMedium } from '../server/generated/prisma/enums';

/**
 * Промо-метки (issue #380): носители, пределы полей и отказы формы метки — код и текст к нему.
 *
 * Словарь отдельный от `shared/denials.ts` по той же причине, что `shared/employeeLinks.ts`:
 * там — отказы двери, здесь — предмет разговора (docs/decisions.md → «Граница словаря — дверь»).
 * Сервер кладёт текст в ответ отказавшей ручки, форма ставит его под поле из `PROMO_DENIAL_FIELDS`.
 *
 * Относительными путями, а не через `#shared`: так подключаются соседние файлы `shared/`.
 */

export type { PromoEntry, PromoMedium };

type Texts<Code extends string> = Readonly<Record<Code, Readonly<Record<WebLanguage, string>>>>;

/** Носители в порядке пилюль формы. */
export const PROMO_MEDIUMS: readonly PromoMedium[] = ['poster', 'card', 'leaflet', 'video', 'sms', 'telegram_ad', 'other'];

export const PROMO_MEDIUM_LABELS: Readonly<Record<PromoMedium, string>> = {
  poster: 'Плакат',
  card: 'Визитка',
  leaflet: 'Листовка',
  video: 'Ролик',
  sms: 'СМС',
  telegram_ad: 'Реклама в Telegram',
  other: 'Другое',
};

export const isPromoMedium = (value: unknown): value is PromoMedium =>
  typeof value === 'string' && (PROMO_MEDIUMS as readonly string[]).includes(value);

/**
 * Входы метки рекламы в Telegram в порядке пилюль формы (issue #467): в приложение — форма
 * заявки, в чат бота — диалог «номер кнопкой, имя текстом». У остальных носителей вход один —
 * чат бота.
 */
export const PROMO_ENTRIES: readonly PromoEntry[] = ['miniapp', 'bot'];

export const isPromoEntry = (value: unknown): value is PromoEntry =>
  typeof value === 'string' && (PROMO_ENTRIES as readonly string[]).includes(value);

/** Подписи пилюль поля «Вход» формы. */
export const PROMO_ENTRY_CHOICE_LABELS: Readonly<Record<PromoEntry, string>> = {
  miniapp: 'Приложение',
  bot: 'Чат бота',
};

/** Вход словами — в карточке и списке меток, у рекламы в Telegram. */
export const PROMO_ENTRY_LABELS: Readonly<Record<PromoEntry, string>> = {
  miniapp: 'вход в приложение',
  bot: 'вход в чат бота',
};

/** Название метки — видно только сотрудникам, в списке и в карточке. */
export const PROMO_NAME_MAX_LENGTH = 80;

/** Место размещения — офис и место, канал, кому раздавали. */
export const PROMO_PLACEMENT_MAX_LENGTH = 120;

/**
 * Отказы лендингов (issue #478). Два последних говорит и форма метки — в поле «Лендинг»:
 * сменить лендинг после перехода нельзя, а выбрать можно только годный.
 */
export type LandingDenialCode =
  | 'landing_not_found'
  | 'landing_name_invalid'
  | 'landing_archive_too_large'
  | 'landing_archive_invalid'
  | 'landing_in_use'
  | 'landing_locked'
  | 'landing_unavailable';

/** Поле окна «Загрузить лендинг», к которому относится отказ. */
export type LandingField = 'name' | 'file';

export const LANDING_DENIAL_FIELDS: Readonly<Record<LandingDenialCode, LandingField | null>> = {
  landing_not_found: null,
  landing_name_invalid: 'name',
  landing_archive_too_large: 'file',
  landing_archive_invalid: 'file',
  landing_in_use: null,
  landing_locked: null,
  landing_unavailable: null,
};

const LANDING_DENIAL_TEXTS: Texts<LandingDenialCode> = {
  landing_not_found: { ru: 'Такого лендинга нет.' },
  landing_name_invalid: { ru: `Напишите название до ${LANDING_NAME_MAX_LENGTH} знаков.` },
  landing_archive_too_large: { ru: `Архив больше ${LANDING_MAX_ARCHIVE_MB} МБ.` },
  landing_archive_invalid: { ru: 'Это не архив .zip или он повреждён.' },
  landing_in_use: { ru: 'Лендинг стоит у меток. Его можно убрать в архив, но не удалить.' },
  landing_locked: { ru: 'По метке уже переходили. Лендинг больше не меняется.' },
  landing_unavailable: { ru: 'Этот лендинг выбрать нельзя: он в архиве или не прошёл проверку.' },
};

export const landingDenialText = (code: LandingDenialCode, language: WebLanguage): string =>
  LANDING_DENIAL_TEXTS[code][language];

/** Отказ заведения и правки метки — по полю формы. */
export type PromoDenialCode =
  | 'name_missing'
  | 'name_too_long'
  | 'medium_missing'
  | 'entry_missing'
  | 'landing_locked'
  | 'landing_unavailable'
  | 'placement_too_long'
  | 'code_invalid'
  | 'code_taken';

/** Поле формы метки, к которому относится отказ. Код стоит в поле «Ссылка». */
export type PromoField = 'name' | 'medium' | 'entry' | 'landing' | 'placement' | 'code';

export const isPromoField = (value: unknown): value is PromoField =>
  value === 'name' ||
  value === 'medium' ||
  value === 'entry' ||
  value === 'landing' ||
  value === 'placement' ||
  value === 'code';

export const PROMO_DENIAL_FIELDS: Readonly<Record<PromoDenialCode, PromoField>> = {
  name_missing: 'name',
  name_too_long: 'name',
  medium_missing: 'medium',
  entry_missing: 'entry',
  landing_locked: 'landing',
  landing_unavailable: 'landing',
  placement_too_long: 'placement',
  code_invalid: 'code',
  code_taken: 'code',
};

// Негодный код форма не присылает — его выдаёт сервер, — и отказ на него означает чужой
// клиент или ссылку, поправленную руками. Человеку из формы ответ один: взять другой код.
const CODE_TAKEN_TEXT = 'Этот код уже занят — нажмите значок обновления, чтобы получить другой';

const PROMO_DENIAL_TEXTS: Texts<PromoDenialCode> = {
  name_missing: { ru: 'Введите название — по нему метку найдут в списке' },
  name_too_long: { ru: `Название — до ${PROMO_NAME_MAX_LENGTH} символов` },
  medium_missing: { ru: 'Выберите носитель' },
  entry_missing: { ru: 'Выберите вход' },
  landing_locked: LANDING_DENIAL_TEXTS.landing_locked,
  landing_unavailable: LANDING_DENIAL_TEXTS.landing_unavailable,
  placement_too_long: { ru: `Место размещения — до ${PROMO_PLACEMENT_MAX_LENGTH} символов` },
  code_invalid: { ru: CODE_TAKEN_TEXT },
  code_taken: { ru: CODE_TAKEN_TEXT },
};

export const promoDenialText = (code: PromoDenialCode, language: WebLanguage): string =>
  PROMO_DENIAL_TEXTS[code][language];
