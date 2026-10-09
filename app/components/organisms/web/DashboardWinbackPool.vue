<script setup lang="ts">
import { computed } from 'vue';
import { DASH, formatNumber } from '~/utils/format';
import { collectedText } from '~/utils/leaders';
import type { LoadState } from '~/types/loadState';
import type { MetricValues } from '#shared/metrics';
import type { DashboardWinbackBand, DashboardWinbackBandKey, DashboardWinbackPool } from '#shared/types/dashboard';

/**
 * Плитка «Можно вернуть» вкладки «Глубина» (issue #446) — экрана
 * `_reference/design/web/dashboard/03-depth.html`, 8 × 3, `.pool`.
 *
 * Слева — сколько водителей ушли за последний год и сколько из них ездили много, внизу — вывод,
 * что чем дольше водитель не ездит, тем реже возвращается сам. Справа — полосы давности
 * последней поездки на `MoleculesWebPriceRow`: длина — ушедшие от наибольшей из трёх полос года,
 * светлая часть — ездившие много; «Больше года» — серой строкой без полосы (docs/decisions.md →
 * «Пул возврата на дашборде»). Числа и доли считает сервер, здесь только подписи.
 *
 * В шапке — «Выгрузить для обзвона»: ушедшие 1–12 месяцев назад с телефонами, как «Выгрузить
 * в Excel» у «Вне программы». Цифр нет — кнопки нет, вместо чисел прочерки и строка покрытия.
 *
 * Данные — свойством: сама плитка в сеть не ходит (docs/frontend.md).
 */
const props = defineProps<{
  state: LoadState;
  /** Месяц `YYYY-MM` — за него скачивается выгрузка. */
  month: string | null;
  winback: DashboardWinbackPool | null;
}>();

const NO_BREAK_SPACE = ' ';

const BAND_LABELS: Record<DashboardWinbackBandKey, string> = {
  months1to3: 'Не ездит 1–3 месяца',
  months3to6: '3–6 месяцев',
  months6to12: '6–12 месяцев',
  overYear: 'Больше года',
};

const ready = computed(() => (props.state === 'ready' ? props.winback : null));

const counted = computed(() => ready.value !== null && ready.value.leftYear !== null);

const downloadUrl = computed(() =>
  props.month ? `/api/dashboard/winback/export?${new URLSearchParams({ month: props.month }).toString()}` : null,
);

const metricValues = computed((): MetricValues | undefined =>
  ready.value
    ? {
        winbackOverYearRides:
          ready.value.overYearMedianRides === null ? DASH : formatNumber(ready.value.overYearMedianRides),
      }
    : undefined,
);

/** Доля как пришла с сервера — целым или до десятой: «11», «0,7». */
const percentNumber = (value: number): string => value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

const count = (value: number | null): string => (value === null ? DASH : formatNumber(value));

const bandOf = (key: DashboardWinbackBandKey): DashboardWinbackBand | undefined =>
  ready.value?.bands.find((band) => band.key === key);

const yearBands = computed(() =>
  (['months1to3', 'months3to6', 'months6to12'] as const).map((key) => bandOf(key)).filter((band) => band !== undefined),
);

const overYear = computed(() => bandOf('overYear'));

/** Шкала полос — наибольшая из трёх полос года. */
const scale = computed(() => Math.max(0, ...yearBands.value.map((band) => band.people ?? 0)));

const shareOf = (band: DashboardWinbackBand): number | null =>
  band.people === null || scale.value === 0 ? null : (band.people / scale.value) * 100;

const partOf = (band: DashboardWinbackBand): { share: number; tone: 'leader' } | undefined =>
  band.people === null || band.many === null || band.people === 0
    ? undefined
    : { share: (band.many / band.people) * 100, tone: 'leader' };

const hintOf = (band: DashboardWinbackBand): string | undefined => {
  if (band.many === null) return undefined;

  const selfReturn =
    band.selfReturnPercent === null
      ? 'сами возвращаются —'
      : `сами возвращаются ${percentNumber(band.selfReturnPercent)}${NO_BREAK_SPACE}% за месяц`;

  return `ездили много — ${formatNumber(band.many)} · ${selfReturn}`;
};

/**
 * Вывод внизу слева — только когда доли идут вниз по давности: 1–3 месяца больше 3–6, а 3–6
 * не меньше 6–12. Две доли 3–12 месяцев равны — одно число.
 */
const conclusion = computed(() => {
  const [first, second, third] = yearBands.value.map((band) => band.selfReturnPercent);

  if (first == null || second == null || third == null || !(first > second && second >= third)) return null;

  const range =
    second === third ? percentNumber(second) : `${percentNumber(third)}–${percentNumber(second)}`;

  return `Чем дольше водитель не ездит, тем реже возвращается сам: из не ездящих 1–3 месяца за месяц снова выходят ${percentNumber(first)}${NO_BREAK_SPACE}%, из не ездящих 3–12 месяцев — ${range}${NO_BREAK_SPACE}%.`;
});

/** Цифр нет — почему: пересчёта денег не было или собраны не все сутки поездок. */
const notCountedText = computed(() => {
  const value = ready.value;

  if (!value || counted.value) return null;

  if (value.computedAt === null) return 'Ещё не посчитано: make metrics-recompute';

  return `Не считаем: ${collectedText(value.coverage)} — ездившего в несобранные дни посчитали бы ушедшим.`;
});
</script>

<template>
  <MoleculesWebTile
    :cols="8"
    :rows="3"
    title="Можно вернуть"
    :metric="ready ? 'winbackPool' : undefined"
    :metric-values="metricValues"
  >
    <template #aside>
      <AtomsWebActionButton
        v-if="ready && counted && (ready.leftYear ?? 0) > 0 && downloadUrl"
        label="Выгрузить для обзвона"
        :download="downloadUrl"
      />
    </template>
    <div v-if="state === 'loading'" class="mt-[18px]">
      <AtomsWebHint text="Считаем ушедших…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-[18px]">
      <AtomsWebHint text="Ушедшие не загрузились. Это отказ запроса, а не пустой месяц." />
    </div>
    <div
      v-else
      class="mt-3.5 grid flex-1 grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] gap-8 max-[760px]:grid-cols-1 max-[760px]:gap-5"
    >
      <div class="flex flex-col">
        <AtomsWebFigure class="mt-3" size="tile" :value="count(ready.leftYear)" :tone="counted ? 'default' : 'muted'" />
        <div class="mt-2 font-manrope text-[15px] leading-[1.35] font-medium text-web-title">
          водителей ушли за последний год
        </div>
        <div v-if="ready.leftYearMany !== null" class="mt-1.5">
          <AtomsWebHint :text="`${formatNumber(ready.leftYearMany)} из них сделали 100+ поездок`" />
        </div>
        <div v-if="notCountedText || conclusion" class="mt-auto pt-2.5">
          <AtomsWebHint :text="notCountedText ?? conclusion ?? ''" />
        </div>
      </div>
      <div class="flex flex-col gap-2.5">
        <MoleculesWebPriceRow
          v-for="band in yearBands"
          :key="band.key"
          :label="BAND_LABELS[band.key]"
          tone="left"
          :value="count(band.people)"
          :share="shareOf(band)"
          :part="partOf(band)"
          :hint="hintOf(band)"
        />
        <MoleculesWebPriceRow
          v-if="overYear"
          :label="BAND_LABELS.overYear"
          tone="left"
          muted
          :value="count(overYear.people)"
          :share="null"
          :hint="hintOf(overYear)"
        />
      </div>
    </div>
  </MoleculesWebTile>
</template>
