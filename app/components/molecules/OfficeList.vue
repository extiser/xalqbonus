<script setup lang="ts">
import type { OfficeContact } from '#shared/types/miniapp';

/**
 * Офисы парка под текстом отказа: название ссылкой на карту, режим работы и телефон.
 *
 * Режим работы показывается всегда и не прячется в мелкий шрифт: у ТТЗ он не круглосуточный,
 * и человек, приехавший туда ночью по совету приложения, приедет зря.
 *
 * Телефон — ссылкой `tel:`: экран живёт в телефоне, и набирать номер глазами здесь незачем.
 */
defineProps<{
  offices: OfficeContact[];
}>();
</script>

<template>
  <ul class="space-y-3">
    <li
      v-for="office in offices"
      :key="office.name"
      class="rounded-2xl border border-slate-200 px-4 py-3"
    >
      <a
        :href="office.mapUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-base font-semibold text-emerald-700 underline underline-offset-2"
      >
        {{ office.name }}
      </a>
      <p class="mt-1 text-sm text-slate-500">{{ office.hours }}</p>
      <a :href="`tel:${office.phone.replace(/\s/g, '')}`" class="mt-1 block text-sm text-slate-700">
        {{ office.phone }}
      </a>
    </li>
  </ul>
</template>
