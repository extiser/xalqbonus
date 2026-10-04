<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toLoadState } from '~/utils/loadState';

/**
 * Дашборд, вкладка «Рычаги» (issue #371): за счёт чего изменились поездки — экран
 * `_reference/design/web/dashboard/02-levers.html`.
 *
 * Дашборд строится срезами, и это первый: на вкладке одна плитка множителей. «Глубина» сделана
 * вторым срезом (issue #373), «Деньги» видна и не нажимается. Пункта «Дашборд» в меню нет —
 * появится, когда дашборд будет готов, — страница открывается адресом.
 *
 * Месяц живёт в адресе (`?month=2026-10`): ссылку на месяц можно переслать. Без него ручка
 * отдаёт последний доступный — текущий, а первого числа прошлый.
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

const { data: levers, status } = await useFetch('/api/dashboard/levers', { query });

const state = computed(() => toLoadState(status.value));

const changeMonth = (month: string): void => {
  void router.push({ query: { ...route.query, month } });
};
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4 px-1 pt-1.5 pb-5 max-web:px-0.5 max-web:pt-1 max-web:pb-3.5">
      <div class="flex min-w-0 flex-col gap-3.5">
        <AtomsWebPageTitle label="Дашборд" />
        <MoleculesWebLevelTabs current="levers" :available="['levers', 'depth']" :month="monthQuery" />
      </div>
      <MoleculesWebMonthPicker
        v-if="levers"
        :month="levers.month"
        :first-month="levers.range.firstMonth"
        :last-month="levers.range.lastMonth"
        @change="changeMonth"
      />
    </div>

    <MoleculesWebBento>
      <OrganismsWebDashboardMultipliers :state="state" :levers="levers ?? null" />
    </MoleculesWebBento>
  </div>
</template>
