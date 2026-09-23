<script setup lang="ts">
import type { MemberOperationDayView, MemberViewLoad } from '~/types/memberView';

/**
 * «История баллов» на главной — `product/design/artboard/history-block.html`.
 *
 * Короткий срез по дням и вход в раздел «Вся история ›». Листания здесь нет: «Показать ещё»
 * растило бы главную без конца, а за давней операцией водитель всё равно идёт в раздел.
 *
 * Пусто — новичок до первой поездки, и голый пустой список читался бы как поломка.
 * Не загрузилось — отказ назван словами, и есть чем повторить. Ждём — строки той же высоты.
 */
defineProps<{
  state: MemberViewLoad;
  days: MemberOperationDayView[];
  texts: {
    title: string;
    all: string;
    empty: string;
    error: string;
    retry: string;
  };
}>();

defineEmits<{ all: []; retry: [] }>();

/** Строк ожидания — столько, сколько обычно видно на главной без прокрутки. */
const SKELETON_ROWS = 3;
</script>

<template>
  <section class="flex flex-col gap-1 px-3.5 pb-5 pt-2">
    <div class="px-1 pb-2 pt-1">
      <MoleculesNextMemberBlockHead
        :title="texts.title"
        :link-label="state === 'ready' ? texts.all : undefined"
        @open="$emit('all')"
      />
    </div>

    <template v-if="state === 'ready'">
      <MoleculesNextMemberOperationDay v-for="day in days" :key="day.id" :label="day.label" :operations="day.operations" />
    </template>

    <template v-else-if="state === 'loading'">
      <div v-for="row in SKELETON_ROWS" :key="row" :class="row > 1 ? 'border-t border-white/6' : ''">
        <MoleculesNextMemberOperationRow />
      </div>
    </template>

    <MoleculesNextMemberNotice v-else-if="state === 'empty'" state="empty" :message="texts.empty" />

    <MoleculesNextMemberNotice v-else state="error" :message="texts.error" :retry-label="texts.retry" @retry="$emit('retry')" />
  </section>
</template>
