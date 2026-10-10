import { readBotToken } from '#server/bot/config';
import { submitCandidateApplication } from '#server/services/candidates/submitCandidateApplication';
import { candidateApplicationDenial, rejectCandidateApplicationFailure } from '#server/utils/candidateApplicationFailure';
import { isLanguage } from '#server/utils/language';
import { requireTelegramLaunch } from '#server/utils/telegramAuth';
import type { MiniAppApplicationRequestBody, MiniAppApplicationResponse } from '#shared/types/miniapp';

/**
 * Заявка кандидата из Mini App (issue #456). Кто подаёт и по какой метке — из проверенной
 * `initData`; номер проверяет сервис — подписью строки контакта или правилом номера, введённого
 * руками. Решения принимает `submitCandidateApplication`.
 *
 * Строковые поля тела, пришедшие не строкой, читаются как пустые: имя тогда отклонит сервис,
 * а отсутствие обоих номеров — `contact_missing`.
 */

const readString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export default defineEventHandler(async (event): Promise<MiniAppApplicationResponse> => {
  const launch = requireTelegramLaunch(event);
  const body = await readBody<Partial<Record<keyof MiniAppApplicationRequestBody, unknown>>>(event);

  if (!isLanguage(body?.language)) {
    throw candidateApplicationDenial('language_invalid');
  }

  try {
    return await submitCandidateApplication({
      launch,
      name: readString(body.name) ?? '',
      contactData: readString(body.contactData),
      manualPhone: readString(body.manualPhone),
      writeAccessGranted: body.writeAccessGranted === true,
      language: body.language,
      botToken: readBotToken(),
      now: new Date(),
    });
  } catch (error) {
    throw rejectCandidateApplicationFailure(error);
  }
});
