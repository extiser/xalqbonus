<script setup lang="ts">
import type { SyncSkipsResponse } from '#shared/types/sync';
import type { LoadState } from '~/types/loadState';

/**
 * Нерешённое пропущенное: что синхронизация не смогла записать и не записала до сих пор.
 *
 * Сверху то, что окно тащит из раза в раз. Решённое сюда не попадает — список обязан
 * таять после того, как реестр догнали.
 */
defineProps<{
  state: LoadState;
  data: SyncSkipsResponse | null;
}>();

const emit = defineEmits<{ page: [offset: number] }>();
</script>

<template>
  <MoleculesSectionPanel
    title="Нерешённое пропущенное"
    note="Только то, что не записано до сих пор. Разрешённое прогоном реестра из списка уходит."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем пропущенное…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Список пропущенного не прочитался. Это отказ запроса, а не пустой список."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.skips.length === 0"
      state="empty"
      message="Нерешённого пропущенного нет."
    />
    <div v-else class="space-y-0">
      <MoleculesSyncSkipItem
        v-for="skip in data.skips"
        :key="`${skip.reason}:${skip.reference}`"
        :skip="skip"
      />
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
