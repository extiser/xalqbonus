<script setup lang="ts">
import type { Language } from '#shared/types/miniapp';

/**
 * Выбор языка: две кнопки рядом, выбранная подсвечена.
 *
 * Предвыбор приходит снаружи — сервер берёт его из `language_code` в `initData`, — но
 * решением не является: выбранное здесь уезжает в `person_settings` и становится языком,
 * на котором водитель дальше получает всё.
 */
defineProps<{
  modelValue: Language;
  labelRu: string;
  labelUz: string;
}>();

defineEmits<{ 'update:modelValue': [language: Language] }>();

/** Языки в порядке показа. Подписи приходят свойствами — текст живёт на сервере. */
const LANGUAGES = ['ru', 'uz'] as const;
</script>

<template>
  <div class="grid grid-cols-2 gap-3">
    <button
      v-for="language in LANGUAGES"
      :key="language"
      type="button"
      class="rounded-2xl border px-4 py-3 text-base font-medium transition-colors"
      :class="
        modelValue === language
          ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      "
      @click="$emit('update:modelValue', language)"
    >
      {{ language === 'ru' ? labelRu : labelUz }}
    </button>
  </div>
</template>
