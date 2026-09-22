<script setup lang="ts">
import type { MemberOperationView } from '~/types/memberView';

/**
 * Строка истории баллов: время — что произошло — сумма.
 *
 * Время фиксированной ширины и табличными цифрами: колонка не пляшет от строки к строке,
 * и список читается сверху вниз одним движением. Сумма со знаком и цветом сразу: знак
 * читается и в чёрно-белом, и тем, кто не различает цвета.
 *
 * Списание алое, а не серое: серая сумма читалась как ценник, а водитель должен видеть,
 * что баллы ушли с него. Алый со знаком минус живёт только в истории.
 *
 * Без операции строка рисует заглушку ожидания той же высоты — список не прыгает,
 * когда данные доедут.
 */
defineProps<{
  /** Нет — строка ожидания. */
  operation?: MemberOperationView;
}>();
</script>

<template>
  <div v-if="operation" class="flex items-baseline gap-3 px-1 py-2.5">
    <span class="w-[42px] shrink-0 text-[13px] font-light tabular-nums text-xb-grey">{{ operation.time }}</span>
    <span class="min-w-0 grow text-[15px] font-normal leading-[1.3] text-xb-text">{{ operation.title }}</span>
    <span
      class="shrink-0 text-[15px] font-bold tabular-nums"
      :class="operation.direction === 'plus' ? 'text-xb-green' : 'text-xb-scarlet'"
    >
      {{ operation.amount }}
    </span>
  </div>
  <div v-else class="flex items-center gap-3 px-1 py-3" aria-hidden="true">
    <span class="operation-bar w-[42px] shrink-0" />
    <span class="operation-bar grow" />
    <span class="operation-bar w-[54px] shrink-0" />
  </div>
</template>

<style scoped>
.operation-bar {
  height: 11px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.13) 50%, rgba(255, 255, 255, 0.07) 100%);
  background-size: 200% 100%;
  animation: operation-shimmer 1.6s ease-in-out infinite;
}

@keyframes operation-shimmer {
  0% { background-position: 140% 0; }
  100% { background-position: -40% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .operation-bar {
    animation: none;
  }
}
</style>
