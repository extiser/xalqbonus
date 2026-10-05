<script setup lang="ts">
import { computed, ref } from 'vue';
import { useReports, type ReportQuery } from '~/composables/useReports';
import type { SelectOption } from '~/types/selectOption';
import { PARK_WIDE_REPORTS, REPORT_TITLES, reportDayKey, type ReportKey, type SectionReportKey } from '#shared/reports';

/**
 * Раздел «Отчёты» (issue #308): клиент сам выбирает и выгружает отчёт по товару, без просьб
 * к нам и без SQL.
 *
 * Панель фильтров одна на все отчёты, разнятся только поля дат: у остатков — день, у остальных —
 * период. «Скачать Excel» выгружает показанный отчёт, а не набранное в фильтрах после показа:
 * файл и экран сходятся цифрами только так.
 *
 * Панель — ровная сетка (Руслан, 30-09-2026, по прогону #308): подписи на одном уровне, поля
 * одной высоты и постоянной ширины, кнопки всегда строкой под полями. Место под даты — всегда
 * на два поля: у отчёта на один день второе место пустует, и `Офис` не сдвигается при смене
 * отчёта. У отчёта по всему парку `Офис` погашен, а не спрятан — по той же причине.
 */

definePageMeta({
  middleware: 'reports-access',
});

useHead({ title: 'Отчёты — Xalq Taxi Bonus' });

const reports = useReports();

const REPORT_OPTIONS: SelectOption[] = (Object.keys(REPORT_TITLES) as SectionReportKey[]).map((key) => ({
  value: key,
  label: REPORT_TITLES[key],
}));

// Полным `ReportKey`, а не списком раздела: экран рисует любой `ReportResult`, и выгрузка
// дашборда (issue #373) обязана иметь свою строку, даже если в выборе раздела её нет.
const EMPTY_MESSAGES: Record<ReportKey, string> = {
  sales: 'За период продаж нет.',
  stock: 'На эту дату остатков нет.',
  turnover: 'За период движения нет.',
  adjustments: 'За период корректировок нет.',
  rewards: 'За период наград не выдавали.',
  order_outcomes: 'За период заказов из бота не было.',
  staff: 'За период сотрудники ничего не оформляли.',
  points_economy: 'За период движения баллов не было.',
  outside_program: 'За месяц водителей вне программы нет.',
  leaders: 'Никто из лидеров не ездит меньше обычного и не ушёл.',
};

/** Сегодня — календарный день по Ташкенту. */
const today = reportDayKey(new Date());

const report = ref<SectionReportKey>('sales');
const from = ref(`${today.slice(0, 8)}01`);
const to = ref(today);
const date = ref(today);
const officeId = ref('');

/** Отчёт на один день; остальные — за период `С`–`По`. */
const isDayReport = computed(() => report.value === 'stock');

/** Отчёт по всему парку: офиса у него нет, поле `Офис` погашено и в запрос не идёт. */
const isParkWide = computed(() => PARK_WIDE_REPORTS.includes(report.value));

/** Погашенное поле офиса показывает «По всему парку», а не офис, выбранный для другого отчёта. */
const officeValue = computed({
  get: () => (isParkWide.value ? '' : officeId.value),
  set: (value: string) => {
    officeId.value = value;
  },
});

/** Выбор отчёта строкой — так его отдаёт поле. Чужого значения в списке нет. */
const reportValue = computed({
  get: () => report.value,
  set: (value: string) => {
    report.value = value as SectionReportKey;
  },
});

const officeOptions = computed<SelectOption[]>(() =>
  reports.offices.value.map((office) => ({
    value: office.officeId,
    label: office.archived ? `${office.name} (в архиве)` : office.name,
  })),
);

const query = (): ReportQuery => {
  const dates: ReportQuery = isDayReport.value ? { date: date.value } : { from: from.value, to: to.value };

  return officeId.value === '' || isParkWide.value ? dates : { ...dates, officeId: officeId.value };
};

const show = (): Promise<void> => reports.show(report.value, query());
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Отчёты</h1>
      <p class="mt-1 text-sm text-slate-500">
        Продажи, остатки, движение товара, награды, заказы, работа сотрудников и баллы — на экран
        и в Excel. Сутки — по Ташкенту, с полуночи, демо в отчёты не входит.
      </p>
    </div>

    <MoleculesSectionPanel title="Параметры">
      <form class="space-y-4" @submit.prevent="show">
        <div class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div class="sm:w-64">
            <MoleculesSelectField v-model="reportValue" label="Отчёт" :options="REPORT_OPTIONS" />
          </div>

          <!-- Место под даты — на два поля по 11rem и зазор между ними, у любого отчёта. -->
          <div class="flex flex-col gap-4 sm:w-92 sm:flex-row">
            <div v-if="isDayReport" class="sm:w-44">
              <MoleculesFormField v-model="date" label="На дату" type="date" required />
            </div>
            <template v-else>
              <div class="sm:w-44">
                <MoleculesFormField v-model="from" label="С" type="date" required />
              </div>
              <div class="sm:w-44">
                <MoleculesFormField v-model="to" label="По" type="date" required />
              </div>
            </template>
          </div>

          <div class="sm:w-64">
            <MoleculesSelectField
              v-model="officeValue"
              label="Офис"
              :options="isParkWide ? [] : officeOptions"
              :disabled="isParkWide"
            >
              <option value="">{{ isParkWide ? 'По всему парку' : 'Все офисы' }}</option>
            </MoleculesSelectField>
          </div>
        </div>

        <div class="flex gap-3">
          <AtomsSubmitButton label="Показать" :disabled="reports.state.value === 'loading'" />
          <AtomsActionLink label="Скачать Excel" :href="reports.exportUrl.value" download />
        </div>
      </form>

      <p v-if="reports.officesError.value" class="mt-3 text-sm text-red-700">
        Список офисов не прочитался: {{ reports.officesError.value }}
      </p>
      <p v-if="reports.error.value" class="mt-3 text-sm text-red-700">{{ reports.error.value }}</p>
    </MoleculesSectionPanel>

    <MoleculesStateNotice v-if="reports.state.value === 'loading'" state="loading" message="Считаем отчёт…" />
    <template v-else-if="reports.state.value === 'ready' && reports.result.value">
      <MoleculesStateNotice
        v-if="reports.result.value.empty"
        state="empty"
        :message="EMPTY_MESSAGES[reports.result.value.report]"
      />
      <OrganismsReportView v-else :result="reports.result.value" />
    </template>
  </div>
</template>
