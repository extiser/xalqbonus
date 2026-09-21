<script setup lang="ts">
import type { MemberReward } from '#shared/types/rewards';

/**
 * Награда в разделе «Мои награды»: что, откуда и в каком она состоянии (issue #172).
 *
 * У ждущей крупно стоит код — водитель показывает экран на стойке, а не диктует; рядом —
 * что выдаётся и где. Сгоревшая — серой строкой: причина и дата видны, а не пустота.
 */
const props = defineProps<{
  reward: MemberReward;
  codeTitle: string;
}>();
</script>

<template>
  <article
    class="flex flex-col gap-1 rounded-2xl border px-4 py-3"
    :class="{
      'border-emerald-500': props.reward.status === 'awaiting',
      'border-slate-200': props.reward.status !== 'awaiting',
      'text-slate-400': props.reward.status === 'expired',
    }"
  >
    <span class="text-base font-semibold">{{ reward.title }}</span>
    <span class="text-sm" :class="reward.status === 'expired' ? 'text-slate-400' : 'text-slate-500'">
      {{ reward.originText }}
    </span>

    <template v-if="reward.code">
      <span class="mt-2 text-sm text-emerald-800">{{ codeTitle }}</span>
      <span class="font-mono text-5xl font-semibold tracking-widest text-emerald-800 tabular-nums">
        {{ reward.code }}
      </span>
    </template>

    <span
      class="text-sm"
      :class="{
        'text-emerald-800': reward.status === 'awaiting' || reward.status === 'credited',
        'text-slate-600': reward.status === 'issued',
        'text-slate-400': reward.status === 'expired',
      }"
    >
      {{ reward.stateText }}
    </span>
    <span v-if="reward.officeName" class="text-sm" :class="reward.status === 'expired' ? 'text-slate-400' : 'text-slate-500'">
      {{ reward.officeName }}<template v-if="reward.status === 'awaiting' && reward.officeAddress">, {{ reward.officeAddress }}</template>
    </span>
  </article>
</template>
