<script setup lang="ts">
import { ref, watch } from 'vue';
import type { OfficeReward } from '#shared/types/rewards';
import { deskIssueQuestion } from '~/utils/deskQuestion';
import { formatDate } from '~/utils/format';
import { rewardStatusLabel } from '~/utils/labels';

/**
 * Карточка награды у стойки в Mini App (issue #172): что выдаётся, почему, кому — имя,
 * позывной и телефон — и до какого срока.
 *
 * «Выдать» — в два нажатия, и вопрос называет водителя по имени: выдачу назад не вернуть,
 * а опечатка в коде ловится только сверкой человека. Отмены у награды нет — неполученная
 * сгорает сама.
 */
const props = defineProps<{
  reward: OfficeReward;
  acting: boolean;
  error: string | null;
}>();

defineEmits<{ issue: []; close: [] }>();

/** Ждёт ли выдача подтверждения. Состояние вида: сервер о нём не знает. */
const confirming = ref(false);

watch(
  () => [props.reward.rewardId, props.reward.status],
  () => {
    confirming.value = false;
  },
);
</script>

<template>
  <section class="flex flex-col gap-5">
    <header class="flex flex-col gap-0.5">
      <p class="text-sm text-slate-500">{{ reward.officeName }}</p>
      <h1 class="text-2xl font-semibold">{{ reward.title }}</h1>
      <p class="text-sm text-slate-600">{{ reward.reasonText }}</p>
      <p v-if="reward.status !== 'awaiting'" class="text-sm text-slate-600">
        {{ rewardStatusLabel(reward.status) }}
      </p>
    </header>

    <div class="flex flex-col gap-0.5">
      <p class="text-lg font-semibold">{{ reward.driverName ?? '—' }}</p>
      <p class="text-sm text-slate-500">
        Позывной: <span class="font-mono tabular-nums">{{ reward.callsign ?? '—' }}</span>
      </p>
      <p class="text-sm text-slate-500">
        Телефон: <span class="tabular-nums">{{ reward.phone ?? '—' }}</span>
      </p>
    </div>

    <dl class="flex flex-col gap-1 text-sm">
      <div class="flex justify-between gap-3">
        <dt class="text-slate-500">Вручена</dt>
        <dd class="tabular-nums">{{ formatDate(reward.createdAt) }}</dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-slate-500">Забрать до</dt>
        <dd class="tabular-nums">{{ formatDate(reward.expiresAt) }}</dd>
      </div>
    </dl>

    <div class="flex flex-col gap-2">
      <p v-if="error" class="text-sm leading-relaxed text-red-700">{{ error }}</p>

      <template v-if="reward.status === 'awaiting' && !confirming">
        <AtomsMiniAppButton label="Выдать" :disabled="acting" @click="confirming = true" />
      </template>

      <template v-else-if="confirming">
        <p class="text-base leading-relaxed">
          {{ deskIssueQuestion(reward.driverName, `«${reward.title}»`) }}
        </p>
        <AtomsMiniAppButton label="Да, выдать" :disabled="acting" @click="$emit('issue')" />
        <AtomsMiniAppButton
          variant="secondary"
          label="Не выдавать"
          :disabled="acting"
          @click="confirming = false"
        />
      </template>

      <AtomsMiniAppButton
        v-if="!confirming"
        variant="secondary"
        label="Закрыть"
        :disabled="acting"
        @click="$emit('close')"
      />
    </div>
  </section>
</template>
