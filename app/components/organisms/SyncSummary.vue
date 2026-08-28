<script setup lang="ts">
import type { SyncSummaryResponse } from '#shared/types/sync';
import type { LoadState } from '~/types/loadState';

/**
 * Свод за сутки и за неделю.
 *
 * Считается по таблицам данных различными сущностями, а не суммой счётчиков прогонов:
 * окно живой синхронизации — одиннадцать минут при прогоне раз в минуту, и один заказ
 * попадает в несколько прогонов подряд, каждый из которых считает его заново.
 */
defineProps<{
  state: LoadState;
  data: SyncSummaryResponse | null;
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Свод за период"
    note="Различные заказы, начисления и пропущенное — по таблицам данных, по времени события. Счётчики прогонов здесь не складываются: один заказ попадает в несколько прогонов подряд."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Считаем свод…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Свод не посчитался. Это отказ запроса, а не пустой период."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.periods.length === 0"
      state="empty"
      message="Считать нечего: журнал прогонов пуст."
    />
    <div v-else class="grid gap-3 lg:grid-cols-2">
      <MoleculesPeriodSummaryCard
        v-for="period in data.periods"
        :key="period.period"
        :summary="period"
        :journal-since="data.journalSince"
        :trips-since="data.tripsSince"
      />
    </div>
  </MoleculesSectionPanel>
</template>
