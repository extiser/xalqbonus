<script setup lang="ts">
import { computed, ref } from 'vue';
import { DASH, formatNumber } from '~/utils/format';
import type { LoadState } from '~/types/loadState';
import type { PickedDriver } from '~/types/rewardGrant';
import type { SelectOption } from '~/types/selectOption';
import type { DriverSearchRow } from '#shared/types/driver';

/**
 * Кому вручить (issue #219): одному водителю или сегменту.
 *
 * Водитель ищется тем же способом, что в разделе водителей, — одной строкой по номеру
 * удостоверения, телефону, имени и позывному. Сегменты — только рабочие, с числом водителей
 * на сейчас; выбор сегмента есть не у всех: раздача сегменту открыта владельцу и админу.
 *
 * За данными компонент не ходит: запрос поиска уходит наверх событием, найденное приходит
 * свойством (docs/frontend.md → «Данные в компоненты не ходят»).
 *
 * Демо-водитель помечен «ДЕМО» (issue #212) и выбирается любой ролью, как живой: на нём учат
 * менеджеров и админов.
 */
const props = defineProps<{
  canPickSegment: boolean;
  segmentOptions: SelectOption[];
  driver: PickedDriver | null;
  searchState: LoadState | null;
  searchRows: DriverSearchRow[];
  /** Отказ ручки по получателю. */
  error: string | null;
}>();

const kind = defineModel<'person' | 'segment'>('kind', { required: true });
const segmentId = defineModel<string>('segmentId', { required: true });

const emit = defineEmits<{ search: [query: string]; pick: [driver: PickedDriver]; clear: [] }>();

const query = ref('');

const kindModel = computed({
  get: () => kind.value,
  set: (value: string) => {
    kind.value = value === 'segment' ? 'segment' : 'person';
  },
});

const KIND_OPTIONS = computed<SelectOption[]>(() => [
  { value: 'person', label: 'Одному водителю' },
  ...(props.canPickSegment ? [{ value: 'segment', label: 'Сегменту' }] : []),
]);

const rowName = (row: DriverSearchRow): string =>
  [row.lastName, row.firstName, row.middleName].filter((part): part is string => Boolean(part)).join(' ') ||
  'Без имени';

const pick = (row: DriverSearchRow): void => {
  emit('pick', {
    personId: row.personId,
    name: rowName(row),
    isMember: row.isMember,
    isDemo: row.isDemo,
  });
};
</script>

<template>
  <div class="space-y-3">
    <label class="block max-w-xs">
      <span class="mb-1 block text-sm font-medium text-slate-700">Кому</span>
      <AtomsSelectInput v-model="kindModel" :options="KIND_OPTIONS" />
    </label>

    <template v-if="kind === 'segment'">
      <label class="block">
        <span class="mb-1 block text-sm font-medium text-slate-700">Сегмент</span>
        <AtomsSelectInput v-model="segmentId" :options="segmentOptions" required>
          <option value="">Выберите сегмент</option>
        </AtomsSelectInput>
      </label>
    </template>

    <template v-else>
      <div v-if="driver" class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <NuxtLink
          :to="`/drivers/${driver.personId}`"
          class="text-sm font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-600"
        >
          {{ driver.name }}
        </NuxtLink>
        <AtomsStatusBadge
          :tone="driver.isMember ? 'ok' : 'muted'"
          :label="driver.isMember ? 'в программе' : 'в программе не состоит'"
        />
        <AtomsStatusBadge v-if="driver.isDemo" tone="demo" label="ДЕМО" />
        <AtomsActionButton label="Другой водитель" @click="emit('clear')" />
      </div>

      <div v-else class="space-y-2">
        <MoleculesDriverSearchForm v-model="query" @submit="emit('search', query)" />
        <MoleculesStateNotice v-if="searchState === 'loading'" state="loading" message="Ищем…" />
        <MoleculesStateNotice
          v-else-if="searchState === 'error'"
          state="error"
          message="Поиск не удался. Это отказ запроса, а не отсутствие водителя."
        />
        <MoleculesStateNotice
          v-else-if="searchState === 'ready' && searchRows.length === 0"
          state="empty"
          message="Никого не нашлось."
        />
        <ul v-else-if="searchRows.length > 0" class="divide-y divide-slate-200">
          <li
            v-for="row in searchRows"
            :key="row.personId"
            class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"
          >
            <div class="min-w-48 flex-1">
              <p class="text-sm font-medium text-slate-900">{{ rowName(row) }}</p>
              <p class="text-xs text-slate-500">
                {{ row.callsigns.join(', ') || DASH }} · {{ row.phones.join(', ') || DASH }} ·
                {{ row.balance === null ? 'счёта нет' : `${formatNumber(row.balance)} баллов` }}
              </p>
            </div>
            <AtomsStatusBadge
              :tone="row.isMember ? 'ok' : 'muted'"
              :label="row.isMember ? 'в программе' : 'не в программе'"
            />
            <AtomsStatusBadge v-if="row.isDemo" tone="demo" label="ДЕМО" />
            <AtomsActionButton label="Выбрать" @click="pick(row)" />
          </li>
        </ul>
      </div>
    </template>

    <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
  </div>
</template>
