<script setup lang="ts">
import { DASH, formatDateTime, formatSignedNumber } from '~/utils/format';
import { stockMovementKindLabel } from '~/utils/labels';
import type { StockMovementEntry } from '#shared/types/catalog';

/**
 * Строка журнала движений: почему остаток такой.
 *
 * Обе дельты показаны всегда, даже нулевая: у резерва под заказ свободный остаток уходит
 * в минус, а резерв в плюс, и строка, показывающая одно число, на вопрос «куда ушёл товар»
 * не отвечает.
 *
 * Автор — прочерк у движения, которое сделал водитель из Mini App или воркер просрочки:
 * там человека не было, и придумывать его нельзя.
 */
defineProps<{
  movement: StockMovementEntry;
}>();
</script>

<template>
  <div class="border-t border-slate-200 py-3 first:border-t-0">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span class="text-sm font-medium text-slate-900">{{ movement.productName }}</span>
      <span class="text-sm text-slate-600">{{ stockMovementKindLabel(movement.kind) }}</span>
      <span class="font-mono text-sm text-slate-900">
        свободно {{ formatSignedNumber(movement.deltaOnHand) }} · резерв
        {{ formatSignedNumber(movement.deltaReserved) }}
      </span>
      <span v-if="movement.orderNumber !== null" class="text-sm text-slate-500">
        заказ № {{ movement.orderNumber }}
      </span>
    </div>
    <p class="mt-1 text-xs text-slate-500">
      {{ formatDateTime(movement.createdAt) }} · {{ movement.employeeName ?? DASH }}
    </p>
    <p v-if="movement.note" class="mt-1 text-sm text-slate-700">{{ movement.note }}</p>
  </div>
</template>
