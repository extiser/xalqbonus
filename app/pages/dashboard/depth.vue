<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDashboardSegment } from '~/composables/useDashboardSegment';
import { toLoadState } from '~/utils/loadState';

/**
 * Дашборд, вкладка «Глубина» (issue #373) — экран `_reference/design/web/dashboard/03-depth.html`.
 *
 * Второй срез дашборда: три плитки про программу, данные для которых уже есть, — баллы
 * по неделям, экономика программы и водители вне программы. Кнопок-входов у плиток нет:
 * подробных страниц нет.
 *
 * Новички (issue #407, `03-depth-newbies.html`) — первым рядом «Сколько остаётся» и «Первые 14 дней»,
 * последней плиткой экрана — список тех, у кого меньше 20 поездок за 14 дней. Остальные плитки
 * «Глубины» — LTV и прочее — ждут транзакций.
 *
 * Шапка и месяц — как у «Рычагов»: месяц живёт в адресе (`?month=2026-10`) и переходит между
 * вкладками.
 */

definePageMeta({
  layout: 'web',
  middleware: 'dashboard-access',
});

useHead({ title: 'Дашборд — Xalq Taxi Bonus' });

const route = useRoute();
const router = useRouter();

const monthQuery = computed(() =>
  typeof route.query.month === 'string' && route.query.month !== '' ? route.query.month : undefined,
);

const query = computed(() => (monthQuery.value ? { month: monthQuery.value } : {}));

const { data: depth, status } = await useFetch('/api/dashboard/depth', { query });

const state = computed(() => toLoadState(status.value));

// «Сделать сегмент» у списка новичков (issue #415) — за месяц, который на экране.
const {
  allowed: canCreateSegment,
  creating: segmentCreating,
  error: segmentError,
  create: createSegment,
} = useDashboardSegment('newcomers', computed(() => depth.value?.month ?? null));

const weeks = computed(() => (state.value === 'ready' ? (depth.value?.weeks ?? null) : null));

const changeMonth = (month: string): void => {
  void router.push({ query: { ...route.query, month } });
};
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4 px-1 pt-1.5 pb-5 max-web:px-0.5 max-web:pt-1 max-web:pb-3.5">
      <div class="flex min-w-0 flex-col gap-3.5">
        <AtomsWebPageTitle label="Дашборд" />
        <MoleculesWebLevelTabs current="depth" :available="['levers', 'depth']" :month="monthQuery" />
      </div>
      <MoleculesWebMonthPicker
        v-if="depth"
        :month="depth.month"
        :first-month="depth.range.firstMonth"
        :last-month="depth.range.lastMonth"
        @change="changeMonth"
      />
    </div>

    <MoleculesWebBento>
      <OrganismsWebDashboardNewcomersRetention :state="state" :month="depth?.month ?? null" :newcomers="depth?.newcomers ?? null" />
      <OrganismsWebDashboardNewcomersFirstDays :state="state" :month="depth?.month ?? null" :newcomers="depth?.newcomers ?? null" />
      <MoleculesWebTile :cols="8" :rows="3" title="Баллы по неделям" metric="pointsWeekly" class="max-web:min-h-[300px]">
        <div v-if="state === 'loading'" class="mt-[18px]">
          <AtomsWebHint text="Считаем баллы…" />
        </div>
        <div v-else-if="weeks === null" class="mt-[18px]">
          <AtomsWebHint text="Баллы не загрузились. Это отказ запроса, а не пустой месяц." />
        </div>
        <div v-else-if="weeks.length === 0" class="mt-[18px]">
          <AtomsWebHint text="К концу месяца в журнале ещё не было ни одного перевода." />
        </div>
        <OrganismsWebPointsWeeklyChart v-else :weeks="weeks" />
      </MoleculesWebTile>
      <OrganismsWebDashboardProgramEconomy :state="state" :month="depth?.month ?? null" :economy="depth?.economy ?? null" />
      <OrganismsWebDashboardOutsideProgram :state="state" :month="depth?.month ?? null" :outside="depth?.outside ?? null" />
      <OrganismsWebDashboardNewcomersList
        :state="state"
        :month="depth?.month ?? null"
        :newcomers="depth?.newcomers ?? null"
        :can-create-segment="canCreateSegment"
        :segment-creating="segmentCreating"
        :segment-error="segmentError"
        @create-segment="createSegment"
      />
    </MoleculesWebBento>
  </div>
</template>
