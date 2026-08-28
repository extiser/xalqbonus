<script setup lang="ts">
import { computed } from 'vue';
import { formatNumber } from '~/utils/format';

/**
 * Листание страницы списка. Наружу отдаётся новое смещение, а не «страница вперёд»:
 * страница — производная величина, и считать её в двух местах незачем.
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
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm text-slate-500">
      {{ formatNumber(firstShown) }}–{{ formatNumber(lastShown) }} из {{ formatNumber(total) }}
    </p>
    <div class="flex gap-2">
      <AtomsPagerButton
        label="Назад"
        :disabled="!hasPrevious"
        @click="emit('change', Math.max(offset - limit, 0))"
      />
      <AtomsPagerButton label="Дальше" :disabled="!hasNext" @click="emit('change', offset + limit)" />
    </div>
  </div>
</template>
