<script setup lang="ts">
/**
 * Раздел экрана: заголовок, примечание под ним и содержимое.
 *
 * Примечание не украшение: разделы этого экрана считают разное разными способами,
 * и без строчки о том, что именно посчитано, числа читаются неверно.
 */
defineProps<{
  title: string;
  note?: string;
}>();
</script>

<template>
  <section class="rounded-lg border border-slate-200 bg-white">
    <header class="border-b border-slate-200 px-4 py-3 sm:px-5">
      <h2 class="text-base font-semibold text-slate-900">{{ title }}</h2>
      <p v-if="note" class="mt-1 text-sm text-slate-500">{{ note }}</p>
    </header>
    <div class="px-4 py-4 sm:px-5">
      <slot />
    </div>
  </section>
</template>
