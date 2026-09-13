<script setup lang="ts">
/**
 * Многострочный ввод: описание товара, заметка к правке остатка.
 *
 * Высота задана строками, а не пикселями: поле должно вмещать ту мысль, ради которой
 * оно многострочное, и растягиваться дальше — работа браузера, а не наша.
 */
withDefaults(
  defineProps<{
    rows?: number;
    placeholder?: string;
    ariaLabel?: string;
    required?: boolean;
  }>(),
  { rows: 3, placeholder: undefined, ariaLabel: undefined, required: false },
);

const model = defineModel<string>({ required: true });
</script>

<template>
  <textarea
    v-model="model"
    :rows="rows"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :required="required"
    class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
  />
</template>
