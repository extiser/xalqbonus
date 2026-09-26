<script setup lang="ts">
import { DISPLAY_TIME_ZONE_LABEL, formatDateTime, formatNumber, pluralize } from '~/utils/format';
import { describeSegmentConditions } from '~/utils/segmentConditions';
import type { LoadState } from '~/types/loadState';
import type { SegmentListResponse } from '#shared/types/segment';

/**
 * Список сегментов: имя ссылкой на карточку, описание, условия словами и число водителей
 * на сейчас.
 *
 * Архивные показаны здесь же, последними и с отметкой: спрятанный архивный сегмент ищут
 * заведением второго с теми же условиями.
 */
defineProps<{
  state: LoadState;
  data: SegmentListResponse | null;
}>();

const driversLabel = (total: number): string =>
  `${formatNumber(total)} ${pluralize(total, 'водитель', 'водителя', 'водителей')}`;
</script>

<template>
  <MoleculesSectionPanel
    title="Сегменты"
    note="Сегмент хранит условия, а не людей: число водителей посчитано на момент открытия страницы и завтра будет другим."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем сегменты…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Сегменты не прочитались. Это отказ запроса, а не отсутствие сегментов."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.segments.length === 0"
      state="empty"
      message="Сегментов ещё не заводили."
    />
    <div v-else>
      <p class="pb-3 text-xs text-slate-400">
        Числа на {{ formatDateTime(data.calculatedAt) }} в зоне {{ DISPLAY_TIME_ZONE_LABEL }}
      </p>
      <ul>
        <li
          v-for="segment in data.segments"
          :key="segment.segmentId"
          class="flex flex-wrap items-start gap-x-4 gap-y-1 border-t border-slate-200 py-3"
        >
          <div class="min-w-48 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <NuxtLink
                :to="`/segments/${segment.segmentId}`"
                class="text-sm font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-600"
              >
                {{ segment.name }}
              </NuxtLink>
              <AtomsStatusBadge v-if="segment.archivedAt" tone="muted" label="В архиве" />
              <AtomsStatusBadge v-if="segment.isDemo" tone="demo" label="ДЕМО" />
            </div>
            <p v-if="segment.description" class="mt-1 text-sm text-slate-600">
              {{ segment.description }}
            </p>
            <p class="mt-0.5 text-xs text-slate-500">
              {{ describeSegmentConditions(segment.conditions).join(' · ') }}
            </p>
          </div>
          <p class="font-mono text-sm text-slate-900 tabular-nums">
            {{ driversLabel(segment.total) }}
          </p>
        </li>
      </ul>
    </div>
  </MoleculesSectionPanel>
</template>
