<script setup lang="ts">
import { ref, watch } from 'vue';
import type { OfficeReward } from '#shared/types/rewards';
import { deskIssueQuestion } from '~/utils/deskQuestion';
import { formatDate } from '~/utils/format';
import { rewardStatusLabel } from '~/utils/labels';

/**
 * Карточка награды в вебе (issue #172): что выдаётся, почему, кому и до какого срока —
 * и одно действие. Выдача в два нажатия, вопрос называет водителя по имени, как у стойки
 * в Mini App. Отмены у награды нет: неполученная сгорает сама.
 */
const props = defineProps<{
  reward: OfficeReward;
  acting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ issue: []; close: [] }>();

const confirming = ref(false);

watch(
  () => [props.reward.rewardId, props.reward.status],
  () => {
    confirming.value = false;
  },
);
</script>

<template>
  <MoleculesSectionPanel :title="reward.title" :note="reward.officeName">
    <dl>
      <MoleculesFactRow label="Статус" :value="rewardStatusLabel(reward.status)" />
      <MoleculesFactRow label="Почему" :value="reward.reasonText" />
      <MoleculesFactRow label="Водитель" :value="reward.driverName" />
      <MoleculesFactRow label="Позывной" :value="reward.callsign" mono />
      <MoleculesFactRow label="Телефон" :value="reward.phone" mono />
      <MoleculesFactRow v-if="reward.code" label="Код" :value="reward.code" mono />
      <MoleculesFactRow label="Вручена" :value="formatDate(reward.createdAt)" />
      <MoleculesFactRow
        v-if="reward.status === 'awaiting'"
        label="Забрать до"
        :value="formatDate(reward.expiresAt)"
      />
      <MoleculesFactRow v-if="reward.issuedAt" label="Выдана" :value="formatDate(reward.issuedAt)" />
      <MoleculesFactRow v-if="reward.expiredAt" label="Сгорела" :value="formatDate(reward.expiredAt)" />
    </dl>

    <p v-if="error" class="mt-4 text-sm text-red-700">{{ error }}</p>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <AtomsActionButton
        v-if="reward.status === 'awaiting' && !confirming"
        label="Выдать"
        tone="primary"
        :disabled="acting"
        @click="confirming = true"
      />

      <template v-else-if="confirming">
        <span class="text-sm">{{ deskIssueQuestion(reward.driverName, `«${reward.title}»`) }}</span>
        <AtomsActionButton label="Да, выдать" tone="primary" :disabled="acting" @click="emit('issue')" />
        <AtomsActionButton label="Не выдавать" :disabled="acting" @click="confirming = false" />
      </template>

      <AtomsActionButton v-if="!confirming" label="Закрыть" :disabled="acting" @click="emit('close')" />
    </div>
  </MoleculesSectionPanel>
</template>
