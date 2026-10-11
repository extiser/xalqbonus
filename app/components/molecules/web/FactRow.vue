<script setup lang="ts">
/**
 * Ряд «название — значение» в плитке — `.kv` карточки заявки (issue #471, `02-card.html`):
 * название слева серым 14 / 400, значение справа 14 / 500, ряд от 40 с тонкой чертой сверху,
 * у первого ряда черты нет. Значение — слотом: рядом с ним встаёт кнопка «скопировать» или
 * код метки серым.
 *
 * Ставится внутри `<dl>`: ряд — группа `<div>` из `<dt>` и `<dd>`.
 */
defineProps<{
  label: string;
}>();
</script>

<template>
  <div class="flex min-h-10 items-center justify-between gap-4 border-t border-web-line py-1.5 font-manrope text-[14px] first:border-t-0">
    <dt class="shrink-0 font-normal text-web-grey">{{ label }}</dt>
    <dd class="m-0 flex min-w-0 flex-wrap items-center justify-end gap-x-1 text-right font-medium text-web-text">
      <slot />
    </dd>
  </div>
</template>
