<script setup lang="ts">
import { formatNumber } from '~/utils/format';

/**
 * Плитка счётчика: подпись, число и пояснение под ним.
 *
 * Пояснение необязательно, но у половины счётчиков этого экрана оно обязано быть:
 * «строк ответа» и «профилей» — разные числа, и перепутать их нельзя.
 */
defineProps<{
  label: string;
  value: number;
  hint?: string;
}>();
</script>

<template>
  <div class="rounded-md bg-slate-50 px-3 py-2">
    <dt class="text-xs text-slate-500">{{ label }}</dt>
    <dd class="mt-0.5 font-mono text-lg text-slate-900 tabular-nums">{{ formatNumber(value) }}</dd>
    <p v-if="hint" class="mt-0.5 text-xs text-slate-400">{{ hint }}</p>
  </div>
</template>
