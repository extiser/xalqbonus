<script setup lang="ts">
import type { SyncStateResponse } from '#shared/types/sync';
import type { LoadState } from '~/types/loadState';

/**
 * Отметки синхронизации по видам прогона.
 *
 * Первое, на что смотрят, когда «баллы не начисляются»: прогоны могут идти минута за
 * минутой и все падать — строки в журнале при этом появляются, воркер жив, а окно стоит
 * на месте.
 */
defineProps<{
  state: LoadState;
  data: SyncStateResponse | null;
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Отметки синхронизации"
    note="Докуда дошло окно опроса у каждого вида прогона. Выключенное расписание — не поломка: отставание у него штатно."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем отметки…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Отметки не прочитались. Это отказ запроса, а не отсутствие данных."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.watermarks.length === 0"
      state="empty"
      message="Отметок нет: ни один вид прогона ещё не отчитывался."
    />
    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <MoleculesWatermarkCard
        v-for="watermark in data.watermarks"
        :key="watermark.kind"
        :watermark="watermark"
      />
    </div>
  </MoleculesSectionPanel>
</template>
