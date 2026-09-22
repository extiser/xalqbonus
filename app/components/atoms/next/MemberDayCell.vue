<script setup lang="ts">
import { computed } from 'vue';
import type { MemberWeekDayView } from '~/types/memberView';

/**
 * Клетка дня в неделе акции — `product/design/comeback/03-member-week-states.html`.
 *
 * В клетке календарная дата, а не номер шага: водитель сверяется с календарём в голове,
 * «день 5» ему сверять не с чем. Стакан — заливка снизу, высота — взятые поездки от пяти:
 * неделя и дневная шкала меряют одним.
 *
 * Зачтённый день налит доверху и отмечен гранатом, тем же знаком, что у балла. Недобранный —
 * счётом «3/5»: «почти» водителю мало, ему нужна цена вопроса, и без счёта отъездивший три
 * поездки читал бы свой день как «меня не заметили». Сегодняшний — обводкой гранатом.
 */
const props = defineProps<{ day: MemberWeekDayView }>();

const labelClasses = computed(() => {
  if (props.day.today) {
    return { weekday: 'text-xb-garnet', number: 'text-xb-text' };
  }

  if (props.day.state === 'done') {
    return { weekday: 'text-xb-secondary', number: 'text-xb-text' };
  }

  if (props.day.state === 'short') {
    return { weekday: 'text-xb-light', number: 'text-xb-secondary' };
  }

  return { weekday: 'text-[#6E7887]', number: 'text-xb-grey' };
});
</script>

<template>
  <div
    class="relative box-border flex h-16 flex-col items-center justify-center gap-[3px] overflow-hidden rounded-[14px] border bg-xb-card"
    :class="day.today ? 'border-xb-garnet' : 'border-transparent'"
  >
    <div
      v-if="day.fill > 0"
      class="absolute inset-x-0 bottom-0"
      :class="
        day.state === 'done'
          ? 'bg-[linear-gradient(180deg,rgba(232,54,93,0.52)_0%,rgba(232,54,93,0.26)_100%)]'
          : 'bg-[linear-gradient(180deg,rgba(232,54,93,0.34)_0%,rgba(232,54,93,0.16)_100%)]'
      "
      :style="{ height: `${day.fill * 100}%` }"
    />
    <span class="relative z-[1] text-[9px] font-semibold uppercase tracking-[0.6px]" :class="labelClasses.weekday">{{ day.weekday }}</span>
    <span class="relative z-[1] text-[15px] font-bold leading-none" :class="labelClasses.number">{{ day.day }}</span>
    <span class="relative z-[1] flex h-[15px] items-center justify-center">
      <span v-if="day.state === 'done'" class="text-xb-garnet"><AtomsNextMemberPointsIcon :size="14" /></span>
      <span v-else-if="day.tally" class="text-[10px] font-semibold text-[rgba(244,246,248,0.55)]">{{ day.tally }}</span>
    </span>
  </div>
</template>
