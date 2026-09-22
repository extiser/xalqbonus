<script setup lang="ts">
import type { DriverRewardsResponse } from '#shared/types/rewards';
import type { LoadState } from '~/types/loadState';

/**
 * Награды водителя в карточке — только просмотр (issue #175).
 *
 * Выдачи и закрытия отсюда нет: награда выдаётся по коду у стойки сотрудником, который видит
 * водителя, и отметка «выдал без кода» сняла бы след, ради которого код заведён. Код ждущей
 * показан, чтобы назвать его водителю по телефону.
 */
defineProps<{
  state: LoadState;
  data: DriverRewardsResponse | null;
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Награды"
    note="Что вручено водителю и в каком оно состоянии. Ждущие в офисе — сверху: за ними водитель придёт, остальное — история."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем награды…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Награды не прочитались. Это отказ запроса, а не отсутствие наград."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.rewards.length === 0"
      state="empty"
      message="Наград нет."
    />
    <div v-else>
      <MoleculesDriverRewardItem
        v-for="reward in data.rewards"
        :key="reward.rewardId"
        :reward="reward"
      />
    </div>
  </MoleculesSectionPanel>
</template>
