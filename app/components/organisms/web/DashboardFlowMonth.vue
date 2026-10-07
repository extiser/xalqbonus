<script setup lang="ts">
import { computed } from 'vue';
import { DASH, formatDayKey, formatNumber, formatSignedNumber } from '~/utils/format';
import { formatMonthTitle, monthForms, shiftMonth } from '#shared/monthNames';
import type { LoadState } from '~/types/loadState';
import type { DashboardLevers } from '#shared/types/dashboard';

/**
 * Панель месяца рядом с графиком потока (issue #392) — плитка «Сентябрь»
 * в `_reference/design/web/dashboard/02-levers.html`: тот же поток числами.
 * Новые + вернулись − ушли = изменение на линии, оно сходится с «Водителями на линии»
 * множителей.
 *
 * Месяц панели — выбранный, если он закрыт, иначе последний закрытый (`flow.panel`). Под
 * названием — серой строкой, почему цифры такие: идущий месяц посчитается позже; у первого месяца
 * истории потока нет вовсе — тогда у трёх строк прочерк, а «На линии» — его водители без знака
 * (`02-levers-first-month.html`).
 *
 * Под строками — вывод словами о месяце панели, его собирает сервер (issue #398,
 * `server/services/metrics/conclusions.ts`). Собраны не все сутки у месяца или у прошлого —
 * вывода нет, вместо него строка покрытия, как у множителей.
 */
const props = defineProps<{
  state: LoadState;
  levers: DashboardLevers | null;
}>();

const ready = computed(() => (props.state === 'ready' ? props.levers : null));

const panel = computed(() => ready.value?.flow.panel ?? null);

/** «Октябрь» — месяц с заглавной, без года. */
const capitalized = (month: string): string => {
  const { nominative } = monthForms(month);

  return `${nominative.charAt(0).toUpperCase()}${nominative.slice(1)}`;
};

/** «Сентябрь» в текущем году по Ташкенту, «Декабрь 2025» — в другом. */
const title = computed(() => {
  const levers = ready.value;

  if (!levers) return 'Поток за месяц';

  const month = panel.value?.month ?? levers.month;

  return month.slice(0, 4) === formatDayKey(new Date()).slice(0, 4) ? capitalized(month) : formatMonthTitle(month);
});

/** Последнее число месяца `YYYY-MM`: день ноль следующего месяца. */
const lastDay = (month: string): number => {
  const [year, monthNumber] = month.split('-').map(Number);

  return new Date(Date.UTC(year ?? 0, monthNumber ?? 0, 0)).getUTCDate();
};

const note = computed(() => {
  const levers = ready.value;

  if (!levers) return null;

  const { month, range, flow } = levers;

  if (flow.selectedOngoing) {
    return `${capitalized(month)} идёт — поток посчитается после ${lastDay(month)} ${monthForms(month).genitive}`;
  }

  if (month === range.firstMonth) {
    const next = shiftMonth(month, 1);

    return `За прошлый период данных нет — поток посчитается с ${monthForms(next).genitive} ${next.slice(0, 4)}`;
  }

  return null;
});

const signed = (value: number): string => (value === 0 ? '0' : formatSignedNumber(value));

const tone = (value: number): 'up' | 'down' => (value < 0 ? 'down' : 'up');

const rows = computed(() => {
  const month = panel.value;

  return [
    {
      key: 'new',
      label: 'Новые',
      metric: 'flowNew',
      hint: 'впервые ездят у нас',
      value: month ? signed(month.newDrivers) : null,
      tone: 'up',
    },
    {
      key: 'returned',
      label: 'Вернулись',
      metric: 'flowReturned',
      hint: 'в прошлом месяце не ездили, раньше ездили',
      value: month ? signed(month.returned) : null,
      tone: 'up',
    },
    {
      key: 'left',
      label: 'Ушли',
      metric: 'flowLeft',
      hint: 'ездили в прошлом месяце, в этом нет',
      value: month ? signed(-month.left) : null,
      tone: 'down',
    },
  ] as const;
});

/** Итог: изменение со знаком, у первого месяца истории — его водители без знака. */
const total = computed(() => {
  const month = panel.value;

  if (month) return { value: signed(month.onLineChange), tone: tone(month.onLineChange), muted: false };

  const onLine = ready.value?.flow.firstMonthOnLine ?? null;

  return onLine === null
    ? { value: DASH, tone: undefined, muted: true }
    : { value: formatNumber(onLine), tone: undefined, muted: false };
});

const coverageText = computed(() => {
  const month = panel.value;

  if (!month?.incomplete) return null;

  const parts = month.coverage.map(
    (period) => `${monthForms(period.from).nominative} — ${period.coveredDays} из ${period.days}`,
  );

  return `Собраны не все сутки: ${parts.join(', ')}. Цифры занижены`;
});
</script>

<template>
  <MoleculesWebTile :cols="4" :rows="3" :title="title">
    <div v-if="state === 'loading'" class="mt-[18px]">
      <AtomsWebHint text="Считаем поток…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-[18px]">
      <AtomsWebHint text="Поток не загрузился. Это отказ запроса, а не пустой месяц." />
    </div>
    <template v-else>
      <div v-if="note" class="mt-0.5 mb-3.5">
        <AtomsWebHint :text="note" />
      </div>
      <div class="flex flex-col gap-3" :class="note ? '' : 'mt-[18px]'">
        <MoleculesWebBreakdownRow
          v-for="row in rows"
          :key="row.key"
          :label="row.label"
          :metric="row.metric"
          :hint="row.hint"
          :value="row.value ?? DASH"
          :tone="row.value === null ? undefined : row.tone"
          :unsigned="row.value === null ? 'muted' : 'bright'"
        />
        <MoleculesWebBreakdownRow
          label="На линии"
          metric="flowOnLine"
          variant="total"
          :value="total.value"
          :tone="total.tone"
          :unsigned="total.muted ? 'muted' : 'bright'"
        />
      </div>
      <div v-if="ready.flow.conclusion || coverageText" class="mt-auto flex flex-col gap-0.5 pt-2.5">
        <AtomsWebHint v-if="ready.flow.conclusion" :text="ready.flow.conclusion" />
        <AtomsWebHint v-if="coverageText" :text="coverageText" />
      </div>
    </template>
  </MoleculesWebTile>
</template>
