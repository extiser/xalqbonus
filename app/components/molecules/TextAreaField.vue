<script setup lang="ts">
/** Многострочное поле формы: подпись, ввод и подсказка под ним. */
withDefaults(
  defineProps<{
    label: string;
    rows?: number;
    placeholder?: string;
    required?: boolean;
    hint?: string | null;
  }>(),
  { rows: 3, placeholder: undefined, required: false, hint: null },
);

const model = defineModel<string>({ required: true });
</script>

<template>
  <label class="block">
    <span class="mb-1 block text-sm font-medium text-slate-700">{{ label }}</span>
    <AtomsTextArea v-model="model" :rows="rows" :placeholder="placeholder" :required="required" />
    <span v-if="hint" class="mt-1 block text-sm text-slate-500">{{ hint }}</span>
  </label>
</template>
