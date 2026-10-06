<script setup lang="ts">
import { computed } from 'vue';
import { DASH, formatNumber, pluralize } from '~/utils/format';
import { collectedText } from '~/utils/leaders';
import { curveFromText, monthsLater, newcomersMetricValues, ongoingNote, percentOf } from '~/utils/newcomers';
import { monthForms, monthYear, shiftMonth } from '#shared/monthNames';
import { noNewcomersText } from '#shared/newcomers';
import type { LoadState } from '~/types/loadState';
import type { DashboardNewcomers } from '#shared/types/dashboard';

/**
 * Плитка «Новички: сколько остаётся» на «Глубине» (issue #407) — `03-depth-newbies.html`, 8 × 3,
 * первой на экране. Слева — главная цифра: доля новичков R − 1, ездивших в R; под ней строка
 * средних по кривой и внизу — по скольким новичкам кривая. Справа — кривая (`OrganismsWebNewcomersCurve`).
 *
 * R — месяц кривой: у закрытого месяца он сам, у идущего — последний закрытый, и тогда под
 * названием сказано, что месяц ещё идёт. Состояния — по листу `03-depth-newbies-states.html`:
 * первый месяц истории, «через месяц» считать не по кому, собраны не все сутки — «—» и причина,
 * кривой нет. Загрузка и отказ ручки — как у плиток «Глубины».
 */
const props = defineProps<{
  state: LoadState;
  /** Выбранный месяц `YYYY-MM`. */
  month: string | null;
  newcomers: DashboardNewcomers | null;
}>();

const ready = computed(() => (props.state === 'ready' && props.month ? props.newcomers : null));

const metricValues = computed(() => (ready.value ? newcomersMetricValues(ready.value.thresholds) : undefined));

const retention = computed(() => (ready.value?.retention?.counted ? ready.value.retention : null));

const cohortMonth = computed(() => (ready.value ? shiftMonth(ready.value.curveMonth, -1) : null));

/** Строка под названием: идущий месяц — чей это последний закрытый; «не считаем» — чьи новички. */
const note = computed(() => {
  const value = ready.value;

  if (!value || !props.month || !cohortMonth.value) return null;

  const ongoing = ongoingNote(value, props.month);

  if (ongoing) return ongoing;

  return value.retention && !value.retention.counted
    ? `Новички ${monthForms(cohortMonth.value).genitive}, в ${monthForms(value.curveMonth).prepositional}`
    : null;
});

/** «—» и причина — у первого месяца истории, у месяца без «через месяц» и у «не считаем». */
const reason = computed(() => {
  const value = ready.value;

  if (!value || !props.month || !cohortMonth.value) return null;

  const firstCohort = value.firstCohortMonth;

  if (value.noNewcomers) {
    return {
      text: `${noNewcomersText(props.month)}, и в нём впервые поехали все. Первые новички — в ${monthYear(firstCohort, 'prepositional')}.`,
      footnote: curveFromText(value),
    };
  }

  if (value.retention === null) {
    return {
      text: `Новичков ${monthYear(cohortMonth.value, 'genitive')} нет — «через месяц» считать не по кому. Первая точка — новички ${monthForms(firstCohort).genitive} в ${monthYear(shiftMonth(firstCohort, 1), 'prepositional')}.`,
      footnote: curveFromText(value),
    };
  }

  if (!value.retention.counted) {
    return {
      text: `Не считаем: ${collectedText(value.retention.coverage)} — новичка, который ездил в несобранные дни, посчитали бы пропавшим.`,
      footnote: `Кривая не строится, пока не собраны все сутки с ${monthYear(shiftMonth(firstCohort, -1), 'genitive')} по ${monthForms(value.curveMonth).nominative}`,
    };
  }

  return null;
});

const points = computed(() =>
  (retention.value?.curve ?? []).map((point) => ({
    offset: point.offset,
    percent: percentOf(point.riding, point.newcomers) ?? 0,
  })),
);

const percentAt = (offset: number): number | null => points.value.find((point) => point.offset === offset)?.percent ?? null;

/** «в среднем через месяц ездят 56 %, через 3 месяца — 31 %»; нет «+3» — без второй половины. */
const averages = computed(() => {
  const first = percentAt(1);
  const third = percentAt(3);

  if (first === null) return null;

  return `в среднем через месяц ездят ${first}\u00A0%${third === null ? '' : `, через 3 месяца — ${third}\u00A0%`}`;
});

/** «Кривая — по 1 276 новичкам с ноября 2025; у последних точек новичков меньше: через 6 месяцев — 817». */
const curveFootnote = computed(() => {
  const value = retention.value;
  const first = value?.curve[0];
  const last = value?.curve.at(-1);

  if (!value || !first || !last) return null;

  const base = `Кривая — по ${formatNumber(first.newcomers)} ${pluralize(first.newcomers, 'новичку', 'новичкам', 'новичкам')} с ${monthYear(value.curveFromMonth, 'genitive')}`;

  return last.offset === 1
    ? base
    : `${base}; у последних точек новичков меньше: ${monthsLater(last.offset)} — ${formatNumber(last.newcomers)}`;
});

const headline = computed(() => {
  const value = retention.value;

  return value ? percentOf(value.riding, value.newcomers) : null;
});
</script>

<template>
  <MoleculesWebTile
    :cols="8"
    :rows="3"
    title="Новички: сколько остаётся"
    :metric="ready ? 'newcomersRetention' : undefined"
    :metric-values="metricValues"
  >
    <div v-if="state === 'loading'" class="mt-[18px]">
      <AtomsWebHint text="Считаем новичков…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-[18px]">
      <AtomsWebHint text="Новички не загрузились. Это отказ запроса, а не пустой месяц." />
    </div>
    <template v-else>
      <div v-if="note" class="mt-0.5">
        <AtomsWebHint :text="note" />
      </div>
      <div class="grid min-h-0 flex-1 grid-cols-[1fr_2.2fr] gap-7 max-web:grid-cols-1 max-web:gap-3">
        <div class="flex flex-col">
          <template v-if="reason">
            <AtomsWebFigure class="mt-[18px]" size="hero" tone="muted" :value="DASH" />
            <p class="mt-2.5 mb-0 font-manrope text-[14px] leading-[1.45] text-web-title">{{ reason.text }}</p>
            <div class="mt-auto pt-2.5"><AtomsWebHint :text="reason.footnote" /></div>
          </template>
          <template v-else-if="retention">
            <AtomsWebFigure class="mt-[18px]" size="hero" :value="headline === null ? DASH : `${headline}\u00A0%`" />
            <p class="mt-2.5 mb-0 font-manrope text-[15px] leading-[1.35] font-medium text-web-title">
              новичков {{ monthForms(cohortMonth ?? ready.curveMonth).genitive }} ездят в {{ monthForms(ready.curveMonth).prepositional }}
            </p>
            <div v-if="averages" class="mt-3"><AtomsWebHint :text="averages" /></div>
            <div v-if="curveFootnote" class="mt-auto pt-2.5"><AtomsWebHint :text="curveFootnote" /></div>
          </template>
        </div>
        <div class="flex min-w-0 flex-col">
          <OrganismsWebNewcomersCurve v-if="retention && points.length > 0" :points="points" />
        </div>
      </div>
    </template>
  </MoleculesWebTile>
</template>
