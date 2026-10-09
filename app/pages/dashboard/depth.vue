<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { HireCostFormValues } from '~/components/molecules/web/HireCostForm.vue';
import { useDashboardSegment } from '~/composables/useDashboardSegment';
import { readHireCostFieldErrors } from '~/utils/hireCostFormErrors';
import { toLoadState } from '~/utils/loadState';
import { failureText } from '~/utils/requestError';
import type { HireCostField } from '#shared/hireCost';
import type { DashboardHireCostRecord, DashboardHireCostRequestBody } from '#shared/types/dashboard';

/**
 * Дашборд, вкладка «Глубина» (issue #373) — экран `_reference/design/web/dashboard/03-depth.html`.
 *
 * Второй срез дашборда: три плитки про программу, данные для которых уже есть, — баллы
 * по неделям, экономика программы и водители вне программы. Кнопок-входов у плиток нет:
 * подробных страниц нет.
 *
 * Сетка — как в эталоне (issue #446): первым рядом «Цена водителя за год» (issue #442) и справа
 * от неё «Окупается ли найм» (issue #445) с окном «Расходы на найм». Ниже — новички (issue #407, `03-depth-newbies.html`):
 * «Сколько остаётся» и «Первые 14 дней»; «Баллы по неделям» и «Экономика программы»; «Можно вернуть»
 * и «Вне программы»; последней плиткой экрана — список новичков, у кого меньше 20 поездок за 14 дней.
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

const { data: depth, status, refresh } = await useFetch('/api/dashboard/depth', { query });

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

// Окно «Расходы на найм» (issue #445): «Задать» и «Изменить» на плитке «Окупается ли найм».
// Сохранили — окно закрывается, и «Глубина» перечитывается: плитка считает по новой записи.

const hireCostOpen = ref(false);
/** Ключ формы: новое открытие окна — чистая форма, без прошлых значений и ошибок. */
const hireCostKey = ref(0);
const hireCostFieldErrors = ref<Partial<Record<HireCostField, string>>>({});
const hireCostError = ref<string | null>(null);
const hireCostSaving = ref(false);

const hirePayback = computed(() => (state.value === 'ready' ? (depth.value?.hirePayback ?? null) : null));

const openHireCost = (): void => {
  hireCostKey.value += 1;
  hireCostFieldErrors.value = {};
  hireCostError.value = null;
  hireCostOpen.value = true;
};

const closeHireCost = (): void => {
  hireCostOpen.value = false;
};

const clearHireCostFieldError = (field: HireCostField): void => {
  if (hireCostFieldErrors.value[field] === undefined) return;

  const next = { ...hireCostFieldErrors.value };
  delete next[field];
  hireCostFieldErrors.value = next;
};

const saveHireCost = async (values: HireCostFormValues): Promise<void> => {
  if (hireCostSaving.value) return;

  hireCostSaving.value = true;
  hireCostError.value = null;

  try {
    await $fetch<DashboardHireCostRecord>('/api/dashboard/hire-cost', {
      method: 'PUT',
      body: values satisfies DashboardHireCostRequestBody,
    });

    hireCostOpen.value = false;
    await refresh();
  } catch (error) {
    const errors = readHireCostFieldErrors(error);

    if (errors !== null) {
      hireCostFieldErrors.value = errors;
    } else {
      hireCostError.value = failureText(error);
    }
  } finally {
    hireCostSaving.value = false;
  }
};
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4 px-1 pt-1.5 pb-5 max-web:px-0.5 max-web:pt-1 max-web:pb-3.5">
      <div class="flex min-w-0 flex-col gap-3.5">
        <AtomsWebPageTitle label="Дашборд" />
        <MoleculesWebLevelTabs current="depth" :available="['money', 'levers', 'depth']" :month="monthQuery" />
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
      <OrganismsWebDashboardDriverValue :state="state" :month="depth?.month ?? null" :driver-value="depth?.driverValue ?? null" />
      <OrganismsWebDashboardHirePayback
        :state="state"
        :month="depth?.month ?? null"
        :hire-payback="depth?.hirePayback ?? null"
        @edit="openHireCost"
      />
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
      <OrganismsWebDashboardWinbackPool :state="state" :month="depth?.month ?? null" :winback="depth?.winback ?? null" />
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

    <MoleculesWebDialog :open="hireCostOpen" title="Расходы на найм" @close="closeHireCost">
      <MoleculesWebHireCostForm
        v-if="hirePayback"
        :key="hireCostKey"
        :initial-month="hirePayback.cost?.fromMonth ?? hirePayback.month"
        :initial-amount="hirePayback.cost?.amount ?? null"
        :first-month="depth?.range.firstMonth ?? hirePayback.month"
        :last-month="hirePayback.month"
        :hired-by-month="hirePayback.hiredByMonth"
        :value-per-hired="hirePayback.valuePerHired"
        :field-errors="hireCostFieldErrors"
        :form-error="hireCostError"
        :submitting="hireCostSaving"
        @submit="saveHireCost"
        @cancel="closeHireCost"
        @edit="clearHireCostFieldError"
      />
    </MoleculesWebDialog>
  </div>
</template>
