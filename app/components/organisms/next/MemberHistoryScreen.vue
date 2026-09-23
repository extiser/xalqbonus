<script setup lang="ts">
import type { MemberOperationDayView, MemberViewLoad } from '~/types/memberView';

/**
 * Раздел «История баллов» — `product/design/app/history-screen.html`.
 *
 * Шапка раздела, отметка синхронизации, операции по дням и «Показать ещё». Раздел спокойный,
 * живого фона нет: главная — витрина программы, раздел — работа со списком.
 *
 * Отметка синхронизации отвечает на вопрос, который задают именно списку: «почему поездки,
 * которую я закончил десять минут назад, здесь нет».
 */
defineProps<{
  state: MemberViewLoad;
  days: MemberOperationDayView[];
  /** Есть ли следующая страница. Нет — кнопки нет. */
  hasMore: boolean;
  texts: {
    title: string;
    back: string;
    synced: string;
    more: string;
    empty: string;
    error: string;
    retry: string;
  };
}>();

defineEmits<{ back: []; more: []; retry: [] }>();

const SKELETON_ROWS = 6;
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar :title="texts.title" :back-label="texts.back" @back="$emit('back')" />

    <div class="px-5 pb-0.5 pt-3">
      <AtomsNextMemberSyncNote :text="texts.synced" />
    </div>

    <div class="flex flex-col gap-1 px-3.5 pb-5 pt-2">
      <template v-if="state === 'ready'">
        <MoleculesNextMemberOperationDay v-for="day in days" :key="day.id" :label="day.label" :operations="day.operations" />
        <div v-if="hasMore" class="mt-[18px] flex justify-center">
          <AtomsNextMemberButton size="s" tone="outline" @click="$emit('more')">{{ texts.more }}</AtomsNextMemberButton>
        </div>
      </template>

      <template v-else-if="state === 'loading'">
        <div v-for="row in SKELETON_ROWS" :key="row" :class="row > 1 ? 'border-t border-white/6' : ''">
          <MoleculesNextMemberOperationRow />
        </div>
      </template>

      <MoleculesNextMemberNotice v-else-if="state === 'empty'" state="empty" :message="texts.empty" />

      <MoleculesNextMemberNotice v-else state="error" :message="texts.error" :retry-label="texts.retry" @retry="$emit('retry')" />
    </div>
  </div>
</template>
