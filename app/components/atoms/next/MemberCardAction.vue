<script setup lang="ts">
/**
 * Строка-действие внизу карточки: текст и шеврон, отбитые линией сверху —
 * «Код для выдачи — внутри», «Просмотреть», «Открыть в Яндекс Картах».
 *
 * Сверху карточки — «что это», снизу — единственное, что от неё нужно. Цвет по смыслу:
 * зелёный зовёт за кодом заказа, золотой — за кодом награды, серый — только посмотреть,
 * синий ведёт наружу, в карту.
 *
 * Сама строка не кнопка: чаще нажимается вся карточка, и кнопка внутри кнопки была бы
 * ошибкой разметки. Где строка нажимается отдельно, кнопкой её оборачивает карточка.
 */
type ActionTone = 'green' | 'gold' | 'grey' | 'blue';

defineProps<{
  label: string;
  tone: ActionTone;
}>();

const TONE_CLASSES: Record<ActionTone, string> = {
  green: 'text-xb-green',
  gold: 'text-xb-gold-light',
  grey: 'text-xb-grey',
  blue: 'text-xb-map',
};
</script>

<template>
  <span
    class="flex w-full items-center gap-2 border-t border-white/7 pt-3 text-left text-[14px] font-medium"
    :class="TONE_CLASSES[tone]"
  >
    <span class="min-w-0 grow">{{ label }}</span>
    <AtomsNextMemberChevron :tone="tone" />
  </span>
</template>
