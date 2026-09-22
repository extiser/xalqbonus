<script setup lang="ts">
/**
 * Строка настройки: название, текущее значение и шеврон — «Язык · Русский ›».
 *
 * Переход, а не переключатель: случайное нажатие не должно выключать все сообщения бота
 * (решение #134). Нажатие отдаётся событием, что за ним открывается — решает экран.
 */
defineProps<{
  label: string;
  value: string;
}>();

defineEmits<{ open: [] }>();
</script>

<template>
  <button
    type="button"
    class="flex min-h-[52px] w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-4 text-left font-manrope text-[15px] font-normal"
    @click="$emit('open')"
  >
    <span class="grow text-xb-text">{{ label }}</span>
    <span class="text-xb-grey">{{ value }}</span>
    <span class="-mr-1">
      <AtomsNextMemberChevron tone="dim" />
    </span>
  </button>
</template>
