<script setup lang="ts">
import type { MemberRewardView, MemberViewLoad } from '~/types/memberView';

/**
 * Раздел «Мои награды» — `product/design/app/rewards-screen.html`.
 *
 * Две группы: сверху ждущие в офисе со счётчиком — за ними идти, ниже история наград.
 * Ждущих нет — первой группы нет вовсе: пустая группа с нулём выглядела бы как потеря.
 * Карточки полные, с кодом: компактная с главной сюда не идёт.
 */
defineProps<{
  state: MemberViewLoad;
  awaiting: MemberRewardView[];
  past: MemberRewardView[];
  texts: {
    title: string;
    back: string;
    awaitingGroup: string;
    pastGroup: string;
    codeTitle: string;
    empty: string;
    error: string;
    retry: string;
  };
}>();

defineEmits<{ back: []; retry: [] }>();
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope text-xb-text">
    <MoleculesNextMemberSectionBar :title="texts.title" :back-label="texts.back" @back="$emit('back')" />

    <div class="flex flex-col gap-2.5 px-4 pb-5 pt-2">
      <template v-if="state === 'ready'">
        <template v-if="awaiting.length > 0">
          <div class="px-0.5 pb-0.5 pt-[18px]">
            <AtomsNextMemberGroupLabel :label="texts.awaitingGroup" :count="awaiting.length" />
          </div>
          <MoleculesNextMemberRewardCard
            v-for="reward in awaiting"
            :key="reward.id"
            :reward="reward"
            variant="full"
            :code-title="texts.codeTitle"
          />
        </template>

        <template v-if="past.length > 0">
          <div class="px-0.5 pb-0.5 pt-[18px]">
            <AtomsNextMemberGroupLabel :label="texts.pastGroup" />
          </div>
          <MoleculesNextMemberRewardCard v-for="reward in past" :key="reward.id" :reward="reward" variant="full" />
        </template>
      </template>

      <MoleculesNextMemberNotice v-else-if="state === 'empty'" state="empty" :message="texts.empty" />

      <MoleculesNextMemberNotice v-else-if="state === 'error'" state="error" :message="texts.error" :retry-label="texts.retry" @retry="$emit('retry')" />
    </div>
  </div>
</template>
