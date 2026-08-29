<script setup lang="ts">
import { DASH } from '~/utils/format';

/**
 * Строка «подпись — значение» в описании.
 *
 * Пустое значение рисуется прочерком, а не пустым местом: «ничего нет» и «поле
 * не нарисовалось» обязаны различаться на экране, с которого списывают факты о человеке.
 *
 * Моноширинный вид приходит смысловым свойством: им набираются номера, идентификаторы
 * и числа — то, что сверяют посимвольно.
 */
defineProps<{
  label: string;
  value?: string | null;
  hint?: string;
  mono?: boolean;
}>();
</script>

<template>
  <div class="flex flex-wrap items-baseline justify-between gap-x-3 py-1">
    <dt class="text-sm text-slate-500">{{ label }}</dt>
    <dd
      class="text-sm text-slate-900"
      :class="mono ? 'font-mono break-all tabular-nums' : 'text-right'"
    >
      <slot>{{ value || DASH }}</slot>
      <p v-if="hint" class="text-xs font-normal text-slate-400">{{ hint }}</p>
    </dd>
  </div>
</template>
