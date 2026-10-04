<script setup lang="ts">
/**
 * Заголовок страницы веба — роль «Заголовок страницы» кодекса: Unbounded 26 / 700, один
 * на страницу. Unbounded на вебе — только числа и этот заголовок.
 */
defineProps<{
  label: string;
}>();
</script>

<template>
  <h1 class="m-0 font-unbounded text-[26px] leading-[1.1] font-bold text-web-text">{{ label }}</h1>
</template>
