import type { ApplicationDenialCode } from '#shared/candidateApplications';

/**
 * Отказ сервисов раздела «Заявки» (issue #471) — кодом. Номер ответа и текст из словаря ставит
 * ручка (`server/utils/applicationFailure.ts`): сервис про HTTP не знает.
 */
export class ApplicationDenialError extends Error {
  readonly code: ApplicationDenialCode;

  constructor(code: ApplicationDenialCode) {
    super(code);
    this.name = 'ApplicationDenialError';
    this.code = code;
  }
}
