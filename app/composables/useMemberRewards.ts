import { ref } from 'vue';
import { INIT_DATA_HEADER } from '#shared/types/miniapp';
import type { MemberGift, MemberReward, MiniAppRewardsResponse } from '#shared/types/rewards';
import type { LoadState } from '~/types/loadState';

/**
 * Раздел «Мои награды» в Mini App (issue #172): список наград участника и ждущие подарки
 * от Xalq Taxi (issue #220).
 *
 * Запрос живёт здесь, а не в компоненте: экран получает готовое свойствами
 * (docs/frontend.md → «Данные в компоненты не ходят»). Личность уходит заголовком
 * с подписанной строкой — идентификатора человека в запросе нет.
 *
 * `holdGift` — подарок, которого нет в свежем ответе, остаётся на экране: он лопается, ждёт
 * ответа на «Забрать» или стоит со строкой отказа. Его место убирает страница, когда карточка
 * доиграла (`removeGift`) — иначе перечитывание обрывало бы лопание и стирало ошибку, которую
 * водитель ещё не прочитал.
 */
export const useMemberRewards = (readInitData: () => string, holdGift: (rewardId: string) => boolean) => {
  const state = ref<LoadState>('loading');
  const rewards = ref<MemberReward[]>([]);
  const gifts = ref<MemberGift[]>([]);
  const giftsUnseen = ref(false);

  /**
   * Подарки после перечитывания: показанные стоят на своих местах со свежими строками, удержанные —
   * как были, новые встают сверху — сервер отдаёт свежие первыми.
   */
  const mergeGifts = (fresh: readonly MemberGift[]): MemberGift[] => {
    const freshById = new Map(fresh.map((gift) => [gift.rewardId, gift]));
    const shownIds = new Set(gifts.value.map((gift) => gift.rewardId));
    const kept = gifts.value.flatMap((gift) => {
      const next = freshById.get(gift.rewardId);

      if (next) {
        return [next];
      }

      return holdGift(gift.rewardId) ? [gift] : [];
    });

    return [...fresh.filter((gift) => !shownIds.has(gift.rewardId)), ...kept];
  };

  const fetchRewards = async (): Promise<void> => {
    const response = await $fetch<MiniAppRewardsResponse>('/api/miniapp/rewards', {
      headers: { [INIT_DATA_HEADER]: readInitData() },
    });

    rewards.value = response.rewards;
    gifts.value = mergeGifts(response.gifts);
    giftsUnseen.value = response.giftsUnseen;
    state.value = 'ready';
  };

  const load = async (): Promise<void> => {
    state.value = 'loading';

    try {
      await fetchRewards();
    } catch (error) {
      console.error('[miniapp] не удалось загрузить награды', error);
      state.value = 'error';
    }
  };

  /**
   * Тихое перечитывание — для блока наград на главной: показанное стоит, пока не пришло новое,
   * отказ его не гасит (как `reloadOrders` у заказов).
   */
  const reload = async (): Promise<void> => {
    try {
      await fetchRewards();
    } catch (error) {
      console.error('[miniapp] не удалось перечитать награды', error);
    }
  };

  /** Подарок уходит из списка: лопнул или отказ прочитан. */
  const removeGift = (rewardId: string): void => {
    gifts.value = gifts.value.filter((gift) => gift.rewardId !== rewardId);
  };

  return { state, rewards, gifts, giftsUnseen, load, reload, removeGift };
};
