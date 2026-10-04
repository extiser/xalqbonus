<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { formatNumber } from '~/utils/format';
import { readWebToken, webChartTheme, type WebChartTheme } from '~/utils/webChartTheme';
import type { DashboardPointsWeek } from '#shared/types/dashboard';

/**
 * График «Баллы по неделям» вкладки «Глубина» (issue #373) — `.chart` плитки «Баллы по неделям»
 * в `_reference/design/web/dashboard/03-depth.html`.
 *
 * Пара столбиков на неделю: выдано золотом — цвет программы, потрачено бирюзовым. Ось одна,
 * слева. Подпись недели — дата понедельника, у последней — белым (кодекс: текущий период
 * белым); неделя, которая ещё идёт, подписана «· идёт». Наведение показывает неделю целиком
 * и оба числа.
 *
 * Легенда — разметкой над графиком, как `.legend` макета: легенда ECharts рисуется внутри
 * холста и шрифтом и отступами с плиткой не сходится.
 *
 * На телефоне, ниже 900, — последние 6 недель: 12 пар столбиков на ширине телефона сливаются.
 *
 * Рисуется только в браузере: тема собирается из токенов страницы (`webChartTheme`), а ширина
 * для телефона — из окна. Данные — свойством: сам график в сеть не ходит.
 */
const props = defineProps<{
  weeks: readonly DashboardPointsWeek[];
}>();

/** Сколько недель на телефоне. */
const NARROW_WEEKS = 6;

/** Граница телефона — `--breakpoint-web`, тот же запрос, что у `max-web:`. */
const NARROW_QUERY = '(width < 900px)';

const BAR_MAX_WIDTH = 24;
/** Горизонталей сетки — примерно три, как в макете: чаще — шум за столбиками. */
const VALUE_SPLITS = 3;
const BAR_RADIUS = 4;

const mounted = ref(false);
const narrow = ref(false);
const theme = shallowRef<WebChartTheme>({});
const colors = shallowRef({ issued: '', spent: '', text: '', axis: '' });

let media: MediaQueryList | null = null;

const updateNarrow = (): void => {
  narrow.value = media?.matches ?? false;
};

onMounted(() => {
  theme.value = webChartTheme();
  colors.value = {
    issued: readWebToken('color-web-gold'),
    spent: readWebToken('color-web-teal'),
    text: readWebToken('color-web-text'),
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

const shownWeeks = computed(() => (narrow.value ? props.weeks.slice(-NARROW_WEEKS) : props.weeks));

/** `2026-09-28` → «28.09». */
const dayMonth = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** Воскресенье недели: понедельник плюс шесть суток, календарно. */
const weekEnd = (weekStart: string): string =>
  new Date(Date.parse(`${weekStart}T00:00:00Z`) + 6 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);

/** Подпись оси значений: «5 тыс» вместо «5 000» — как в макете. */
const axisValue = (value: number): string =>
  value !== 0 && value % 1_000 === 0 ? `${formatNumber(value / 1_000)} тыс` : formatNumber(value);

const legendDot = (color: string): string =>
  `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;background:${color}"></span>`;

const tooltipText = (index: number): string => {
  const week = shownWeeks.value[index];

  if (!week) return '';

  return [
    `<b>${dayMonth(week.weekStart)}–${dayMonth(weekEnd(week.weekStart))}</b>`,
    `${legendDot(colors.value.issued)}выдано ${formatNumber(week.issued)}`,
    `${legendDot(colors.value.spent)}потрачено ${formatNumber(week.spent)}`,
  ].join('<br>');
};

/** Номер недели под курсором: у подсказки по оси приходит список рядов, у неё одна неделя. */
const hoveredIndex = (params: unknown): number => {
  const first: unknown = Array.isArray(params) ? params[0] : params;

  return typeof first === 'object' && first !== null && 'dataIndex' in first && typeof first.dataIndex === 'number'
    ? first.dataIndex
    : -1;
};

const option = computed<ECOption>(() => {
  const weeks = shownWeeks.value;
  const lastIndex = weeks.length - 1;

  return {
    grid: { left: 0, right: 0, top: 8, bottom: 0, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'category',
      data: weeks.map((week) => (week.current ? `${dayMonth(week.weekStart)} · идёт` : dayMonth(week.weekStart))),
      axisLabel: {
        interval: 0,
        color: (_value?: string | number, index?: number) =>
          index === lastIndex ? colors.value.text : colors.value.axis,
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
        name: 'выдано',
        data: weeks.map((week) => week.issued),
        barMaxWidth: BAR_MAX_WIDTH,
        itemStyle: { color: colors.value.issued, borderRadius: BAR_RADIUS },
      },
      {
        type: 'bar',
        name: 'потрачено',
        data: weeks.map((week) => week.spent),
        barMaxWidth: BAR_MAX_WIDTH,
        itemStyle: { color: colors.value.spent, borderRadius: BAR_RADIUS },
      },
    ],
  };
});

const ariaLabel = computed(() => `Баллы по неделям: выдано и потрачено, недель — ${shownWeeks.value.length}`);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="mt-2 flex flex-wrap gap-[18px] font-manrope text-[13px] font-medium text-web-title">
      <span><i class="mr-1.5 inline-block size-3 rounded align-[-1px] bg-web-gold" />выдано</span>
      <span><i class="mr-1.5 inline-block size-3 rounded align-[-1px] bg-web-teal" />потрачено</span>
    </div>
    <div class="mt-3 min-h-0 flex-1 max-web:h-[220px] max-web:flex-none" role="img" :aria-label="ariaLabel">
      <VChart v-if="mounted" :option="option" :theme="theme" autoresize />
    </div>
    <p class="m-0 mt-1.5 text-right font-manrope text-[11px] font-medium text-web-axis">
      недели с первого перевода в журнале
    </p>
  </div>
</template>
