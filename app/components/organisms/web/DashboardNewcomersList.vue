<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { DASH, formatNumber } from '~/utils/format';
import { formatShortDay, incompleteMonthsText } from '~/utils/leaders';
import { listTitle, newcomersMetricValues } from '~/utils/newcomers';
import { monthForms } from '#shared/monthNames';
import { listFromDayText, noNewcomersInMonthText, noNewcomersListText } from '#shared/newcomers';
import type { LoadState } from '~/types/loadState';
import type { DashboardNewcomerRow, DashboardNewcomers } from '#shared/types/dashboard';

/**
 * Список «Новички {месяца}: меньше 20 поездок за 14 дней — поимённо» (issue #407) — последней
 * плиткой «Глубины», `03-depth-newbies.html`: 12 колонок, растёт по числу строк (`grow`). Новички
 * месяца, у кого 14 дней прошли, а поездок меньше порога; порядок — сервера. Строка открывает
 * карточку водителя; ФИО — ссылка туда же, для клавиатуры. Ярлыков о человеке нет — только цифры.
 *
 * Таблица — `table-layout: fixed` с ширинами колонок эталона, не уже 860: дальше прокрутка вбок
 * внутри плитки. Текст — влево, «Программа» и числа — вправо, даты серым, порог в «N / 20» серым.
 *
 * Справа в шапке — «Выгрузить в Excel» (файл ручки, все строки с телефонами) и «Сделать сегмент · N»,
 * N — строки с «Программа: да». Сегмент из списка — T107: кнопка видна и погашена всегда. Строки
 * вместо таблицы — первый месяц истории, «не считаем», новичков нет, 14 дней ещё ни у кого
 * не прошли, никого — по листу `03-depth-newbies-states.html`; тогда погашены обе.
 */
const props = defineProps<{
  state: LoadState;
  /** Выбранный месяц `YYYY-MM`. */
  month: string | null;
  newcomers: DashboardNewcomers | null;
}>();

const router = useRouter();

const ready = computed(() => (props.state === 'ready' && props.month ? props.newcomers : null));

const metricValues = computed(() => (ready.value ? newcomersMetricValues(ready.value.thresholds) : undefined));

const title = computed(() => listTitle(ready.value, props.month));

const rows = computed(() => (ready.value?.list?.counted ? ready.value.list.rows : null));

const segmentSize = computed(() => rows.value?.filter((row) => row.inProgram).length ?? 0);

const downloadUrl = computed(() =>
  props.month ? `/api/dashboard/newcomers/export?${new URLSearchParams({ month: props.month }).toString()}` : null,
);

/** Строка вместо таблицы; `null` — таблица. */
const note = computed(() => {
  const value = ready.value;
  const month = props.month;

  if (!value || !month) return null;

  if (value.noNewcomers || !value.list || !value.firstDays) {
    return noNewcomersListText(month, value.firstCohortMonth);
  }

  const genitive = monthForms(month).genitive;
  const { firstDays: days, tripsTarget } = value.thresholds;

  if (!value.list.counted || !value.firstDays.counted) {
    const coverage = value.list.counted ? [] : value.list.coverage;

    return `Список не строим, пока не собраны все сутки ${incompleteMonthsText(coverage)}: поездки в несобранные дни выглядят как их отсутствие, и в список попали бы те, кто ездил.`;
  }

  if (value.firstDays.newcomers === 0) return noNewcomersInMonthText(month);

  if (value.firstDays.firstResultsDay !== null) {
    return listFromDayText(value.firstDays.firstResultsDay, month, days);
  }

  if (value.list.rows.length === 0) {
    return `Никого: все новички ${genitive}, у кого ${days} дней прошли, сделали ${tripsTarget} поездок и больше. Тех, у кого ${days} дней ещё идут, список покажет, когда они пройдут.`;
  }

  return null;
});

const driverPath = (row: DashboardNewcomerRow): string => `/drivers/${row.personId}`;

type Column = { label: string; width: string; align: 'left' | 'right' };

const columns = computed((): readonly Column[] => [
  { label: 'Позывной', width: '10%', align: 'left' },
  { label: 'Водитель', width: '30%', align: 'left' },
  { label: 'Программа', width: '12%', align: 'right' },
  { label: 'Первая поездка', width: '16%', align: 'right' },
  { label: `Поездок за ${ready.value?.thresholds.firstDays ?? ''} дней`, width: '16%', align: 'right' },
  { label: 'Последняя поездка', width: '16%', align: 'right' },
]);

const HEAD_CLASSES = 'pb-2.5 font-manrope text-[12px] font-medium whitespace-nowrap text-web-axis';
/** Правый отступ колонки; у последней его нет — вровень с кнопками шапки. */
const gap = (index: number): string => (index === columns.value.length - 1 ? '' : 'pr-3');

/** Клетка колонки `index`: ФИО переносится и отступает дальше, остальное — в строку. */
const cell = (index: number): string =>
  [
    'border-t border-web-line py-3 group-hover:bg-web-cyan/3',
    index === 1 ? 'whitespace-normal pr-4' : `whitespace-nowrap ${gap(index)}`,
    columns.value[index]?.align === 'right' ? 'text-right' : '',
  ].join(' ');

const PILL_CLASSES = 'inline-block rounded-full px-2.5 py-[3px] font-manrope text-[12px] font-semibold';
</script>

<template>
  <MoleculesWebTile
    :cols="12"
    :rows="rows && rows.length > 0 && !note ? 3 : 1"
    grow
    :title="title"
    :metric="ready ? 'newcomersList' : undefined"
    :metric-values="metricValues"
  >
    <template #aside>
      <div class="-mr-[5px] flex shrink-0 items-center gap-2.5">
        <AtomsWebActionButton
          label="Выгрузить в Excel"
          :download="downloadUrl ?? undefined"
          :disabled="!rows || rows.length === 0 || note !== null || !downloadUrl"
        />
        <AtomsWebActionButton :label="`Сделать сегмент · ${segmentSize}`" title="Сегмент из списка — T107" disabled />
        <MoleculesWebMetricInfo metric="newcomersActions" />
      </div>
    </template>

    <div v-if="state === 'loading'" class="mt-3.5">
      <AtomsWebHint text="Считаем новичков…" />
    </div>
    <div v-else-if="state === 'error' || !ready" class="mt-3.5">
      <AtomsWebHint text="Список не загрузился. Это отказ запроса, а не пустой список." />
    </div>
    <div v-else-if="note" class="mt-auto pt-2.5">
      <AtomsWebHint :text="note" />
    </div>
    <div v-else-if="rows" class="-mx-1 mt-3.5 overflow-x-auto px-1">
      <table class="mt-3.5 w-full min-w-[860px] table-fixed border-collapse font-manrope text-[14px] text-web-text">
        <colgroup>
          <col v-for="column in columns" :key="column.label" :style="{ width: column.width }" />
        </colgroup>
        <thead>
          <tr>
            <th
              v-for="(column, index) in columns"
              :key="column.label"
              :class="[HEAD_CLASSES, gap(index), column.align === 'right' ? 'text-right' : 'text-left']"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.personId" class="group cursor-pointer" @click="router.push(driverPath(row))">
            <td :class="cell(0)">
              <template v-if="row.callsign">{{ row.callsign }}</template>
              <span v-else class="text-web-grey">{{ DASH }}</span>
            </td>
            <td :class="cell(1)">
              <NuxtLink
                :to="driverPath(row)"
                class="text-web-text no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
                @click.stop
              >
                {{ row.name ?? DASH }}
              </NuxtLink>
            </td>
            <td :class="cell(2)">
              <span :class="[PILL_CLASSES, row.inProgram ? 'bg-web-green/12 text-web-green' : 'bg-web-scarlet/12 text-web-scarlet']">
                {{ row.inProgram ? 'да' : 'нет' }}
              </span>
            </td>
            <td :class="cell(3)" class="text-web-grey">{{ formatShortDay(row.firstTripDay) }}</td>
            <td :class="cell(4)">
              {{ formatNumber(row.windowTrips) }} <span class="text-web-grey">/ {{ formatNumber(ready.thresholds.tripsTarget) }}</span>
            </td>
            <td :class="cell(5)" class="text-web-grey">{{ formatShortDay(row.lastTripDay) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </MoleculesWebTile>
</template>
