<script setup lang="ts">
/**
 * Шеврон «вперёд» — у ссылок в шапках блоков, у карточек, которые открываются,
 * и у строк настроек.
 *
 * Цвет у шеврона свой по смыслу строки, а не общий: зелёный зовёт за кодом, золотой
 * повторяет подарок, синий ведёт наружу, в карту. Значение `tone`, а не класс снаружи.
 */
type ChevronTone = 'light' | 'grey' | 'dim' | 'muted' | 'green' | 'gold' | 'amber' | 'blue';

withDefaults(
  defineProps<{
    tone?: ChevronTone;
    size?: number;
  }>(),
  { tone: 'light', size: 16 },
);

const TONE_CLASSES: Record<ChevronTone, string> = {
  light: 'text-xb-light',
  grey: 'text-xb-grey',
  dim: 'text-[#6B7483]',
  muted: 'text-[#626A77]',
  green: 'text-xb-green',
  gold: 'text-xb-gold-light',
  amber: 'text-xb-gold',
  blue: 'text-xb-map',
};
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    class="shrink-0"
    :class="TONE_CLASSES[tone]"
  >
    <path
      d="M9.5 5.5l6.5 6.5-6.5 6.5"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
