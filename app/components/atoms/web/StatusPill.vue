<script setup lang="ts">
import { CANDIDATE_APPLICATION_STATUS_LABELS, type CandidateApplicationStatus } from '#shared/candidateApplications';

/**
 * Плашка статуса заявки — `.st` кодекса веба, «Статусы» (issue #471): 12 / 600, поля 3 × 10,
 * пилюля. Цвет статуса всегда идёт со словом: «Новая» — золото, «В работе» — цвет названия
 * на поднятой, «Оформлен» — зелёный, «Отказ» — приглушённый алый. Подложка своего цвета 10 %,
 * у отказа 8 %.
 */
defineProps<{
  status: CandidateApplicationStatus;
}>();

const STATUS_CLASSES: Record<CandidateApplicationStatus, string> = {
  new: 'bg-web-gold/10 text-web-gold',
  in_progress: 'bg-web-raised text-web-title',
  hired: 'bg-web-green/10 text-web-green',
  rejected: 'bg-web-scarlet/8 text-web-scarlet-muted',
};
</script>

<template>
  <span
    class="inline-block rounded-full px-2.5 py-[3px] font-manrope text-[12px] leading-[1.45] font-semibold whitespace-nowrap"
    :class="STATUS_CLASSES[status]"
  >{{ CANDIDATE_APPLICATION_STATUS_LABELS[status] }}</span>
</template>
