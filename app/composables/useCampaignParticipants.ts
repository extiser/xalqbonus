import { ref, watch } from 'vue';
import type { LoadState } from '~/types/loadState';
import { CAMPAIGN_PARTICIPANTS_LIMIT } from '#shared/campaign';
import type { CampaignParticipantsResponse } from '#shared/types/campaign';

/**
 * Участники акции: фильтры, смещение и страница.
 *
 * Запросы живут здесь, а не в компоненте таблицы (docs/frontend.md → «Данные в компоненты
 * не ходят»). Смена фильтра возвращает на первую страницу: смещение от прежнего фильтра
 * в новом показало бы середину списка или пустоту.
 */
export const useCampaignParticipants = (readCampaignId: () => string | null) => {
  const state = ref<LoadState>('loading');
  const data = ref<CampaignParticipantsResponse | null>(null);
  const half = ref('');
  const participantState = ref('');
  const outcome = ref('');
  const sort = ref('');
  const offset = ref(0);

  /** Номер последнего запроса: ответ на прежний фильтр, приехавший позже, не показывается. */
  let sequence = 0;

  const load = async (): Promise<void> => {
    const campaignId = readCampaignId();

    if (campaignId === null) {
      return;
    }

    const current = ++sequence;

    state.value = 'loading';

    try {
      const response = await $fetch<CampaignParticipantsResponse>(
        `/api/campaigns/${campaignId}/participants`,
        {
          query: {
            half: half.value || undefined,
            state: participantState.value || undefined,
            outcome: outcome.value || undefined,
            sort: sort.value || undefined,
            limit: CAMPAIGN_PARTICIPANTS_LIMIT,
            offset: offset.value,
          },
        },
      );

      if (current === sequence) {
        data.value = response;
        state.value = 'ready';
      }
    } catch {
      if (current === sequence) {
        state.value = 'error';
      }
    }
  };

  watch([half, participantState, outcome, sort], () => {
    offset.value = 0;
    void load();
  });

  const page = (next: number): void => {
    offset.value = next;
    void load();
  };

  return { state, data, half, participantState, outcome, sort, load, page };
};
