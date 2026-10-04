import type { RewardSource } from '../server/generated/prisma/enums';
import { GIFT_FIELD_LABELS } from './gift';

/**
 * Подписи полей ручной награды-товара и произвольной в форме «Вручить» (issue #266).
 *
 * Как `GIFT_FIELD_LABELS`: ими же предпросмотр системного текста называет то, что ещё
 * не заполнено, — «{Где получать}» на месте офиса. Одна строка на подпись и на подстановку.
 * «Забрать до» — та же строка, что у подарка: поле одно и то же.
 */
export const REWARD_FIELD_LABELS = {
  product: 'Товар',
  title: 'Что выдаётся',
  office: 'Где получать',
  noteRu: 'Почему на русском',
  noteUz: 'Почему на узбекском',
  untilDate: GIFT_FIELD_LABELS.untilDate,
} as const;

/**
 * Зона парка — та же, что `PARK_TIME_ZONE` сервера (`server/utils/parkTime.ts`), но своей
 * константой: коду экрана до `server/` доступа нет (так же устроен `shared/sendWindow.ts`).
 */
const REWARD_TIME_ZONE = 'Asia/Tashkent';

const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: REWARD_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const HALF_DAY_MS = 12 * 60 * 60 * 1_000;

/**
 * День «Забрать до» — `2026-10-10`, календарный день по Ташкенту. Одно правило на экран водителя
 * и служебные экраны (issue #354).
 *
 * Срок ручной награды и подарка — граница суток после выбранного дня (issue #266), и день самой
 * метки назвал бы следующее число, а не то, что выбрал сотрудник и написано водителю. Граница —
 * 00:00 следующего дня по Ташкенту (docs/decisions.md → «Сутки — с 00:00 до 00:00 по Ташкенту;
 * у акции — свои, с 05:00»), а у выданных до перехода на календарные сутки — 05:00: их срок
 * хранится меткой и не пересчитывается (issue #352). Полсуток назад от любой из двух — внутри
 * выбранного дня.
 *
 * Срок приза акции — момент `now() + N дней`, а не граница суток: его день — день самого срока.
 */
export const rewardDeadlineDay = (expiresAt: Date, source: RewardSource): string => {
  switch (source) {
    case 'manual':
    case 'gift':
      return DAY_KEY.format(new Date(expiresAt.getTime() - HALF_DAY_MS));
    case 'campaign':
      return DAY_KEY.format(expiresAt);
  }
};
