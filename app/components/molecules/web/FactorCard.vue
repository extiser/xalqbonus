<script setup lang="ts">
import { computed } from 'vue';
import { DASH, formatSignedNumber } from '~/utils/format';
import type { MetricKey } from '#shared/metrics';

/**
 * Карточка множителя в уравнении поездок — `.factor` в
 * `_reference/design/web/dashboard/02-levers.html`: подпись со значком подсказки, значение,
 * прошлое значение и вклад в изменение поездок.
 *
 * Под подпись — две строки у всех карточек: «Поездок в день на водителя» со значком уходит
 * на вторую, и без запаса значения встали бы на разной высоте. Результат (`result`) — на
 * циановой подложке 8 %: это сумма, а не множитель.
 *
 * Вклад красится только по знаку: зелёный у плюса, алый у минуса, у нуля без цвета (`codex.md`,
 * «Алый и зелёный — только у числа со знаком»). Нет базы — прочерк вместо прошлого и вклада.
 */
type FactorVariant = 'factor' | 'result';

const props = withDefaults(
  defineProps<{
    label: string;
    metric: MetricKey;
    /** Значение строкой, как показать: «431», «17,4». */
    value: string;
    /** Прошлое значение с подписью: «было 413», «в сентябре 79 400». `null` — базы нет. */
    was: string | null;
    /** Вклад в поездки. `null` — разложения нет. */
    contribution: number | null;
    /** Подпись после вклада: «поездок», у результата — «всего». */
    contributionLabel: string;
    variant?: FactorVariant;
  }>(),
  { variant: 'factor' },
);

const VARIANT_CLASSES: Record<FactorVariant, string> = {
  factor: 'bg-web-raised',
  result: 'bg-web-cyan/8',
};

const contributionTone = computed(() => {
  if (props.contribution === null || props.contribution === 0) return 'text-web-text';

  return props.contribution > 0 ? 'text-web-green' : 'text-web-scarlet';
});
</script>

<template>
  <div class="flex min-w-0 flex-col rounded-[22px] px-5 py-[18px] font-manrope" :class="VARIANT_CLASSES[variant]">
    <span class="min-h-[2.6em] text-[14px] leading-[1.3] font-medium text-web-title">
      <MoleculesWebMetricLabel :label="label" :metric="metric" />
    </span>
    <span class="mt-2.5 font-unbounded text-[30px] leading-[1.05] font-bold tracking-[-1px] text-web-text max-web:text-[24px]">
      {{ value }}
    </span>
    <span class="mt-1.5 text-[13px] text-web-grey">{{ was ?? DASH }}</span>
    <span class="mt-auto pt-3 text-[14px] font-semibold text-web-title">
      <template v-if="contribution === null">{{ DASH }}</template>
      <template v-else><b class="font-bold" :class="contributionTone">{{ formatSignedNumber(contribution) }}</b> {{ contributionLabel }}</template>
    </span>
  </div>
</template>
