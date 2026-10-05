<script setup lang="ts">
import { computed } from 'vue';
import { formatMonthTitle } from '#shared/monthNames';

/**
 * Выбор месяца дашборда — `.period` в `_reference/design/web/dashboard/02-levers.html`:
 * «Октябрь 2026» и стрелки назад и вперёд по кругу 34. На краю диапазона стрелка погашена.
 *
 * Месяцы — `YYYY-MM`. Где живёт выбранный — решает страница: компонент только отдаёт
 * соседний месяц событием.
 */
const props = defineProps<{
  month: string;
  firstMonth: string;
  lastMonth: string;
}>();

const emit = defineEmits<{ change: [month: string] }>();

const shift = (month: string, by: number): string => {
  const [year, monthNumber] = month.split('-').map(Number);

  return new Date(Date.UTC(year ?? 0, (monthNumber ?? 1) - 1 + by, 1)).toISOString().slice(0, 7);
};

const title = computed(() => formatMonthTitle(props.month));
const canGoBack = computed(() => props.month > props.firstMonth);
const canGoForward = computed(() => props.month < props.lastMonth);

const ARROW_CLASSES =
  'grid size-[34px] cursor-pointer place-items-center rounded-full border-0 bg-web-raised p-0 disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-web-cyan';
</script>

<template>
  <div class="flex items-center gap-2.5 rounded-full bg-web-tile py-1.5 pr-1.5 pl-[18px] font-manrope text-[14px] font-semibold text-web-text">
    <span aria-live="polite">{{ title }}</span>
    <button
      type="button"
      :class="ARROW_CLASSES"
      aria-label="Прошлый месяц"
      :disabled="!canGoBack"
      @click="emit('change', shift(month, -1))"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 stroke-web-text" aria-hidden="true">
        <path d="M10 3L5 8l5 5" />
      </svg>
    </button>
    <button
      type="button"
      :class="ARROW_CLASSES"
      aria-label="Следующий месяц"
      :disabled="!canGoForward"
      @click="emit('change', shift(month, 1))"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 stroke-web-text" aria-hidden="true">
        <path d="M6 3l5 5-5 5" />
      </svg>
    </button>
  </div>
</template>
