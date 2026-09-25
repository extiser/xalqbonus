import type { OpenAppButton } from '#server/adapters/telegram/outgoing';
import { readGiftCover } from '#server/adapters/uploads/giftCovers';
import type { CampaignParticipantOutcome, Language } from '#server/generated/prisma/enums';
import { launchButton } from '#server/bot/launchButton';
import { countedPlainText, formatPoints, text } from '#server/bot/texts';
import { calendarDayMoment, formatCalendarDate, formatDayMonthWord } from '#server/utils/parkTime';

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
 * Строки со счётом подставляются в текст через `text`, и экранирование накрывает их вместе
 * с названием акции, офиса и приза — чужими строками, которые вводит сотрудник.
 *
 * Размеченное объединение, а не свободный словарь: новый шаблон дописывается сюда вместе
 * со своими параметрами, и сборщик текста обязан его разобрать — забыть половину не выйдет.
 */
export type Notification =
  | {
      template: 'welcome_bonus';
      params: {
        /** Сколько баллов начислено. Числом: человеческий вид числа — забота текста. */
        points: number;
      };
    }
  | {
      /** Итог акции в 09:00 дня после конца окна (issue #182). */
      template: 'campaign_finished';
      params: {
        /** Название акции. Правится только у черновика, поэтому в задании оно не устареет. */
        title: string;
        outcome: CampaignParticipantOutcome;
        /** Зачётных дней по снимку итога. */
        qualifiedDays: number;
        /** Дней в окне половины. */
        windowDays: number;
        /** Заработанных и неоткрытых сундуков на момент итога. */
        unopenedChests: number;
      };
    }
  | {
      /** Вскрытие неоткрытых сундуков в 21:00 того же дня (issue #182). */
      template: 'campaign_chests_revealed';
      params: {
        title: string;
        /** Что выпало — по строке на вскрытый сундук, в порядке вскрытия. */
        prizes: RevealedPrize[];
        /** Офис акции — там ждут товарные и произвольные призы. */
        officeName: string | null;
        /** До какого момента их забрать, ISO-строкой. Пусто, если все призы — баллы. */
        expiresAt: string | null;
      };
    }
  | {
      /**
       * Сброс сессии из профиля (issue #216, T53): приложение закрылось, и в чат приходит
       * приветствие /start с кнопкой запуска — открыть приложение заново одним нажатием.
       */
      template: 'app_relaunch';
      params: Record<string, never>;
    }
  | {
      /**
       * Подарок от Xalq Taxi ждёт в приложении (issue #219). Уходит в окне 09:00–21:00
       * по Ташкенту — правило очереди (`server/queues/notifications.ts`). С обложкой — фото
       * с подписью, без неё — текстом.
       */
      template: 'gift_received';
      params: {
        points: number;
        /**
         * Повод раздачи на обоих языках: «ко Дню учителя». В сообщение идёт один — на языке
         * человека, прочитанном в момент отправки. Раздача не правится, в задании он не устареет.
         */
        reasonRu: string;
        reasonUz: string;
        /** День автозачисления, `YYYY-MM-DD`. */
        untilDate: string;
        /** Обложка на томе. Пусто — сообщение без фото. */
        coverPath: string | null;
      };
    };

/** Приз вскрытого сундука: баллы уже на балансе, товар или произвольный ждёт в офисе. */
export type RevealedPrize = { kind: 'points'; points: number } | { kind: 'office'; title: string };

/** Имя шаблона отдельным типом — им размечаются строки лога. */
export type NotificationTemplate = Notification['template'];

/**
 * Итог акции: вступившему с неоткрытыми — их число и зов открыть; вступившему без них — итог
 * без зова; не вступившему — коротко, что акция закончилась.
 */
const renderCampaignFinished = (
  params: Extract<Notification, { template: 'campaign_finished' }>['params'],
  language: Language,
): string => {
  const { title } = params;

  switch (params.outcome) {
    case 'no_response':
    case 'seen_not_joined':
      return text('notification_campaign_finished_not_joined', language, { title });
    case 'returned':
    case 'short':
    case 'joined_no_trips':
      if (params.unopenedChests > 0) {
        return text('notification_campaign_finished_chests', language, {
          title,
          chests: countedPlainText('notification_unopened_chests', language, params.unopenedChests),
        });
      }

      return params.outcome === 'returned'
        ? text('notification_campaign_finished_returned', language, {
            title,
            done: String(params.qualifiedDays),
            total: String(params.windowDays),
          })
        : text('notification_campaign_finished_joined', language, { title });
  }
};

/** Вскрытие: что выпало построчно и где забирать то, что лежит в офисе. */
const renderChestsRevealed = (
  params: Extract<Notification, { template: 'campaign_chests_revealed' }>['params'],
  language: Language,
): string => {
  const lines = params.prizes.map((prize) =>
    prize.kind === 'points'
      ? text('notification_revealed_points_line', language, {
          prize: countedPlainText('reward_points', language, prize.points),
        })
      : text('notification_revealed_office_line', language, { prize: prize.title }),
  );
  const hasOfficePrizes = params.prizes.some((prize) => prize.kind === 'office');
  const pickup =
    hasOfficePrizes && params.officeName && params.expiresAt
      ? [
          text('notification_revealed_pickup', language, {
            office: params.officeName,
            date: formatCalendarDate(new Date(params.expiresAt)),
          }),
        ]
      : [];

  return [
    text('notification_campaign_chests_revealed', language, { title: params.title }),
    lines.join('\n'),
    ...pickup,
  ].join('\n\n');
};

type GiftReceivedParams = Extract<Notification, { template: 'gift_received' }>['params'];

const giftReceivedValues = (params: GiftReceivedParams, language: Language): Record<string, string> => ({
  points: countedPlainText('reward_points', language, params.points),
  reason: language === 'uz' ? params.reasonUz : params.reasonRu,
  date: formatDayMonthWord(calendarDayMoment(params.untilDate), language),
});

/** Собирает текст уведомления на языке получателя. */
export const renderNotification = (notification: Notification, language: Language): string => {
  switch (notification.template) {
    case 'welcome_bonus':
      return text('notification_welcome_bonus', language, {
        points: formatPoints(BigInt(notification.params.points)),
      });
    case 'campaign_finished':
      return renderCampaignFinished(notification.params, language);
    case 'campaign_chests_revealed':
      return renderChestsRevealed(notification.params, language);
    case 'app_relaunch':
      return text('start_greeting', language);
    case 'gift_received':
      return text('notification_gift_received', language, giftReceivedValues(notification.params, language));
  }
};

/**
 * Кнопка под уведомлением. Есть у тех, что зовут в приложение, — та же, что под приветствием
 * бота: у `app_relaunch` и у подарка, который забирают в приложении. Остальные уведомления
 * сообщают, а не зовут.
 */
export const notificationButton = (notification: Notification, language: Language): OpenAppButton | undefined =>
  notification.template === 'app_relaunch' || notification.template === 'gift_received'
    ? launchButton(language)
    : undefined;

/**
 * Фото уведомления: где оно лежит и как прочитать его байты. Путь — ключ, по которому дверь
 * помнит `file_id` уже выгруженной картинки; чтение — забота шаблона, потому что знает, в каком
 * подкаталоге тома лежит его картинка, только он.
 */
export type NotificationPhoto = {
  path: string;
  read: () => Promise<{ bytes: Buffer; fileName: string }>;
};

/** Фото под уведомлением. Есть только у подарка с обложкой — текст тогда уходит подписью. */
export const notificationPhoto = (notification: Notification): NotificationPhoto | null => {
  if (notification.template !== 'gift_received' || notification.params.coverPath === null) {
    return null;
  }

  const { coverPath } = notification.params;

  return { path: coverPath, read: () => readGiftCover(coverPath) };
};
