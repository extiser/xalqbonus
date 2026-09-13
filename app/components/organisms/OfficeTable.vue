<script setup lang="ts">
import type { OfficeListResponse } from '#shared/types/catalog';
import type { LoadState } from '~/types/loadState';

/**
 * Список офисов парка: название ссылкой на карточку, адрес, режим работы, признак архива.
 *
 * Три состояния нарисованы, а не подразумеваются: «офисов ещё не заводили» и «список
 * не читается» для смотрящего означают противоположное (docs/frontend.md → «Три состояния
 * обязательны»).
 *
 * Архивные офисы показаны здесь же и помечены: спрятанный архивный офис ищут заведением
 * второго с тем же названием.
 */
defineProps<{
  state: LoadState;
  data: OfficeListResponse | null;
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Офисы"
    note="Офис не удаляется, а уходит в архив: на него ссылаются заказы, и заказ обязан помнить, где его выдавали."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем список…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Список офисов не прочитался. Это отказ запроса, а не отсутствие офисов."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.offices.length === 0"
      state="empty"
      message="Офисов ещё не заводили."
    />
    <ul v-else>
      <li
        v-for="office in data.offices"
        :key="office.officeId"
        class="border-t border-slate-200 py-3 first:border-t-0"
      >
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <NuxtLink
            :to="`/offices/${office.officeId}`"
            class="text-sm font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-600"
          >
            {{ office.name }}
          </NuxtLink>
          <AtomsStatusBadge v-if="office.archivedAt" tone="muted" label="В архиве" />
        </div>
        <p class="mt-1 text-sm text-slate-600">{{ office.address }}</p>
        <p v-if="office.workHours" class="mt-0.5 text-xs text-slate-500">{{ office.workHours }}</p>
      </li>
    </ul>
  </MoleculesSectionPanel>
</template>
