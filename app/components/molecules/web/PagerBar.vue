<script setup lang="ts">
import { computed } from 'vue';
import { PhArrowLeft, PhArrowRight } from '@phosphor-icons/vue';
import { formatNumber } from '~/utils/format';

/**
 * Листание таблицы веба — кодекс, «Листание» (issue #471): слева «1–25 из 46» 13 / 500 серым,
 * «Назад» и «Дальше» — кнопки действия в плитке; недоступная — прозрачность 40 %. Номеров
 * страниц нет.
 *
 * Свойства и событие — как у листания светлой раскладки (`MoleculesPagerBar`): наружу отдаётся
 * новое смещение, а не «страница вперёд», — страница производная величина.
 */
const props = defineProps<{
  total: number;
  limit: number;
  offset: number;
}>();

const emit = defineEmits<{ change: [offset: number] }>();

const firstShown = computed(() => (props.total === 0 ? 0 : props.offset + 1));
const lastShown = computed(() => Math.min(props.offset + props.limit, props.total));
const hasPrevious = computed(() => props.offset > 0);
const hasNext = computed(() => props.offset + props.limit < props.total);
</script>

<template>
  <nav class="flex flex-none flex-wrap items-center gap-1.5" aria-label="Страницы">
    <span class="mr-2.5 font-manrope text-[13px] font-medium whitespace-nowrap text-web-grey">
      {{ formatNumber(firstShown) }}–{{ formatNumber(lastShown) }} из {{ formatNumber(total) }}
    </span>
    <AtomsWebActionButton
      label="Назад"
      :icon="PhArrowLeft"
      :disabled="!hasPrevious"
      @click="emit('change', Math.max(offset - limit, 0))"
    />
    <AtomsWebActionButton
      label="Дальше"
      :trailing-icon="PhArrowRight"
      :disabled="!hasNext"
      @click="emit('change', offset + limit)"
    />
  </nav>
</template>
