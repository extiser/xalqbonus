<script setup lang="ts">
import type { MemberOrder, MemberOrderTexts } from '#shared/types/miniapp';
import type { LoadState } from '~/types/loadState';

/**
 * «Мои заказы»: висящие сверху с кодом, выданные и отменённые ниже — с датой и причиной.
 *
 * Порядок приходит с сервера готовым: сортировать здесь значило бы завести второе место,
 * где решено, что висящий заказ важнее свежего.
 */
defineProps<{
  state: LoadState;
  orders: MemberOrder[];
  texts: MemberOrderTexts;
}>();

defineEmits<{ open: [order: MemberOrder] }>();
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">{{ texts.ordersTitle }}</h1>

    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="…" />
    <MoleculesStateNotice v-else-if="state === 'error'" state="error" :message="texts.ordersFailed" />
    <MoleculesStateNotice
      v-else-if="orders.length === 0"
      state="empty"
      :message="texts.ordersEmpty"
    />

    <div v-else class="flex flex-col gap-3">
      <MoleculesMemberOrderItem
        v-for="order in orders"
        :key="order.orderId"
        :order="order"
        :points-unit="texts.points"
        @open="$emit('open', order)"
      />
    </div>
  </section>
</template>
