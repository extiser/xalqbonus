<script setup lang="ts">
/**
 * Баланс в шапке: «Ваши баллы» серым над числом с гранатом — `_reference/design/home/catalog-bar.html`.
 *
 * Один на два места: справа в шапке раздела и в липкой шапке главной — CSS у них совпадает
 * побайтно. Подпись над числом — чтобы число не читалось как цена или сумма заказа.
 *
 * Число приходит готовой строкой, «1 450»: на главной оно набирается вместе с крупным,
 * и набор считает тот, кто владеет крупным числом.
 */
defineProps<{
  label: string;
  amount: string;
}>();
</script>

<template>
  <span class="flex shrink-0 flex-col items-end gap-px font-manrope">
    <span class="text-[12px] font-normal text-xb-grey">{{ label }}</span>
    <span class="flex items-center gap-1 text-[17px] font-bold tabular-nums text-xb-text">
      <span class="flex text-xb-garnet"><AtomsNextMemberPointsIcon :size="15" /></span>
      {{ amount }}
    </span>
  </span>
</template>
