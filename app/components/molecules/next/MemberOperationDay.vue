<script setup lang="ts">
import type { MemberOperationView } from '~/types/memberView';

/**
 * День истории баллов: подпись дня и операции за него, отбитые тонкой линией.
 *
 * Сегодня и вчера подписаны словами, остальные — датой: водитель ищет вчерашнюю поездку,
 * а не поездку четырнадцатого сентября. Подпись приходит готовой.
 *
 * Один и тот же день стоит на главной и в разделе — поэтому молекулой, а не разметкой
 * в каждом из двух.
 */
defineProps<{
  label: string;
  operations: MemberOperationView[];
}>();
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="px-1 pb-1.5 pt-3.5">
      <AtomsNextMemberGroupLabel :label="label" />
    </div>
    <div
      v-for="(operation, index) in operations"
      :key="operation.id"
      :class="index > 0 ? 'border-t border-white/6' : ''"
    >
      <MoleculesNextMemberOperationRow :operation="operation" />
    </div>
  </div>
</template>
