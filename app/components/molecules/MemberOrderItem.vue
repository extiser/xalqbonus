<script setup lang="ts">
import type { MemberOrder } from '#shared/types/miniapp';
import { formatNumber } from '~/utils/format';

/**
 * Заказ в списке «Мои заказы»: номер, офис, сумма и статус.
 *
 * У висящего крупно стоит код — ради него список и открывают у стойки. У выданного
 * и отменённого вместо кода дата и причина: код освобождён и больше ничего не значит.
 */
const props = defineProps<{
  order: MemberOrder;
  pointsUnit: string;
}>();

defineEmits<{ open: [] }>();
</script>

<template>
  <button
    type="button"
    class="flex w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
    :class="props.order.code ? 'border-emerald-500' : 'border-slate-200'"
    @click="$emit('open')"
  >
    <span class="flex items-baseline gap-3">
      <span class="flex-1 text-base font-semibold">{{ order.title }}</span>
      <span class="shrink-0 text-base font-medium tabular-nums">
        {{ formatNumber(order.totalPoints) }} {{ pointsUnit }}
      </span>
    </span>
    <span class="text-sm text-slate-500">{{ order.officeName }}</span>
    <span
      v-if="order.code"
      class="font-mono text-2xl font-semibold tracking-widest text-emerald-800 tabular-nums"
    >
      {{ order.code }}
    </span>
    <span class="text-sm" :class="order.code ? 'text-emerald-800' : 'text-slate-600'">
      {{ order.statusText }}
    </span>
    <span v-if="order.reasonText" class="text-sm text-slate-500">{{ order.reasonText }}</span>
  </button>
</template>
