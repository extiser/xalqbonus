<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { PhKeyboard } from '@phosphor-icons/vue';
import { DASH, formatCalendarDate, formatDate, formatWaitDuration } from '~/utils/format';
import type { LoadState } from '~/types/loadState';
import type { FilterPill } from '~/components/molecules/web/FilterPills.vue';
import {
  APPLICATION_OVERDUE_HOURS,
  CANDIDATE_MATCH_LABELS,
  FORMER_DRIVER_DAYS,
  type ApplicationFilter,
} from '#shared/candidateApplications';
import type { ApplicationList, ApplicationRow } from '#shared/types/applications';

/**
 * Плитка «Заявки» списка заявок (issue #471) — таблица `01-list.html`, 12 × 6, растёт по числу
 * строк (`grow`). Справа в шапке поиск, под шапкой пилюли фильтра с числом у каждой, внизу
 * листание.
 *
 * Колонки: №, кандидат (имя, под ним телефон и пометка «вручную»), статус, откуда (метка, под
 * ней код), когда подана, сверка, кто ведёт, сколько ждёт ответа. Номер строки сплошной через
 * страницы. Ждёт ответа — циан, дольше суток — жирным; не ждёт — прочерк. Строка открывает
 * карточку заявки, имя — ссылка туда же, для клавиатуры.
 *
 * Данные, фильтр, поиск и страница — свойствами; сама плитка в сеть не ходит и адрес не правит:
 * выбор уходит наверх событиями.
 */
const props = defineProps<{
  state: LoadState;
  list: ApplicationList | null;
  filter: ApplicationFilter;
  query: string;
  /** Момент, от которого считается «ждёт ответа», мс. */
  now: number;
}>();

const emit = defineEmits<{
  filter: [filter: ApplicationFilter];
  search: [query: string];
  page: [offset: number];
}>();

const router = useRouter();

const OVERDUE_MS = APPLICATION_OVERDUE_HOURS * 60 * 60 * 1_000;

const MATCH_VALUES = { formerDriverDays: String(FORMER_DRIVER_DAYS) };

const pills = computed((): FilterPill<ApplicationFilter>[] => {
  const counts = props.list?.counts;
  const count = (key: ApplicationFilter): number => counts?.[key] ?? 0;

  return [
    { key: 'all', label: 'Все', count: count('all') },
    { key: 'waiting', label: 'Ждут ответа', count: count('waiting'), tone: 'cyan' },
    { key: 'new', label: 'Новая', count: count('new'), tone: 'gold' },
    { key: 'in_progress', label: 'В работе', count: count('in_progress') },
    { key: 'hired', label: 'Оформлен', count: count('hired'), tone: 'green' },
    { key: 'rejected', label: 'Отказ', count: count('rejected'), tone: 'scarlet' },
  ];
});

const selectFilter = (key: string): void => {
  const pill = pills.value.find((candidate) => candidate.key === key);

  if (pill) emit('filter', pill.key);
};

const search = computed({
  get: () => props.query,
  set: (value: string) => emit('search', value),
});

const cardPath = (id: string): string => `/applications/${id}`;

/** Сверка словами: первая строка и серая вторая — кто этот человек нам. */
const matchLines = (row: ApplicationRow): { main: string; sub: string | null } => {
  if (row.telegramWasMember) {
    const who = [row.formerDriverName, row.formerDriverCallsign === null ? null : `позывной ${row.formerDriverCallsign}`]
      .filter((part): part is string => part !== null)
      .join(', ');

    return { main: 'Telegram был у водителя', sub: who === '' ? null : who };
  }

  if (row.match === 'former' && row.lastTripDay !== null) {
    return { main: CANDIDATE_MATCH_LABELS.former, sub: `последняя поездка ${formatCalendarDate(row.lastTripDay)}` };
  }

  return { main: CANDIDATE_MATCH_LABELS[row.match], sub: null };
};

const waitingFor = (row: ApplicationRow): { text: string; overdue: boolean } | null => {
  if (row.waitingSince === null) return null;

  const waited = props.now - new Date(row.waitingSince).getTime();

  return { text: formatWaitDuration(waited), overdue: waited > OVERDUE_MS };
};

const HEAD_CLASSES = 'pr-3 pb-2.5 font-manrope text-[12px] font-medium whitespace-nowrap text-web-axis';
const CELL_CLASSES = 'border-t border-web-line py-[11px] pr-3 align-top whitespace-nowrap group-hover:bg-web-cyan/3';
const SUB_CLASSES = 'mt-0.5 text-[12px] font-medium text-web-grey';
</script>

<template>
  <MoleculesWebTile :cols="12" :rows="6" grow title="Заявки">
    <template #aside>
      <MoleculesWebSearchField v-model="search" placeholder="Имя или телефон" label="Поиск заявки по имени или телефону" />
    </template>

    <div class="mt-4">
      <MoleculesWebFilterPills :pills="pills" :current="filter" label="Фильтр заявок" @select="selectFilter" />
    </div>

    <div v-if="state === 'loading' && list === null" class="mt-3.5">
      <AtomsWebHint text="Загружаем заявки…" />
    </div>
    <div v-else-if="state === 'error' || list === null" class="mt-3.5">
      <AtomsWebHint text="Заявки не загрузились. Это отказ запроса, а не пустой список." />
    </div>
    <template v-else>
      <!-- Значок последней колонки висит за её правым краем: прокрутке оставлено место справа. -->
      <div class="mt-3.5 -mr-[30px] -ml-1 overflow-x-auto pr-[30px] pl-1">
        <table class="w-full border-collapse font-manrope text-[14px]">
          <thead>
            <tr>
              <th :class="HEAD_CLASSES" class="w-px text-right">№</th>
              <th :class="HEAD_CLASSES" class="text-left">Кандидат</th>
              <th :class="HEAD_CLASSES" class="text-left">Статус</th>
              <th :class="HEAD_CLASSES" class="text-left">Откуда</th>
              <th :class="HEAD_CLASSES" class="text-left">Подана</th>
              <th :class="HEAD_CLASSES" class="text-left">
                <MoleculesWebMetricLabel label="Сверка" metric="applicationsMatch" :metric-values="MATCH_VALUES" />
              </th>
              <th :class="HEAD_CLASSES" class="text-left">
                <MoleculesWebMetricLabel label="Ведёт" metric="applicationsLead" />
              </th>
              <th :class="HEAD_CLASSES" class="text-right">
                <MoleculesWebColumnLabel label="Ждёт ответа" metric="applicationsWaitFor" />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="list.rows.length === 0">
              <td :class="CELL_CLASSES" colspan="8" class="text-web-grey">Заявок нет</td>
            </tr>
            <tr
              v-for="(row, index) in list.rows"
              :key="row.id"
              class="group cursor-pointer"
              @click="router.push(cardPath(row.id))"
            >
              <td :class="CELL_CLASSES" class="text-right"><AtomsWebRowNumber :value="list.offset + index + 1" /></td>
              <td :class="CELL_CLASSES">
                <NuxtLink
                  :to="cardPath(row.id)"
                  class="block text-[15px] font-semibold text-web-text no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
                  @click.stop
                >
                  {{ row.name }}
                </NuxtLink>
                <div :class="SUB_CLASSES" class="flex items-center gap-1">
                  {{ row.phone }}
                  <template v-if="row.phoneManual">
                    ·
                    <MoleculesWebTooltip text="Номер введён вручную. Кандидат не поделился номером из Telegram.">
                      <span
                        tabindex="0"
                        class="inline-flex cursor-default items-center gap-1 focus-visible:text-web-text focus-visible:outline-none"
                        @click.stop
                      >
                        <PhKeyboard weight="duotone" aria-hidden="true" class="size-3.5" />вручную
                      </span>
                    </MoleculesWebTooltip>
                  </template>
                </div>
              </td>
              <td :class="CELL_CLASSES"><AtomsWebStatusPill :status="row.status" /></td>
              <td :class="CELL_CLASSES">
                <template v-if="row.promoName !== null">
                  {{ row.promoName }}
                  <div :class="SUB_CLASSES">{{ row.promoCode }}</div>
                </template>
                <template v-else>{{ row.promoCode }}</template>
              </td>
              <td :class="CELL_CLASSES" class="text-web-grey">{{ formatDate(row.createdAt) }}</td>
              <td :class="CELL_CLASSES" class="font-medium text-web-title">
                {{ matchLines(row).main }}
                <div v-if="matchLines(row).sub !== null" :class="SUB_CLASSES">{{ matchLines(row).sub }}</div>
              </td>
              <td :class="[CELL_CLASSES, row.handledBy === null ? 'text-web-grey' : '']">
                {{ row.handledBy ?? DASH }}
              </td>
              <td :class="CELL_CLASSES" class="text-right">
                <span
                  v-if="waitingFor(row) !== null"
                  class="text-web-cyan"
                  :class="waitingFor(row)?.overdue ? 'font-bold' : 'font-semibold'"
                >
                  {{ waitingFor(row)?.text }}
                  <span class="mt-0.5 block text-[12px] font-normal text-web-grey">
                    {{ row.waitingFrom === 'candidate' ? 'кандидат написал' : 'с подачи' }}
                  </span>
                </span>
                <span v-else class="text-web-grey">{{ DASH }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-auto flex items-center justify-between gap-3 pt-3 max-web:flex-col max-web:items-start">
        <AtomsWebHint
          text="Сверху те, кто ждёт ответа, дольше всех первыми. Ниже заявки в работе. Оформленные и отказы стоят в конце списка. Строка открывает карточку заявки с перепиской."
        />
        <MoleculesWebPagerBar :total="list.total" :limit="list.limit" :offset="list.offset" @change="emit('page', $event)" />
      </div>
    </template>
  </MoleculesWebTile>
</template>
