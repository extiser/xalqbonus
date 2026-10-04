<script setup lang="ts">
import { computed } from 'vue';
import type { MetricKey } from '#shared/metrics';

/**
 * Подпись метрики со значком подсказки после неё (`codex.md`, «Подсказка метрики»): значок
 * держится за последнее слово и на строку один не уходит — `.glue` в
 * `_reference/design/web/dashboard/02-levers.html`. Без метрики — просто подпись.
 *
 * Шрифт и цвет — того, кто ставит подпись: название плитки и подпись множителя разные.
 */
const props = defineProps<{
  label: string;
  metric?: MetricKey;
}>();

/** Всё до последнего слова — с пробелом на конце — и последнее слово. */
const parts = computed(() => {
  const cut = props.label.lastIndexOf(' ') + 1;

  return { head: props.label.slice(0, cut), last: props.label.slice(cut) };
});
</script>

<template>
  <template v-if="metric">{{ parts.head }}<span class="whitespace-nowrap">{{ parts.last }}<MoleculesWebMetricInfo :metric="metric" /></span></template>
  <template v-else>{{ label }}</template>
</template>
