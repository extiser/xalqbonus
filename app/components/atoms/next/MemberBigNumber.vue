<script setup lang="ts">
/**
 * Крупное число экрана — баланс на главной. Unbounded 62/700.
 *
 * Число приходит готовой строкой, уже в наборе: на главной оно набирается вверх вместе
 * с балансом в липкой шапке, и набор считает тот, кто владеет обоими (`useCountUp`).
 *
 * Золотой тон со свечением — обещание, а не баланс: «+300» на слайде приветственного бонуса
 * (`_reference/design/home/main-screen-welcome.html`, `.amount.gold`).
 */
withDefaults(defineProps<{ value: string; tone?: 'default' | 'gold' }>(), { tone: 'default' });
</script>

<template>
  <span
    class="font-unbounded text-[62px] font-bold leading-none tracking-[-3px] tabular-nums"
    :class="tone === 'gold' ? 'text-[#FFE7B4] [text-shadow:0_0_24px_rgba(255,199,92,0.35)]' : 'text-xb-text'"
  >
    {{ value }}
  </span>
</template>
