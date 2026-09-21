<script setup lang="ts">
import {
  campaignHalfLabel,
  participantOutcomeLabel,
  participantStateLabel,
} from '~/utils/labels';
import type {
  CampaignHalfBreakdown,
  CampaignParticipantOutcome,
  CampaignParticipantState,
} from '#shared/types/campaign';

/**
 * Разбивка состава акции по состояниям и под ней — по исходам окна, отдельно по половинам,
 * когда состав делили: без этого разреза замер контроля не посчитать.
 *
 * Состояния — то, что водитель меняет сам; исходы ставит итог окна. Пока окно идёт, исходы
 * все нули — это нормальное состояние, а не пустота.
 */
defineProps<{
  breakdown: CampaignHalfBreakdown[];
}>();

const STATES: CampaignParticipantState[] = ['invited', 'opened', 'joined', 'declined'];
const OUTCOMES: CampaignParticipantOutcome[] = [
  'returned',
  'short',
  'joined_no_trips',
  'seen_not_joined',
  'no_response',
];
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
        <p class="text-xs font-medium text-slate-500">Исходы окна</p>
        <dl class="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MoleculesCounterTile
            v-for="outcome in OUTCOMES"
            :key="outcome"
            :label="participantOutcomeLabel(outcome)"
            :value="row.outcomes[outcome]"
          />
        </dl>
      </div>
    </div>
  </MoleculesSectionPanel>
</template>
