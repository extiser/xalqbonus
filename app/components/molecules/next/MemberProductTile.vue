<script setup lang="ts">
import { computed } from 'vue';
import type { MemberProductView } from '~/types/memberView';

/**
 * Плитка товара, вариант 2 — `_reference/design/catalog/catalog-showcase.html` (`.grid.v2 .tile`),
 * на главной — `catalog-block.html`.
 *
 * Фото на светлой подложке `xb-photo`: фото приходят на белом, и умножение растворяет белый
 * в подложке; у товара без фото — одна подложка, без картинки (issue #218). Сверху на фото
 * пилюли — скидка слева, остаток справа. Под фото цена первой строкой, старая зачёркнутая
 * справа от новой, и под ней название во всю ширину, до трёх строк.
 *
 * Название срезается по 30 символов с многоточием (Руслан, 24-09-2026): длинные названия
 * иначе растягивают плитку. Три строки — страховка сверх этого. Полное название видно
 * в подтверждении заказа.
 *
 * Два вида. `showcase` — на витрине: остаток на фото и счётчик внизу; счётчик прижат к низу
 * плитки, чтобы в ряду с названиями разной длины кнопки стояли на одной линии. `home` —
 * в блоке на главной: офис там не выбран, поэтому ни остатка, ни счётчика — вся плитка
 * нажимается и ведёт в каталог.
 */
type TileMode = 'showcase' | 'home';

const NAME_LIMIT = 30;

const props = defineProps<{
  mode: TileMode;
  product: MemberProductView;
  texts: {
    /** Слово на пилюле скидки: «SALE». */
    sale: string;
    /** Подписи кнопок счётчика — только на витрине. */
    stepper?: {
      decrease: string;
      /** «Добавить» — у невыбранного. */
      increase: string;
      /** «Добавить ещё» — у выбранного. */
      increaseMore: string;
    };
  };
}>();

defineEmits<{ open: []; inc: []; dec: [] }>();

const name = computed(() =>
  props.product.name.length > NAME_LIMIT ? `${props.product.name.slice(0, NAME_LIMIT).trimEnd()}…` : props.product.name,
);

const count = computed(() => props.product.count ?? 0);
</script>

<template>
  <component
    :is="mode === 'home' ? 'button' : 'div'"
    :type="mode === 'home' ? 'button' : undefined"
    class="flex min-w-0 flex-col gap-2.5 font-manrope leading-[normal] text-xb-text"
    :class="mode === 'home' ? 'cursor-pointer border-0 bg-transparent p-0 text-left' : ''"
    @click="mode === 'home' && $emit('open')"
  >
    <div class="relative aspect-[9/10] overflow-hidden rounded-[24px] bg-xb-photo">
      <img v-if="product.image" :src="product.image" alt="" class="absolute left-[8%] top-[13%] block h-[80%] w-[84%] object-contain mix-blend-multiply" />
      <div class="member-product-tile-pills absolute flex justify-between">
        <AtomsNextMemberTilePill v-if="product.discount" kind="sale" :label="product.discount" :word="texts.sale" />
        <span v-else />
        <AtomsNextMemberTilePill v-if="mode === 'showcase' && product.stock" kind="stock" :label="product.stock" />
        <span v-else />
      </div>
    </div>

    <div class="flex flex-col gap-1 px-1">
      <div class="flex items-baseline gap-2">
        <span class="flex items-center gap-[3px] text-[20px] font-extrabold leading-[1.1] tracking-[-0.3px] tabular-nums">
          <span class="relative top-[2px] flex text-xb-garnet"><AtomsNextMemberPointsIcon :size="15" /></span>
          {{ product.price }}
        </span>
        <s v-if="product.oldPrice" class="text-[12px] font-medium text-xb-grey">{{ product.oldPrice }}</s>
      </div>
      <div class="line-clamp-3 min-w-0 text-[14px] font-medium leading-[1.3] [overflow-wrap:anywhere]">{{ name }}</div>
    </div>

    <div v-if="mode === 'showcase' && texts.stepper" class="mt-auto">
      <AtomsNextMemberQtyStepper
        size="tile"
        :count="count"
        :max="product.available"
        :texts="{ decrease: texts.stepper.decrease, increase: count > 0 ? texts.stepper.increaseMore : texts.stepper.increase }"
        @inc="$emit('inc')"
        @dec="$emit('dec')"
      />
    </div>
  </component>
</template>

<style scoped>
/* Пилюли — 10 от краёв фото, до 360 px — 8: пилюли там мельче. */
.member-product-tile-pills {
  top: 10px;
  left: 10px;
  right: 10px;
}

@media (max-width: 360px) {
  .member-product-tile-pills {
    top: 8px;
    left: 8px;
    right: 8px;
  }
}
</style>
