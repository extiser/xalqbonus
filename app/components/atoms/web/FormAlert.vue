<script setup lang="ts">
import { PhWarningCircle } from '@phosphor-icons/vue';

/**
 * Ошибка не про одно поле — сеть, сервер, отказ Telegram — алой плашкой над полями формы
 * (`codex.md`, «Формы — решено»): 14 / 500, скругление 14, подложка алого 10 %, контур 40 %,
 * значок `warning-circle`. Текст — из словаря отказов, его прислал сервер.
 *
 * Отступ от соседей ставит форма.
 */
defineProps<{
  text: string;
}>();
</script>

<template>
  <p
    role="alert"
    class="m-0 flex items-start gap-2 rounded-[14px] bg-web-scarlet/10 px-4 py-3 font-manrope text-[14px] leading-[1.45] font-medium text-web-scarlet inset-ring inset-ring-web-scarlet/40"
  >
    <PhWarningCircle weight="duotone" aria-hidden="true" class="mt-0.5 size-[18px] shrink-0" />{{ text }}
  </p>
</template>
