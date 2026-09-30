<script setup lang="ts">
import { computed, ref } from 'vue';
import { useReports, type ReportQuery } from '~/composables/useReports';
import type { SelectOption } from '~/types/selectOption';
import { REPORT_TITLES, reportDayKey, type ReportKey } from '#shared/reports';

/**
 * Раздел «Отчёты» (issue #308): клиент сам выбирает и выгружает отчёт по товару, без просьб
 * к нам и без SQL.
 *
 * Панель фильтров одна на все отчёты, разнятся только поля дат: у продаж — период, у остатков —
 * день. «Скачать Excel» выгружает показанный отчёт, а не набранное в фильтрах после показа:
 * файл и экран сходятся цифрами только так.
 */

definePageMeta({
  middleware: 'reports-access',
});

useHead({ title: 'Отчёты — Xalq Taxi Bonus' });

const reports = useReports();

const REPORT_OPTIONS: SelectOption[] = (Object.keys(REPORT_TITLES) as ReportKey[]).map((key) => ({
  value: key,
  label: REPORT_TITLES[key],
}));

const EMPTY_MESSAGES: Record<ReportKey, string> = {
  sales: 'За период продаж нет.',
  stock: 'На эту дату остатков нет.',
};

/** Сегодня — сутки парка: до 05:00 по Ташкенту это ещё вчера. */
const today = reportDayKey(new Date());

const report = ref<ReportKey>('sales');
const from = ref(`${today.slice(0, 8)}01`);
const to = ref(today);
const date = ref(today);
const officeId = ref('');

/** Выбор отчёта строкой — так его отдаёт поле. Чужого значения в списке нет. */
const reportValue = computed({
  get: () => report.value,
  set: (value: string) => {
    report.value = value as ReportKey;
  },
});

const officeOptions = computed<SelectOption[]>(() =>
  reports.offices.value.map((office) => ({
    value: office.officeId,
    label: office.archived ? `${office.name} (в архиве)` : office.name,
  })),
);

const query = (): ReportQuery => {
  const dates: ReportQuery = report.value === 'sales' ? { from: from.value, to: to.value } : { date: date.value };

  return officeId.value === '' ? dates : { ...dates, officeId: officeId.value };
};

const show = (): Promise<void> => reports.show(report.value, query());
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Отчёты</h1>
      <p class="mt-1 text-sm text-slate-500">
        Продажи и остатки по офисам и товарам — на экран и в Excel. Сутки — с 05:00 по Ташкенту, демо
        в отчёты не входит.
      </p>
    </div>

    <MoleculesSectionPanel title="Параметры">
      <form class="flex flex-wrap items-end gap-4" @submit.prevent="show">
        <label class="block w-56">
          <span class="mb-1 block text-sm font-medium text-slate-700">Отчёт</span>
          <AtomsSelectInput v-model="reportValue" :options="REPORT_OPTIONS" />
        </label>

        <template v-if="report === 'sales'">
          <div class="w-44">
            <MoleculesFormField v-model="from" label="С" type="date" required />
          </div>
          <div class="w-44">
            <MoleculesFormField v-model="to" label="По" type="date" required />
          </div>
        </template>
        <div v-else class="w-44">
          <MoleculesFormField v-model="date" label="На дату" type="date" required />
        </div>

        <label class="block w-64">
          <span class="mb-1 block text-sm font-medium text-slate-700">Офис</span>
          <AtomsSelectInput v-model="officeId" :options="officeOptions">
            <option value="">Все офисы</option>
          </AtomsSelectInput>
        </label>

        <div class="flex gap-3 pb-1">
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
