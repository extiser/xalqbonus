<script setup lang="ts">
import type { MemberOffice } from '#shared/types/miniapp';

/**
 * Офис в списке выбора: название, адрес и часы — нажатием, карта и телефон — ссылками.
 *
 * Ссылки стоят отдельно от нажимаемой части, а не внутри неё: ссылка внутри кнопки —
 * это два действия на одно касание, и открыть карту, не уйдя в витрину, стало бы нельзя.
 * Карта открывается наружу: в Mini App своей карты нет.
 */
defineProps<{
  office: MemberOffice;
  mapLabel: string;
}>();

defineEmits<{ select: [] }>();
</script>

<template>
  <article class="rounded-2xl border border-slate-200">
    <button
      type="button"
      class="block w-full rounded-2xl px-4 pt-3 pb-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      @click="$emit('select')"
    >
      <span class="block text-base font-semibold text-slate-900">{{ office.name }}</span>
      <span class="mt-0.5 block text-sm text-slate-600">{{ office.address }}</span>
      <!-- Часы не прячутся: приехать в закрытый офис по совету приложения — худший исход. -->
      <span v-if="office.workHours" class="mt-0.5 block text-sm text-slate-500">
        {{ office.workHours }}
      </span>
    </button>

    <div
      v-if="office.mapUrl || office.phone || office.telegram"
      class="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-sm"
    >
      <a
        v-if="office.mapUrl"
        :href="office.mapUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="font-medium text-emerald-700 underline underline-offset-2"
      >
        {{ mapLabel }}
      </a>
      <a v-if="office.phone" :href="`tel:${office.phone}`" class="text-slate-700">
        {{ office.phone }}
      </a>
      <span v-if="office.telegram" class="text-slate-700">{{ office.telegram }}</span>
    </div>
  </article>
</template>
