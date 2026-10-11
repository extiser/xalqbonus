<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router';
import { formatNumber, pluralize } from '~/utils/format';
import { toLoadState } from '~/utils/loadState';
import type { ApplicationListTab } from '~/components/organisms/web/ApplicationTable.vue';
import { APPLICATION_OVERDUE_HOURS, isApplicationFilter } from '#shared/candidateApplications';
import type { MetricKey, MetricValues } from '#shared/metrics';
import type { AdParticipantList, ApplicationList, UnfinishedList } from '#shared/types/applications';

/**
 * Раздел «Заявки», список (issue #471) — экран `_reference/design/web/applications/01-list.html`.
 *
 * Четыре плитки «кого пинать» и итога, таблица заявок с фильтром, поиском и листанием и таблица
 * участников программы, пришедших по рекламе. Пилюля «Не закончили» (issue #475, `03-unfinished.html`)
 * показывает вместо заявок людей, не подавших заявку в чате бота: плитки и числа у пилюль при ней
 * берутся из списка заявок без фильтра, строки — из своей ручки. Фильтр, поиск и страница живут в адресе
 * (`?filter=`, `?q=`, `?offset=`, `?adOffset=`): ссылку на отфильтрованный список можно переслать,
 * а «Назад» из карточки возвращает туда же.
 */

definePageMeta({
  layout: 'web',
  middleware: 'applications-access',
});

useHead({ title: 'Заявки — Xalq Taxi Bonus' });

const route = useRoute();
const router = useRouter();

const readText = (value: unknown): string => (typeof value === 'string' ? value : '');

const readOffset = (value: unknown): number => {
  const offset = Number(readText(value));

  return Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
};

const filter = computed((): ApplicationListTab => {
  const value = route.query.filter;

  if (value === 'unfinished') return 'unfinished';

  return isApplicationFilter(value) ? value : 'all';
});
const query = computed(() => readText(route.query.q));
const offset = computed(() => readOffset(route.query.offset));
const adOffset = computed(() => readOffset(route.query.adOffset));

// При «Не закончили» строки заявок не нужны: список зовётся без фильтра — ради плиток и чисел у пилюль.
const { data: list, status } = await useFetch<ApplicationList>('/api/applications', {
  query: computed(() =>
    filter.value === 'unfinished'
      ? { filter: 'all', q: query.value, offset: 0 }
      : { filter: filter.value, q: query.value, offset: offset.value },
  ),
});

// `useRequestFetch`, а не `$fetch`: при отрисовке на сервере запрос несёт cookie сессии.
const requestFetch = useRequestFetch();

const { data: unfinished, status: unfinishedStatus } = await useAsyncData(
  'applications-unfinished',
  (): Promise<UnfinishedList | null> =>
    filter.value === 'unfinished'
      ? requestFetch<UnfinishedList>('/api/applications/unfinished', { query: { q: query.value, offset: offset.value } })
      : Promise.resolve(null),
  { watch: [filter, query, offset] },
);

const { data: adList, status: adStatus } = await useFetch<AdParticipantList>('/api/applications/ad-participants', {
  query: computed(() => ({ offset: adOffset.value })),
});

const state = computed(() => toLoadState(status.value));
const unfinishedState = computed(() => toLoadState(unfinishedStatus.value));
const adState = computed(() => toLoadState(adStatus.value));

/** Пустое значение из адреса убирается: ссылка остаётся короткой. */
const replaceQuery = (changes: Record<string, string | number>): void => {
  const next: LocationQueryRaw = { ...route.query };

  for (const [key, value] of Object.entries(changes)) {
    if (value === '' || value === 0 || (key === 'filter' && value === 'all')) delete next[key];
    else next[key] = String(value);
  }

  void router.replace({ query: next });
};

// Новый фильтр и новый поиск — с первой страницы: старое смещение могло быть дальше конца.
const selectFilter = (next: ApplicationListTab): void => replaceQuery({ filter: next, offset: 0 });
const search = (next: string): void => replaceQuery({ q: next.trim(), offset: 0 });
const page = (next: number): void => replaceQuery({ offset: next });
const adPage = (next: number): void => replaceQuery({ adOffset: next });

// «Ждёт ответа» считается от этого момента; раз в минуту он сдвигается, и длительности растут
// без перезагрузки.
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  now.value = Date.now();
  clock = setInterval(() => {
    now.value = Date.now();
  }, 60_000);
});

onBeforeUnmount(() => {
  if (clock) clearInterval(clock);
});

/** Число плитки и серая подпись рядом: «+18 за 7 дней», «1 не закончил». */
type TotalTile = { title: string; metric: MetricKey; value: number | null; unit: string | undefined; values?: MetricValues };

const weekUnit = (week: number | undefined): string | undefined =>
  week === undefined ? undefined : `+${formatNumber(week)} за 7 дней`;

const unfinishedUnit = (count: number | undefined): string | undefined =>
  count === undefined || count === 0
    ? undefined
    : `${formatNumber(count)} ${pluralize(count, 'не закончил', 'не закончили', 'не закончили')}`;

const tiles = computed<TotalTile[]>(() => {
  const counts = list.value?.tiles ?? null;

  return [
    {
      title: 'Ждут ответа',
      metric: 'applicationsWaiting',
      value: counts?.waiting ?? null,
      unit: unfinishedUnit(counts?.waitingUnfinished),
    },
    {
      title: 'Дольше суток',
      metric: 'applicationsOverdue',
      value: counts?.overdue ?? null,
      unit: undefined,
      values: { overdueHours: String(APPLICATION_OVERDUE_HOURS) },
    },
    { title: 'Всего заявок', metric: 'applicationsTotal', value: counts?.total ?? null, unit: weekUnit(counts?.totalWeek) },
    { title: 'Оформлены', metric: 'applicationsHired', value: counts?.hired ?? null, unit: weekUnit(counts?.hiredWeek) },
  ];
});
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4 px-1 pt-1.5 pb-5 max-web:px-0.5 max-web:pt-1 max-web:pb-3.5">
      <div class="flex min-w-0 grow basis-80 flex-col gap-2">
        <AtomsWebPageTitle label="Заявки" />
        <p class="m-0 max-w-[760px] font-manrope text-[14px] leading-[1.5] text-web-title">
          Заявки людей, которые хотят работать в парке. Здесь видно, кто ждёт ответа, кто ведёт заявку и чем она
          закончилась.
        </p>
      </div>
    </div>

    <MoleculesWebBento>
      <MoleculesWebTile
        v-for="tile in tiles"
        :key="tile.metric"
        :cols="3"
        :rows="1"
        :medium="6"
        :title="tile.title"
        :metric="tile.metric"
        :metric-values="tile.values"
      >
        <div class="mt-3">
          <AtomsWebFigure
            v-if="tile.value !== null"
            size="tile"
            :value="formatNumber(tile.value)"
            :unit="tile.unit"
          />
          <AtomsWebHint v-else :text="state === 'loading' ? 'Считаем…' : 'Не загрузилось'" />
        </div>
      </MoleculesWebTile>
      <OrganismsWebApplicationTable
        :state="state"
        :list="list ?? null"
        :filter="filter"
        :query="query"
        :now="now"
        :unfinished-state="unfinishedState"
        :unfinished="unfinished ?? null"
        @filter="selectFilter"
        @search="search"
        @page="page"
      />
      <OrganismsWebAdParticipantTable :state="adState" :list="adList ?? null" @page="adPage" />
    </MoleculesWebBento>
  </div>
</template>
