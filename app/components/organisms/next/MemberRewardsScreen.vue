<script setup lang="ts">
import type { MemberItemTone, MemberRewardStatus, MemberRewardView, MemberViewLoad } from '~/types/memberView';

/**
 * Раздел «Мои награды» — `_reference/design/orders/rewards-screen.html`; ждущих нет —
 * `rewards-screen-nopending.html`; наград не было и не загрузилось — `rewards-screen-empty.html`.
 *
 * Собран видом «Моих заказов» (Руслан, 24-09-2026): та же карточка, что у заказа, с происхождением
 * под названием. Две группы: сверху ждущие в офисе со счётчиком — за ними идти, ниже история наград.
 * Ждущих нет — группа остаётся с нулём и строкой «Здесь пусто», как у заказов.
 *
 * Кода в списке нет — он на экране награды. Товар и произвольная награда открывают его,
 * баллы на балансе не открываются: экран им не нужен.
 */
defineProps<{
  state: MemberViewLoad;
  awaiting: MemberRewardView[];
  past: MemberRewardView[];
  /** Баланс справа в шапке — готовыми строками («Ваши баллы», «1 450»). */
  balance?: { label: string; amount: string };
  texts: {
    title: string;
    back: string;
    awaitingGroup: string;
    pastGroup: string;
    /** «Здесь пусто» под группой без ждущих. */
    groupEmpty: string;
    empty: string;
    error: string;
    retry: string;
  };
}>();

defineEmits<{ back: []; open: [rewardId: string]; retry: [] }>();

const TONES: Record<MemberRewardStatus, MemberItemTone> = {
  awaiting: 'waiting',
  credited: 'credited',
  issued: 'issued',
  expired: 'cancelled',
};

/** Награда — свойствами карточки: тон по состоянию, остальное как есть. */
function itemCard(reward: MemberRewardView) {
  return {
    title: reward.title,
    origin: reward.origin,
    state: reward.state,
    hint: reward.hint,
    tone: TONES[reward.status],
    reason: reward.reason,
    office: reward.office,
    action: reward.actionLabel,
  };
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar :title="texts.title" :back-label="texts.back" :balance="balance" @back="$emit('back')" />

    <div v-if="state === 'ready'" class="flex flex-col gap-2.5 px-4 pb-5 pt-2">
      <div class="px-0.5 pb-0.5 pt-[18px]">
        <AtomsNextMemberGroupLabel :label="texts.awaitingGroup" :count="awaiting.length" />
      </div>
      <MoleculesNextMemberItemCard v-for="reward in awaiting" :key="reward.id" v-bind="itemCard(reward)" @open="$emit('open', reward.id)" />
      <div v-if="awaiting.length === 0" class="px-1 pb-2 pt-6">
        <AtomsNextMemberEmptyLine :label="texts.groupEmpty" />
      </div>

      <template v-if="past.length > 0">
        <div class="px-0.5 pb-0.5 pt-[18px]">
          <AtomsNextMemberGroupLabel :label="texts.pastGroup" />
        </div>
        <MoleculesNextMemberItemCard v-for="reward in past" :key="reward.id" v-bind="itemCard(reward)" @open="$emit('open', reward.id)" />
      </template>
    </div>

    <MoleculesNextMemberNotice v-else-if="state === 'empty'" state="empty" size="screen" :message="texts.empty" />

    <MoleculesNextMemberNotice
      v-else-if="state === 'error'"
      state="error"
      size="screen"
      :message="texts.error"
      :retry-label="texts.retry"
      @retry="$emit('retry')"
    />
  </div>
</template>
