<script setup lang="ts">
import { DASH, formatDateTime, formatNumber } from '~/utils/format';
import type { ReportCell, ReportColumn, ReportRow, ReportResult } from '#shared/types/reports';

/**
 * Отчёт на экране (issue #308): заголовок, подпись и разделы — таблица и примечания под ней.
 *
 * Рисует любой `ReportResult` одинаково — тот же, из которого сервер собирает книгу Excel:
 * новый отчёт своего экрана не требует. За данными компонент не ходит
 * (docs/frontend.md → «Данные в компоненты не ходят»).
 *
 * Широкая таблица прокручивается внутри своего блока, а не раздвигает страницу.
 */
defineProps<{
  result: ReportResult;
}>();

const isNumeric = (column: ReportColumn): boolean => column.kind !== 'text';

/** Число — с разрядами, «значения нет» в числовой колонке — прочерк, а не пустота и не ноль. */
const cellText = (column: ReportColumn, value: ReportCell | undefined): string => {
  if (value === null || value === undefined) {
    return isNumeric(column) ? DASH : '';
  }

  return typeof value === 'number' ? formatNumber(value) : value;
};

const ROW_CLASSES: Record<ReportRow['kind'], string> = {
  row: 'border-t border-slate-100',
  subtotal: 'border-t border-slate-100 font-semibold',
  total: 'border-t-2 border-slate-400 font-semibold',
};
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold text-slate-900">{{ result.title }}</h2>
      <p class="mt-1 text-sm text-slate-500">{{ result.subtitle }}</p>
      <p class="mt-1 text-xs text-slate-400">Сформирован {{ formatDateTime(result.generatedAt) }}</p>
    </div>

    <MoleculesSectionPanel v-for="section in result.sections" :key="section.title" :title="section.title">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs text-slate-500">
            <tr>
              <th
                v-for="column in section.columns"
                :key="column.key"
                class="py-2 pr-4 font-medium whitespace-nowrap last:pr-0"
                :class="isNumeric(column) ? 'text-right' : ''"
              >
                {{ column.label }}
              </th>
            </tr>
          </thead>
          <tbody class="text-slate-900">
            <tr v-for="(row, rowIndex) in section.rows" :key="rowIndex" :class="ROW_CLASSES[row.kind]">
              <td
                v-for="column in section.columns"
                :key="column.key"
                class="py-2 pr-4 last:pr-0"
                :class="isNumeric(column) ? 'text-right whitespace-nowrap tabular-nums' : ''"
              >
                {{ cellText(column, row.cells[column.key]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul v-if="section.notes.length > 0" class="mt-4 space-y-1 text-sm text-slate-500 italic">
        <li v-for="note in section.notes" :key="note">{{ note }}</li>
      </ul>
    </MoleculesSectionPanel>
  </div>
</template>
