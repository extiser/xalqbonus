<script setup lang="ts">
import { computed } from 'vue';
import { DASH, formatClock, formatMomentDate, formatSignedCompactSum, formatSignedPercent, formatTenths } from '~/utils/format';
import { monthForms, periodMonthWord } from '#shared/monthNames';
import type { LoadState } from '~/types/loadState';
import type { DashboardMoney, DashboardMoneyComparison } from '#shared/types/dashboard';

/**
 * Плитка «Доход парка» вкладки «Деньги» (issue #438), 12 × 2 — главная цифра экрана
 * `_reference/design/web/dashboard/01-money.html`.
 *
 * Доход месяца в млн до десятой; под ним одной строкой с переносом — изменение к тому же месяцу
 * год назад со стрелкой тренда, изменение к прошлому месяцу в сутки и вердикт. Нет базы
 * или в ней дохода ноль — своего изменения нет. Вердикт — к году: «богаче» или «беднее»; при
 * равенстве, без базы года и когда у периода либо базы собраны не все сутки — его нет
 * (docs/decisions.md → «Деньги на дашборде»).
 *
 * Внизу — из чего цифра, почему не «прибыль» и когда посчитана таблица. Посчитанных суток
 * идущего месяца ещё нет — вместо числа прочерк и строка, когда посчитается.
 *
 * Данные — свойством: сама плитка в сеть не ходит.
 */
const props = defineProps<{
  state: LoadState;
  money: DashboardMoney | null;
}>();

const MILLION = 1_000_000;

const SOURCE_TEXT =
  'Комиссия парка с оплаченных заказов по транзакциям Яндекса. Расходы парка не введены, поэтому это не «прибыль».';

const ready = computed(() => (props.state === 'ready' ? props.money : null));

/** Посчитанных суток идущего месяца ещё нет. */
const empty = computed(() => ready.value !== null && ready.value.period.days === 0);

const figure = computed(() => (ready.value && !empty.value ? formatTenths(ready.value.income / MILLION) : DASH));

const isComplete = (comparison: DashboardMoneyComparison): boolean =>
  comparison.basePeriod.coveredDays >= comparison.basePeriod.days;

type DeltaView = { value: string; base: string; tone: 'up' | 'down'; trend: boolean };

/**
 * Изменение к базе. Целиком — суммой и долей в подписи базы: «−58,2 млн» «к сентябрю 2025,
 * −32,3 %»; в сутки — долей: «+1,0 %» «к августу в сутки».
 */
const delta = (comparison: DashboardMoneyComparison, withYear: boolean, trend: boolean): DeltaView | null => {
  const { current, base, basePeriod, perDay } = comparison;

  if (base === null || base.income <= 0) return null;

  const change = current.income - base.income;
  const share = formatSignedPercent((change / base.income) * 100);
  const baseWord = `к ${periodMonthWord(basePeriod, 'dative')}${withYear ? ` ${basePeriod.from.slice(0, 4)}` : ''}`;
  const tone = change < 0 ? 'down' : 'up';

  return perDay
    ? { value: share, base: `${baseWord} в сутки`, tone, trend }
    : { value: formatSignedCompactSum(change), base: `${baseWord}, ${share}`, tone, trend };
};

const deltas = computed(() => {
  const money = ready.value;

  if (!money || empty.value) return [];

  return [delta(money.bases.year, true, true), delta(money.bases.month, false, false)].filter(
    (view): view is DeltaView => view !== null,
  );
});

const verdict = computed(() => {
  const money = ready.value;

  if (!money || empty.value) return null;

  const { year } = money.bases;
  const periodComplete = money.period.coveredDays >= money.period.days;

  if (year.base === null || !periodComplete || !isComplete(year)) return null;
  if (year.current.income > year.base.income) return { text: 'Парк стал богаче, чем год назад', tone: 'good' as const };
  if (year.current.income < year.base.income) return { text: 'Парк стал беднее, чем год назад', tone: 'bad' as const };

  return null;
});

const footer = computed(() => {
  const money = ready.value;

  if (!money) return '';

  const computedText = money.computedAt
    ? `Посчитано ${formatMomentDate(money.computedAt)} в ${formatClock(money.computedAt)}.`
    : 'Ещё не посчитано: make metrics-recompute';

  return `${SOURCE_TEXT} ${computedText}`;
});

const pendingText = computed(() =>
  ready.value && empty.value
    ? `За ${monthForms(ready.value.month).nominative} посчитается утром, после перечитывания транзакций`
    : null,
);
</script>

<template>
  <MoleculesWebTile :cols="12" :rows="2" title="Доход парка" metric="moneyIncome">
    <div v-if="state === 'loading'" class="mt-[18px]">
      <AtomsWebHint text="Считаем доход…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-[18px]">
      <AtomsWebHint text="Доход не загрузился. Это отказ запроса, а не пустой месяц." />
    </div>
    <template v-else>
      <AtomsWebFigure class="mt-[18px]" :value="figure" unit="млн сум" size="hero" :tone="empty ? 'muted' : 'default'" />
      <div v-if="deltas.length > 0 || verdict" class="mt-3.5 flex flex-wrap items-center gap-x-7 gap-y-3">
        <div v-if="deltas.length > 0" class="flex flex-wrap gap-x-7 gap-y-1.5">
          <AtomsWebDelta
            v-for="view in deltas"
            :key="view.base"
            :value="view.value"
            :base="view.base"
            :tone="view.tone"
            :trend="view.trend"
          />
        </div>
        <AtomsWebVerdict v-if="verdict" :text="verdict.text" :tone="verdict.tone" />
      </div>
      <div class="mt-auto flex flex-col gap-0.5 pt-2.5">
        <AtomsWebHint v-if="pendingText" :text="pendingText" />
        <AtomsWebHint :text="footer" />
      </div>
    </template>
  </MoleculesWebTile>
</template>
