<script setup lang="ts">
import type { StaffDateView } from '~/types/staffView';

/**
 * Сроки под карточкой заказа и награды — `_reference/design/staff/03-order-card.html`, `.dates`
 * (issue #250): «Оформлен» и «Забрать до», «Вручена» и «Забрать до». Строками профиля, без
 * подложки: это справка, а не поле для сверки.
 */
defineProps<{
  dates: StaffDateView[];
}>();
</script>

<template>
  <div class="flex flex-col gap-1.5 px-0.5 pt-3.5 font-manrope text-[14px] leading-[normal]">
    <div v-for="date in dates" :key="date.label" class="flex justify-between">
      <span class="font-normal text-xb-grey">{{ date.label }}</span>
      <b class="font-semibold tabular-nums text-xb-text">{{ date.value }}</b>
    </div>
  </div>
</template>
