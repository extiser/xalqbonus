<script setup lang="ts">
import { SERVICE_NAVIGATION } from '~/utils/navigation';

/** Раскладка служебных экранов: шапка сверху, содержимое колонкой под ней. */
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <OrganismsAppHeader :items="SERVICE_NAVIGATION" />
    <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <slot />
    </main>
  </div>
</template>
