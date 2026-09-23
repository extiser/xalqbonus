<script setup lang="ts">
import type { MemberOrderLineView } from '~/types/memberView';

/**
 * Состав заказа: позиции строками и «Итого».
 *
 * Без подложки, строками на фоне: две карточки выше уже держат экран, и третья делала бы его
 * сплошной лестницей блоков. Количество и цена за штуку — второй строкой под названием:
 * на узком экране они иначе ломают название.
 *
 * Итог — обычным цветом и без знака: это ценник заказа, а не событие списания. Списание
 * названо один раз, в карточке заказа.
 */
defineProps<{
  lines: MemberOrderLineView[];
  total: string;
  texts: {
    title: string;
    total: string;
  };
}>();
</script>

<template>
  <div class="flex flex-col">
    <div class="pb-3.5">
      <AtomsNextMemberGroupLabel :label="texts.title" />
    </div>

    <div v-for="line in lines" :key="line.id" class="flex items-baseline gap-3 border-t border-white/6 py-[11px]">
      <span class="min-w-0 grow text-[15px] font-normal leading-[1.3] text-xb-text">
        {{ line.title }}
        <small class="mt-0.5 block text-[13px] font-light text-xb-grey">{{ line.detail }}</small>
      </span>
      <span class="shrink-0 text-[15px] font-semibold tabular-nums text-xb-secondary">{{ line.cost }}</span>
    </div>

    <div class="mt-1 flex items-baseline gap-3 border-t border-white/14 pt-[13px]">
      <span class="grow text-[15px] font-bold text-xb-text">{{ texts.total }}</span>
      <span class="shrink-0 text-[19px] font-bold tabular-nums text-xb-text">{{ total }}</span>
    </div>
  </div>
</template>
