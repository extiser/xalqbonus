<script setup lang="ts">
import type { StaffOfficeView } from '~/types/staffView';

/**
 * Офис на выборе офиса — `_reference/design/staff/01-office-picker.html`, `.office` (issue #250).
 *
 * Вся карточка — одна кнопка: менеджер у стойки жмёт не глядя. Название 16/700, адрес серым,
 * «Ждут выдачи: N» зелёным, как ждущий заказ. Никто не ждёт — строки нет вовсе.
 */
defineProps<{
  office: StaffOfficeView;
}>();

defineEmits<{ select: [] }>();
</script>

<template>
  <button
    type="button"
    class="box-border flex w-full cursor-pointer items-center gap-3.5 rounded-[20px] border border-white/9 bg-xb-card py-4 pl-4 pr-3.5 text-left font-manrope leading-[normal] text-xb-text active:bg-[#1A1E25]"
    @click="$emit('select')"
  >
    <span class="flex min-w-0 grow flex-col gap-[3px]">
      <span class="text-[16px] font-bold leading-[1.3]">{{ office.name }}</span>
      <span class="text-[13px] font-light leading-[1.4] text-xb-grey">{{ office.address }}</span>
      <span v-if="office.awaiting" class="mt-[5px] text-[13px] font-semibold text-xb-green">{{ office.awaiting }}</span>
    </span>
    <AtomsNextMemberChevron tone="dim" :size="18" />
  </button>
</template>
