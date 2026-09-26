<script setup lang="ts">
import type { StaffRewardView } from '~/types/staffView';

/**
 * Награда у стойки — `_reference/design/staff/04-reward-card.html`, шторка —
 * `04-reward-issue-sheet.html` (issue #250). Устроена как карточка заказа (`StaffOrderCard`):
 * водитель, сроки, «Выдать» внизу.
 *
 * Вместо состава — приз одной карточкой: миниатюра товара или значок подарка у произвольной
 * награды, золотая метка откуда, название и подпись — у акции её название и пояснение.
 * Отмены нет: не забранная награда сгорает сама.
 *
 * Фото товара в ответе стойки нет — стоит пустая подложка, как в макете.
 */
defineProps<{
  reward: StaffRewardView;
  sheetOpen: boolean;
  acting: boolean;
}>();

const emit = defineEmits<{ back: []; askIssue: []; issue: []; close: [] }>();

const close = (acting: boolean): void => {
  if (!acting) {
    emit('close');
  }
};
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(24px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar title="Награда" back-label="Назад" @back="$emit('back')" />

    <div class="flex grow flex-col gap-2.5 px-4 pb-5 pt-2">
      <div class="px-0.5 pb-0.5 pt-[18px]">
        <AtomsNextMemberGroupLabel label="Водитель" />
      </div>
      <MoleculesNextStaffDriverCard :driver="reward.driver" />

      <div class="px-0.5 pb-0.5 pt-[18px]">
        <AtomsNextMemberGroupLabel label="Приз" />
      </div>
      <div class="flex items-center gap-3.5 rounded-[20px] border border-white/9 bg-xb-card px-4 py-3.5">
        <span
          v-if="reward.prize.icon === 'gift'"
          class="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-white/6"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
            <rect x="4" y="10" width="16" height="10" rx="2" stroke="#8A93A2" stroke-width="1.7" />
            <path d="M3 8h18v2H3z" stroke="#8A93A2" stroke-width="1.7" stroke-linejoin="round" />
            <path d="M12 8v12" stroke="#8A93A2" stroke-width="1.7" />
            <path d="M12 8c-2-3.5-5.5-3-5-1s3 1 5 1c2 0 4.5 1 5-1s-3-2.5-5 1z" stroke="#8A93A2" stroke-width="1.5" stroke-linejoin="round" />
          </svg>
        </span>
        <span v-else class="size-14 shrink-0 rounded-[14px] bg-xb-photo" aria-hidden="true" />
        <div class="min-w-0 grow">
          <div class="text-[11px] font-semibold tracking-[0.3px] text-xb-gold">{{ reward.prize.label }}</div>
          <div class="mt-[3px] text-[16px] font-bold leading-[1.3]">{{ reward.prize.title }}</div>
          <div v-if="reward.prize.caption" class="mt-[3px] text-[13px] font-light text-xb-grey">{{ reward.prize.caption }}</div>
        </div>
      </div>

      <MoleculesNextStaffDateRows :dates="reward.dates" />
    </div>

    <div class="mt-auto flex flex-col gap-2.5 px-4 pt-2">
      <AtomsNextMemberButton size="xl" tone="green" @click="$emit('askIssue')">Выдать</AtomsNextMemberButton>
    </div>

    <MoleculesNextMemberSheet :open="sheetOpen" title="Выдать награду?" :subtitle="reward.issueSubtitle" @close="close(acting)">
      <template #buttons>
        <AtomsNextMemberButton size="xl" tone="green" :busy="acting" @click="$emit('issue')">Да, выдать</AtomsNextMemberButton>
        <AtomsNextMemberButton size="l" tone="grey" :disabled="acting" @click="close(acting)">Назад</AtomsNextMemberButton>
      </template>
    </MoleculesNextMemberSheet>
  </div>
</template>
