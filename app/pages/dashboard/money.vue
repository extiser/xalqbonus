<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toLoadState } from '~/utils/loadState';

/**
 * Дашборд, вкладка «Деньги» (issue #438) — первый уровень и первая вкладка дашборда, экран
 * `_reference/design/web/dashboard/01-money.html`: сколько парк заработал за месяц, за счёт
 * чего доход изменился к тому же месяцу год назад и к прошлому месяцу, и доход по месяцам
 * за год. Цифры — из готовой таблицы ночного пересчёта (docs/decisions.md → «Деньги на дашборде»).
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

const { data: money, status } = await useFetch('/api/dashboard/money', { query });

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
        <MoleculesWebLevelTabs current="money" :available="['money', 'levers', 'depth']" :month="monthQuery" />
      </div>
      <MoleculesWebMonthPicker
        v-if="money"
        :month="money.month"
        :first-month="money.range.firstMonth"
        :last-month="money.range.lastMonth"
        @change="changeMonth"
      />
    </div>

    <MoleculesWebBento>
      <OrganismsWebDashboardIncome :state="state" :money="money ?? null" />
      <OrganismsWebDashboardIncomeWhy :state="state" :money="money ?? null" />
      <OrganismsWebDashboardIncomeByMonth :state="state" :money="money ?? null" />
    </MoleculesWebBento>
  </div>
</template>
