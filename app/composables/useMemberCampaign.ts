import { ref } from 'vue';
import {
  INIT_DATA_HEADER,
  type MemberCampaign,
  type MiniAppCampaignResponse,
} from '#shared/types/miniapp';
import { failureMessage } from '~/utils/requestError';

/**
 * Акция на экране участника: что у водителя с ней, «Участвовать» и «Отказаться» (issue #166).
 *
 * Запросы живут здесь, а не в компоненте (docs/frontend.md → «Данные в компоненты не ходят»).
 * Подписанная строка берётся вызовом — по той же причине, что у истории: к моменту создания
 * composable объекта Telegram на странице ещё нет.
 *
 * Акции нет — блока нет: для большинства участников это обычное состояние, а не пустое место,
 * которое надо объяснять.
 */
export const useMemberCampaign = (readInitData: () => string, readFallbackText: () => string) => {
  const campaign = ref<MemberCampaign | null>(null);
  const acting = ref(false);
  const error = ref<string | null>(null);

  const headers = (): Record<string, string> => ({ [INIT_DATA_HEADER]: readInitData() });

  /**
   * Чтение экрана акции. Первое успешное переводит «приглашён» в «открыл экран акции» — поэтому оно идёт
   * вместе с экраном участника, а не по нажатию.
   *
   * Отказ не гасит экран участника: баланс и история прочитаны и верны, а блок акции
   * остаётся прежним. В консоль отказ пишется — другого окна наружу у Mini App нет.
   */
  const load = async (): Promise<void> => {
    try {
      const response = await $fetch<MiniAppCampaignResponse>('/api/miniapp/campaign', {
        headers: headers(),
      });

      campaign.value = response.campaign;
    } catch (failure) {
      console.error('[miniapp] не удалось прочитать акцию', failure);
    }
  };

  /** Ответ на акцию. Экран показывает то состояние, что вернул сервер, — а не то, что нажали. */
  const respond = async (action: 'join' | 'decline'): Promise<void> => {
    if (acting.value) {
      return;
    }

    acting.value = true;
    error.value = null;

    try {
      const response = await $fetch<MiniAppCampaignResponse>(`/api/miniapp/campaign/${action}`, {
        method: 'POST',
        headers: headers(),
      });

      campaign.value = response.campaign;
    } catch (failure) {
      error.value = failureMessage(failure) ?? readFallbackText();
    } finally {
      acting.value = false;
    }
  };

  return {
    campaign,
    acting,
    error,
    load,
    join: (): Promise<void> => respond('join'),
    decline: (): Promise<void> => respond('decline'),
  };
};
