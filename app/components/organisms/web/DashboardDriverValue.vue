<script setup lang="ts">
import { computed } from 'vue';
import { DASH, formatCompactSum, formatTenths, formatWholePercent } from '~/utils/format';
import { ongoingNote } from '~/utils/newcomers';
import { monthYear } from '#shared/monthNames';
import type { LoadState } from '~/types/loadState';
import type { MetricValues } from '#shared/metrics';
import type { DashboardDriverValue } from '#shared/types/dashboard';

/**
 * Плитка «Цена водителя за год» вкладки «Глубина» (issue #442) — экрана
 * `_reference/design/web/dashboard/03-depth.html`, 8 × 3.
 *
 * Три строки на одной шкале — лидер, остальные на линии и новичок: доход парка с водителя
 * за 12 месяцев по нынешним ставкам, полоса — доля от цены лидера. Под строками — во сколько раз
 * лидер дороже остальных и сколько новичков дорастает до лидера (docs/decisions.md → «Цена
 * водителя на дашборде»). Числа считает сервер, здесь только подписи.
 *
 * Идущий месяц показывает последний закрытый — строка под названием, как у «Новички: сколько
 * остаётся». Собраны не все сутки наборов — вместо чисел прочерки и строка покрытия, как у «Денег».
 *
 * Данные — свойством: сама плитка в сеть не ходит (docs/frontend.md).
 */
const props = defineProps<{
  state: LoadState;
  /** Выбранный месяц `YYYY-MM`: у идущего плитка говорит, что показывает прошлый. */
  month: string | null;
  driverValue: DashboardDriverValue | null;
}>();

const ready = computed(() => (props.state === 'ready' ? props.driverValue : null));

/** «с октября 2024 по сентябрь 2025» в подсказке — окно наборов «за год». */
const metricValues = computed((): MetricValues | undefined =>
  ready.value
    ? {
        driverValueFrom: monthYear(ready.value.cohortsFrom, 'genitive'),
        driverValueTo: monthYear(ready.value.cohortsTo, 'nominative'),
      }
    : undefined,
);

const note = computed(() =>
  ready.value && props.month ? ongoingNote(ready.value.ongoing, ready.value.month, props.month) : null,
);

const sum = (value: number | null): string => (value === null ? DASH : formatCompactSum(value));

/** Доля от цены лидера; цены лидера нет — полосы нет. */
const shareOfLeader = (value: number | null): number | null => {
  const leader = ready.value?.leader.value12 ?? null;

  return value === null || leader === null || leader <= 0 ? null : (value / leader) * 100;
};

const groupHint = (riding: number | null, value24: number | null): string | undefined => {
  if (riding === null) return undefined;

  const year = `через год ездят ${formatWholePercent(riding)}`;

  return value24 === null ? year : `${year} · за два года — ${formatCompactSum(value24)}`;
};

const newcomerHint = computed(() => {
  const newcomer = ready.value?.newcomer;

  if (!newcomer || newcomer.median12 === null || newcomer.ridingAfterYearPercent === null) return undefined;

  return `среднее по всем пришедшим · обычный новичок — ${formatCompactSum(newcomer.median12)} · через год ездят ${newcomer.ridingAfterYearPercent} из 100`;
});

const conclusion = computed(() => {
  const value = ready.value;

  if (!value) return null;

  const { leader, others, newcomer } = value;
  const parts: string[] = [];

  if (leader.value12 !== null && others.value12 !== null && others.value12 > 0) {
    parts.push(`Лидер приносит парку в ${formatTenths(leader.value12 / others.value12)} раза больше остальных.`);
  }

  if (newcomer.becameLeaderPercent !== null) {
    parts.push(`Новичков до лидера за год дорастает ${formatWholePercent(newcomer.becameLeaderPercent)}.`);
  }

  return parts.length > 0 ? parts.join(' ') : null;
});

/** «Собраны не все сутки: июль 2025 — 28 из 31. Цену не считаем» — пропуск дал бы ушедшему нули. */
const coverageText = computed(() => {
  const value = ready.value;

  if (!value) return null;

  const incomplete = value.coverage.filter((period) => period.coveredDays < period.days);

  if (incomplete.length === 0) return null;

  const parts = incomplete.map(
    (period) => `${monthYear(period.from.slice(0, 7), 'nominative')} — ${period.coveredDays} из ${period.days}`,
  );

  return `Собраны не все сутки: ${parts.join(', ')}. Цену не считаем`;
});
</script>

<template>
  <MoleculesWebTile
    :cols="8"
    :rows="3"
    title="Цена водителя за год"
    :metric="ready ? 'driverValue' : undefined"
    :metric-values="metricValues"
  >
    <div v-if="state === 'loading'" class="mt-[18px]">
      <AtomsWebHint text="Считаем цену водителя…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-[18px]">
      <AtomsWebHint text="Цена водителя не загрузилась. Это отказ запроса, а не пустой месяц." />
    </div>
    <template v-else>
      <div v-if="note" class="mt-0.5">
        <AtomsWebHint :text="note" />
      </div>
      <div class="mt-[18px] flex flex-col gap-4">
        <MoleculesWebPriceRow
          label="Лидер"
          tone="leader"
          :value="sum(ready.leader.value12)"
          :share="ready.leader.value12 === null ? null : 100"
          :hint="groupHint(ready.leader.ridingAfterYearPercent, ready.leader.value24)"
        />
        <MoleculesWebPriceRow
          label="Остальные на линии"
          tone="others"
          :value="sum(ready.others.value12)"
          :share="shareOfLeader(ready.others.value12)"
          :hint="groupHint(ready.others.ridingAfterYearPercent, ready.others.value24)"
        />
        <MoleculesWebPriceRow
          label="Новичок"
          tone="newcomer"
          :value="sum(ready.newcomer.value12)"
          :share="shareOfLeader(ready.newcomer.value12)"
          :hint="newcomerHint"
        />
      </div>
      <div v-if="coverageText || conclusion" class="mt-auto pt-2.5">
        <AtomsWebHint :text="coverageText ?? conclusion ?? ''" />
      </div>
    </template>
  </MoleculesWebTile>
</template>
