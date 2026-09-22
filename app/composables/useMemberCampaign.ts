import { ref } from 'vue';
import {
  INIT_DATA_HEADER,
  type MemberCampaign,
  type MiniAppCampaignResponse,
  type MiniAppOpenChestRequestBody,
  type MiniAppOpenChestResponse,
} from '#shared/types/miniapp';
import { failureMessage } from '~/utils/requestError';

/** Что выпало из только что открытого сундука — пока водитель не закрыл сообщение. */
export type OpenedChestPrize = {
  prizeText: string;
  rewardsHint: string;
};

/**
 * Акция на экране участника: что у водителя с ней, «Участвовать» и «Отказаться» (issue #166).
 *
 * Запросы живут здесь, а не в компоненте (docs/frontend.md → «Данные в компоненты не ходят»).
 * Подписанная строка берётся вызовом — по той же причине, что у истории: к моменту создания
 * composable объекта Telegram на странице ещё нет.
 *
 * Акции нет — блока нет: для большинства участников это обычное состояние, а не пустое место,
 * которое надо объяснять.
 *
 * Открытие сундука (issue #181) — здесь же: ответ несёт экран акции с уже открытым сундуком
 * и то, что выпало.
 */
export const useMemberCampaign = (readInitData: () => string, readFallbackText: () => string) => {
  const campaign = ref<MemberCampaign | null>(null);
  const acting = ref(false);
  const error = ref<string | null>(null);
  const prize = ref<OpenedChestPrize | null>(null);

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

  /**
   * Открытие сундука. Кнопки гаснут на время ответа тем же `acting`: второе нажатие вдогонку
   * сервер отбил бы повтором, но водителю незачем видеть приз дважды.
   */
  const openChest = async (chest: MiniAppOpenChestRequestBody): Promise<void> => {
    if (acting.value) {
      return;
    }

    acting.value = true;
    error.value = null;
    prize.value = null;

    try {
      const response = await $fetch<MiniAppOpenChestResponse>('/api/miniapp/campaign/chests/open', {
        method: 'POST',
        headers: headers(),
        body: chest,
      });

      campaign.value = response.campaign;
      prize.value = { prizeText: response.prizeText, rewardsHint: response.rewardsHint };
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
    prize,
    load,
    openChest,
    dismissPrize: (): void => {
      prize.value = null;
    },
    join: (): Promise<void> => respond('join'),
    decline: (): Promise<void> => respond('decline'),
  };
};
