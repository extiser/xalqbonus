<script setup lang="ts">
/**
 * Кнопка действия в плитке веба — «Сделать сегмент», «Задать», «Список» на экранах дашборда
 * (`.btn` в `_reference/design/web/dashboard/02-levers.html`).
 *
 * Высота 36, текст циан 13 / 600, подложка циан 12 %, контур циан 45 % (`codex.md`, «Кнопка
 * действия в плитке»): залитая циановая слишком яркая, а на тёмной подложке кнопку не видно.
 *
 * Ведёт адресом (`to`) — тогда это ссылка, иначе кнопка с событием `click`. В плитке со входом
 * (`to` у плитки) её не ставят: плитка нажимается целиком, и кнопка в ссылке — ошибка разметки.
 */
defineProps<{
  label: string;
  to?: string;
}>();

defineEmits<{ click: [] }>();

const CLASSES =
  'inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full bg-web-cyan/12 px-4 font-manrope text-[13px] font-semibold whitespace-nowrap text-web-cyan no-underline inset-ring inset-ring-web-cyan/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan';
</script>

<template>
  <NuxtLink v-if="to" :to="to" :class="CLASSES">{{ label }}</NuxtLink>
  <button v-else type="button" :class="CLASSES" @click="$emit('click')">{{ label }}</button>
</template>
