<script setup lang="ts">
import type { MemberLineView } from '~/types/memberView';

/**
 * Состав: подпись группы, строки состава и «Сумма» — `_reference/design/orders/order-screen.html`
 * (`.lines`, `.total`). На экране заказа — «Состав заказа», на экране награды — «Награда».
 *
 * Без подложки, строками на фоне: две карточки выше уже держат экран, и третья делала бы его
 * сплошной лестницей блоков.
 *
 * Итог — белым и без знака минус: это ценник заказа, а не событие списания. Списание названо
 * один раз, в карточке заказа. У произвольной награды цены нет — нет и итога.
 */
defineProps<{
  lines: MemberLineView[];
  /** Итог числом: «900». Нет — строки «Сумма» нет. */
  total?: string;
  texts: {
    title: string;
    total: string;
  };
}>();
</script>

<template>
  <div class="flex flex-col leading-[normal]">
    <div class="pb-3.5">
      <AtomsNextMemberGroupLabel :label="texts.title" />
    </div>

    <MoleculesNextMemberLineRow
      v-for="line in lines"
      :key="line.id"
      :title="line.title"
      :caption="line.caption"
      :image="line.image"
      :price="line.price"
      :old-price="line.oldPrice"
      :icon="line.icon"
    />

    <div v-if="total" class="mt-1 flex items-baseline gap-3 border-t border-white/14 pt-[13px]">
      <span class="grow text-[15px] font-bold text-xb-text">{{ texts.total }}</span>
      <span class="inline-flex shrink-0 items-center gap-1 text-[19px] font-bold tabular-nums text-xb-text">
        <span class="relative top-px flex text-xb-garnet"><AtomsNextMemberPointsIcon :size="16" /></span>
        {{ total }}
      </span>
    </div>
  </div>
</template>
