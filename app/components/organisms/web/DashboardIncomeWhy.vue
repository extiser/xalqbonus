<script setup lang="ts">
import { computed, ref } from 'vue';
import { DASH, formatNumber, formatSignedCompactSum } from '~/utils/format';
import { formatCommissionPair, formatDecimal } from '#shared/numberFormat';
import { monthForms, monthYear, periodMonthWord } from '#shared/monthNames';
import type { MetricKey } from '#shared/metrics';
import type { LoadState } from '~/types/loadState';
import type { DashboardMoney, DashboardMoneyComparison, DashboardPeriod } from '#shared/types/dashboard';

/**
 * Плитка «Почему изменилось» вкладки «Деньги» (issue #438), 12 × 3 — уравнение
 * `_reference/design/web/dashboard/01-money.html`: доход парка = заказов × оплата на заказ ×
 * комиссия парка. Устроена как «За счёт чего изменились поездки» на «Рычагах»
 * (`DashboardMultipliers.vue`): у каждой карточки значение, «было» и вклад в изменение дохода.
 *
 * Переключатель «год · месяц» в шапке меняет базу всего уравнения: год — тот же месяц год назад,
 * целиком, а когда у периода и базы суток разное число — в сутки; месяц — прошлый месяц, всегда
 * в сутки, и подписи карточек тогда «в сутки». Выбран год. Вклады и вывод считает сервер
 * (`server/services/metrics/readDashboardMoney.ts`), здесь только подписи.
 *
 * Внизу — вывод выбранной базы и, если у периода или базы собраны не все сутки, сколько.
 * Посчитанных суток идущего месяца ещё нет — прочерки и строка, когда посчитается.
 *
 * Данные — свойством: сама плитка в сеть не ходит.
 */
const props = defineProps<{
  state: LoadState;
  money: DashboardMoney | null;
}>();

type BaseKey = 'year' | 'month';

const MILLION = 1_000_000;

const selected = ref<BaseKey>('year');

const ready = computed(() => (props.state === 'ready' ? props.money : null));

const empty = computed(() => ready.value !== null && ready.value.period.days === 0);

const comparison = computed<DashboardMoneyComparison | null>(() =>
  ready.value ? ready.value.bases[selected.value] : null,
);

/** «сентябрю 2025», «августу» — база в дательном падеже; у года — с годом. */
const baseDative = (period: DashboardPeriod, key: BaseKey): string =>
  `${periodMonthWord(period, 'dative')}${key === 'year' ? ` ${period.from.slice(0, 4)}` : ''}`;

const options = computed(() => {
  const money = ready.value;

  return [
    {
      key: 'year' as const,
      label: 'год',
      ariaLabel: money ? `К ${baseDative(money.bases.year.basePeriod, 'year')}` : undefined,
    },
    {
      key: 'month' as const,
      label: 'месяц',
      ariaLabel: money ? `К ${baseDative(money.bases.month.basePeriod, 'month')}` : undefined,
    },
  ];
});

/** Доход в млн: целиком — до десятой, в сутки — до сотой. */
const formatIncome = (value: number, perDay: boolean): string => formatDecimal(value / MILLION, perDay ? 2 : 1);

type CardView = {
  key: string;
  variant: 'factor' | 'result';
  label: string;
  metric: MetricKey;
  value: string;
  was: string | null;
  detail: string | null;
  contribution: string | null;
  contributionLabel: string;
};

const cards = computed<CardView[]>(() => {
  const view = comparison.value;

  if (!view) return [];

  const { current, base, contributions, perDay, basePeriod } = view;
  const show = !empty.value;
  const signed = (value: number | undefined): string | null =>
    show && value !== undefined ? formatSignedCompactSum(value) : null;
  const commission = formatCommissionPair(current.commission, base?.commission ?? null);
  // «в сентябре 2025 — 180,4 млн» целиком, «в августе 4,03 млн» в сутки — как в эталоне.
  const inBase = `в ${periodMonthWord(basePeriod, 'prepositional')}${selected.value === 'year' ? ` ${basePeriod.from.slice(0, 4)}` : ''}`;
  const incomeWas =
    base === null
      ? null
      : `${inBase}${perDay ? ' ' : ' — '}${formatIncome(base.income, perDay)} млн`;
  const perOrder = `с заказа ${formatNumber(Math.round(current.incomePerOrder))} сум`;

  return [
    {
      key: 'income',
      variant: 'result',
      label: perDay ? 'Доход в сутки, млн сум' : 'Доход парка, млн сум',
      metric: perDay ? 'moneyIncomePerDay' : 'moneyIncome',
      value: show ? formatIncome(current.income, perDay) : DASH,
      was: show ? incomeWas : null,
      detail: null,
      contribution: signed(contributions?.total),
      contributionLabel: 'всего',
    },
    {
      key: 'orders',
      variant: 'factor',
      label: perDay ? 'Заказов в сутки' : 'Заказов',
      metric: perDay ? 'moneyOrdersPerDay' : 'moneyOrders',
      value: show ? formatNumber(Math.round(current.orders)) : DASH,
      was: show && base ? `было ${formatNumber(Math.round(base.orders))}` : null,
      detail: null,
      contribution: signed(contributions?.orders),
      contributionLabel: '',
    },
    {
      key: 'paymentPerOrder',
      variant: 'factor',
      label: 'Оплата на заказ, сум',
      metric: 'moneyPaymentPerOrder',
      value: show ? formatNumber(Math.round(current.paymentPerOrder)) : DASH,
      was: show && base ? `было ${formatNumber(Math.round(base.paymentPerOrder))}` : null,
      detail: null,
      contribution: signed(contributions?.paymentPerOrder),
      contributionLabel: '',
    },
    {
      key: 'commission',
      variant: 'factor',
      label: 'Комиссия парка, %',
      metric: 'moneyCommission',
      value: show ? commission.current : DASH,
      was: show && commission.base !== null ? `было ${commission.base}` : null,
      detail: show
        ? base
          ? `${perOrder}, было ${formatNumber(Math.round(base.incomePerOrder))}`
          : perOrder
        : null,
      contribution: signed(contributions?.commission),
      contributionLabel: '',
    },
  ];
});

const pendingText = computed(() =>
  ready.value && empty.value
    ? `За ${monthForms(ready.value.month).nominative} посчитается утром, после перечитывания транзакций`
    : null,
);

/** «Собраны не все сутки: сентябрь 2026 — 28 из 30, сентябрь 2025 — 30 из 30. Цифры занижены». */
const coverageText = computed(() => {
  const money = ready.value;
  const view = comparison.value;

  if (!money || !view || empty.value) return null;

  const periods = [money.period, view.basePeriod];

  if (periods.every((period) => period.coveredDays >= period.days)) return null;

  const parts = periods.map(
    (period) => `${monthYear(period.from.slice(0, 7), 'nominative')} — ${period.coveredDays} из ${period.days}`,
  );

  return `Собраны не все сутки: ${parts.join(', ')}. Цифры занижены`;
});
</script>

<template>
  <MoleculesWebTile :cols="12" :rows="3" title="Почему изменилось" metric="moneyWhy">
    <template #aside>
      <AtomsWebSegmented v-if="ready" :options="options" :selected="selected" @select="selected = $event" />
    </template>
    <div v-if="state === 'loading'" class="mt-[18px]">
      <AtomsWebHint text="Считаем доход…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-[18px]">
      <AtomsWebHint text="Доход не загрузился. Это отказ запроса, а не пустой месяц." />
    </div>
    <template v-else>
      <div
        class="mt-[18px] grid grid-cols-[1.15fr_auto_1fr_auto_1fr_auto_1fr] items-stretch gap-3.5 max-web:grid-cols-2"
        role="tabpanel"
      >
        <template v-for="(card, index) in cards" :key="card.key">
          <span
            v-if="index > 0"
            class="self-center font-manrope text-[26px] font-semibold text-web-axis max-web:hidden"
            aria-hidden="true"
          >{{ index === 1 ? '=' : '×' }}</span>
          <div class="grid min-w-0">
            <MoleculesWebFactorCard
              :label="card.label"
              :metric="card.metric"
              :value="card.value"
              :was="card.was"
              :detail="card.detail"
              :contribution="card.contribution"
              :contribution-label="card.contributionLabel"
              :variant="card.variant"
            />
          </div>
        </template>
      </div>
      <div class="mt-auto flex flex-col gap-0.5 pt-2.5">
        <AtomsWebHint v-if="pendingText" :text="pendingText" />
        <AtomsWebHint v-if="comparison?.conclusion" :text="comparison.conclusion" />
        <AtomsWebHint v-if="coverageText" :text="coverageText" />
      </div>
    </template>
  </MoleculesWebTile>
</template>
