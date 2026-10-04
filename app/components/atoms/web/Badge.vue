<script setup lang="ts">
/**
 * Бейдж веба — «цифры условные» в кодексе и на экранах дашборда (`.badge`): 11 / 600,
 * серый на поднятом, полная скруглённость. Пометка о плитке, а не данные, поэтому тише
 * всего остального текста на ней.
 */
defineProps<{
  label: string;
}>();
</script>

<template>
  <span class="inline-block shrink-0 rounded-full bg-web-raised px-2.5 py-1 font-manrope text-[11px] font-semibold whitespace-nowrap text-web-grey">
    {{ label }}
  </span>
</template>
