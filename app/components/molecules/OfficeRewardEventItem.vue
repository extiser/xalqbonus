<script setup lang="ts">
import { computed } from 'vue';
import { DASH, formatDateTime } from '~/utils/format';
import { officeRewardEventLabel } from '~/utils/labels';
import type { OfficeRewardEventEntry } from '#shared/types/catalog';

/**
 * Строка ленты офиса: событие произвольной награды — то, у чего движения остатка нет.
 *
 * Несёт то же, что строка движения: что за награда, что произошло, когда и кто. Вручение
 * акцией называет акцию, а не прочерк: вручила она. Сгорание делает воркер — там человека
 * не было, и придумывать его нельзя.
 */
const props = defineProps<{
  reward: OfficeRewardEventEntry;
}>();

const actor = computed(() => {
  if (props.reward.employeeName) {
    return props.reward.employeeName;
  }

  return props.reward.campaignTitle ? `акция «${props.reward.campaignTitle}»` : DASH;
});
</script>

<template>
  <div class="border-t border-slate-200 py-3 first:border-t-0">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span class="text-sm font-medium text-slate-900">{{ reward.rewardTitle }}</span>
      <span class="text-sm text-slate-600">{{ officeRewardEventLabel(reward.event) }}</span>
      <span class="text-sm text-slate-500">награда без товара со склада</span>
    </div>
    <p class="mt-1 text-xs text-slate-500">
      {{ formatDateTime(reward.createdAt) }} · {{ actor }}
    </p>
    <p v-if="reward.note" class="mt-1 text-sm text-slate-700">{{ reward.note }}</p>
  </div>
</template>
