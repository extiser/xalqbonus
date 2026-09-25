<script setup lang="ts">
import { computed } from 'vue';
import { formatNumber } from '~/utils/format';

/**
 * Счётчик знаков под полем: сколько набрано из скольких и сколько осталось — тем же видом,
 * что у текстов рассылки. Считает `length` строки — той же меркой, что проверка на сервере.
 */
const props = defineProps<{
  length: number;
  limit: number;
}>();

const remaining = computed(() => props.limit - props.length);
const tooLong = computed(() => remaining.value < 0);
</script>

<template>
  <p class="mt-1 text-sm" :class="tooLong ? 'text-red-700' : 'text-slate-500'">
    <span class="font-semibold tabular-nums">{{ formatNumber(length) }}</span>
    из {{ formatNumber(limit) }} знаков.
    <template v-if="tooLong">Длиннее на {{ formatNumber(-remaining) }} — сократите.</template>
    <template v-else>Осталось {{ formatNumber(remaining) }}.</template>
  </p>
</template>
