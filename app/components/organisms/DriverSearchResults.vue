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

/** Признак запроса: подпись и распознанное значение. */
type SearchCriterion = {
  label: string;
  value: string;
};

/**
 * Строка «по чему искали»: номер, телефон, слова имени, позывной — только те признаки,
 * что были распознаны в запросе.
 *
 * Значения в записях вебвизора закрыты все, подписи — нет (issue #432): строка повторяет
 * набранное в поиске, а набранное там вебвизор не пишет. Закрыть одни номер и телефон мало —
 * телефон, набранный целиком, приезжает сюда ещё и позывным.
 */
const criteria = computed((): SearchCriterion[] => {
  const data = props.data;

  if (!data) {
    return [];
  }

  const parts: SearchCriterion[] = [];

  if (data.licenseCanonical) {
    parts.push({ label: 'номер ВУ', value: data.licenseCanonical });
  }

  if (data.phoneDigits) {
    parts.push({ label: 'телефон, оканчивающийся на', value: data.phoneDigits });
  }

  if (data.nameTerms.length > 0) {
    parts.push({ label: 'имя:', value: data.nameTerms.join(' ') });
  }

  if (data.callsignTerm) {
    parts.push({ label: 'позывной, содержащий', value: data.callsignTerm });
  }

  return parts;
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
      message="Введите номер удостоверения, телефон, имя или позывной."
    />
    <div v-else-if="data.rows.length === 0">
      <MoleculesStateNotice
        state="empty"
        message="В реестре парка такого водителя нет — ни среди работающих, ни среди уволенных."
      />
      <p v-if="criteria.length > 0" class="text-center text-xs text-slate-400">
        Искали:
        <template v-for="(part, index) in criteria" :key="part.label">
          <template v-if="index > 0"> · </template>{{ part.label }}
          <span class="ym-hide-content">{{ part.value }}</span>
        </template>
      </p>
    </div>
    <div v-else class="space-y-0">
      <p v-if="criteria.length > 0" class="pb-3 text-xs text-slate-400">
        Искали:
        <template v-for="(part, index) in criteria" :key="part.label">
          <template v-if="index > 0"> · </template>{{ part.label }}
          <span class="ym-hide-content">{{ part.value }}</span>
        </template>
      </p>
      <MoleculesDriverSearchItem
        v-for="(driver, index) in data.rows"
        :key="driver.personId"
        :driver="driver"
        :position="data.offset + index + 1"
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
