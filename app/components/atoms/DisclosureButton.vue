<script setup lang="ts">
/** Кнопка раскрытия строки: подпись и стрелка, повёрнутая по состоянию. */
defineProps<{
  label: string;
  expanded: boolean;
}>();

defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
    :aria-expanded="expanded"
    @click="$emit('toggle')"
  >
    <span
      class="inline-block transition-transform"
      :class="expanded ? 'rotate-90' : 'rotate-0'"
      aria-hidden="true"
    >
      ›
    </span>
    {{ label }}
  </button>
</template>
