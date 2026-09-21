<script setup lang="ts">
import type { MemberCampaign, MemberWeekDay, MemberWeekLineTone } from '#shared/types/miniapp';

/**
 * Акция на экране участника — рабочий минимум (issue #166): название, сроки, состояние
 * строкой, «Участвовать» и ссылка «Отказаться».
 *
 * Вёрстка по макетам сюда не входит и приезжает своей задачей: она переоденет этот блок,
 * а вызовы ручек и разбор состояний останутся прежними. Тексты — с сервера, на языке
 * водителя.
 *
 * У вступившего под этим — неделя (issue #168): день окна, клетки дней, счётчик зачётных дней,
 * строки срока и запаса и сегодняшняя цель. Какую строку показать и каким видом, решил сервер;
 * здесь только раскраска вида. Без оформления, анимации и нагрева фона.
 */
defineProps<{
  campaign: MemberCampaign;
  /** Ответ в пути: кнопки гаснут, чтобы второе нажатие не ушло вдогонку. */
  acting: boolean;
  error: string | null;
}>();

defineEmits<{ join: []; decline: [] }>();

const TONE_CLASSES: Record<MemberWeekLineTone, string> = {
  gold: 'text-sm font-semibold text-amber-600',
  grey: 'text-xs text-slate-500',
  white: 'text-xs font-medium text-slate-900',
};

/**
 * Что в клетке: зачтённый день — отметка, прошедший — счёт «3/5», сегодняшний до цели и будущий —
 * ничего. Сегодняшний не наливается по ходу дня: счёт дня стоит в блоке цели над неделей.
 */
const cellText = (day: MemberWeekDay): string => {
  if (day.qualified) {
    return '✓';
  }

  return day.kind === 'past' ? `${day.trips}/5` : '';
};

const CELL_CLASSES: Record<MemberWeekDay['kind'], string> = {
  past: 'border-slate-200',
  today: 'border-rose-700',
  future: 'border-dashed border-slate-200',
};
</script>

<template>
  <section class="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
    <div class="flex flex-col gap-1">
      <p class="text-lg font-semibold text-slate-900">{{ campaign.title }}</p>
      <p class="text-sm text-slate-600">{{ campaign.window }}</p>
      <p class="text-base font-medium text-slate-800">{{ campaign.stateText }}</p>
    </div>

    <template v-if="campaign.canRespond">
      <AtomsMiniAppButton :label="campaign.joinLabel" :disabled="acting" @click="$emit('join')" />
      <button
        type="button"
        class="self-center rounded-md px-2 py-1 text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:text-slate-300"
        :disabled="acting"
        @click="$emit('decline')"
      >
        {{ campaign.declineLabel }}
      </button>
    </template>

    <div v-if="campaign.progress" class="flex flex-col gap-3">
      <div v-if="campaign.progress.today" class="flex flex-col gap-1 rounded-xl bg-white p-3">
        <p class="text-base font-semibold text-slate-900">{{ campaign.progress.today.tripsText }}</p>
        <p class="text-sm text-slate-700">{{ campaign.progress.today.goalText }}</p>
      </div>

      <div class="flex items-baseline justify-between gap-2">
        <p class="text-sm font-medium text-slate-800">{{ campaign.progress.dayText }}</p>
        <p v-if="campaign.progress.weekTop" :class="TONE_CLASSES[campaign.progress.weekTop.tone]">
          {{ campaign.progress.weekTop.text }}
        </p>
      </div>

      <ol class="grid grid-flow-col auto-cols-fr gap-1">
        <li
          v-for="day in campaign.progress.days"
          :key="day.day"
          class="flex h-10 items-center justify-center rounded-md border-2 text-xs"
          :class="[
            CELL_CLASSES[day.kind],
            day.qualified ? 'bg-rose-100 font-semibold text-rose-800' : 'bg-white text-slate-700',
          ]"
        >
          {{ cellText(day) }}
        </li>
      </ol>

      <div class="flex items-baseline justify-between gap-2">
        <p class="text-sm font-semibold text-rose-800">{{ campaign.progress.counterText }}</p>
        <p
          v-if="campaign.progress.weekBottom"
          :class="TONE_CLASSES[campaign.progress.weekBottom.tone]"
        >
          {{ campaign.progress.weekBottom.text }}
        </p>
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
  </section>
</template>
