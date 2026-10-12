import type { LandingDenialCode } from '../../../shared/promo';

/**
 * Отказ ручек лендингов (issue #478) — кодом из словаря `shared/promo.ts`. Номер ответа, поле
 * окна и текст ставит `rejectPromoFailure`: сервис говорит, что случилось, а не как это показать.
 */
export class LandingFailure extends Error {
  constructor(readonly code: LandingDenialCode) {
    super(`лендинг: ${code}`);
    this.name = 'LandingFailure';
  }
}
