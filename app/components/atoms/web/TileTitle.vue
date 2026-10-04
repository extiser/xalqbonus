<script setup lang="ts">
import type { MetricKey } from '#shared/metrics';

/**
 * Название плитки веба — роль «Название плитки» кодекса: Manrope 18 / 500, высота строки 1,25,
 * цвет `title`. Крупное и серое: читается первым, но с числом не спорит.
 *
 * Отдельным атомом, а не строкой внутри плитки: роль показывается и одна, на листе шрифтов
 * служебной страницы `/design/web`.
 *
 * С ключом метрики (`metric`) после названия стоит значок подсказки — определение метрики
 * из `shared/metrics.ts` (`codex.md`, «Подсказка метрики»). Не путать с `AtomsWebHint`:
 * тот — уточнение под числом.
 */
defineProps<{
  label: string;
  /** Золотая точка программы перед названием — «Цена программы». */
  marker?: 'program';
  metric?: MetricKey;
}>();
</script>

<template>
  <span class="min-w-0 font-manrope text-[18px] leading-[1.25] font-medium text-web-title">
    <AtomsWebProgramDot v-if="marker === 'program'" /><MoleculesWebMetricLabel :label="label" :metric="metric" />
  </span>
</template>
