<script setup lang="ts">
/**
 * Вариант выбора в шторке — строка с кружком-отметкой справа.
 *
 * Выбранный — рамкой и отметкой, без заливки цветом: гранат в шторке занят кнопкой
 * «Сохранить», и второй гранатовый блок спорил бы с ней.
 */
defineProps<{
  label: string;
  selected: boolean;
}>();

defineEmits<{ select: [] }>();
</script>

<template>
  <button
    type="button"
    role="radio"
    :aria-checked="selected"
    class="box-border flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[16px] border px-[18px] text-left font-manrope text-[16px] font-semibold transition-colors duration-150"
    :class="selected ? 'border-white/30 bg-white/6 text-xb-text' : 'border-white/9 bg-white/3 text-xb-secondary'"
    @click="$emit('select')"
  >
    <span class="grow">{{ label }}</span>
    <span
      class="box-border flex size-[22px] shrink-0 items-center justify-center rounded-full"
      :class="selected ? 'bg-xb-text' : 'border-[1.5px] border-white/22'"
      aria-hidden="true"
    >
      <svg v-if="selected" viewBox="0 0 24 24" width="14" height="14" fill="none">
        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#0B0D11" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
  </button>
</template>
