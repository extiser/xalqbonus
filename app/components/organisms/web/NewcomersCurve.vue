<script setup lang="ts">
import { computed } from 'vue';

/**
 * Кривая «Новички: сколько остаётся» (issue #407) — `.nb-chart` эталона
 * `_reference/design/web/dashboard/03-depth-newbies.html`: сколько из 100 новичков ездят через
 * «+k» месяцев после прихода. Линия одна, сплошная, циан; «пришёл» — 100 %.
 *
 * Ось 0–100 % с сеткой через 25, подписи снизу «пришёл», «+1» … до последней точки, что есть.
 * На «+1» и «+3» — точка, пунктирная вертикаль и процент над точкой справа: о них говорит строка
 * средних слева.
 *
 * Рисунок — SVG без библиотеки, как в эталоне: растягивается по полю (`preserveAspectRatio="none"`,
 * толщина линий от растяжения не зависит), подписи и точки — разметкой поверх, чтобы буквы
 * не плющились. Поля под подписи — как в эталоне: слева 56, справа 20, сверху 8, снизу 22.
 */
const props = defineProps<{
  /** Точки «+1» … по порядку, процентом до целого. */
  points: readonly { offset: number; percent: number }[];
}>();

const WIDTH = 644;
const HEIGHT = 190;
const GRID = [0, 25, 50, 75, 100] as const;
/** Точки с вертикалью и подписью — о них строка средних. */
const MARKED_OFFSETS = [1, 3] as const;

const PLOT_LEFT = 56;
const PLOT_RIGHT = 20;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 22;

const lastOffset = computed(() => props.points.at(-1)?.offset ?? 0);

/** Доля ширины поля у точки «+k»; «пришёл» — ноль. */
const shareOf = (offset: number): number => (lastOffset.value === 0 ? 0 : offset / lastOffset.value);

const yOf = (percent: number): number => HEIGHT * (1 - percent / 100);

const line = computed(() =>
  [{ offset: 0, percent: 100 }, ...props.points]
    .map((point) => `${(shareOf(point.offset) * WIDTH).toFixed(1)},${yOf(point.percent).toFixed(1)}`)
    .join(' '),
);

const marked = computed(() => props.points.filter((point) => (MARKED_OFFSETS as readonly number[]).includes(point.offset)));

const xLabels = computed(() =>
  Array.from({ length: lastOffset.value + 1 }, (_, offset) => ({
    offset,
    label: offset === 0 ? 'пришёл' : `+${offset}`,
  })),
);

/** Позиция по горизонтали поверх поля: `calc` от ширины, как в эталоне. */
const leftOf = (offset: number, shift = 0): string =>
  `calc(${PLOT_LEFT}px + ${shareOf(offset)} * (100% - ${PLOT_LEFT + PLOT_RIGHT}px) + ${shift}px)`;

const topOf = (percent: number, shift = 0): string =>
  `calc(${PLOT_TOP}px + ${1 - percent / 100} * (100% - ${PLOT_TOP + PLOT_BOTTOM}px) + ${shift}px)`;

const ariaLabel = computed(
  () => `Из 100 новичков через N месяцев после прихода ездят: ${props.points.map((point) => point.percent).join(', ')}`,
);

const AXIS_LABEL = 'absolute font-manrope text-[12px] font-medium whitespace-nowrap text-web-axis';
</script>

<template>
  <div class="relative min-h-0 flex-1 max-web:min-h-[220px]" role="img" :aria-label="ariaLabel">
    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      preserveAspectRatio="none"
      class="absolute overflow-visible"
      :style="{
        left: `${PLOT_LEFT}px`,
        top: `${PLOT_TOP}px`,
        width: `calc(100% - ${PLOT_LEFT + PLOT_RIGHT}px)`,
        height: `calc(100% - ${PLOT_TOP + PLOT_BOTTOM}px)`,
      }"
      aria-hidden="true"
    >
      <line
        v-for="percent in GRID"
        :key="percent"
        x1="0"
        :x2="WIDTH"
        :y1="yOf(percent)"
        :y2="yOf(percent)"
        :class="percent === 0 ? 'stroke-web-axis' : 'stroke-web-line'"
        vector-effect="non-scaling-stroke"
      />
      <line
        v-for="point in marked"
        :key="`mark-${point.offset}`"
        :x1="shareOf(point.offset) * WIDTH"
        :x2="shareOf(point.offset) * WIDTH"
        y1="0"
        :y2="HEIGHT"
        class="stroke-web-cyan/25"
        stroke-dasharray="3 4"
        vector-effect="non-scaling-stroke"
      />
      <polyline :points="line" fill="none" class="stroke-web-cyan" stroke-width="2" vector-effect="non-scaling-stroke" />
    </svg>

    <span
      v-for="percent in GRID"
      :key="`y-${percent}`"
      :class="AXIS_LABEL"
      class="left-0 w-[46px] -translate-y-1/2 text-right"
      :style="{ top: topOf(percent) }"
      aria-hidden="true"
    >{{ percent }}&nbsp;%</span>
    <span
      v-for="label in xLabels"
      :key="`x-${label.offset}`"
      :class="AXIS_LABEL"
      class="bottom-0 -translate-x-1/2 leading-[14px]"
      :style="{ left: leftOf(label.offset) }"
      aria-hidden="true"
    >{{ label.label }}</span>

    <template v-for="point in marked" :key="`dot-${point.offset}`">
      <i
        class="absolute size-2.5 -translate-1/2 rounded-full bg-web-cyan"
        :style="{ left: leftOf(point.offset), top: topOf(point.percent) }"
        aria-hidden="true"
      />
      <span
        class="absolute -translate-y-1/2 font-manrope text-[12px] font-bold whitespace-nowrap text-web-title"
        :style="{ left: leftOf(point.offset, 8), top: topOf(point.percent, -10) }"
        aria-hidden="true"
      >{{ point.percent }}&nbsp;%</span>
    </template>
  </div>
</template>
