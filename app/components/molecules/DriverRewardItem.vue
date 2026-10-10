<script setup lang="ts">
import { computed } from 'vue';
import { rewardDeadlineDay } from '#shared/reward';
import { DASH, formatCalendarDate, formatDateTime, formatNumber, pluralize } from '~/utils/format';
import { driverRewardStatusLabel } from '~/utils/labels';
import type { DriverReward } from '#shared/types/rewards';

/**
 * Одна награда в карточке водителя: что выдано, в каком она состоянии и откуда взялась.
 *
 * Строка отвечает водителю, позвонившему с вопросом «что мне положено и где мой приз»:
 * у ждущей — код, офис и срок, которые сотрудник называет вслух; у полученной — когда и кто
 * выдал; у сгоревшей — когда; у отменённой — когда и кто отменил. Автор ручной выдачи показан
 * всегда: вручение без следа — то, чего в программе быть не должно.
 *
 * Ждущую — в офисе или незабранный подарок — можно отменить (issue #270), если роль позволяет.
 * Подтверждение спрашивает страница: строка только сообщает, что нажали, и отдаёт название,
 * которым награда названа здесь.
 */
const props = defineProps<{
  reward: DriverReward;
  /** Роль сотрудника позволяет отменять награды. Ждёт ли награда, строка решает сама. */
  canCancel: boolean;
  /** Отмена этой награды уже ушла: второе нажатие не отправляется. */
  cancelling: boolean;
}>();

const emit = defineEmits<{ cancel: [reward: DriverReward, title: string] }>();

type Tone = 'ok' | 'warn' | 'muted';

const STATUS_TONES: Record<DriverReward['status'], Tone> = {
  credited: 'ok',
  claimable: 'warn',
  awaiting: 'warn',
  issued: 'ok',
  expired: 'muted',
  cancelled: 'muted',
};

/** Что выдано: у баллов — сумма, у остальных — сохранённое название. */
const title = computed(() => {
  const points = props.reward.points;

  return props.reward.kind === 'points' && points !== null
    ? `${formatNumber(points)} ${pluralize(points, 'балл', 'балла', 'баллов')}`
    : props.reward.title;
});

/** Откуда: акция с названием, ручная выдача или подарок — с автором. */
const origin = computed(() => {
  switch (props.reward.source) {
    case 'campaign':
      return `акция «${props.reward.campaignTitle ?? DASH}»`;
    case 'manual':
      return `вручную · вручил ${props.reward.grantedByName ?? DASH}`;
    case 'gift':
      return `подарок от Xalq Taxi · вручил ${props.reward.grantedByName ?? DASH}`;
  }
});

/**
 * День «Забрать до» у ждущей — тот, что выбрал сотрудник, а не день метки срока: правило одно
 * с экраном водителя (`rewardDeadlineDay`, issue #354).
 */
const deadlineDay = computed(() =>
  props.reward.expiresAt === null
    ? DASH
    : formatCalendarDate(rewardDeadlineDay(new Date(props.reward.expiresAt), props.reward.source)),
);

/** Отменяется только ждущая: выданная, зачисленная и сгоревшая остаются как есть. */
const cancellable = computed(
  () => props.canCancel && (props.reward.status === 'awaiting' || props.reward.status === 'claimable'),
);

/** Как подарок лёг на баланс — сотрудник отвечает водителю «вы забрали его сами». */
const claimText = computed(() =>
  props.reward.claimMode === 'driver' ? 'забрал сам' : 'зачислено по сроку',
);
</script>

<template>
  <article class="border-t border-slate-200 py-3 first:border-t-0 first:pt-0">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="text-sm font-medium text-slate-900">{{ title }}</span>
      <AtomsStatusBadge
        :tone="STATUS_TONES[reward.status]"
        :label="driverRewardStatusLabel(reward.status)"
      />
      <span
        v-if="reward.code !== null"
        class="font-mono text-base font-semibold tracking-widest text-slate-900"
      >
        {{ reward.code }}
      </span>
      <span v-if="cancellable" class="ml-auto">
        <AtomsActionButton
          label="Отменить"
          tone="danger"
          :disabled="cancelling"
          @click="emit('cancel', reward, title)"
        />
      </span>
    </div>

    <p v-if="reward.status === 'awaiting'" class="mt-1 text-sm text-slate-700">
      {{ reward.officeName ?? DASH }} · до {{ deadlineDay }}
    </p>
    <p v-else-if="reward.status === 'issued'" class="mt-1 text-sm text-slate-700">
      Получена {{ formatDateTime(reward.issuedAt) }} · {{ reward.officeName ?? DASH }} · выдал
      {{ reward.issuedByName ?? DASH }}
    </p>
    <p v-else-if="reward.status === 'expired'" class="mt-1 text-sm text-slate-700">
      Срок вышел {{ formatDateTime(reward.expiredAt) }}
    </p>
    <p v-else-if="reward.status === 'cancelled'" class="mt-1 text-sm text-slate-700">
      Отменена {{ formatDateTime(reward.cancelledAt) }} · {{ reward.cancelledByName ?? DASH }}
    </p>
    <p v-else-if="reward.status === 'claimable'" class="mt-1 text-sm text-slate-700">
      Ждёт в приложении · зачислится сам {{ formatDateTime(reward.expiresAt) }}
    </p>
    <p v-else-if="reward.claimedAt !== null" class="mt-1 text-sm text-slate-700">
      На балансе с {{ formatDateTime(reward.claimedAt) }} · {{ claimText }}
    </p>

    <p class="mt-1 text-xs text-slate-500">
      {{ formatDateTime(reward.createdAt) }} · {{ origin }}
    </p>
    <p v-if="reward.sourceNote" class="mt-1 text-sm text-slate-700">{{ reward.sourceNote }}</p>
  </article>
</template>
