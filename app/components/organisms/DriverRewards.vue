<script setup lang="ts">
import type { DriverReward, DriverRewardsResponse } from '#shared/types/rewards';
import type { LoadState } from '~/types/loadState';

/**
 * Награды водителя в карточке (issue #175).
 *
 * Выдачи отсюда нет: награда выдаётся по коду у стойки сотрудником, который видит водителя,
 * и отметка «выдал без кода» сняла бы след, ради которого код заведён. Код ждущей показан,
 * чтобы назвать его водителю по телефону. Ждущую, выданную по ошибке, можно отменить
 * (issue #270) — запрос и подтверждение у страницы.
 */
defineProps<{
  state: LoadState;
  data: DriverRewardsResponse | null;
  canCancel: boolean;
  /** Награда, отмена которой уже ушла. */
  cancellingId: string | null;
  /** Отказ последней отмены — текстом из ответа. */
  cancelError: string | null;
}>();

const emit = defineEmits<{ cancel: [reward: DriverReward, title: string] }>();
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
      <p v-if="cancelError" class="mb-3 text-sm text-red-700">{{ cancelError }}</p>
      <MoleculesDriverRewardItem
        v-for="reward in data.rewards"
        :key="reward.rewardId"
        :reward="reward"
        :can-cancel="canCancel"
        :cancelling="cancellingId === reward.rewardId"
        @cancel="(cancelled, title) => emit('cancel', cancelled, title)"
      />
    </div>
  </MoleculesSectionPanel>
</template>
