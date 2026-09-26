<script setup lang="ts">
/**
 * «Обновить» у списка «Ждут выдачи» на стойке (решение Руслана 26-09-2026, прогон #253).
 *
 * Пилюля 36 с зелёным контуром — цвет ждущего заказа: список про то, что ждёт выдачи.
 * Слева круговая стрелка. Пока список перечитывается (`busy`), пилюля гаснет до 55 % и стрелка
 * крутится; строки под ней стоят до ответа — это решает родитель.
 */
defineProps<{
  busy: boolean;
}>();

defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    :disabled="busy"
    class="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[rgba(95,208,138,0.45)] bg-[rgba(34,184,102,0.10)] px-3.5 font-manrope text-[14px] font-semibold text-xb-green transition-opacity disabled:cursor-default disabled:opacity-55"
    @click="$emit('click')"
  >
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      class="shrink-0"
      :class="busy ? 'staff-refresh-spin' : ''"
    >
      <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      <path d="M20 4.5v4h-4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    Обновить
  </button>
</template>

<style scoped>
/* Оборот 0.8 с — как кольцо ожидания в кнопках (`MemberButton`). */
.staff-refresh-spin {
  animation: staff-refresh-spin 0.8s linear infinite;
}

@keyframes staff-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .staff-refresh-spin {
    animation: none;
  }
}
</style>
