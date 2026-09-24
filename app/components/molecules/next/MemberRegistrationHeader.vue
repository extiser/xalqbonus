<script setup lang="ts">
/**
 * Шапка экранов регистрации и заглушек: логотип белым слева, справа слот — туда встаёт
 * переключатель языка, где он есть.
 *
 * 50 сверху от края безопасной зоны, 20 по бокам. Строка высотой не меньше 36: логотип
 * и переключатель стоят по её середине, и шапка без переключателя не проседает.
 *
 * Лежит над живым фоном (`z-index: 2`): фон растянут под весь верх экрана.
 */
</script>

<template>
  <div class="relative z-[2] px-5 pt-[calc(50px+env(safe-area-inset-top))]">
    <div class="flex min-h-9 items-center justify-between">
      <AtomsNextMemberLogo size="s" />
      <slot />
    </div>
  </div>
</template>
