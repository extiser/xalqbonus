import { ref, type Ref } from 'vue';
import type { TelegramLinkDenial } from '~/types/telegramLink';
import { failureCode, failureDetails, failureText } from '~/utils/requestError';
import type { DriverTelegramCandidateResponse, DriverTelegramOtherDriver } from '#shared/types/driver';

/**
 * Привязка и отвязка Telegram в карточке водителя (issue #305): введённый ID, проверка
 * кандидата, привязка по подтверждению и отвязка.
 *
 * Состояние и запросы живут здесь, а не в организме: компонент за данными не ходит
 * (docs/frontend.md → «Данные в компоненты не ходят»). Вызывает страница карточки и после
 * успеха перечитывает карточку сама — `onChanged`.
 *
 * Что можно, решает сервер: попытка, сотрудник, чужой чат — всё это он отказывает своим кодом,
 * а здесь отказ только показывается. По коду решается одно: у `linked_to_other` в ответе есть
 * тот водитель, и его имя становится ссылкой.
 */

/** Тот водитель из `data` отказа `linked_to_other`. `null` — отказ другой или данных нет. */
const otherDriverOf = (error: unknown): DriverTelegramOtherDriver | null => {
  if (failureCode(error) !== 'linked_to_other') {
    return null;
  }

  const details = failureDetails(error);
  const personId = details?.personId;
  const fullName = details?.fullName;
  const callsign = details?.callsign;

  if (typeof personId !== 'string' || typeof fullName !== 'string') {
    return null;
  }

  return { personId, fullName, callsign: typeof callsign === 'string' ? callsign : null };
};

const denialOf = (error: unknown): TelegramLinkDenial => ({
  message: failureText(error),
  other: otherDriverOf(error),
});

export const useDriverTelegramLink = (personId: Ref<string>, onChanged: () => Promise<void>) => {
  const telegramId = ref('');
  const busy = ref(false);
  const denial = ref<TelegramLinkDenial | null>(null);
  /** Кандидат для диалога подтверждения. Есть — диалог открыт. */
  const candidate = ref<DriverTelegramCandidateResponse | null>(null);

  /** Запрос с общим флагом и отказом: у трёх действий блока одно поле и одна строка отказа. */
  const run = async (request: () => Promise<void>): Promise<void> => {
    busy.value = true;
    denial.value = null;

    try {
      await request();
    } catch (error) {
      denial.value = denialOf(error);
    } finally {
      busy.value = false;
    }
  };

  /** «Привязать» под полем: проверка без записи, успех открывает диалог. */
  const check = (): Promise<void> =>
    run(async () => {
      candidate.value = await $fetch<DriverTelegramCandidateResponse>(
        `/api/drivers/${personId.value}/telegram-candidate`,
        { query: { telegramId: telegramId.value.trim() } },
      );
    });

  /** Подтверждение в диалоге: привязка по тому же ID, что проверяли. */
  const confirmLink = (): Promise<void> => {
    const confirmed = candidate.value;

    candidate.value = null;

    if (!confirmed) {
      return Promise.resolve();
    }

    return run(async () => {
      await $fetch(`/api/drivers/${personId.value}/telegram-link`, {
        method: 'POST',
        body: { telegramId: confirmed.telegramUserId },
      });
      telegramId.value = '';
      await onChanged();
    });
  };

  const unlink = (): Promise<void> =>
    run(async () => {
      await $fetch(`/api/drivers/${personId.value}/telegram-unlink`, { method: 'POST' });
      await onChanged();
    });

  const cancel = (): void => {
    candidate.value = null;
  };

  return { telegramId, busy, denial, candidate, check, confirmLink, unlink, cancel };
};
