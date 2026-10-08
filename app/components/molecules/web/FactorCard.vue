<script setup lang="ts">
import { computed } from 'vue';
import { DASH } from '~/utils/format';
import { valueSign } from '~/utils/signedValue';
import type { MetricKey } from '#shared/metrics';

/**
 * Карточка множителя в уравнении — `.factor` в `_reference/design/web/dashboard/02-levers.html`
 * и `01-money.html`: подпись со значком подсказки, значение, прошлое значение и вклад в изменение
 * результата — поездок «Рычагов» или дохода «Денег» (issue #438). Под прошлым значением бывает
 * вторая строка — «с заказа 1 533 сум, было 1 815» у комиссии парка.
 *
 * Вклад приходит готовой строкой со знаком: «+3 466», «−33,0 млн» — вид числа решает уравнение.
 *
 * Под подпись — две строки у всех карточек: «Водителей на линии» со значком на узкой карточке уходит
 * на вторую, и без запаса значения встали бы на разной высоте. Результат (`result`) — на
 * циановой подложке 8 %: это сумма, а не множитель.
 *
 * Вклад красится только по знаку строки (`valueSign`): зелёный у плюса, алый у минуса, у нуля —
 * «+0», «+0,0 тыс.» — без цвета (`codex.md`, «Алый и зелёный — только у числа со знаком»). Нет
 * базы — прочерк вместо прошлого и вклада.
 *
 * Без сравнения (`compare: false`) строк прошлого и вклада нет вовсе — первый месяц истории,
 * сравнивать которому не с чем по построению (`02-levers-first-month.html`, issue #392).
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
    /** Вторая строка под прошлым значением: «с заказа 1 533 сум, было 1 815». */
    detail?: string | null;
    /** Вклад строкой со знаком: «+3 466», «−33,0 млн». `null` — разложения нет. */
    contribution: string | null;
    /** Подпись после вклада: «поездок», у результата — «всего»; у множителей «Денег» её нет. */
    contributionLabel?: string;
    variant?: FactorVariant;
    /** Показывать ли прошлое значение и вклад. */
    compare?: boolean;
  }>(),
  { detail: null, contributionLabel: '', variant: 'factor', compare: true },
);

const VARIANT_CLASSES: Record<FactorVariant, string> = {
  factor: 'bg-web-raised',
  result: 'bg-web-cyan/8',
};

/** Ноль со знаком — «+0», «+0,0 тыс.»: цифр, кроме нулей, в строке нет. */
const NON_ZERO_DIGIT = /[1-9]/;

const contributionTone = computed(() => {
  const sign = props.contribution === null ? null : valueSign(props.contribution);

  if (sign === null || !NON_ZERO_DIGIT.test(props.contribution ?? '')) return 'text-web-text';

  return sign === 'plus' ? 'text-web-green' : 'text-web-scarlet';
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
    <template v-if="compare">
      <span class="mt-1.5 text-[13px] text-web-grey">{{ was ?? DASH }}</span>
      <span v-if="detail" class="mt-1.5 text-[13px] text-web-grey">{{ detail }}</span>
      <span class="mt-auto pt-3 text-[14px] font-semibold text-web-title">
        <template v-if="contribution === null">{{ DASH }}</template>
        <template v-else><b class="font-bold" :class="contributionTone">{{ contribution }}</b>{{ contributionLabel ? ` ${contributionLabel}` : '' }}</template>
      </span>
    </template>
  </div>
</template>
