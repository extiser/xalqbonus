<script setup lang="ts">
/** Кнопка листания. Своего отступа снаружи не получает — расстояние ставит контейнер. */
defineProps<{
  label: string;
  disabled: boolean;
}>();

defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
    :disabled="disabled"
    @click="$emit('click')"
  >
    {{ label }}
  </button>
</template>
