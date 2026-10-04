<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { formatNumber, pluralize } from '~/utils/format';
import { readWebToken, webChartTheme, type WebChartTheme } from '~/utils/webChartTheme';
import type { PromoDay } from '#shared/types/promo';

/**
 * График «Переходы по дням» карточки метки (issue #380) — плитка «Переходы по дням»
 * в `_reference/design/web/promo/03-card.html`, по образцу `PointsWeeklyChart`.
 *
 * Столбик на сутки по Ташкенту — разные люди за сутки. Прошлые дни бирюзовым, сегодняшний —
 * циан с подписью «ДД.ММ — N»: кодекс, текущий период ярче прошлого. Сутки без касаний —
 * нулём, столбика нет, но место за ним остаётся: видно, где носитель молчал. Наведение —
 * день и число людей.
 *
 * Рисуется только в браузере: тема собирается из токенов страницы. Данные — свойством.
 */
const props = defineProps<{
  days: readonly PromoDay[];
}>();

const BAR_MAX_WIDTH = 33;
const BAR_RADIUS = 4;
/** Горизонталей сетки — около трёх, как в макете. */
const VALUE_SPLITS = 2;

const mounted = ref(false);
const theme = shallowRef<WebChartTheme>({});
const colors = shallowRef({ past: '', today: '', text: '' });

onMounted(() => {
  theme.value = webChartTheme();
  colors.value = {
    past: readWebToken('color-web-teal'),
    today: readWebToken('color-web-cyan'),
    text: readWebToken('color-web-text'),
  };
  mounted.value = true;
});

/** `2026-10-06` → «06.10». */
const dayMonth = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

const tooltipText = (index: number): string => {
  const day = props.days[index];

  if (!day) return '';

  return `<b>${dayMonth(day.day)}</b><br>${formatNumber(day.people)} ${pluralize(day.people, 'человек', 'человека', 'человек')}`;
};

const hoveredIndex = (params: unknown): number => {
  const first: unknown = Array.isArray(params) ? params[0] : params;

  return typeof first === 'object' && first !== null && 'dataIndex' in first && typeof first.dataIndex === 'number'
    ? first.dataIndex
    : -1;
};

const option = computed<ECOption>(() => {
  const days = props.days;
  const lastIndex = days.length - 1;

  return {
    grid: { left: 0, right: 0, top: 24, bottom: 0, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'category',
      data: days.map((day) => dayMonth(day.day)),
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitNumber: VALUE_SPLITS,
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => tooltipText(hoveredIndex(params)),
    },
    series: [
      {
        type: 'bar',
        name: 'перешли',
        barMaxWidth: BAR_MAX_WIDTH,
        data: days.map((day, index) =>
          index === lastIndex
            ? {
                value: day.people,
                itemStyle: { color: colors.value.today, borderRadius: BAR_RADIUS },
                label: {
                  show: true,
                  position: 'top',
                  align: 'right',
                  offset: [BAR_MAX_WIDTH / 2, 0],
                  color: colors.value.text,
                  fontWeight: 700,
                  formatter: `${dayMonth(day.day)} — ${formatNumber(day.people)}`,
                },
              }
            : { value: day.people, itemStyle: { color: colors.value.past, borderRadius: BAR_RADIUS } },
        ),
      },
    ],
  };
});

const ariaLabel = computed(() => {
  const last = props.days[props.days.length - 1];

  return last
    ? `Переходы по дням: дней — ${props.days.length}, сегодня — ${formatNumber(last.people)}`
    : 'Переходы по дням: дней нет';
});
</script>

<template>
  <div class="mt-3 min-h-0 flex-1 max-web:h-[200px] max-web:flex-none" role="img" :aria-label="ariaLabel">
    <VChart v-if="mounted" :option="option" :theme="theme" autoresize />
  </div>
</template>
