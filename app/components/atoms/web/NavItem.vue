<script setup lang="ts">
import type { Component } from 'vue';

/**
 * Пункт меню веба — `.nav` кодекса `_reference/design/web/codex.html` («Каркас» и «Телефон»).
 *
 * На ноутбуке — строка: значок 20 слева от подписи 14 / 500, текущий пункт на поднятой подложке.
 * На телефоне, ниже 900, — столбик в панели внизу: значок 24 над подписью 11, ширина от 68,
 * текущий — циан без подложки (`codex.md`, «Раскладка и меню»).
 *
 * Значок — компонент Phosphor из пункта навигации, вес duotone: контур и заливка формы на 20 %
 * того же цвета.
 *
 * Место под счётчик заведено, а что он считает — не решено,
 * поэтому сейчас его никто не передаёт и в навигации поля под него нет.
 */
withDefaults(
  defineProps<{
    icon: Component;
    title: string;
    to: string;
    current: boolean;
    count?: number;
  }>(),
  { count: undefined },
);
</script>

<template>
  <NuxtLink
    :to="to"
    :aria-current="current ? 'page' : undefined"
    class="relative flex items-center gap-3 rounded-[14px] px-3 py-[11px] font-manrope text-[14px] font-medium whitespace-nowrap no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-web-cyan max-web:min-w-[68px] max-web:flex-none max-web:flex-col max-web:gap-1 max-web:rounded-[18px] max-web:px-1.5 max-web:pt-2 max-web:pb-1.5 max-web:text-[11px]"
    :class="current ? 'bg-web-raised text-web-text max-web:bg-transparent max-web:text-web-cyan' : 'text-web-title'"
  >
    <component
      :is="icon"
      weight="duotone"
      aria-hidden="true"
      class="size-5 shrink-0 max-web:size-6"
      :class="current ? 'text-web-cyan' : 'text-web-grey'"
    />
    {{ title }}
    <span
      v-if="count !== undefined"
      class="ml-auto rounded-full bg-web-cyan px-2 py-0.5 text-[11px] leading-[1.45] font-semibold text-web-page max-web:absolute max-web:top-[3px] max-web:left-[calc(50%+6px)] max-web:ml-0 max-web:px-1.5 max-web:py-px max-web:text-[10px]"
    >
      {{ count }}
    </span>
  </NuxtLink>
</template>
