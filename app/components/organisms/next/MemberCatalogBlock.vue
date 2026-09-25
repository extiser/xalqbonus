<script setup lang="ts">
import type { MemberProductView, MemberViewLoad } from '~/types/memberView';

/**
 * «Каталог» на главной — `_reference/design/catalog/catalog-block.html` и `catalog-block.md`.
 *
 * Часть каталога, а не весь он: четыре плитки, товары со скидкой первыми. Плитка та же, что
 * на витрине, только без остатка и счётчика — офис на главной не выбран. Нажатие по плитке
 * ведёт в каталог без офиса, прокрученный к этому товару, «Весь каталог» — в тот же каталог
 * сверху (issue #234). Шапка и отступы — как у «Моих заказов» и «Моих наград».
 *
 * В каталоге пусто — блок не прячется, а говорит, что здесь появится, и без «Весь каталог»:
 * там тоже пусто. Не загрузилось — текст и «Повторить», как в соседних блоках.
 */
defineProps<{
  state: MemberViewLoad;
  products: MemberProductView[];
  texts: {
    title: string;
    all: string;
    /** Слово на пилюле скидки: «SALE». */
    sale: string;
    empty: string;
    error: string;
    retry: string;
  };
}>();

defineEmits<{ all: []; open: [productId: string]; retry: [] }>();
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

    <div v-if="state === 'ready'" class="grid grid-cols-2 gap-x-4 gap-y-[22px]">
      <MoleculesNextMemberProductTile
        v-for="product in products"
        :key="product.id"
        mode="home"
        :product="product"
        :texts="{ sale: texts.sale }"
        @open="$emit('open', product.id)"
      />
    </div>

    <MoleculesNextMemberNotice v-else-if="state === 'empty'" state="empty" :message="texts.empty" />

    <MoleculesNextMemberNotice v-else state="error" :message="texts.error" :retry-label="texts.retry" @retry="$emit('retry')" />
  </section>
</template>
