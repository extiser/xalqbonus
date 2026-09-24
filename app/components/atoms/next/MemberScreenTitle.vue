<script setup lang="ts">
/**
 * Заголовок экрана регистрации и заглушки — Manrope 28/800, а не Unbounded: длинный заголовок
 * с названием «XalqTaxi BonusBot» в широком Unbounded не читался.
 *
 * `primary` — главный язык экрана, крупно и белым. `secondary` — второй язык на двуязычных
 * экранах (шаг 1, заглушки): 21/700 серым, чтобы два заголовка не спорили.
 *
 * Перенос строки в тексте сохраняется: в приветствии шага 1 название стоит своей строкой.
 */
type TitleTone = 'primary' | 'secondary';

defineProps<{
  text: string;
  tone: TitleTone;
}>();
</script>

<template>
  <!-- Текст вплотную к тегам: при `pre-line` перенос вокруг него стал бы пустой строкой. -->
  <h1 v-if="tone === 'primary'" class="m-0 whitespace-pre-line text-[28px] font-extrabold leading-[1.28] tracking-normal text-xb-text">{{ text }}</h1>
  <h2 v-else class="m-0 whitespace-pre-line text-[21px] font-bold leading-[1.32] tracking-[0.1px] text-xb-light">{{ text }}</h2>
</template>
