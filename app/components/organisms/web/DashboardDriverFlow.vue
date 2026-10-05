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
 * Неполный месяц — собраны не все сутки у него или у прошлого (`incomplete`): столбики
 * полупрозрачные — цветом с прозрачностью, а не `opacity` элемента: та бледнила бы и изменение
 * над месяцем панели, вокруг стопки — пунктирный контур серым, под подписью «неполн.», в подсказке —
 * строка об этом. Иначе дыра в истории читалась бы как настоящий отток. Контур — своя стопка
 * поверх стопки месяца (`barGap: '-100%'`): невидимый столбик вниз на «ушли» и на нём контур
 * на всю высоту, стопкой без учёта знака (`stackStrategy: 'all'`) — одна рамка, а не две
 * половины, сходящиеся у нуля. Изменение над месяцем панели не меняется.
 *
 * Метка «Новый бот» — линия у правого края столбика месяца переключения, если он на графике.
 * Столбик — доля шага месяца (`BAR_WIDTH`), поэтому его край — та же доля в долях шага.
 * Предел ширины (`BAR_MAX_WIDTH`) ломает эту долю, только когда шаг шире 100: на ноутбуке
 * при шести-семи месяцах он около 100, на широком мониторе линия отходит от столбика на десяток
 * пикселей.
 *
 * Нажатие на стопку месяца или на рамку идущего открывает этот месяц страницы — событием
 * `select`, тем же переходом, что выбор в переключателе месяца: своего состояния у графика нет.
 * Уже выбранный месяц нажатием ничего не делает, и в его подсказке нет строки «Нажмите — открыть
 * месяц». Контур неполного месяца и метка «Новый бот» нажатия не ловят — они пропускают его
 * к столбикам под собой.
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

const emit = defineEmits<{ select: [month: string] }>();

/** Доля шага месяца под столбик. */
const BAR_WIDTH = 0.4;
/** Столбик не шире макета: когда месяцев два-три, доля шага растянула бы его на полплитки. */
const BAR_MAX_WIDTH = 40;
/** Метка «Новый бот» — чуть правее края столбика, чтобы не легла на него. */
const SWITCHOVER_GAP = 0.05;
/**
 * Поле справа под подпись метки, когда месяц переключения — последний столбик: подпись идёт
 * вправо от линии, как в макете, и без поля обрезалась бы краем графика.
 */
const SWITCHOVER_LABEL_ROOM = 110;
/** Прозрачность столбиков неполного месяца. */
const INCOMPLETE_OPACITY = 0.35;
/** Высота пустой рамки идущего месяца вверх и вниз — доля самого высокого столбика. */
const ONGOING_SHARE = 0.3;
const BAR_RADIUS = 4;
const VALUE_SPLITS = 4;

const ready = computed(() => (props.state === 'ready' ? props.levers : null));

const mounted = ref(false);
const theme = shallowRef<WebChartTheme>({});
const colors = shallowRef({
  newDrivers: '',
  returned: '',
  left: '',
  switchover: '',
  text: '',
  title: '',
  axis: '',
  grey: '',
});

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
    grey: readWebToken('color-web-grey'),
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

/** `#9CEEFF` → `rgba(156, 238, 255, 0.35)`. Токены веба — шестнадцатеричные; иное — как есть. */
const withAlpha = (color: string, alpha: number): string => {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];

  if (!hex) return color;

  const value = Number.parseInt(hex, 16);

  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

const signed = (value: number): string => (value === 0 ? '0' : formatSignedNumber(value));

const legendDot = (color: string): string =>
  `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;background:${color}"></span>`;

/** Строка «открыть месяц» в подсказке — у всех месяцев, кроме выбранного. */
const openHint = (month: string): string[] =>
  month === ready.value?.month ? [] : [`<span style="color:${colors.value.grey}">Нажмите — открыть месяц</span>`];

const tooltipText = (index: number): string => {
  const month = months.value[index];

  if (!month) {
    const ongoing = ongoingMonth.value;

    return ongoing ? [`<b>${formatMonthTitle(ongoing)}</b>`, 'идёт', ...openHint(ongoing)].join('<br>') : '';
  }

  return [
    `<b>${formatMonthTitle(month.month)}</b>`,
    `${legendDot(colors.value.newDrivers)}новые ${formatNumber(month.newDrivers)}`,
    `${legendDot(colors.value.returned)}вернулись ${formatNumber(month.returned)}`,
    `${legendDot(colors.value.left)}ушли ${formatNumber(month.left)}`,
    ...(month.incomplete ? ['Собраны не все сутки'] : []),
    ...openHint(month.month),
  ].join('<br>');
};

/** Нажатие на столбик: месяц — категория столбика. Выбранный не открывается заново. */
const openMonth = (params: unknown): void => {
  const month =
    typeof params === 'object' && params !== null && 'name' in params && typeof params.name === 'string'
      ? params.name
      : null;

  if (month !== null && month !== ready.value?.month && /^\d{4}-\d{2}$/.test(month)) {
    emit('select', month);
  }
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
  const incompleteMonths = new Set(closed.filter((month) => month.incomplete).map((month) => month.month));
  const faded = (color: string) => ({ color: withAlpha(color, INCOMPLETE_OPACITY) });
  const onlyClosed = (value: (month: DashboardFlowMonth) => number, color: string) =>
    categories.map((_month, index) => {
      const month = closed[index];

      if (!month) return null;

      return month.incomplete ? { value: value(month), itemStyle: faded(color) } : value(month);
    });
  const onlyIncomplete = (value: (month: DashboardFlowMonth) => number): (number | null)[] =>
    categories.map((_month, index) => {
      const month = closed[index];

      return month?.incomplete ? value(month) : null;
    });
  const monthLabel = (value: string): string => {
    if (value === ongoing) return `${shortMonth(value)}\n{note|идёт}`;
    if (incompleteMonths.has(value)) return `${shortMonth(value)}\n{note|неполн.}`;

    return shortMonth(value);
  };
  const onlyOngoing = (value: number): (number | null)[] =>
    categories.map((_month, index) => (index === ongoingIndex ? value : null));
  const placeholder = {
    type: 'bar' as const,
    stack: 'flow',
    barWidth: `${BAR_WIDTH * 100}%`,
    barMaxWidth: BAR_MAX_WIDTH,
    barGap: '-100%',
    itemStyle: {
      color: 'transparent',
      borderColor: colors.value.axis,
      borderWidth: 1,
      borderType: 'dashed' as const,
      borderRadius: BAR_RADIUS,
    },
  };

  return {
    grid: {
      left: 0,
      right: switchoverIndex !== -1 && switchoverIndex === categories.length - 1 ? SWITCHOVER_LABEL_ROOM : 0,
      top: 28,
      bottom: 0,
      outerBoundsMode: 'same',
      outerBoundsContain: 'axisLabel',
    },
    xAxis: [
      {
        type: 'category',
        data: categories,
        axisLabel: {
          interval: 0,
          formatter: monthLabel,
          color: (_value?: string | number, index?: number) =>
            index === panelIndex ? colors.value.text : colors.value.axis,
          rich: { note: { fontSize: 11, color: colors.value.axis } },
        },
      },
      // Скрытая числовая ось под метку «Новый бот»: на категориальной оси метка встаёт только
      // в центр месяца. Полоса месяца `i` здесь — от `i − 0,5` до `i + 0,5`, как у категорий.
      { type: 'value', show: false, min: -0.5, max: categories.length - 0.5 },
    ],
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
        barMaxWidth: BAR_MAX_WIDTH,
        barGap: '-100%',
        data: onlyClosed((month) => month.newDrivers, colors.value.newDrivers),
        itemStyle: { color: colors.value.newDrivers, borderRadius: BAR_RADIUS },
      },
      {
        type: 'bar',
        name: 'вернулись',
        stack: 'flow',
        barWidth: `${BAR_WIDTH * 100}%`,
        barMaxWidth: BAR_MAX_WIDTH,
        barGap: '-100%',
        data: categories.map((_month, index) => {
          const month = closed[index];

          if (!month) return null;

          const itemStyle = month.incomplete ? faded(colors.value.returned) : undefined;

          if (index !== panelIndex) return { value: month.returned, itemStyle };

          return {
            value: month.returned,
            itemStyle,
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
        barMaxWidth: BAR_MAX_WIDTH,
        barGap: '-100%',
        data: onlyClosed((month) => -month.left, colors.value.left),
        itemStyle: { color: colors.value.left, borderRadius: BAR_RADIUS },
      },
      { ...placeholder, name: 'идёт', data: onlyOngoing(ongoingHeight) },
      { ...placeholder, name: 'идёт вниз', data: onlyOngoing(-ongoingHeight) },
      {
        type: 'bar',
        name: 'неполный, низ',
        stack: 'incomplete',
        stackStrategy: 'all',
        silent: true,
        barWidth: `${BAR_WIDTH * 100}%`,
        barMaxWidth: BAR_MAX_WIDTH,
        barGap: '-100%',
        data: onlyIncomplete((month) => -month.left),
        itemStyle: { color: 'transparent' },
      },
      {
        type: 'bar',
        name: 'неполный',
        stack: 'incomplete',
        stackStrategy: 'all',
        silent: true,
        barWidth: `${BAR_WIDTH * 100}%`,
        barMaxWidth: BAR_MAX_WIDTH,
        barGap: '-100%',
        data: onlyIncomplete((month) => month.left + month.newDrivers + month.returned),
        itemStyle: {
          color: 'transparent',
          borderColor: colors.value.grey,
          borderWidth: 1,
          borderType: [4, 4],
          borderRadius: BAR_RADIUS,
        },
      },
      {
        type: 'bar',
        name: 'Новый бот',
        xAxisIndex: 1,
        silent: true,
        data: [],
        markLine:
          switchoverIndex === -1
            ? undefined
            : {
                silent: true,
                symbol: 'none',
                lineStyle: { color: colors.value.switchover, width: 1.5, type: 'solid' },
                label: {
                  formatter: switchoverLabel,
                  position: 'end',
                  align: 'left',
                  // У `end` ECharts сдвигает подпись вдоль линии: у вертикальной горизонтальная
                  // часть `distance` умножается на ноль. Зазор до линии — отступ слева: он считается
                  // от середины линии, и от её края до текста остаётся ~7 px. По вертикали —
                  // на 14 px ниже верхнего конца линии.
                  distance: [0, -14],
                  padding: [0, 0, 0, 8],
                  color: colors.value.title,
                  fontSize: 12,
                  fontWeight: 600,
                },
                data: [{ xAxis: switchoverIndex + BAR_WIDTH / 2 + SWITCHOVER_GAP }],
              },
      },
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
        <VChart v-if="mounted" :option="option" :theme="theme" autoresize @click="openMonth" />
      </div>
    </div>
  </MoleculesWebTile>
</template>
