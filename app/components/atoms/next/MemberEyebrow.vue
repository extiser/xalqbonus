<script setup lang="ts">
/**
 * Надпись над крупным числом: «Ваши баллы», «Сегодня».
 *
 * Капсом и в разрядку, светлее подписи группы: она читается вместе с числом под ней
 * и не должна проваливаться рядом с ним.
 */
defineProps<{ label: string }>();
</script>

<template>
  <span class="text-[12px] font-semibold uppercase tracking-[1.4px] text-xb-light">{{ label }}</span>
</template>
