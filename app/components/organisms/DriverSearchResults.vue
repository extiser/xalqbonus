<script setup lang="ts">
import { computed } from 'vue';
import type { DriverSearchResponse } from '#shared/types/driver';
import type { LoadState } from '~/types/loadState';

/**
 * Результаты поиска по реестру парка.
 *
 * Под пустым списком подписано, по каким значениям шёл поиск: водитель диктует номер как
 * попало, и «во что превратился ваш запрос» — половина ответа на «почему не нашёлся».
 * Пустой список без этой подписи заставляет проверять догадки в psql.
 */
const props = defineProps<{
  state: LoadState;
  data: DriverSearchResponse | null;
}>();

const emit = defineEmits<{ page: [offset: number] }>();

/** Строка «по чему искали»: номер, телефон, слова имени — только те, что были признаны. */
const criteriaNote = computed(() => {
  const data = props.data;

  if (!data) {
    return null;
  }

  const parts: string[] = [];

  if (data.licenseCanonical) {
    parts.push(`номер ВУ ${data.licenseCanonical}`);
  }

  if (data.phoneDigits) {
    parts.push(`телефон, оканчивающийся на ${data.phoneDigits}`);
  }

  if (data.nameTerms.length > 0) {
    parts.push(`имя: ${data.nameTerms.join(' ')}`);
  }

  return parts.length > 0 ? `Искали: ${parts.join(' · ')}` : null;
});
</script>

<template>
  <MoleculesSectionPanel
    title="Результаты"
    note="Поиск идёт по всему реестру парка, а не по участникам программы: «нет в парке» и «не зарегистрирован» — разные ответы."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Ищем…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Поиск не отработал. Это отказ запроса, а не отсутствие такого водителя."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.query.length === 0"
      state="empty"
      message="Введите номер удостоверения, телефон или имя."
    />
    <div v-else-if="data.rows.length === 0">
      <MoleculesStateNotice
        state="empty"
        message="В реестре парка такого водителя нет — ни среди работающих, ни среди уволенных."
      />
      <p v-if="criteriaNote" class="text-center text-xs text-slate-400">{{ criteriaNote }}</p>
    </div>
    <div v-else class="space-y-0">
      <p v-if="criteriaNote" class="pb-3 text-xs text-slate-400">{{ criteriaNote }}</p>
      <MoleculesDriverSearchItem
        v-for="driver in data.rows"
        :key="driver.personId"
        :driver="driver"
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
