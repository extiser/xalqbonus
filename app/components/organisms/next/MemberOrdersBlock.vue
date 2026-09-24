<script setup lang="ts">
import type { MemberOrderRowView, MemberViewLoad } from '~/types/memberView';

/**
 * «Мои заказы» на главной — `_reference/design/home/orders-block.html` и `orders-block.md`.
 *
 * Короткий срез заказов, за которыми надо идти: все висящие, каждый своей строкой —
 * водители берут по два-три заказа, у них разные сроки и бывают разные офисы.
 * Висящих нет, но заказы были — один последний, спокойной карточкой, и «Все заказы».
 * Заказов не было вовсе — текст, что здесь появится, и без ссылки: в разделе пусто.
 * Блок не прячется, пока водители привыкают к новому боту (Руслан, 23-09-2026).
 * Не загрузилось — заголовок и «Повторить»: отказ запроса не должен выглядеть как отсутствие заказов.
 *
 * Что показывать — решает тот, кто отдаёт `orders`: блок рисует пришедшее.
 */
defineProps<{
  state: MemberViewLoad;
  orders: MemberOrderRowView[];
  texts: {
    title: string;
    all: string;
    empty: string;
    error: string;
    retry: string;
  };
}>();

defineEmits<{ all: []; open: [orderId: string]; retry: [] }>();
</script>

<template>
  <section v-if="state !== 'loading'" class="flex flex-col gap-2.5 px-3.5 pb-5 pt-2">
    <div class="px-1 pb-2 pt-1">
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
        @open="$emit('open', order.id)"
      />
    </template>

    <MoleculesNextMemberNotice v-else-if="state === 'empty'" state="empty" :message="texts.empty" />

    <MoleculesNextMemberNotice v-else state="error" :message="texts.error" :retry-label="texts.retry" @retry="$emit('retry')" />
  </section>
</template>
