<script setup lang="ts">
/**
 * Числовое поле формы: подпись, ввод и подсказка под ним.
 *
 * Устроено как `FormField` и по той же причине обнимает поле элементом `<label>`,
 * а не связывается с ним через `id`: придуманные идентификаторы обязаны быть уникальными
 * на странице, и две одинаковые формы на одном экране однажды этим столкнутся.
 */
withDefaults(
  defineProps<{
    label: string;
    min?: number;
    max?: number;
    placeholder?: string;
    required?: boolean;
    /** Правило ввода, а не отказ: «строго больше нуля», «в сумах». */
    hint?: string | null;
  }>(),
  { min: 0, max: undefined, placeholder: undefined, required: false, hint: null },
);

const model = defineModel<string>({ required: true });
</script>

<template>
  <label class="block">
    <span class="mb-1 block text-sm font-medium text-slate-700">{{ label }}</span>
    <AtomsNumberInput
      v-model="model"
      :min="min"
      :max="max"
      :placeholder="placeholder"
      :required="required"
    />
    <span v-if="hint" class="mt-1 block text-sm text-slate-500">{{ hint }}</span>
  </label>
</template>
