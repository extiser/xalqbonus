<script setup lang="ts">
import type { SyncRunsResponse } from '#shared/types/sync';
import type { LoadState } from '~/types/loadState';

/**
 * Журнал прогонов страницей, новыми вперёд.
 *
 * Отдельные падения показаны спокойным цветом вместе с текстом ошибки: упавший прогон
 * не двигает отметку, следующий забирает то же окно и догоняет — потерь нет. Красным
 * горит прогон, оборванный на середине: он висит в `running` и не закроется сам.
 */
defineProps<{
  state: LoadState;
  data: SyncRunsResponse | null;
}>();

const emit = defineEmits<{ page: [offset: number] }>();
</script>

<template>
  <MoleculesSectionPanel
    title="Последние прогоны"
    note="Счётчики прогона — события этого прогона, а не различные сущности: перекрытие окон приносит один заказ снова и снова."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем журнал…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Журнал прогонов не прочитался. Это отказ запроса, а не отсутствие прогонов."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.runs.length === 0"
      state="empty"
      message="Прогонов ещё не было."
    />
    <div v-else class="space-y-0">
      <MoleculesSyncRunItem v-for="run in data.runs" :key="run.id" :run="run" />
      <div class="border-t border-slate-200 pt-3">
        <MoleculesPagerBar
          :total="data.total"
          :limit="data.limit"
          :offset="data.offset"
          @change="emit('page', $event)"
        />
      </div>
    </div>
  </MoleculesSectionPanel>
</template>
