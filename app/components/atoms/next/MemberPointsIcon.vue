<script setup lang="ts">
/**
 * Знак балла — гранат (`product/design/pomegranate.svg`).
 *
 * Рисуется цветом текста вокруг (`currentColor`): штатный цвет знака — гранатовый, но рядом
 * с золотой суммой или на белой карточке награды он берёт цвет своей строки, и второй
 * файл под каждый цвет не нужен.
 */
withDefaults(
  defineProps<{
    /** Сторона квадрата в пикселях. Знак читается от 16. */
    size?: number;
  }>(),
  { size: 16 },
);
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="shrink-0">
    <ellipse cx="12" cy="14.6" rx="7.6" ry="7.1" fill="currentColor" />
    <path
      d="M9.4 8.4 C10.5 7.7 10.8 6.7 10.6 5.9 C10.1 5.0 9.1 4.3 7.7 3.7 L10.0 4.1 L10.2 2.4 L11.35 3.8 L12 1.7 L12.65 3.8 L13.8 2.4 L14.0 4.1 L16.3 3.7 C14.9 4.3 13.9 5.0 13.4 5.9 C13.2 6.7 13.5 7.7 14.6 8.4 Z"
      fill="currentColor"
    />
  </svg>
</template>
