<script setup lang="ts">
import { campaignHalfLabel, participantStateLabel } from '~/utils/labels';
import type { CampaignHalfBreakdown, CampaignParticipantState } from '#shared/types/campaign';

/**
 * Разбивка состава акции по состояниям — отдельно по половинам, когда состав делили.
 *
 * Состояния здесь только те, что водитель меняет сам. Исходы окна появятся с итогом окна
 * и сюда не подмешиваются.
 */
defineProps<{
  breakdown: CampaignHalfBreakdown[];
}>();

const STATES: CampaignParticipantState[] = ['invited', 'opened', 'joined', 'declined'];
</script>

<template>
  <MoleculesSectionPanel
    title="Состав по состояниям"
    note="«Открыл экран акции» — видел акцию в Mini App и ещё не ответил. «Участвует» — нажал «Участвовать», «отказался» — нажал «Отказаться». Назад состояния не ходят."
  >
    <MoleculesStateNotice
      v-if="breakdown.length === 0"
      state="empty"
      message="Участников нет: снимок ещё не снимали."
    />
    <div v-else class="space-y-4">
      <div v-for="row in breakdown" :key="row.half" class="space-y-2">
        <p class="text-sm font-semibold text-slate-900">
          {{ breakdown.length > 1 ? campaignHalfLabel(row.half) : 'Весь состав' }} ·
          {{ row.total }}
        </p>
        <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MoleculesCounterTile
            v-for="state in STATES"
            :key="state"
            :label="participantStateLabel(state)"
            :value="row.states[state]"
          />
        </dl>
      </div>
    </div>
  </MoleculesSectionPanel>
</template>
