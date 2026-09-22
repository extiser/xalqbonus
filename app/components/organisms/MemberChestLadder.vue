<script setup lang="ts">
import type {
  MemberChestLadder,
  MemberChestStep,
  MemberDayChest,
  MiniAppOpenChestRequestBody,
} from '#shared/types/miniapp';

/**
 * Лестница сундуков участника — рабочий минимум (issue #181): три строки — сундуки дня,
 * трёх дней, недели — и сетка сундуков дня. Нажатие на заработанный сундук открывает его.
 *
 * Вёрстка по макетам (`03-member-chests-states.html`, `04-day-chests-sheet.html`), шторки
 * и анимация открытия сюда не входят и приезжают проходом по дизайну. Что показать и каким
 * состоянием, решил сервер; здесь только раскраска состояния.
 */
defineProps<{
  chests: MemberChestLadder;
  /** Ответ в пути: сундуки не нажимаются, чтобы второе нажатие не ушло вдогонку. */
  acting: boolean;
}>();

defineEmits<{ open: [chest: MiniAppOpenChestRequestBody] }>();

/** Строка ступени: золото — есть что открыть, гранат — ваш, серый — не в этот раз. */
const STEP_CLASSES: Record<MemberChestStep['state'], string> = {
  reachable: 'border-slate-200 bg-white text-slate-900',
  to_open: 'border-amber-400 bg-amber-50 text-slate-900',
  opened: 'border-rose-300 bg-white text-slate-900',
  unreachable: 'border-slate-200 bg-slate-100 text-slate-400',
};

const DAY_ROW_CLASSES: Record<MemberChestLadder['dayRow']['state'], string> = {
  idle: 'border-slate-200 bg-white text-slate-900',
  to_open: 'border-amber-400 bg-amber-50 text-slate-900',
  opened: 'border-rose-300 bg-white text-slate-900',
};

const CARD_CLASSES: Record<MemberDayChest['state'], string> = {
  ahead: 'border-slate-200 bg-slate-100 text-slate-400',
  today: 'border-rose-700 bg-white text-slate-900',
  to_open: 'border-amber-400 bg-amber-100 font-semibold text-amber-800',
  opened: 'border-slate-300 bg-white text-slate-600',
  missed: 'border-slate-200 bg-slate-100 text-slate-500',
};
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2 rounded-xl border-2 p-3" :class="DAY_ROW_CLASSES[chests.dayRow.state]">
      <div class="flex flex-col">
        <p class="text-sm font-semibold">{{ chests.dayRow.title }}</p>
        <p class="text-xs">{{ chests.dayRow.caption }}</p>
      </div>
      <p v-if="chests.dayRow.state === 'opened'" class="text-sm font-semibold">
        {{ chests.dayRow.opened }}
      </p>
    </div>

    <ol class="grid grid-cols-4 gap-1">
      <li v-for="chest in chests.days" :key="chest.day">
        <button
          type="button"
          class="flex h-16 w-full flex-col items-center justify-center gap-0.5 rounded-md border-2 px-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-default"
          :class="CARD_CLASSES[chest.state]"
          :disabled="chest.state !== 'to_open' || acting"
          @click="$emit('open', { kind: 'day', day: chest.day })"
        >
          <span class="font-medium">{{ chest.day }}</span>
          <span v-if="chest.tripsText">{{ chest.tripsText }}</span>
          <span>{{ chest.label }}</span>
          <span v-if="chest.prizeText" class="truncate text-[10px]">{{ chest.prizeText }}</span>
        </button>
      </li>
    </ol>

    <button
      v-for="step in [chests.threeDays, chests.week]"
      :key="step.kind"
      type="button"
      class="flex items-center justify-between gap-2 rounded-xl border-2 p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-default"
      :class="STEP_CLASSES[step.state]"
      :disabled="step.state !== 'to_open' || acting"
      @click="$emit('open', { kind: step.kind, day: null })"
    >
      <span class="flex flex-col">
        <span class="text-sm font-semibold" :class="{ 'text-amber-700': step.kind === 'week' && step.state !== 'unreachable' }">
          {{ step.title }}
        </span>
        <span class="text-xs">{{ step.caption }}</span>
      </span>
      <span v-if="step.prizeText" class="text-xs font-medium">{{ step.prizeText }}</span>
    </button>
  </div>
</template>
