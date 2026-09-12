<script setup lang="ts">
/**
 * Поле формы: подпись, ввод и отказ по этому полю.
 *
 * Подпись обнимает поле элементом `<label>`, а не связывается с ним через `id`:
 * придуманные идентификаторы обязаны быть уникальными на странице, и два одинаковых
 * поля в одной форме однажды этим столкнутся.
 */
type FieldType = 'text' | 'tel' | 'password';

withDefaults(
  defineProps<{
    label: string;
    type: FieldType;
    placeholder?: string;
    autocomplete?: string;
    autofocus?: boolean;
    /** Что не так с этим полем. `null` — всё в порядке. */
    error?: string | null;
    /** Подсказка под полем: правило ввода, а не отказ. */
    hint?: string | null;
  }>(),
  {
    placeholder: undefined,
    autocomplete: undefined,
    autofocus: false,
    error: null,
    hint: null,
  },
);

const model = defineModel<string>({ required: true });
</script>

<template>
  <label class="block">
    <span class="mb-1 block text-sm font-medium text-slate-700">{{ label }}</span>
    <AtomsTextInput
      v-model="model"
      :type="type"
      size="large"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :autofocus="autofocus"
    />
    <span v-if="error" class="mt-1 block text-sm text-red-700">{{ error }}</span>
    <span v-else-if="hint" class="mt-1 block text-sm text-slate-500">{{ hint }}</span>
  </label>
</template>
