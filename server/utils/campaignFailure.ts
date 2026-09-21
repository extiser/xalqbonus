import { createError, type H3Error } from 'h3';

import {
  CampaignAudienceEmptyError,
  CampaignNotLaunchableError,
  CampaignSecondHalfUnavailableError,
  CampaignSegmentArchivedError,
  CampaignSegmentUnknownError,
  CampaignSlugTakenError,
  CampaignStatusMismatchError,
  InvalidCampaignFieldsError,
  UnknownCampaignError,
  type CampaignFieldProblem,
} from '#server/services/campaigns/errors';
import {
  CAMPAIGN_AUDIENCE_EMPTY_TEXT,
  CAMPAIGN_SEGMENT_ARCHIVED_TEXT,
  campaignLaunchProblemText,
} from '#shared/campaign';

/**
 * Что ответить сотруднику на доменный отказ ручки акций.
 *
 * Отказы — строками при своих правилах, а не кодами словаря двери: они про предмет разговора,
 * а не про доступ (docs/decisions.md → «Отказ двери веба говорит кодом, а текст живёт
 * словарём»). Собраны в одном месте, как у рассылок и сегментов: ручек семь, а отказов
 * на всех один набор.
 *
 * Причины незапускаемого черновика и фразы про архивный сегмент и пустой состав берутся
 * из `shared/campaign.ts`: те же стоят у закрытой кнопки запуска на экране.
 *
 * `null` — не отказ, а поломка: такое уходит пятисоткой.
 */

const STATUS_ACTION_TEXT = {
  draft: 'Правится и запускается только черновик. Эта акция уже запущена — повторного запуска и правки нет.',
  running: 'Окно половины Б назначается только идущей акции.',
  finished: 'Действие для оконченной акции не предусмотрено.',
} as const;

const FIELD_PROBLEM_TEXT: Record<CampaignFieldProblem, string> = {
  slug_invalid:
    'Короткое имя — строчная латиница, цифры и дефисы между ними, например comeback-wave-1.',
  segment_invalid: 'Сегмент выбран неверно — выберите его из списка заново.',
  day_invalid: 'Дата окна не читается как день календаря.',
  window_reversed: 'Последний день окна раньше первого.',
  window_incomplete: 'Для окна нужны обе даты.',
  office_invalid: 'Офис выбран неверно — выберите его из списка заново.',
  reward_lifetime_invalid: 'Срок наград — целое число дней, не меньше одного.',
};

const reject = (statusCode: 400 | 404 | 409, statusMessage: string, message: string): H3Error =>
  createError({ statusCode, statusMessage, message });

export const explainCampaignFailure = (error: unknown): H3Error | null => {
  if (error instanceof UnknownCampaignError) {
    return reject(404, 'Not Found', 'Такой акции нет.');
  }

  if (error instanceof CampaignStatusMismatchError) {
    return reject(409, 'Conflict', STATUS_ACTION_TEXT[error.expected]);
  }

  if (error instanceof CampaignNotLaunchableError) {
    return reject(
      409,
      'Conflict',
      `Акцию нельзя запустить. ${error.problems.map(campaignLaunchProblemText).join(' ')}`,
    );
  }

  if (error instanceof CampaignSegmentArchivedError) {
    return reject(409, 'Conflict', CAMPAIGN_SEGMENT_ARCHIVED_TEXT);
  }

  if (error instanceof CampaignSegmentUnknownError) {
    return reject(400, 'Bad Request', 'Такого сегмента нет.');
  }

  if (error instanceof CampaignAudienceEmptyError) {
    return reject(409, 'Conflict', CAMPAIGN_AUDIENCE_EMPTY_TEXT);
  }

  if (error instanceof CampaignSlugTakenError) {
    return reject(409, 'Conflict', `Короткое имя «${error.slug}» уже занято другой акцией.`);
  }

  if (error instanceof CampaignSecondHalfUnavailableError) {
    return reject(
      409,
      'Conflict',
      error.reason === 'no_split'
        ? 'Состав этой акции не делили — половины Б у неё нет.'
        : 'Окно половины Б уже назначено. Назначается оно один раз.',
    );
  }

  if (error instanceof InvalidCampaignFieldsError) {
    return reject(400, 'Bad Request', FIELD_PROBLEM_TEXT[error.problem]);
  }

  return null;
};

/** Отказ в человеческом виде или исходная ошибка — для `catch` в ручке. */
export const rethrowCampaignFailure = (error: unknown): never => {
  throw explainCampaignFailure(error) ?? error;
};
