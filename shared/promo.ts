import type { WebLanguage } from './denials';
import type { PromoMedium } from '../server/generated/prisma/enums';

/**
 * Промо-метки (issue #380): носители, пределы полей и отказы формы метки — код и текст к нему.
 *
 * Словарь отдельный от `shared/denials.ts` по той же причине, что `shared/employeeLinks.ts`:
 * там — отказы двери, здесь — предмет разговора (docs/decisions.md → «Граница словаря — дверь»).
 * Сервер кладёт текст в ответ отказавшей ручки, форма ставит его под поле из `PROMO_DENIAL_FIELDS`.
 *
 * Относительными путями, а не через `#shared`: так подключаются соседние файлы `shared/`.
 */

export type { PromoMedium };

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

/** Название метки — видно только сотрудникам, в списке и в карточке. */
export const PROMO_NAME_MAX_LENGTH = 80;

/** Место размещения — офис и место, канал, кому раздавали. */
export const PROMO_PLACEMENT_MAX_LENGTH = 120;

/** Отказ заведения и правки метки — по полю формы. */
export type PromoDenialCode =
  | 'name_missing'
  | 'name_too_long'
  | 'medium_missing'
  | 'placement_too_long'
  | 'code_invalid'
  | 'code_taken';

/** Поле формы метки, к которому относится отказ. Код стоит в поле «Ссылка». */
export type PromoField = 'name' | 'medium' | 'placement' | 'code';

export const isPromoField = (value: unknown): value is PromoField =>
  value === 'name' || value === 'medium' || value === 'placement' || value === 'code';

export const PROMO_DENIAL_FIELDS: Readonly<Record<PromoDenialCode, PromoField>> = {
  name_missing: 'name',
  name_too_long: 'name',
  medium_missing: 'medium',
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
  placement_too_long: { ru: `Место размещения — до ${PROMO_PLACEMENT_MAX_LENGTH} символов` },
  code_invalid: { ru: CODE_TAKEN_TEXT },
  code_taken: { ru: CODE_TAKEN_TEXT },
};

export const promoDenialText = (code: PromoDenialCode, language: WebLanguage): string =>
  PROMO_DENIAL_TEXTS[code][language];
