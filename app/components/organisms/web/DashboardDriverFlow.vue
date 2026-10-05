<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { formatNumber, formatSignedNumber } from '~/utils/format';
import { readWebToken, webChartTheme, type WebChartTheme } from '~/utils/webChartTheme';
import { BOT_SWITCHOVER_DAY } from '#shared/metrics';
import { formatMonthTitle, monthForms, shiftMonth } from '#shared/monthNames';
import type { LoadState } from '~/types/loadState';
import type { DashboardFlowMonth, DashboardLevers } from '#shared/types/dashboard';

/**
 * Плитка «Поток водителей по месяцам» вкладки «Рычаги» (issue #392) — `.chart-tile`
 * в `_reference/design/web/dashboard/02-levers.html`. Определения —
 * docs/decisions.md → «Поток водителей — по календарному месяцу».
 *
 * Столбик на закрытый месяц: новые и вернувшиеся стопкой вверх от нуля, новые снизу; ушедшие —
 * вниз. Над месяцем панели — изменение на линии со знаком, подпись этого месяца белая. Выбран
 * идущий месяц — справа его место: пунктирная рамка без заливки и «идёт» второй строкой
 * подписи. Рамка — пара пустых столбиков той же стопки, вверх и вниз: так она встаёт ровно
 * на место столбика, без своего сдвига.
 *
 * Метка «Новый бот» — линия у правого края столбика месяца переключения, если он на графике.
 * Столбик — доля шага месяца (`BAR_WIDTH`), поэтому его край — та же доля в долях шага.
 *
 * Выбран первый месяц истории — месяцев потока нет: вместо графика сказано словами, почему
 * и с какого месяца он начнётся (`02-levers-first-month.html`).
 *
 * Легенда — разметкой над графиком, как в `PointsWeeklyChart`. Рисуется только в браузере:
 * тема и цвета — из токенов страницы. Данные — свойством: плитка в сеть не ходит.
 */
const props = defineProps<{
  state: LoadState;
  levers: DashboardLevers | null;
}>();

/** Доля шага месяца под столбик. */
const BAR_WIDTH = 0.4;
/** Метка «Новый бот» — чуть правее края столбика, чтобы не легла на него. */
const SWITCHOVER_GAP = 0.05;
/** Высота пустой рамки идущего месяца вверх и вниз — доля самого высокого столбика. */
const ONGOING_SHARE = 0.3;
const BAR_RADIUS = 4;
const VALUE_SPLITS = 4;

const ready = computed(() => (props.state === 'ready' ? props.levers : null));

const mounted = ref(false);
const theme = shallowRef<WebChartTheme>({});
const colors = shallowRef({ newDrivers: '', returned: '', left: '', switchover: '', text: '', title: '', axis: '' });

onMounted(() => {
  theme.value = webChartTheme();
  colors.value = {
    newDrivers: readWebToken('color-web-cyan'),
    returned: readWebToken('color-web-teal-mid'),
    left: readWebToken('color-web-scarlet'),
    switchover: readWebToken('color-web-garnet'),
    text: readWebToken('color-web-text'),
    title: readWebToken('color-web-title'),
    axis: readWebToken('color-web-axis'),
  };
  mounted.value = true;
});

const months = computed<readonly DashboardFlowMonth[]>(() => ready.value?.flow.months ?? []);

/** Место идущего месяца справа от закрытых. */
const ongoingMonth = computed(() => (ready.value?.flow.selectedOngoing ? ready.value.month : null));

const emptyText = computed(() => {
  const firstMonth = ready.value?.range.firstMonth;

  if (!firstMonth) return '';

  const withYear = (month: string, form: 'nominative' | 'genitive'): string =>
    `${monthForms(month)[form]} ${month.slice(0, 4)}`;

  return (
    `Поток считается от прошлого месяца, а за ${withYear(shiftMonth(firstMonth, -1), 'nominative')} данных нет. ` +
    `Первый столбец — ${withYear(shiftMonth(firstMonth, 1), 'nominative')}.`
  );
});

/** «ноя», «дек» — первые три буквы месяца. */
const shortMonth = (month: string): string => monthForms(month).nominative.slice(0, 3);

const signed = (value: number): string => (value === 0 ? '0' : formatSignedNumber(value));

const legendDot = (color: string): string =>
  `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;background:${color}"></span>`;

const tooltipText = (index: number): string => {
  const month = months.value[index];

  if (!month) {
    return ongoingMonth.value ? `<b>${formatMonthTitle(ongoingMonth.value)}</b><br>идёт` : '';
  }

  return [
    `<b>${formatMonthTitle(month.month)}</b>`,
    `${legendDot(colors.value.newDrivers)}новые ${formatNumber(month.newDrivers)}`,
    `${legendDot(colors.value.returned)}вернулись ${formatNumber(month.returned)}`,
    `${legendDot(colors.value.left)}ушли ${formatNumber(month.left)}`,
  ].join('<br>');
};

/** Номер месяца под курсором: у подсказки по оси приходит список рядов, у него один месяц. */
const hoveredIndex = (params: unknown): number => {
  const first: unknown = Array.isArray(params) ? params[0] : params;

  return typeof first === 'object' && first !== null && 'dataIndex' in first && typeof first.dataIndex === 'number'
    ? first.dataIndex
    : -1;
};

/** Подпись оси значений со знаком: «+80», «0», «−40». */
const axisValue = (value: number): string => (value > 0 ? `+${formatNumber(value)}` : formatNumber(value));

const option = computed<ECOption>(() => {
  const closed = months.value;
  const ongoing = ongoingMonth.value;
  const panelIndex = closed.length - 1;
  const ongoingIndex = ongoing ? closed.length : -1;
  const categories = [...closed.map((month) => month.month), ...(ongoing ? [ongoing] : [])];
  const tallest = Math.max(1, ...closed.map((month) => Math.max(month.newDrivers + month.returned, month.left)));
  const ongoingHeight = Math.max(1, Math.round(tallest * ONGOING_SHARE));
  const switchoverIndex = closed.findIndex((month) => month.month === BOT_SWITCHOVER_DAY.slice(0, 7));
  const switchoverLabel = `Новый бот · ${BOT_SWITCHOVER_DAY.slice(8, 10)}.${BOT_SWITCHOVER_DAY.slice(5, 7)}`;
  const onlyClosed = (value: (month: DashboardFlowMonth) => number): (number | null)[] =>
    categories.map((_month, index) => {
      const month = closed[index];

      return month ? value(month) : null;
    });
  const onlyOngoing = (value: number): (number | null)[] =>
    categories.map((_month, index) => (index === ongoingIndex ? value : null));
  const placeholder = {
    type: 'bar' as const,
    stack: 'flow',
    silent: true,
    barWidth: `${BAR_WIDTH * 100}%`,
    itemStyle: {
      color: 'transparent',
      borderColor: colors.value.axis,
      borderWidth: 1,
      borderType: 'dashed' as const,
      borderRadius: BAR_RADIUS,
    },
  };

  return {
    grid: { left: 0, right: 0, top: 28, bottom: 0, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: {
        interval: 0,
        formatter: (value: string) => (value === ongoing ? `${shortMonth(value)}\n{note|идёт}` : shortMonth(value)),
        color: (_value?: string | number, index?: number) =>
          index === panelIndex ? colors.value.text : colors.value.axis,
        rich: { note: { fontSize: 11, color: colors.value.axis } },
      },
    },
    yAxis: {
      type: 'value',
      splitNumber: VALUE_SPLITS,
      axisLabel: { formatter: axisValue },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => tooltipText(hoveredIndex(params)),
    },
    series: [
      {
        type: 'bar',
        name: 'новые',
        stack: 'flow',
        barWidth: `${BAR_WIDTH * 100}%`,
        data: onlyClosed((month) => month.newDrivers),
        itemStyle: { color: colors.value.newDrivers, borderRadius: BAR_RADIUS },
        markLine:
          switchoverIndex === -1
            ? undefined
            : {
                silent: true,
                symbol: 'none',
                lineStyle: { color: colors.value.switchover, width: 1.5, type: 'solid' },
                label: {
                  formatter: switchoverLabel,
                  position: 'insideEndTop',
                  rotate: 0,
                  color: colors.value.title,
                  fontWeight: 600,
                },
                data: [{ xAxis: switchoverIndex + BAR_WIDTH / 2 + SWITCHOVER_GAP }],
              },
      },
      {
        type: 'bar',
        name: 'вернулись',
        stack: 'flow',
        barWidth: `${BAR_WIDTH * 100}%`,
        data: categories.map((_month, index) => {
          const month = closed[index];

          if (!month) return null;
          if (index !== panelIndex) return month.returned;

          return {
            value: month.returned,
            label: {
              show: true,
              position: 'top',
              formatter: signed(month.onLineChange),
              color: colors.value.text,
              fontSize: 13,
              fontWeight: 700,
            },
          };
        }),
        itemStyle: { color: colors.value.returned, borderRadius: BAR_RADIUS },
      },
      {
        type: 'bar',
        name: 'ушли',
        stack: 'flow',
        barWidth: `${BAR_WIDTH * 100}%`,
        data: onlyClosed((month) => -month.left),
        itemStyle: { color: colors.value.left, borderRadius: BAR_RADIUS },
      },
      { ...placeholder, name: 'идёт', data: onlyOngoing(ongoingHeight) },
      { ...placeholder, name: 'идёт вниз', data: onlyOngoing(-ongoingHeight) },
    ],
  };
});

const ariaLabel = computed(() => {
  const closed = months.value;
  const first = closed[0];
  const last = closed.at(-1);
  const span = first && last ? `${formatMonthTitle(first.month)} — ${formatMonthTitle(last.month)}` : '';
  const ongoing = ongoingMonth.value ? `; ${formatMonthTitle(ongoingMonth.value)} идёт` : '';

  return `Поток водителей: новые, вернувшиеся и ушедшие по месяцам, ${span}${ongoing}`;
});
</script>

<template>
  <MoleculesWebTile :cols="8" :rows="3" title="Поток водителей по месяцам" metric="driverFlow" class="max-web:min-h-[300px]">
    <div v-if="state === 'loading'" class="mt-[18px]">
      <AtomsWebHint text="Считаем поток…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-[18px]">
      <AtomsWebHint text="Поток не загрузился. Это отказ запроса, а не пустой месяц." />
    </div>
    <p
      v-else-if="months.length === 0"
      class="m-0 grid flex-1 place-items-center px-10 py-6 text-center font-manrope text-[15px] leading-[1.5] text-web-grey max-web:px-2"
    >
      {{ emptyText }}
    </p>
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div class="mt-2 flex flex-wrap gap-[18px] font-manrope text-[13px] font-medium text-web-title">
        <span><i class="mr-1.5 inline-block size-3 rounded align-[-1px] bg-web-cyan" />новые</span>
        <span><i class="mr-1.5 inline-block size-3 rounded align-[-1px] bg-web-teal-mid" />вернулись</span>
        <span><i class="mr-1.5 inline-block size-3 rounded align-[-1px] bg-web-scarlet" />ушли</span>
      </div>
      <div class="mt-3 min-h-0 flex-1 max-web:h-[220px] max-web:flex-none" role="img" :aria-label="ariaLabel">
        <VChart v-if="mounted" :option="option" :theme="theme" autoresize />
      </div>
    </div>
  </MoleculesWebTile>
</template>
