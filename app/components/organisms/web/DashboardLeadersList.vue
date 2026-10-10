<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { DASH, formatNumber, formatSignedNumber, pluralize } from '~/utils/format';
import {
  formatShortDay,
  incompleteMonthsText,
  leadersMetricValues,
  leadersOf,
  listFromText,
  noLeadersText,
} from '~/utils/leaders';
import { monthForms, shiftMonth } from '#shared/monthNames';
import type { LoadState } from '~/types/loadState';
import type { MetricKey } from '#shared/metrics';
import type { DashboardLeaderGroup, DashboardLeaderRow, DashboardLevers } from '#shared/types/dashboard';

/**
 * Список «Ездят меньше обычного, перестали или ушли — поимённо» под плитками лидеров (issue #402) —
 * `02-levers.html`, 12 колонок, растёт по числу строк (`grow`). Три группы подзаголовками с числом,
 * пустая группа не показывается. Строка открывает карточку водителя; ФИО — ссылка туда же,
 * для клавиатуры.
 *
 * Строка вместо таблицы — плитка в два ряда, как в макетах состояний; с таблицей — три и растёт.
 *
 * Первая колонка — номер строки, сплошной через группы: подзаголовок называет число в группе,
 * номер — сколько всего.
 *
 * Таблица — `table-layout: fixed` с заданными ширинами колонок, не уже 860: дальше прокрутка вбок
 * внутри плитки. Текст — влево, числа и «Программа» — вправо; значок подсказки в их шапке — за
 * правым краем подписи (`MoleculesWebColumnLabel`). Отступ от шапки плитки до таблицы — 28, как
 * от края плитки до шапки.
 *
 * Справа в шапке — «Выгрузить в Excel» (файл ручки, все строки с телефонами) и «Сделать сегмент · N»,
 * N — строки с «Программа: да». Списка нет — первый месяц истории, «не считаем» или никого — погашены обе.
 *
 * «Сделать сегмент» (issue #415) нажимается, когда список посчитан, N больше нуля и роль позволяет
 * заводить сегменты; таблица на экране и N = 0 — погашена с подсказкой. Запрос — у страницы (`useDashboardSegment`),
 * здесь — нажатие событием, «Создаём…» на время запроса и отказ строкой под шапкой.
 */
const props = defineProps<{
  state: LoadState;
  levers: DashboardLevers | null;
  /** Роль позволяет заводить сегменты. */
  canCreateSegment: boolean;
  /** Запрос «Сделать сегмент» идёт. */
  segmentCreating: boolean;
  /** Отказ «Сделать сегмент» — строкой под шапкой. */
  segmentError: string | null;
}>();

const emit = defineEmits<{ createSegment: [] }>();

const router = useRouter();

const ready = computed(() => (props.state === 'ready' ? props.levers : null));

const leaders = computed(() => ready.value?.leaders ?? null);

const metricValues = computed(() => (leaders.value ? leadersMetricValues(leaders.value.thresholds) : undefined));

const rows = computed(() => (leaders.value?.list?.counted ? leaders.value.list.rows : null));

const segmentSize = computed(() => rows.value?.filter((row) => row.inProgram).length ?? 0);

const downloadUrl = computed(() =>
  ready.value
    ? `/api/dashboard/leaders/export?${new URLSearchParams({ month: ready.value.month }).toString()}`
    : null,
);

/** Строка вместо таблицы: первый месяц истории, «не считаем» или никого. */
const note = computed(() => {
  const value = leaders.value;

  if (!value || !ready.value) return null;

  if (value.noLeaders || !value.list) {
    return `${noLeadersText(value, ready.value.range.firstMonth)} ${listFromText(value)}`;
  }

  if (!value.list.counted) {
    return `Список не строим, пока не собраны все сутки ${incompleteMonthsText(value.list.coverage)}: недели с пропуском выглядят как недели без поездок, и в «перестали» и «ушли» попали бы те, кто ездил.`;
  }

  if (value.list.rows.length === 0) {
    const emptyMonth = shiftMonth(value.cohortMonth, 1);

    return `Никого: все лидеры ${monthForms(value.leadersMonth).genitive} ездят как обычно, все лидеры ${monthForms(value.cohortMonth).genitive} ездили в ${monthForms(emptyMonth).prepositional}. Список появится, как только кто-то из них сбавит или пропадёт.`;
  }

  return null;
});

const segmentEnabled = computed(
  () => rows.value !== null && segmentSize.value > 0 && props.canCreateSegment && !props.segmentCreating,
);

/**
 * Подсказка погашенной кнопки — только когда таблица на экране, а участников в ней нет. Есть строка
 * вместо таблицы — причину называет она, подсказки нет.
 */
const segmentHint = computed(() =>
  rows.value !== null && note.value === null && segmentSize.value === 0 ? 'В списке нет участников программы' : undefined,
);

const segmentLabel = computed(() => (props.segmentCreating ? 'Создаём…' : `Сделать сегмент · ${segmentSize.value}`));

const GROUP_TITLES: Record<DashboardLeaderGroup, (count: number) => string> = {
  below: (count) => `Ездят меньше обычного · ${formatNumber(count)}`,
  stopped: (count) => `Перестали ездить · ${formatNumber(count)} — сначала те, кто остановился недавно`,
  left: (count) => `Ушли · ${formatNumber(count)} — ни одной поездки за месяц`,
};

const GROUP_ORDER: readonly DashboardLeaderGroup[] = ['below', 'stopped', 'left'];

/**
 * Непустые группы в порядке экрана; строки внутри уже упорядочены сервером. `start` — сколько
 * строк стоит выше группы: от него продолжается сплошной номер.
 */
const groups = computed(() => {
  let start = 0;

  return GROUP_ORDER.map((group) => {
    const members = (rows.value ?? []).filter((row) => row.group === group);
    const entry = { group, title: GROUP_TITLES[group](members.length), rows: members, start };

    start += members.length;

    return entry;
  }).filter((group) => group.rows.length > 0);
});

const footnote = computed(() => {
  const value = leaders.value;

  return value
    ? `${leadersOf(value.leadersMonth)} · последняя полная неделя ${formatShortDay(value.week.from)}–${formatShortDay(value.week.to)}. Нажатие на строку — карточка водителя.`
    : '';
});

const driverPath = (row: DashboardLeaderRow): string => `/drivers/${row.personId}`;

const idleText = (days: number): string => `не ездит ${days} ${pluralize(days, 'день', 'дня', 'дней')}`;

type Column = { label: string; width: string; align: 'left' | 'right'; metric?: MetricKey };

/** Колонка номера строки — перед `COLUMNS`; её ширина взята у «Последней поездки», «Водителя» и «К своей норме». */
const NUMBER_WIDTH = '5%';

const COLUMNS: readonly Column[] = [
  { label: 'Позывной', width: '8%', align: 'left' },
  { label: 'Водитель', width: '25%', align: 'left' },
  { label: 'Программа', width: '9%', align: 'right', metric: 'leadersProgram' },
  { label: 'В неделю / его норма', width: '15%', align: 'right', metric: 'leadersWeekNorm' },
  { label: 'К своей норме', width: '14%', align: 'right', metric: 'leadersToNorm' },
  { label: 'Недель ниже', width: '12%', align: 'right', metric: 'leadersWeeksBelow' },
  { label: 'Последняя поездка', width: '12%', align: 'right' },
];

const HEAD_CLASSES = 'pb-2.5 font-manrope text-[12px] font-medium whitespace-nowrap text-web-axis';
/** Правый отступ колонки; у последней его нет — вровень с кнопками шапки. */
const gap = (index: number): string => (index === COLUMNS.length - 1 ? '' : 'pr-3');

/** Клетка колонки `index`: ФИО переносится и отступает дальше, остальное — в строку. */
const cell = (index: number): string =>
  [
    'border-t border-web-line py-[11px] group-hover:bg-web-cyan/3',
    index === 1 ? 'whitespace-normal pr-4' : `whitespace-nowrap ${gap(index)}`,
    COLUMNS[index]?.align === 'right' ? 'text-right' : '',
  ].join(' ');

const NUMBER_CELL_CLASSES = 'border-t border-web-line py-[11px] pr-3 text-right whitespace-nowrap group-hover:bg-web-cyan/3';

const PILL_CLASSES = 'inline-block rounded-full px-2.5 py-[3px] font-manrope text-[12px] font-semibold';
</script>

<template>
  <MoleculesWebTile
    :cols="12"
    :rows="rows && rows.length > 0 ? 3 : 2"
    grow
    title="Ездят меньше обычного, перестали или ушли — поимённо"
    :metric="leaders ? 'leadersList' : undefined"
    :metric-values="metricValues"
  >
    <template #aside>
      <div class="-mr-[5px] flex shrink-0 items-center gap-2.5">
        <AtomsWebActionButton
          label="Выгрузить в Excel"
          :download="downloadUrl ?? undefined"
          :disabled="!rows || rows.length === 0 || !downloadUrl"
        />
        <AtomsWebActionButton
          :label="segmentLabel"
          :title="segmentHint"
          :disabled="!segmentEnabled"
          @click="emit('createSegment')"
        />
        <MoleculesWebMetricInfo metric="leadersActions" />
      </div>
    </template>

    <AtomsWebFieldError v-if="segmentError" id="leaders-segment-error" :text="segmentError" />

    <div v-if="state === 'loading'" class="mt-3.5">
      <AtomsWebHint text="Считаем лидеров…" />
    </div>
    <div v-else-if="state === 'error' || !leaders" class="mt-3.5">
      <AtomsWebHint text="Список не загрузился. Это отказ запроса, а не пустой список." />
    </div>
    <div v-else-if="note" class="mt-auto pt-2.5">
      <AtomsWebHint :text="note" />
    </div>
    <template v-else>
      <div class="-mx-1 mt-3.5 overflow-x-auto px-1">
        <table class="mt-3.5 w-full min-w-[860px] table-fixed border-collapse font-manrope text-[14px] text-web-text">
          <colgroup>
            <col :style="{ width: NUMBER_WIDTH }" />
            <col v-for="column in COLUMNS" :key="column.label" :style="{ width: column.width }" />
          </colgroup>
          <thead>
            <tr>
              <th :class="HEAD_CLASSES" class="pr-3 text-right">№</th>
              <th
                v-for="(column, index) in COLUMNS"
                :key="column.label"
                :class="[HEAD_CLASSES, gap(index), column.align === 'right' ? 'text-right' : 'text-left']"
              >
                <MoleculesWebColumnLabel :label="column.label" :metric="column.metric" :metric-values="metricValues" />
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(group, groupIndex) in groups" :key="group.group">
              <tr>
                <td
                  :colspan="COLUMNS.length + 1"
                  class="pr-3 pb-2 font-manrope text-[12px] font-semibold text-web-title"
                  :class="groupIndex === 0 ? 'pt-1' : 'pt-[18px]'"
                >
                  {{ group.title }}
                </td>
              </tr>
              <tr
                v-for="(row, index) in group.rows"
                :key="row.personId"
                class="group cursor-pointer"
                @click="router.push(driverPath(row))"
              >
                <td :class="NUMBER_CELL_CLASSES"><AtomsWebRowNumber :value="group.start + index + 1" /></td>
                <td :class="cell(0)">{{ row.callsign ?? DASH }}</td>
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
                  <span
                    :class="[PILL_CLASSES, row.inProgram ? 'bg-web-green/12 text-web-green' : 'bg-web-scarlet/12 text-web-scarlet']"
                  >
                    {{ row.inProgram ? 'да' : 'нет' }}
                  </span>
                </td>
                <td :class="cell(3)">
                  <template v-if="row.norm === null">{{ DASH }}</template>
                  <template v-else>
                    {{ formatNumber(row.weekTrips) }} <span class="text-web-grey">/ {{ formatNumber(row.norm) }}</span>
                  </template>
                </td>
                <td :class="cell(4)">
                  <b v-if="row.deviationPercent !== null" class="font-bold text-web-scarlet">
                    {{ formatSignedNumber(row.deviationPercent) }} %
                  </b>
                  <span v-else-if="row.idleDays !== null" class="font-semibold text-web-title">
                    {{ idleText(row.idleDays) }}
                  </span>
                </td>
                <td :class="cell(5)">
                  <span v-if="row.weeksBelow === null" class="text-web-grey">{{ DASH }}</span>
                  <template v-else>{{ row.weeksBelow }}</template>
                </td>
                <td :class="cell(6)" class="text-web-grey">{{ formatShortDay(row.lastTripDay) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div class="mt-auto pt-2.5">
        <AtomsWebHint :text="footnote" />
      </div>
    </template>
  </MoleculesWebTile>
</template>
