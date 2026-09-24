<script setup lang="ts">
import type { MemberItemTone, MemberRewardDetailView } from '~/types/memberView';

/**
 * Экран награды — `_reference/design/orders/reward-screen.html`; произвольная награда —
 * `reward-screen-custom.html`; получена и срок вышел — `reward-screen-states.html`.
 *
 * Копия экрана заказа (Руслан, 24-09-2026: «делай таким же видом, как товар, просто зачеркнём
 * цену»): карточка с кодом, «Где забрать», строка награды с «Суммой». Первой строкой карточки —
 * откуда награда, суммы в карточке нет: награда ничего не списала.
 *
 * Цена товара из каталога зачёркнута, рядом «0» — водитель видит, сколько стоил бы подарок.
 * У произвольной награды фото и цены нет: значок подарка и ни цены, ни «Суммы».
 *
 * Закрытая — как закрытый заказ: кода и «Где забрать» нет, карточка спокойная. Кнопки отмены
 * нет вовсе — награду не отменяют. Баланса в шапке нет (`_reference/design/home/section-bar.md`).
 */
defineProps<{
  reward: MemberRewardDetailView;
  texts: {
    title: string;
    back: string;
    codeTitle: string;
    officeTitle: string;
    map: string;
    linesTitle: string;
    total: string;
  };
}>();

defineEmits<{ back: []; map: [] }>();

const TONES: Record<MemberRewardDetailView['status'], Exclude<MemberItemTone, 'credited'>> = {
  awaiting: 'waiting',
  issued: 'issued',
  expired: 'cancelled',
};
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar :title="texts.title" :back-label="texts.back" @back="$emit('back')" />

    <div class="flex flex-col gap-3 px-4 pt-3.5">
      <MoleculesNextMemberOrderStatusCard
        :tone="TONES[reward.status]"
        :origin="reward.origin"
        :state="reward.state"
        :hint="reward.hint"
        :reason="reward.reason"
        :code="reward.code"
        :code-title="texts.codeTitle"
      />

      <MoleculesNextMemberOfficeCard
        v-if="reward.officeCard"
        :office="reward.officeCard"
        :texts="{ title: texts.officeTitle, map: texts.map }"
        @map="$emit('map')"
      />

      <div class="px-0.5 pt-3.5">
        <MoleculesNextMemberOrderLines
          :lines="reward.lines"
          :total="reward.total"
          :texts="{ title: texts.linesTitle, total: texts.total }"
        />
      </div>
    </div>
  </div>
</template>
