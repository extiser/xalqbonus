<script setup lang="ts">
/**
 * Кнопка главного действия на экране водителя.
 *
 * Крупная и во всю ширину: экран живёт в телефоне, и нажимают её большим пальцем на ходу.
 * Своего отступа снаружи не получает — расстояние до соседей ставит контейнер.
 */
defineProps<{
  label: string;
  /** Пока запрос в пути. Ожиданием ответа Telegram кнопка не гасится — см. страницу `/app`. */
  disabled?: boolean;
}>();

defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    class="w-full rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
    @click="$emit('click')"
  >
    {{ label }}
  </button>
</template>
