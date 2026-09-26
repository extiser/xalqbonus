/**
 * Окно отправки уведомлений по часам парка — с 09:00 до 21:00 по Ташкенту.
 *
 * Одно на обе стороны: очередь откладывает по нему сообщение до утра, а форма подарка
 * по нему же говорит, что сообщение уйдёт в 09:00 (issue #251). Два набора часов разошлись бы
 * на первой правке, и форма обещала бы не то, что сделает очередь.
 *
 * Зона — та же, что `PARK_TIME_ZONE` сервера (`server/utils/parkTime.ts`), но своей константой:
 * коду формы до `server/` доступа нет.
 */

export const SEND_WINDOW_START_HOUR = 9;
export const SEND_WINDOW_END_HOUR = 21;
export const SEND_WINDOW_TIME_ZONE = 'Asia/Tashkent';

const HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: SEND_WINDOW_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

/** Момент внутри окна: час по зоне парка в `[SEND_WINDOW_START_HOUR, SEND_WINDOW_END_HOUR)`. */
export const isInSendWindow = (moment: Date): boolean => {
  const hour = Number(HOUR.formatToParts(moment).find((part) => part.type === 'hour')?.value ?? 0);

  return hour >= SEND_WINDOW_START_HOUR && hour < SEND_WINDOW_END_HOUR;
};
