<script setup lang="ts">
import type { OfficeOrder } from '#shared/types/orders';
import type { LoadState } from '~/types/loadState';
import { formatNumber } from '~/utils/format';

/**
 * Висящие заказы офиса под полем кода — на случай, если водитель код не помнит.
 *
 * Сотрудник находит заказ по номеру и имени, и заказ открывается той же карточкой, что по коду.
 * Три состояния нарисованы: «висящих нет» и «список не прочитался» у стойки значат разное.
 */
defineProps<{
  state: LoadState;
  orders: OfficeOrder[];
}>();

defineEmits<{ open: [order: OfficeOrder] }>();
</script>

<template>
  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Ждут выдачи</h2>

    <p v-if="state === 'loading'" class="py-4 text-sm text-slate-500">Читаем заказы…</p>
    <p v-else-if="state === 'error'" class="py-4 text-sm text-red-700">
      Список заказов не прочитался. Это отказ запроса, а не отсутствие заказов.
    </p>
    <p v-else-if="orders.length === 0" class="py-4 text-sm text-slate-500">
      Висящих заказов в этом офисе нет.
    </p>

    <ul v-else class="flex flex-col divide-y divide-slate-100">
      <li v-for="order in orders" :key="order.orderId">
        <button
          type="button"
          class="flex w-full items-baseline gap-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          @click="$emit('open', order)"
        >
          <span class="shrink-0 text-base font-semibold tabular-nums">№ {{ order.number }}</span>
          <span class="flex-1 truncate text-base">
            {{ order.driverName ?? '—' }}
            <span v-if="order.callsign" class="text-sm text-slate-500"> · {{ order.callsign }}</span>
          </span>
          <span class="shrink-0 text-sm text-slate-600 tabular-nums">
            {{ formatNumber(order.totalPoints) }}
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>
