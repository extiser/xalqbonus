<script setup lang="ts">
import type { OrderLineListItem } from '~/types/orderLineList';
import { formatNumber } from '~/utils/format';

/**
 * Состав заказа: товар, штуки и стоимость позиции, внизу сумма.
 *
 * Валюта — у вызывающего: у заказа за баллы это баллы, у розничного — сумы (issue #294).
 * Один компонент на карточку заказа и на подтверждение оформления у стойки: сотрудник сверяет
 * с водителем тот же список, который потом увидит в карточке.
 */
const props = defineProps<{
  lines: OrderLineListItem[];
  total: number;
  totalLabel: string;
  /** Единица суммы: «баллов», «сум». */
  unit: string;
  piecesUnit: string;
}>();
</script>

<template>
  <div class="flex flex-col">
    <ul class="flex flex-col divide-y divide-slate-100">
      <li v-for="line in props.lines" :key="line.productId" class="flex items-baseline gap-3 py-2">
        <span class="flex-1 text-base leading-snug">{{ line.name }}</span>
        <span class="shrink-0 text-sm text-slate-500 tabular-nums">
          {{ line.quantity }} {{ piecesUnit }}
        </span>
        <span class="w-24 shrink-0 text-right text-base font-medium tabular-nums">
          {{ formatNumber(line.quantity * line.unitPrice) }}
        </span>
      </li>
    </ul>
    <div class="flex items-baseline gap-3 border-t border-slate-200 pt-3">
      <span class="flex-1 text-base font-semibold">{{ totalLabel }}</span>
      <span class="shrink-0 text-lg font-semibold tabular-nums">
        {{ formatNumber(total) }} {{ unit }}
      </span>
    </div>
  </div>
</template>
