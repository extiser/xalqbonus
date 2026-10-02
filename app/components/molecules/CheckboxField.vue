<script setup lang="ts">
/**
 * Галочка с подписью справа — у вопроса и варианта опроса (issue #320, #335).
 *
 * Подпись обнимает поле `<label>`, как у `FormField`: нажатие по слову ставит галочку.
 */
defineProps<{
  label: string;
}>();

const checked = defineModel<boolean>({ required: true });
</script>

<template>
  <label class="flex items-center gap-2">
    <input
      v-model="checked"
      type="checkbox"
      class="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
    />
    <span class="text-sm text-slate-900">{{ label }}</span>
  </label>
</template>
