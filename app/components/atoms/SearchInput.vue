<script setup lang="ts">
/**
 * Поле поиска. Своего отступа снаружи не получает — расстояние ставит контейнер.
 *
 * Тип `search`, а не `text`: браузер даёт крестик очистки, а на телефоне — клавиатуру
 * с кнопкой поиска вместо перевода строки.
 */
defineProps<{
  placeholder: string;
  label: string;
}>();

const model = defineModel<string>({ required: true });
</script>

<template>
  <input
    v-model="model"
    type="search"
    :placeholder="placeholder"
    :aria-label="label"
    class="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
  />
</template>
