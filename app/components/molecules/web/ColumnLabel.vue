<script setup lang="ts">
import type { MetricKey, MetricValues } from '#shared/metrics';

/**
 * Подпись колонки с числами в шапке таблицы веба (issue #402): значок подсказки — после подписи
 * и вынесен за её правый край. Правый край текста подписи совпадает с правым краем чисел,
 * значок висит правее, в отступе колонки (`codex.md`, «Подсказка метрики»; `.tbl th.num .info`
 * в `_reference/design/web/dashboard/02-levers.html`).
 *
 * Значок выходит за ячейку на 18 пикселей: у последней колонки таблицы место под него оставляет
 * тот, кто её собирает. Шрифт и цвет — шапки таблицы.
 */
defineProps<{
  label: string;
  metric?: MetricKey;
  metricValues?: MetricValues;
}>();
</script>

<template>
  <!-- Одной строкой: пробел после подписи сдвинул бы её правый край с края чисел. -->
  <span class="relative whitespace-nowrap">{{ label }}<span v-if="metric" class="absolute top-1/2 -right-[30px] flex -translate-y-1/2"><MoleculesWebMetricInfo :metric="metric" :values="metricValues" /></span></span>
</template>
