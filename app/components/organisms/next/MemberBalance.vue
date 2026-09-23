<script setup lang="ts">
/**
 * Баллы в центре главного экрана: «Ваши баллы», число, «Обменять баллы» и отметка свежести.
 *
 * Уровни подписи и числа равны экрану акции — переключение между экранами не должно дёргать
 * раскладку. Отметка свежести стоит над свечением кнопки (`z-index`), иначе гранатовое
 * зарево ложится на неё сверху.
 */
defineProps<{
  points: number;
  texts: {
    title: string;
    exchange: string;
    updated: string;
  };
}>();

defineEmits<{ exchange: [] }>();
</script>

<template>
  <div class="relative flex flex-col items-center gap-5">
    <div class="flex flex-col items-center gap-2.5">
      <AtomsNextMemberEyebrow :label="texts.title" />
      <AtomsNextMemberBigNumber :value="points" />
    </div>
    <AtomsNextMemberButton size="m" tone="garnet" @click="$emit('exchange')">{{ texts.exchange }}</AtomsNextMemberButton>
    <div class="relative z-[1]">
      <AtomsNextMemberSyncNote :text="texts.updated" />
    </div>
  </div>
</template>
