<script setup lang="ts">
/**
 * Уточнение — роль кодекса веба: Manrope 13 / 300, высота строки 1,4, серый. Откуда цифра
 * и когда посчитана: «Посчитано сегодня в 05:00». Вид — `.t-sub` в
 * `_reference/design/web/dashboard/01-money.html`; прижать его к низу плитки — дело того,
 * кто собирает плитку.
 */
defineProps<{
  text: string;
}>();
</script>

<template>
  <p class="m-0 font-manrope text-[13px] leading-[1.4] font-light text-web-grey">{{ text }}</p>
</template>
