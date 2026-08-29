<script setup lang="ts">
/** Кнопка отправки формы. Своего отступа снаружи не получает — расстояние ставит контейнер. */
defineProps<{
  label: string;
}>();
</script>

<template>
  <button
    type="submit"
    class="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
  >
    {{ label }}
  </button>
</template>
