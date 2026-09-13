<script setup lang="ts">
import type { MemberOrderLine } from '#shared/types/miniapp';
import { formatNumber } from '~/utils/format';

/**
 * Состав заказа: товар, штуки и стоимость позиции, внизу сумма.
 *
 * Один компонент на подтверждение и на экран заказа: водитель сверяет на стойке тот же
 * список, который подтверждал, и расходиться видом им незачем.
 */
const props = defineProps<{
  lines: MemberOrderLine[];
  total: number;
  totalLabel: string;
  pointsUnit: string;
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
        <span class="w-20 shrink-0 text-right text-base font-medium tabular-nums">
          {{ formatNumber(line.quantity * line.unitPoints) }}
        </span>
      </li>
    </ul>
    <div class="flex items-baseline gap-3 border-t border-slate-200 pt-3">
      <span class="flex-1 text-base font-semibold">{{ totalLabel }}</span>
      <span class="shrink-0 text-lg font-semibold tabular-nums">
        {{ formatNumber(total) }} {{ pointsUnit }}
      </span>
    </div>
  </div>
</template>
