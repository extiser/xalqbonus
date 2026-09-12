<script setup lang="ts">
import { computed } from 'vue';
import type { MemberOperation } from '#shared/types/miniapp';
import { formatSignedNumber } from '~/utils/format';

/**
 * Одна операция в истории водителя: время, за что и на сколько.
 *
 * Поездки стоят поштучно и не сворачиваются в строку за день ни при каком их количестве:
 * свёрнутое «14 поездок» на спор не отвечает — водитель скажет, что их было пятнадцать,
 * а поштучно он находит недостающую сам (issue #101).
 *
 * Ни номера заказа, ни второй стороны перевода здесь нет: это состав для сотрудника,
 * разбирающего спор у стойки, а не для водителя.
 */
const props = defineProps<{ operation: MemberOperation }>();

const incoming = computed(() => props.operation.delta > 0);
</script>

<template>
  <article class="flex items-baseline gap-3 py-2.5">
    <span class="w-11 shrink-0 text-sm text-slate-400 tabular-nums">{{ operation.time }}</span>
    <span class="flex-1 text-base leading-snug">{{ operation.reason }}</span>
    <!-- Цвет и знак вместе, а не вместо друг друга: знак читается и в чёрно-белом, и тем,
         кто не различает зелёное с красным. -->
    <span
      class="shrink-0 text-base font-semibold tabular-nums"
      :class="incoming ? 'text-emerald-700' : 'text-slate-500'"
    >
      {{ formatSignedNumber(operation.delta) }}
    </span>
  </article>
</template>
