<script setup lang="ts">
/**
 * Отметка свежести данных: «Обновлено в 14:26», «Поездки учтены до 22.09, 14:31».
 *
 * Самая тихая строка экрана — 13/200 серым (шкала шрифтов): она отвечает на вопрос
 * «почему последней поездки нет», и задают его редко, но в одном и том же месте.
 */
defineProps<{ text: string }>();
</script>

<template>
  <span class="block text-[13px] font-extralight tracking-[0.2px] text-xb-grey">{{ text }}</span>
</template>
