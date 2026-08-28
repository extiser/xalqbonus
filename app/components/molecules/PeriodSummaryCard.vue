<script setup lang="ts">
import { computed } from 'vue';
import type { SyncPeriodSummary } from '#shared/types/sync';
import { formatDateTime } from '~/utils/format';

/**
 * Свод за один период.
 *
 * Числа здесь — различные сущности из таблиц данных, а не суммы счётчиков прогонов.
 * Подписи говорят, с какого момента есть данные, и их две: журнал прогонов начинается
 * с первого прогона, а поездки приезжают окном опроса — догоняющий прогон приносит их
 * за неделю назад. «За неделю» на суточной истории поездок — та же неправда, что
 * «за сутки» на шестичасовой истории журнала.
 */
const props = defineProps<{
  summary: SyncPeriodSummary;
  /** Первый прогон в журнале. Пусто, если журнал пуст. */
  journalSince: string | null;
  /** Самая ранняя поездка по времени завершения. Пусто, если поездок нет. */
  tripsSince: string | null;
}>();

const PERIOD_TITLES: Record<SyncPeriodSummary['period'], string> = {
  day: 'За сутки',
  week: 'За неделю',
};

/**
 * Подпись одной границы данных.
 *
 * Приглушённой строкой и без выделения цветом: история короче периода — это про возраст
 * стенда, а не про поломку. Красным на этом экране горит одно — застрявшая отметка.
 */
const buildCoverage = (label: string, since: string | null, emptyText: string): string => {
  if (!since) {
    return emptyText;
  }

  return new Date(since) > new Date(props.summary.from)
    ? `${label} только с ${formatDateTime(since)} — период шире, чем история`
    : `${label} с ${formatDateTime(since)}`;
};

const journalCoverage = computed(() =>
  buildCoverage('журнал прогонов', props.journalSince, 'журнал прогонов пуст'),
);

const tripsCoverage = computed(() =>
  buildCoverage('поездки в базе', props.tripsSince, 'поездок в базе нет'),
);
</script>

<template>
  <article class="rounded-lg border border-slate-200 bg-white px-4 py-3">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 class="text-sm font-semibold text-slate-900">{{ PERIOD_TITLES[summary.period] }}</h3>
      <div class="text-xs text-slate-400">
        <p>{{ tripsCoverage }}</p>
        <p>{{ journalCoverage }}</p>
      </div>
    </div>

    <dl class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <MoleculesCounterTile
        label="Поездок"
        :value="summary.trips"
        hint="различных, по времени завершения"
      />
      <MoleculesCounterTile
        label="Из них завершённых"
        :value="summary.tripsCompleted"
        hint="за них и начисляется балл"
      />
      <MoleculesCounterTile
        label="Начислений"
        :value="summary.awards"
        hint="строк журнала с причиной trip"
      />
      <MoleculesCounterTile
        label="Вне программы"
        :value="summary.outsideProgram"
        hint="завершённых поездок водителей не в программе"
      />
      <MoleculesCounterTile
        label="Новое пропущенное"
        :value="summary.skipsFirstSeen"
        hint="впервые увидено в периоде"
      />
      <MoleculesCounterTile
        label="Из них не решено"
        :value="summary.skipsUnresolved"
        hint="потеряно до сих пор"
      />
      <MoleculesCounterTile label="Прогонов" :value="summary.runs" />
      <MoleculesCounterTile
        label="Из них упало"
        :value="summary.runsFailed"
        hint="отметку не двигают, окно перечитается"
      />
    </dl>
  </article>
</template>
