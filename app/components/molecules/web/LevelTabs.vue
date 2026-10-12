<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';

/**
 * Вкладки раздела веба — `.levels` в `_reference/design/web/dashboard/02-levers.html`: 14 / 600
 * на фоне плитки, выбранная — на поднятом с циановым контуром 18 %. Уровни дашборда «Деньги ·
 * Рычаги · Глубина» и «Метки · Лендинги» раздела «Промо» (issue #478,
 * `_reference/design/web/promo/04-landings.html`).
 *
 * Вкладка ведёт на свою страницу (`to`); вкладка без адреса видна и не нажимается — так
 * дашборд показывает уровни, которых ещё нет (issue #371). На телефоне вкладки прокручиваются
 * вбок. Подпись группы (`label`) — для читалки экрана.
 */
export type LevelTab = {
  key: string;
  label: string;
  /** Куда ведёт; `null` — вкладка видна и не нажимается. */
  to: RouteLocationRaw | null;
};

defineProps<{
  tabs: readonly LevelTab[];
  current: string;
  label: string;
}>();

const TAB_CLASSES =
  'shrink-0 rounded-full px-4 py-[9px] font-manrope text-[14px] leading-[1.45] font-semibold whitespace-nowrap no-underline';
</script>

<template>
  <nav class="flex gap-1.5 max-web:overflow-x-auto" :aria-label="label">
    <template v-for="tab in tabs" :key="tab.key">
      <span
        v-if="tab.key === current"
        aria-current="page"
        class="bg-web-raised text-web-text inset-ring inset-ring-web-cyan/18"
        :class="TAB_CLASSES"
      >{{ tab.label }}</span>
      <NuxtLink
        v-else-if="tab.to !== null"
        :to="tab.to"
        class="bg-web-tile text-web-title hover:text-web-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
        :class="TAB_CLASSES"
      >{{ tab.label }}</NuxtLink>
      <span v-else aria-disabled="true" class="cursor-default bg-web-tile text-web-title" :class="TAB_CLASSES">{{ tab.label }}</span>
    </template>
  </nav>
</template>
