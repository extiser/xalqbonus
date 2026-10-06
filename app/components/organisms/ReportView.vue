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
 *
 * Группы офисов не сливаются (по прогону): под `Итого: {офис}` — линия той же
 * толщины, что над `Итого`, и перед строками следующего офиса — пустая полоса в половину строки.
 * Перед `Итого` полосы нет: там уже есть линия.
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
  subtotal: 'border-t border-b-2 border-t-slate-100 border-b-slate-400 font-semibold',
  total: 'border-t-2 border-slate-400 font-semibold',
};

/** После этой строки начинается следующий офис: она — `Итого: {офис}`, и за ней не `Итого`. */
const opensGap = (rows: ReportRow[], index: number): boolean =>
  rows[index]?.kind === 'subtotal' && rows[index + 1]?.kind === 'row';

/**
 * Первая строка офиса после полосы — без верхней линии: полоса отделяет офис сама, и линия
 * на её нижнем краю читалась бы как граница пустой строки.
 */
const rowClass = (rows: ReportRow[], index: number): string => {
  const row = rows[index];

  if (!row) {
    return '';
  }

  return row.kind === 'row' && opensGap(rows, index - 1) ? '' : ROW_CLASSES[row.kind];
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
            <template v-for="(row, rowIndex) in section.rows" :key="rowIndex">
              <tr :class="rowClass(section.rows, rowIndex)">
                <td
                  v-for="column in section.columns"
                  :key="column.key"
                  class="py-2 pr-4 last:pr-0"
                  :class="isNumeric(column) ? 'text-right whitespace-nowrap tabular-nums' : ''"
                >
                  {{ cellText(column, row.cells[column.key]) }}
                </td>
              </tr>
              <!-- Полоса в половину строки (36 px): отступ между офисами, без линий. -->
              <tr v-if="opensGap(section.rows, rowIndex)" aria-hidden="true">
                <td :colspan="section.columns.length" class="h-4.5 p-0" />
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <ul v-if="section.notes.length > 0" class="mt-4 space-y-1 text-sm text-slate-500 italic">
        <li v-for="note in section.notes" :key="note">{{ note }}</li>
      </ul>
    </MoleculesSectionPanel>
  </div>
</template>
