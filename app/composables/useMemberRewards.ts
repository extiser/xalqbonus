import { ref } from 'vue';
import { INIT_DATA_HEADER } from '#shared/types/miniapp';
import type { MemberReward, MiniAppRewardsResponse } from '#shared/types/rewards';
import type { LoadState } from '~/types/loadState';

/**
 * Раздел «Мои награды» в Mini App (issue #172): список наград участника.
 *
 * Запрос живёт здесь, а не в компоненте: экран получает готовое свойствами
 * (docs/frontend.md → «Данные в компоненты не ходят»). Личность уходит заголовком
 * с подписанной строкой — идентификатора человека в запросе нет.
 */
export const useMemberRewards = (readInitData: () => string) => {
  const state = ref<LoadState>('loading');
  const rewards = ref<MemberReward[]>([]);

  const load = async (): Promise<void> => {
    state.value = 'loading';

    try {
      const response = await $fetch<MiniAppRewardsResponse>('/api/miniapp/rewards', {
        headers: { [INIT_DATA_HEADER]: readInitData() },
      });

      rewards.value = response.rewards;
      state.value = 'ready';
    } catch (error) {
      console.error('[miniapp] не удалось загрузить награды', error);
      state.value = 'error';
    }
  };

  return { state, rewards, load };
};
