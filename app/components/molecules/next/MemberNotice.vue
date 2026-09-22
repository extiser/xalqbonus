<script setup lang="ts">
/**
 * Пустое место или отказ загрузки — вместо списка блока или раздела.
 *
 * Состояния разные и выглядят по-разному: отказ запроса, показанный как пустота, читается
 * как пропавшие баллы или подарок. У отказа есть чем повторить — вторичной кнопкой S,
 * у пустоты повторять нечего.
 */
type NoticeState = 'empty' | 'error';

defineProps<{
  state: NoticeState;
  message: string;
  /** Подпись «Повторить». Нужна только отказу. */
  retryLabel?: string;
}>();

defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="flex flex-col items-center gap-3 px-5 py-[34px] text-center text-[15px] font-light leading-[1.4] text-xb-grey">
    <p class="m-0">{{ message }}</p>
    <AtomsNextMemberButton v-if="state === 'error' && retryLabel" size="s" tone="outline" @click="$emit('retry')">
      {{ retryLabel }}
    </AtomsNextMemberButton>
  </div>
</template>
