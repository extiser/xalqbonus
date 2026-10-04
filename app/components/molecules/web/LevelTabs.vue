<script setup lang="ts">
/**
 * Вкладки уровней дашборда «Деньги · Рычаги · Глубина» — `.levels` в
 * `_reference/design/web/dashboard/02-levers.html`: 14 / 600 на фоне плитки, выбранная —
 * на поднятом с циановым контуром 18 %.
 *
 * Уровень ведёт на свою страницу `/dashboard/{уровень}`, если он уже сделан (`available`);
 * несделанный виден и не нажимается — дашборд строится срезами (issue #371). На телефоне
 * вкладки прокручиваются вбок.
 */
export type DashboardLevel = 'money' | 'levers' | 'depth';

defineProps<{
  current: DashboardLevel;
  available: readonly DashboardLevel[];
}>();

const LEVELS: readonly { key: DashboardLevel; label: string }[] = [
  { key: 'money', label: 'Деньги' },
  { key: 'levers', label: 'Рычаги' },
  { key: 'depth', label: 'Глубина' },
];

const TAB_CLASSES =
  'shrink-0 rounded-full px-4 py-[9px] font-manrope text-[14px] leading-[1.45] font-semibold whitespace-nowrap no-underline';
</script>

<template>
  <nav class="flex gap-1.5 max-web:overflow-x-auto" aria-label="Уровни дашборда">
    <template v-for="level in LEVELS" :key="level.key">
      <span
        v-if="level.key === current"
        aria-current="page"
        class="bg-web-raised text-web-text inset-ring inset-ring-web-cyan/18"
        :class="TAB_CLASSES"
      >{{ level.label }}</span>
      <NuxtLink
        v-else-if="available.includes(level.key)"
        :to="`/dashboard/${level.key}`"
        class="bg-web-tile text-web-title hover:text-web-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
        :class="TAB_CLASSES"
      >{{ level.label }}</NuxtLink>
      <span v-else aria-disabled="true" class="cursor-default bg-web-tile text-web-title" :class="TAB_CLASSES">{{ level.label }}</span>
    </template>
  </nav>
</template>
