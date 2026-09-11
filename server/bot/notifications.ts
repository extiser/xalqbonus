import type { Language } from '#server/generated/prisma/enums';
import { formatPoints, text } from '#server/bot/texts';

/**
 * Уведомления водителю: что именно система умеет ему написать сама.
 *
 * Шаблон и его параметры, а не готовая строка. Причина двойная. Рассылка на четыре тысячи
 * человек с готовым текстом несёт в Redis четыре тысячи копий одного и того же сообщения,
 * а язык, зашитый в задание при постановке, разойдётся с настройкой человека, если тот
 * успеет сменить язык до отправки. Поэтому текст собирается в момент отправки — здесь,
 * из шаблона и языка получателя, прочитанного тогда же.
 *
 * Уведомление не экран диалога: оно приходит само, прошлого сообщения бота не стирает
 * и через `sendScreen` не идёт (server/bot/screen.ts).
 */

/**
 * Одно уведомление: имя шаблона и его параметры, размеченные типом.
 *
 * Размеченное объединение, а не свободный словарь: новый шаблон дописывается сюда вместе
 * со своими параметрами, и сборщик текста обязан его разобрать — забыть половину не выйдет.
 */
export type Notification = {
  template: 'welcome_bonus';
  params: {
    /** Сколько баллов начислено. Числом: человеческий вид числа — забота текста. */
    points: number;
  };
};

/** Имя шаблона отдельным типом — им размечаются строки лога. */
export type NotificationTemplate = Notification['template'];

/** Собирает текст уведомления на языке получателя. */
export const renderNotification = (notification: Notification, language: Language): string => {
  switch (notification.template) {
    case 'welcome_bonus':
      return text('notification_welcome_bonus', language, {
        points: formatPoints(BigInt(notification.params.points)),
      });
  }
};
