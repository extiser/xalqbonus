<script setup lang="ts">
import type { MemberOrderRowView, MemberViewLoad } from '~/types/memberView';

/**
 * «Мои заказы» на главной — `product/design/artboard/orders-block.html`.
 *
 * Короткий срез заказов, за которыми надо идти: только висящие, каждый своей строкой —
 * водители берут по два-три заказа, у них разные сроки и бывают разные офисы.
 * Нет висящих — блока нет вовсе: звать некуда. Не загрузилось — заголовок и «Повторить»:
 * отказ запроса не должен выглядеть как отсутствие заказов.
 */
defineProps<{
  state: MemberViewLoad;
  orders: MemberOrderRowView[];
  texts: {
    title: string;
    all: string;
    error: string;
    retry: string;
  };
}>();

defineEmits<{ all: []; open: [orderId: string]; retry: [] }>();
</script>

<template>
  <section v-if="state === 'ready' || state === 'error'" class="flex flex-col gap-2.5 px-3.5 pb-5 pt-2">
    <div class="px-1 py-1">
      <MoleculesNextMemberBlockHead
        :title="texts.title"
        :link-label="state === 'ready' ? texts.all : undefined"
        @open="$emit('all')"
      />
    </div>

    <template v-if="state === 'ready'">
      <MoleculesNextMemberOrderRow
        v-for="order in orders"
        :key="order.id"
        :order="order"
        variant="compact"
        @open="$emit('open', order.id)"
      />
    </template>

    <MoleculesNextMemberNotice v-else state="error" :message="texts.error" :retry-label="texts.retry" @retry="$emit('retry')" />
  </section>
</template>
