<script setup lang="ts">
import type { MemberRewardView, MemberViewLoad } from '~/types/memberView';

/**
 * «Мои награды» на главной — `_reference/design/home/rewards-block.html` и `rewards-block.md`.
 *
 * Ждущие — компактной карточкой, каждая своей строкой: водитель идёт в офис за всеми сразу
 * и должен знать, за чем именно. Ждущих нет, но награды были — одна последняя полной
 * карточкой и «Все награды», иначе раздел не найти. Наград не было вовсе — текст, что здесь
 * появится, и без ссылки: в разделе пусто (Руслан, 23-09-2026).
 */
defineProps<{
  state: MemberViewLoad;
  rewards: MemberRewardView[];
  texts: {
    title: string;
    all: string;
    empty: string;
    error: string;
    retry: string;
  };
}>();

defineEmits<{ all: []; open: [rewardId: string]; retry: [] }>();
</script>

<template>
  <section v-if="state !== 'loading'" class="flex flex-col gap-2.5 px-3.5 pb-5 pt-2">
    <div class="px-1 pb-2 pt-1">
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

    <MoleculesNextMemberNotice v-else-if="state === 'empty'" state="empty" :message="texts.empty" />

    <MoleculesNextMemberNotice v-else state="error" :message="texts.error" :retry-label="texts.retry" @retry="$emit('retry')" />
  </section>
</template>
