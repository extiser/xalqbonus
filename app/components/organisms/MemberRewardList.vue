<script setup lang="ts">
import type { MemberReward, MemberRewardTexts } from '#shared/types/rewards';
import type { LoadState } from '~/types/loadState';

/**
 * «Мои награды»: всё, что водителю дали, — свежее первым, баллы наравне с товарами
 * (issue #172). Раздел отвечает на вопрос «что мне дали», история начислений — «что
 * с балансом», и одно другое не дублирует.
 *
 * Порядок приходит с сервера готовым: сортировать здесь значило бы завести второе место,
 * где решено, что свежее важнее.
 */
defineProps<{
  state: LoadState;
  rewards: MemberReward[];
  texts: MemberRewardTexts;
}>();
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">{{ texts.rewardsTitle }}</h1>

    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="…" />
    <MoleculesStateNotice v-else-if="state === 'error'" state="error" :message="texts.rewardsFailed" />
    <MoleculesStateNotice
      v-else-if="rewards.length === 0"
      state="empty"
      :message="texts.rewardsEmpty"
    />

    <div v-else class="flex flex-col gap-3">
      <MoleculesMemberRewardItem
        v-for="reward in rewards"
        :key="reward.rewardId"
        :reward="reward"
        :code-title="texts.codeTitle"
      />
    </div>
  </section>
</template>
