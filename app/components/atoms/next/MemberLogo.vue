<script setup lang="ts">
/**
 * Логотип Xalq Taxi белым, без подложки — шапка экранов регистрации и заглушек, центр загрузки.
 *
 * `s` — 68 по ширине, в шапке слева. `l` — 96, по центру экрана загрузки. Высота идёт
 * от картинки: знак и надпись не сплющиваются.
 */
type LogoSize = 's' | 'l';

defineProps<{ size: LogoSize }>();

const SIZE_CLASSES: Record<LogoSize, string> = {
  s: 'w-[68px]',
  l: 'w-24',
};
</script>

<template>
  <img src="/design/xalq-taxi-logo-white.png" alt="Xalq Taxi" class="block h-auto" :class="SIZE_CLASSES[size]" />
</template>
