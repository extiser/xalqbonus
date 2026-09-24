<script setup lang="ts">
/**
 * Крупное число экрана — баланс на главной. Unbounded 62/700.
 *
 * Число приходит готовой строкой, уже в наборе: на главной оно набирается вверх вместе
 * с балансом в липкой шапке, и набор считает тот, кто владеет обоими (`useCountUp`).
 */
defineProps<{ value: string }>();
</script>

<template>
  <span class="font-unbounded text-[62px] font-bold leading-none tracking-[-3px] tabular-nums text-xb-text">
    {{ value }}
  </span>
</template>
