<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { formatNumber, formatTenths } from '~/utils/format';
import { readWebToken, webChartTheme, type WebChartTheme } from '~/utils/webChartTheme';
import { monthForms, monthYear } from '#shared/monthNames';
import type { LoadState } from '~/types/loadState';
import type { DashboardMoney, DashboardMoneyMonth } from '#shared/types/dashboard';

/**
 * Плитка «Доход парка по месяцам» вкладки «Деньги» (issue #438), 12 × 3 — `.chart-tile`
 * `_reference/design/web/dashboard/01-money.html`. ECharts, как `PointsWeeklyChart.vue`.
 *
 * 13 столбцов, от того же месяца год назад по выбранный: выбранный — циановым, тот же месяц год
 * назад — серо-бирюзовым, остальные — бирюзовым фоном шкалы. Над каждым — доход в млн до десятой,
 * у выбранного белым и жирным: подписан каждый столбец, иначе остальные декоративные. Меток
 * событий нет: новый бот на доход парка не влияет (docs/decisions.md → «Деньги на дашборде»).
 *
 * Идущий месяц — доход за посчитанные сутки, подпись «окт · идёт». Месяц, где собраны не все
 * сутки, подписан «· не все сутки» второй строкой: одной строкой на ноутбуке подписи соседних
 * месяцев наезжали бы друг на друга.
 *
 * На телефоне, ниже 900, — тот же месяц год назад и последние четыре, между ними — разрыв «⋯»;
 * «остальные месяцы» в легенде скрыты. Стрелки-входа и нажатия на столбец нет: вести некуда.
 *
 * Легенда — разметкой над графиком. Рисуется только в браузере: тема и цвета — из токенов
 * страницы, ширина для телефона — из окна. Данные — свойством: плитка в сеть не ходит.
 */
const props = defineProps<{
  state: LoadState;
  money: DashboardMoney | null;
}>();

const MILLION = 1_000_000;

/** Последних месяцев на телефоне — рядом с тем же месяцем год назад. */
const NARROW_RECENT = 4;

/** Граница телефона — `--breakpoint-web`, тот же запрос, что у `max-web:`. */
const NARROW_QUERY = '(width < 900px)';

/** Категория разрыва на телефоне: подпись оси «⋯», столбца нет. */
const GAP = 'gap';

const BAR_WIDTH = '50%';
const BAR_MAX_WIDTH = 44;
const BAR_RADIUS = 6;
const VALUE_SPLITS = 4;

const ready = computed(() => (props.state === 'ready' ? props.money : null));

const mounted = ref(false);
const narrow = ref(false);
const theme = shallowRef<WebChartTheme>({});
const colors = shallowRef({ selected: '', yearAgo: '', other: '', text: '', title: '', grey: '', axis: '' });

let media: MediaQueryList | null = null;

const updateNarrow = (): void => {
  narrow.value = media?.matches ?? false;
};

onMounted(() => {
  theme.value = webChartTheme();
  colors.value = {
    selected: readWebToken('color-web-cyan'),
    yearAgo: readWebToken('color-web-compare'),
    other: readWebToken('color-web-teal'),
    text: readWebToken('color-web-text'),
    title: readWebToken('color-web-title'),
    grey: readWebToken('color-web-grey'),
    axis: readWebToken('color-web-axis'),
  };
  media = window.matchMedia(NARROW_QUERY);
  updateNarrow();
  media.addEventListener('change', updateNarrow);
  mounted.value = true;
});

onBeforeUnmount(() => {
  media?.removeEventListener('change', updateNarrow);
});

const months = computed<readonly DashboardMoneyMonth[]>(() => ready.value?.byMonth ?? []);

const selectedMonth = computed(() => ready.value?.month ?? '');

const yearAgoMonth = computed(() => months.value[0]?.month ?? '');

/** Столбцы на экране: все 13 или, на телефоне, год назад, разрыв и последние четыре. */
const shown = computed<readonly (DashboardMoneyMonth | typeof GAP)[]>(() => {
  const all = months.value;

  if (!narrow.value || all.length <= NARROW_RECENT + 1) return all;

  const first = all[0];

  return first ? [first, GAP, ...all.slice(-NARROW_RECENT)] : all;
});

/** «сен», «окт» — первые три буквы месяца. */
const shortMonth = (month: string): string => monthForms(month).nominative.slice(0, 3);

const monthLabel = (column: DashboardMoneyMonth): string => {
  // На телефоне тот же месяц год назад стоит через разрыв, и без года его не отличить: «сен 25».
  const name =
    narrow.value && column.month === yearAgoMonth.value
      ? `${shortMonth(column.month)} ${column.month.slice(2, 4)}`
      : shortMonth(column.month);

  if (column.partial) return `${name} · идёт`;
  if (column.coveredDays < column.days) return `${name}\n· не все сутки`;

  return name;
};

/** Подпись оси значений в млн: «200 млн», «0». */
const axisValue = (value: number): string => (value === 0 ? '0' : `${formatNumber(value / MILLION)} млн`);

const option = computed<ECOption>(() => {
  const columns = shown.value;
  const palette = colors.value;

  const barStyle = (month: string): { bar: string; label: string; weight: number } => {
    if (month === selectedMonth.value) return { bar: palette.selected, label: palette.text, weight: 700 };
    if (month === yearAgoMonth.value) return { bar: palette.yearAgo, label: palette.title, weight: 700 };

    return { bar: palette.other, label: palette.grey, weight: 600 };
  };

  return {
    grid: { left: 0, right: 0, top: 24, bottom: 0, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'category',
      data: columns.map((column) => (column === GAP ? '⋯' : monthLabel(column))),
      axisLabel: {
        interval: 0,
        color: (_value?: string | number, index?: number) => {
          const column = columns[index ?? -1];

          return column !== GAP && column?.month === selectedMonth.value ? palette.text : palette.axis;
        },
      },
    },
    yAxis: {
      type: 'value',
      splitNumber: VALUE_SPLITS,
      axisLabel: { formatter: axisValue },
    },
    series: [
      {
        type: 'bar',
        name: 'доход',
        barWidth: BAR_WIDTH,
        barMaxWidth: BAR_MAX_WIDTH,
        data: columns.map((column) => {
          if (column === GAP || column.days === 0) return null;

          const style = barStyle(column.month);

          return {
            value: column.income,
            itemStyle: { color: style.bar, borderRadius: BAR_RADIUS },
            label: { color: style.label, fontWeight: style.weight },
          };
        }),
        label: {
          show: true,
          position: 'top',
          fontSize: 13,
          formatter: (params: { value?: unknown }) =>
            typeof params.value === 'number' ? formatTenths(params.value / MILLION) : '',
        },
      },
    ],
  };
});

const legend = computed(() =>
  ready.value
    ? { selected: monthYear(selectedMonth.value, 'nominative'), yearAgo: monthYear(yearAgoMonth.value, 'nominative') }
    : null,
);

const ariaLabel = computed(() => {
  const columns = months.value;
  const first = columns[0];
  const last = columns[columns.length - 1];

  return first && last
    ? `Доход парка по месяцам, ${monthYear(first.month, 'nominative')} — ${monthYear(last.month, 'nominative')}`
    : 'Доход парка по месяцам';
});
</script>

<template>
  <MoleculesWebTile :cols="12" :rows="3" title="Доход парка по месяцам" metric="moneyIncomeByMonth" class="max-web:min-h-[300px]">
    <div v-if="state === 'loading'" class="mt-[18px]">
      <AtomsWebHint text="Считаем доход…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-[18px]">
      <AtomsWebHint text="Доход не загрузился. Это отказ запроса, а не пустой месяц." />
    </div>
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div v-if="legend" class="mt-2 flex flex-wrap gap-[18px] font-manrope text-[13px] font-medium text-web-title">
        <span><i class="mr-1.5 inline-block size-3 rounded align-[-1px] bg-web-cyan" />{{ legend.selected }}</span>
        <span><i class="mr-1.5 inline-block size-3 rounded align-[-1px] bg-web-compare" />{{ legend.yearAgo }}</span>
        <span class="max-web:hidden"><i class="mr-1.5 inline-block size-3 rounded align-[-1px] bg-web-teal" />остальные месяцы</span>
      </div>
      <div class="mt-3 min-h-0 flex-1 max-web:h-[220px] max-web:flex-none" role="img" :aria-label="ariaLabel">
        <VChart v-if="mounted" :option="option" :theme="theme" autoresize />
      </div>
    </div>
  </MoleculesWebTile>
</template>
