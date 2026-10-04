<script setup lang="ts">
import { computed } from 'vue';
import { DASH, formatCompactSum, formatNumber, formatSignedNumber, pluralize } from '~/utils/format';
import { monthForms } from '~/utils/monthNames';
import type { LoadState } from '~/types/loadState';
import type { DashboardProgramEconomy } from '#shared/types/dashboard';

/**
 * Плитка «Экономика программы» вкладки «Глубина» (issue #373) — экрана
 * `_reference/design/web/dashboard/03-depth.html`, 4 × 3.
 *
 * Строки разбора: выдано, потрачено с выкупом, цена балла с числом заказов, по которым она
 * посчитана, и итогом — долг по баллам, главным числом в баллах, в сумах — уточнением
 * (docs/decisions.md → «Баллы в метриках дашборда»). Под строками — на сколько долг изменился
 * за месяц. Числа считает сервер, здесь только подписи.
 *
 * Данные — свойством: сама плитка в сеть не ходит (docs/frontend.md).
 */
const props = defineProps<{
  state: LoadState;
  /** Месяц `YYYY-MM` — в названии плитки. */
  month: string | null;
  economy: DashboardProgramEconomy | null;
}>();

const TITLE = 'Экономика программы';

const title = computed(() => (props.month ? `${TITLE} · ${monthForms(props.month).nominative}` : TITLE));

const ready = computed(() => (props.state === 'ready' ? props.economy : null));

const spentHint = (economy: DashboardProgramEconomy): string =>
  economy.redemptionPercent === null
    ? 'выкупа нет: ничего не выдано'
    : `выкуп ${economy.redemptionPercent} % от выданного`;

const costHint = (economy: DashboardProgramEconomy): string => {
  if (economy.pointCost === null) return 'ещё не было выданных заказов';

  const orders = economy.pointCostOrders;
  const base = `по ${formatNumber(orders)} ${pluralize(orders, 'выданному заказу', 'выданным заказам', 'выданным заказам')}`;
  const unpriced = economy.pointCostUnpricedLines;

  return unpriced > 0
    ? `${base}, у ${formatNumber(unpriced)} ${pluralize(unpriced, 'позиции', 'позиций', 'позиций')} нет себестоимости`
    : base;
};

const debtHint = (economy: DashboardProgramEconomy): string =>
  economy.debtSum === null
    ? 'в сумах — когда будет цена балла'
    : `≈ ${formatCompactSum(economy.debtSum)} сум по цене балла`;

const changeText = computed(() => {
  const change = ready.value?.debtPointsChange ?? 0;
  const amount = change === 0 ? '0' : formatSignedNumber(change);

  return `Долг за месяц: ${amount} ${pluralize(change, 'балл', 'балла', 'баллов')}`;
});
</script>

<template>
  <MoleculesWebTile :cols="4" :rows="3" :title="title">
    <div v-if="state === 'loading'" class="mt-[18px]">
      <AtomsWebHint text="Считаем баллы…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-[18px]">
      <AtomsWebHint text="Баллы не загрузились. Это отказ запроса, а не пустой месяц." />
    </div>
    <template v-else>
      <div class="mt-[18px] flex flex-col gap-3">
        <MoleculesWebBreakdownRow
          label="Выдано баллов"
          metric="pointsIssued"
          hint="за поездки, подарки, акции"
          :value="formatNumber(ready.issued)"
        />
        <MoleculesWebBreakdownRow
          label="Потрачено"
          metric="pointsSpent"
          :hint="spentHint(ready)"
          :value="formatNumber(ready.spent)"
        />
        <MoleculesWebBreakdownRow
          label="Цена балла"
          metric="pointCost"
          :hint="costHint(ready)"
          :value="ready.pointCost === null ? DASH : `${formatNumber(ready.pointCost)} сум`"
        />
        <MoleculesWebBreakdownRow
          label="Долг по баллам"
          metric="pointsDebt"
          marker="program"
          variant="total"
          :hint="debtHint(ready)"
          :value="formatNumber(ready.debtPoints)"
        />
      </div>
      <div class="mt-auto pt-2.5">
        <AtomsWebHint :text="changeText" />
      </div>
    </template>
  </MoleculesWebTile>
</template>
