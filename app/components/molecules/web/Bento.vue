<script setup lang="ts">
/**
 * Сетка плиток веба — `.bento` кодекса `_reference/design/web/codex.html`: 12 колонок, ряд 120,
 * зазор 16. Плитки (`MoleculesWebTile`) встают в порядке разметки, место каждой задаёт её размер.
 *
 * На телефоне, ниже 900, — одна колонка, ряды по содержимому, зазор 12 (кодекс, «Телефон»).
 */
</script>

<template>
  <div class="grid grid-cols-12 auto-rows-[120px] gap-web-gap max-web:grid-cols-1 max-web:auto-rows-auto max-web:gap-3">
    <slot />
  </div>
</template>
