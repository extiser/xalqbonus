<script setup lang="ts">
/**
 * Подложка-список: закруглённая карточка, строки внутри отбиты тонкой линией.
 *
 * Линии между строками рисует сама карточка, а не строки: строка не знает, первая она
 * или нет, и одна и та же строка стоит и под шапкой человека, и первой в группе настроек.
 */
</script>

<template>
  <div class="divide-y divide-white/6 overflow-hidden rounded-[20px] border border-white/9 bg-xb-card">
    <slot />
  </div>
</template>
