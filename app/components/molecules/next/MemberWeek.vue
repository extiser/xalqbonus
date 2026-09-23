<script setup lang="ts">
import type { MemberWeekDayView } from '~/types/memberView';

/**
 * «Ваша неделя» на экране участника — `product/design/comeback/03-member-screen.html`
 * и лист состояний `03-member-week-states.html`.
 *
 * Отвечает на два вопроса разом: сколько у акции осталось и как она идёт. Вверху срок,
 * семь клеток, внизу счёт собранных дней и запас пропусков.
 *
 * Срок и запас загораются вместе, когда запаса не осталось: блок меняет тон целиком.
 * Срок — золотом, запас — белым жирнее: гранат делал бы из факта окрик, а звать в машину —
 * работа дневной цели. Кегль при загорании не растёт — состояние несёт цвет.
 */
defineProps<{
  title: string;
  term: string;
  /** Запаса пропусков не осталось — срок и запас загораются. */
  urgent: boolean;
  days: MemberWeekDayView[];
  /** Сколько дней собрано — числом, оно выделяется гранатом. */
  collected: number;
  /** Хвост счёта: «из 5 дней». */
  collectedRest: string;
  skips: string;
}>();
</script>

<template>
  <div class="flex flex-col">
    <MoleculesNextMemberBlockHead :title="title">
      <template #aside>
        <span class="text-[11px]" :class="urgent ? 'font-semibold text-xb-gold' : 'font-normal text-[#6E7887]'">{{ term }}</span>
      </template>
    </MoleculesNextMemberBlockHead>

    <div class="mt-3.5 grid grid-cols-7 gap-[5px]">
      <AtomsNextMemberDayCell v-for="day in days" :key="day.id" :day="day" />
    </div>

    <div class="mt-3 flex items-baseline justify-between gap-2.5">
      <span class="whitespace-nowrap text-[15px] font-bold text-xb-text">
        <b :class="collected === 0 ? 'text-xb-text' : 'text-xb-garnet'">{{ collected }}</b> {{ collectedRest }}
      </span>
      <span class="text-right text-[11px]" :class="urgent ? 'font-semibold text-xb-text' : 'font-normal text-[#6E7887]'">{{ skips }}</span>
    </div>
  </div>
</template>
