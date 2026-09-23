<script setup lang="ts">
import type { MemberRewardView, MemberViewLoad } from '~/types/memberView';

/**
 * «Мои награды» на главной — `product/design/artboard/rewards-block.html`.
 *
 * Ждущие — компактной карточкой, каждая своей строкой: водитель идёт в офис за всеми сразу
 * и должен знать, за чем именно. Ждущих нет, но награды были — блок остаётся с полной
 * карточкой, иначе раздел не найти. Наград не было вовсе — блока нет (`empty`).
 */
defineProps<{
  state: MemberViewLoad;
  rewards: MemberRewardView[];
  texts: {
    title: string;
    all: string;
    error: string;
    retry: string;
  };
}>();

defineEmits<{ all: []; open: [rewardId: string]; retry: [] }>();
</script>

<template>
  <section v-if="state === 'ready' || state === 'error'" class="flex flex-col gap-2.5 px-3.5 pb-5 pt-2">
    <div class="px-1 py-1">
      <MoleculesNextMemberBlockHead
        :title="texts.title"
        :link-label="state === 'ready' ? texts.all : undefined"
        @open="$emit('all')"
      />
    </div>

    <template v-if="state === 'ready'">
      <MoleculesNextMemberRewardCard
        v-for="reward in rewards"
        :key="reward.id"
        :reward="reward"
        :variant="reward.status === 'awaiting' ? 'compact' : 'full'"
        @open="$emit('open', reward.id)"
      />
    </template>

    <MoleculesNextMemberNotice v-else state="error" :message="texts.error" :retry-label="texts.retry" @retry="$emit('retry')" />
  </section>
</template>
