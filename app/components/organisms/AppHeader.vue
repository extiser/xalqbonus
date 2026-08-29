<script setup lang="ts">
import { useRoute } from 'vue-router';
import type { NavigationItem } from '~/utils/navigation';

/** Шапка служебной части: имя системы и переходы между экранами. */
defineProps<{
  items: NavigationItem[];
}>();

const route = useRoute();

/**
 * Пункт считается текущим и на вложенных страницах: карточка водителя живёт по адресу
 * `/drivers/<id>`, и шапка, гаснущая при переходе в неё, теряет ответ на вопрос
 * «где я сейчас».
 */
const isCurrent = (path: string): boolean =>
  route.path === path || route.path.startsWith(`${path}/`);
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
      <NuxtLink to="/" class="text-base font-semibold text-slate-900">XalqBonus</NuxtLink>
      <nav class="flex flex-wrap gap-x-4 gap-y-1">
        <NuxtLink
          v-for="item in items"
          :key="item.path"
          :to="item.path"
          class="rounded-md px-2 py-1 text-sm font-medium transition-colors"
          :class="
            isCurrent(item.path)
              ? 'bg-slate-100 text-slate-900'
              : 'text-slate-500 hover:text-slate-900'
          "
        >
          {{ item.title }}
        </NuxtLink>
      </nav>
    </div>
  </header>
</template>
