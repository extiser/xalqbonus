<script setup lang="ts">
import { computed } from 'vue';
import { DASH, formatNumber } from '~/utils/format';
import { collectedText } from '~/utils/leaders';
import { newcomersMetricValues, percentOf } from '~/utils/newcomers';
import { dayWord, monthForms, monthYear, shiftMonth } from '#shared/monthNames';
import { noNewcomersText } from '#shared/newcomers';
import type { LoadState } from '~/types/loadState';
import type { DashboardNewcomers } from '#shared/types/dashboard';

/**
 * Плитка «Первые 14 дней новичков» на «Глубине» (issue #407) — `03-depth-newbies.html`, 4 × 3,
 * справа от «Сколько остаётся». Крупная цифра — доля новичков месяца с 20+ поездками за свои
 * 14 дней среди тех, у кого 14 дней прошли; под ней — то же за прошлый месяц на тот же день.
 * Внизу — полоса из трёх частей: 20+ бирюзой, меньше 20 золотом, ещё идут штриховкой (`.bar14`),
 * легенда с числами и сколько всего новичков на опорный день.
 *
 * Состояния — по листу `03-depth-newbies-states.html`: ни одно окно не прошло — «—», первые итоги
 * и полоса целиком в штриховке; первый месяц истории, новичков нет, собраны не все сутки — «—»
 * и причина, полосы нет. Окно и порог — из ответа ручки: это константы сервера.
 */
const props = defineProps<{
  state: LoadState;
  /** Выбранный месяц `YYYY-MM`. */
  month: string | null;
  newcomers: DashboardNewcomers | null;
}>();

const ready = computed(() => (props.state === 'ready' && props.month ? props.newcomers : null));

const metricValues = computed(() => (ready.value ? newcomersMetricValues(ready.value.thresholds) : undefined));

const title = computed(() =>
  ready.value ? `Первые ${ready.value.thresholds.firstDays} дней новичков` : 'Первые дни новичков',
);

const firstDays = computed(() => (ready.value?.firstDays?.counted ? ready.value.firstDays : null));

const monthGenitive = computed(() => (props.month ? monthForms(props.month).genitive : ''));

/** «—» и причина вместо цифры; полоса остаётся только у «первых итогов». */
const reason = computed(() => {
  const value = ready.value;

  if (!value || !props.month) return null;

  if (value.noNewcomers || !value.firstDays) {
    return {
      text: `${noNewcomersText(props.month)}. Первые новички — в ${monthYear(value.firstCohortMonth, 'prepositional')}.`,
      footnote: `Новичков ${monthYear(props.month, 'genitive')} — нет`,
    };
  }

  if (!value.firstDays.counted) {
    return {
      text: `Не считаем: ${collectedText(value.firstDays.coverage)} — у новичка сдвинулась бы первая поездка, а поездки за ${value.thresholds.firstDays} дней недосчитались.`,
      footnote: `Новичков ${monthGenitive.value} — не считаем`,
    };
  }

  if (value.firstDays.newcomers === 0) {
    return { text: `Новичков в ${monthForms(props.month).prepositional} нет.`, footnote: null };
  }

  if (value.firstDays.firstResultsDay !== null) {
    return {
      text: `У новичков ${monthGenitive.value} ${value.thresholds.firstDays} дней ещё не прошли — первые итоги ${dayWord(value.firstDays.firstResultsDay)}.`,
      footnote: null,
    };
  }

  return null;
});

const headline = computed(() => {
  const value = firstDays.value;

  return value ? percentOf(value.reached, value.reached + value.below) : null;
});

/** «в сентябре — 66 %»; у M − 1 раньше первого набора — «в октябре 2025 новичков нет». */
const comparison = computed(() => {
  const value = firstDays.value;

  if (!value || !props.month) return null;

  const previousMonth = shiftMonth(props.month, -1);

  if (value.previous === null) return `в ${monthYear(previousMonth, 'prepositional')} новичков нет`;

  const percent = percentOf(value.previous.reached, value.previous.passed);

  return percent === null
    ? `в ${monthForms(previousMonth).prepositional} новичков нет`
    : `в ${monthForms(previousMonth).prepositional} — ${percent}\u00A0%`;
});

const bar = computed(() => {
  const value = firstDays.value;
  const thresholds = ready.value?.thresholds;

  if (!value || !thresholds || value.newcomers === 0) return null;

  return [
    { key: 'reached', count: value.reached, label: `${thresholds.tripsTarget} поездок и больше`, swatch: 'bg-web-cyan' },
    { key: 'below', count: value.below, label: `меньше ${thresholds.tripsTarget}`, swatch: 'bg-web-gold' },
    { key: 'running', count: value.running, label: `${thresholds.firstDays} дней ещё идут`, swatch: 'bg-web-cyan/25' },
  ] as const;
});

const barLabel = computed(() => bar.value?.map((part) => `${part.label} — ${part.count}`).join(', ') ?? '');

const footnote = computed(() => {
  const value = ready.value;

  return value && firstDays.value
    ? `Новичков ${monthGenitive.value} — ${formatNumber(firstDays.value.newcomers)} · на ${dayWord(value.asOfDay)}`
    : null;
});

/** Штриховка «ещё идут» — `.bar14 .run` эталона. */
const RUNNING_FILL = 'repeating-linear-gradient(135deg, var(--color-web-raised) 0 5px, rgba(156, 238, 255, 0.1) 5px 9px)';
</script>

<template>
  <MoleculesWebTile :cols="4" :rows="3" :title="title" :metric="ready ? 'newcomersFirstDays' : undefined" :metric-values="metricValues">
    <div v-if="state === 'loading'" class="mt-3">
      <AtomsWebHint text="Считаем новичков…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-3">
      <AtomsWebHint text="Новички не загрузились. Это отказ запроса, а не пустой месяц." />
    </div>
    <template v-else>
      <template v-if="reason">
        <AtomsWebFigure class="mt-3" size="tile" tone="muted" :value="DASH" />
        <p class="mt-2 mb-0 font-manrope text-[14px] leading-[1.45] text-web-title">{{ reason.text }}</p>
      </template>
      <template v-else-if="firstDays && month">
        <AtomsWebFigure class="mt-3" size="tile" :value="headline === null ? DASH : `${headline}\u00A0%`" />
        <p class="mt-2 mb-0 font-manrope text-[15px] leading-[1.35] font-medium text-web-title">
          новичков {{ monthGenitive }} сделали {{ ready.thresholds.tripsTarget }}+ поездок за {{ ready.thresholds.firstDays }} дней
        </p>
      </template>
      <div v-if="comparison && firstDays" class="mt-1.5"><AtomsWebHint :text="comparison" /></div>

      <template v-if="bar && firstDays">
        <div class="mt-auto flex h-3 gap-[3px] max-web:mt-4" role="img" :aria-label="barLabel">
          <i
            v-for="part in bar.filter((segment) => segment.count > 0)"
            :key="part.key"
            class="block h-full basis-0 rounded"
            :class="part.key === 'reached' ? 'bg-web-cyan' : part.key === 'below' ? 'bg-web-gold' : ''"
            :style="{ flexGrow: part.count, background: part.key === 'running' ? RUNNING_FILL : undefined }"
          />
        </div>
        <div class="mt-3 flex flex-col gap-1.5 font-manrope text-[14px] font-medium text-web-title">
          <span v-for="part in bar" :key="part.key">
            <i class="mr-[7px] inline-block size-2.5 rounded-[3px]" :class="part.swatch" aria-hidden="true" />{{ part.label }} —
            <b class="font-bold text-web-text">{{ formatNumber(part.count) }}</b>
          </span>
        </div>
        <div v-if="footnote" class="mt-2.5"><AtomsWebHint :text="footnote" /></div>
      </template>
      <div v-else class="mt-auto pt-2.5">
        <AtomsWebHint :text="reason?.footnote ?? footnote ?? ''" />
      </div>
    </template>
  </MoleculesWebTile>
</template>
