<script setup lang="ts">
import type { StaffDeskRowView } from '~/types/staffView';

/**
 * Строка «Ждут выдачи» у стойки — `_reference/design/staff/02-desk.html`, `.item` (issue #250).
 *
 * Вся карточка — кнопка: открывает карточку заказа или награды. Сверху метка вида 11/600:
 * заказ зелёной, награда золотой — всё про награды золотое, как у водителя. Рамка у всех одна,
 * награда отличается только цветом метки. Ниже — что (16/700) и кто: «Фамилия Имя · позывной»
 * светлее остального и «когда» серым.
 */
defineProps<{
  row: StaffDeskRowView;
}>();

defineEmits<{ open: [] }>();
</script>

<template>
  <button
    type="button"
    class="box-border flex w-full cursor-pointer items-center gap-3.5 rounded-[20px] border border-white/9 bg-xb-card py-3.5 pl-4 pr-3.5 text-left font-manrope leading-[normal] text-xb-text active:bg-[#1A1E25]"
    @click="$emit('open')"
  >
    <span class="flex min-w-0 grow flex-col gap-[3px]">
      <span class="text-[11px] font-semibold tracking-[0.3px]" :class="row.tone === 'order' ? 'text-xb-green' : 'text-xb-gold'">
        {{ row.label }}
      </span>
      <span class="text-[16px] font-bold leading-[1.3]">{{ row.title }}</span>
      <span class="text-[13px] font-light leading-[1.4] text-xb-grey">
        <template v-if="row.driver"><b class="font-medium text-xb-secondary">{{ row.driver }}</b> · </template>{{ row.when }}
      </span>
    </span>
    <AtomsNextMemberChevron tone="dim" :size="18" />
  </button>
</template>
