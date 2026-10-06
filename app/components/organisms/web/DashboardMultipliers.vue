<script setup lang="ts">
import { computed } from 'vue';
import { formatClock, formatMomentDate, formatNumber, formatTenths } from '~/utils/format';
import { monthForms, periodMonthWord, shiftMonth } from '#shared/monthNames';
import type { LoadState } from '~/types/loadState';
import type { DashboardLevers } from '#shared/types/dashboard';

/**
 * Плитка «За счёт чего изменились поездки» вкладки «Рычаги» (issue #371) — экрана
 * `_reference/design/web/dashboard/02-levers.html`.
 *
 * Размер 12 × 3, а не 12 × 2 макета: в два ряда уравнение и строки под ним
 * не помещаются, и «Посчитано …» обрезалось. Место под строками — под вывод словами.
 *
 * Поездки = водители на линии × дни на линии × поездки в день: у каждого множителя значение,
 * прошлое значение и вклад — сколько поездок прибавил или отнял именно он. Вклады считает
 * сервер (`server/services/metrics/decomposeMultipliers.ts`), здесь только подписи.
 *
 * База сравнения в подписях — падежом месяца: «к сентябрю», «в сентябре»; неполный месяц —
 * диапазоном: «к 1–4 сентября». Нет базы — прочерки вместо прошлого и вкладов, а в названии
 * нет «· к …». Под уравнением — вывод словами (issue #383), когда посчитано и, если собраны
 * не все сутки, сколько. Вывод собирает сервер (`server/services/metrics/conclusions.ts`);
 * нет его — строки нет.
 *
 * Первый месяц истории (issue #392) сравнивать не с чем по построению: строк прошлого и вкладов
 * нет вовсе, а под уравнением сказано словами, за какой месяц данных нет и с какого будет
 * сравнение (`02-levers-first-month.html`). Остальные месяцы без базы — с прочерками.
 *
 * На телефоне, ниже 900, — две колонки по две карточки, знаки `=` и `×` скрыты.
 *
 * Данные — свойством: сама плитка в сеть не ходит (docs/frontend.md).
 */
const props = defineProps<{
  state: LoadState;
  levers: DashboardLevers | null;
}>();

const TITLE = 'За счёт чего изменились поездки';

const ready = computed(() => (props.state === 'ready' ? props.levers : null));

const title = computed(() =>
  ready.value?.base ? `${TITLE} · к ${periodMonthWord(ready.value.basePeriod, 'dative')}` : TITLE,
);

/** Выбран первый месяц истории: прошлого месяца в данных нет. */
const firstMonth = computed(() => ready.value !== null && ready.value.month === ready.value.range.firstMonth);

/** «сентябрь 2025» — месяц словом и годом. */
const monthWithYear = (month: string, form: 'nominative' | 'genitive'): string =>
  `${monthForms(month)[form]} ${month.slice(0, 4)}`;

const firstMonthText = computed(() => {
  const levers = ready.value;

  if (!levers || !firstMonth.value) return null;

  const { firstMonth: month } = levers.range;

  return (
    `За ${monthWithYear(shiftMonth(month, -1), 'nominative')} данных нет: история заказов — ` +
    `с ${monthWithYear(month, 'genitive')}. Сравнение с прошлым месяцем — с ${monthWithYear(shiftMonth(month, 1), 'genitive')}.`
  );
});

const cards = computed(() => {
  const levers = ready.value;

  if (!levers) return [];

  const { current, base, contributions, period, basePeriod } = levers;

  return [
    {
      key: 'trips',
      variant: 'result',
      label: 'Поездок',
      metric: 'trips',
      value: formatNumber(current.trips),
      was: base ? `в ${periodMonthWord(basePeriod, 'prepositional')} ${formatNumber(base.trips)}` : null,
      contribution: contributions?.total ?? null,
      contributionLabel: 'всего',
    },
    {
      key: 'driversOnLine',
      variant: 'factor',
      label: 'Водителей на линии',
      metric: 'driversOnLine',
      value: formatNumber(current.driversOnLine),
      was: base ? `было ${formatNumber(base.driversOnLine)}` : null,
      contribution: contributions?.driversOnLine ?? null,
      contributionLabel: 'поездок',
    },
    {
      key: 'daysOnLine',
      variant: 'factor',
      label: `Дней на линии из ${period.days}`,
      metric: 'daysOnLine',
      value: formatTenths(current.daysOnLine),
      was: base ? `было ${formatTenths(base.daysOnLine)}` : null,
      contribution: contributions?.daysOnLine ?? null,
      contributionLabel: 'поездок',
    },
    {
      key: 'tripsPerDay',
      variant: 'factor',
      // Короче подписи макета: на 390 «… на водителя» шла в три строки
      // и разводила значения по высоте; «на водителя» сказано в подсказке.
      label: 'Поездок в день',
      metric: 'tripsPerDay',
      value: formatTenths(current.tripsPerDay),
      was: base ? `было ${formatTenths(base.tripsPerDay)}` : null,
      contribution: contributions?.tripsPerDay ?? null,
      contributionLabel: 'поездок',
    },
  ] as const;
});

const computedText = computed(() => {
  const computedAt = ready.value?.computedAt;

  return computedAt
    ? `Посчитано ${formatMomentDate(computedAt)} в ${formatClock(computedAt)}`
    : 'Ещё не посчитано: make metrics-recompute';
});

const coverageText = computed(() => {
  const levers = ready.value;

  if (!levers) return null;

  // У первого месяца истории база — месяц до истории: её суток нет по построению, а не недобраны.
  const periods = firstMonth.value ? [levers.period] : [levers.period, levers.basePeriod];

  if (periods.every((period) => period.coveredDays >= period.days)) return null;

  const parts = periods.map(
    (period) => `${monthForms(period.from).nominative} — ${period.coveredDays} из ${period.days}`,
  );

  return `Собраны не все сутки: ${parts.join(', ')}. Цифры занижены`;
});
</script>

<template>
  <MoleculesWebTile :cols="12" :rows="3" :title="title" metric="multipliersContribution">
    <div v-if="state === 'loading'" class="mt-[18px]">
      <AtomsWebHint text="Считаем множители…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-[18px]">
      <AtomsWebHint text="Множители не загрузились. Это отказ запроса, а не пустой месяц." />
    </div>
    <template v-else>
      <div
        class="mt-[18px] grid grid-cols-[1.15fr_auto_1fr_auto_1fr_auto_1fr] items-stretch gap-3.5 max-web:grid-cols-2"
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
              :contribution="card.contribution"
              :contribution-label="card.contributionLabel"
              :variant="card.variant"
              :compare="!firstMonth"
            />
          </div>
        </template>
      </div>
      <div class="mt-auto flex flex-col gap-0.5 pt-2.5">
        <AtomsWebHint v-if="firstMonthText" :text="firstMonthText" />
        <AtomsWebHint v-if="ready.conclusion" :text="ready.conclusion" />
        <AtomsWebHint :text="computedText" />
        <AtomsWebHint v-if="coverageText" :text="coverageText" />
      </div>
    </template>
  </MoleculesWebTile>
</template>
