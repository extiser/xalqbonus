<script setup lang="ts">
import type { MemberChestRowView, MemberHeatStage, MemberWeekDayView } from '~/types/memberView';

/**
 * Экран участника акции — `product/design/comeback/03-member-screen.html` и листы
 * `03-member-week-states.html`, `03-member-chests-states.html`, `03-member-heat-scale.html`.
 *
 * Сверху — нагретый фон, шапка с балансом и дневная цель; уровни подписи и числа равны
 * главному экрану, переключение между ними не дёргает раскладку. Ниже — неделя и три
 * строки сундуков: экран отвечает на «где я сейчас», а не «как это работает».
 *
 * Заголовка «Ваши сундуки» над строками нет: три строки с картинками и так читаются
 * как список наград.
 */
defineProps<{
  name: string;
  callsign?: string;
  balance: string;
  stage: MemberHeatStage;
  goal: {
    done: number;
    target: number;
    note: string;
  };
  week: {
    term: string;
    urgent: boolean;
    days: MemberWeekDayView[];
    collected: number;
    skips: string;
  };
  chests: MemberChestRowView[];
  texts: {
    profile: string;
    refresh: string;
    promo: string;
    today: string;
    unit: string;
    take: string;
    updated: string;
    weekTitle: string;
    collectedRest: string;
  };
}>();

defineEmits<{ profile: []; refresh: []; take: []; chest: [chestId: string] }>();
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen font-manrope text-xb-text">
    <div class="relative flex flex-col gap-[34px] overflow-hidden px-5 py-[26px]">
      <AtomsNextMemberHeatBackdrop :stage="stage" />

      <OrganismsNextMemberHomeHeader
        :name="name"
        :callsign="callsign"
        :balance="balance"
        :texts="{ profile: texts.profile, refresh: texts.refresh, promo: texts.promo }"
        @profile="$emit('profile')"
        @refresh="$emit('refresh')"
      />

      <MoleculesNextMemberDailyGoal
        :done="goal.done"
        :target="goal.target"
        :stage="stage"
        :texts="{ today: texts.today, unit: texts.unit, note: goal.note, take: texts.take }"
        @take="$emit('take')"
      />

      <div class="relative -mt-2.5 text-center">
        <AtomsNextMemberSyncNote :text="texts.updated" />
      </div>
    </div>

    <div class="flex flex-col gap-3.5 px-5 pb-7 pt-1">
      <MoleculesNextMemberWeek
        :title="texts.weekTitle"
        :term="week.term"
        :urgent="week.urgent"
        :days="week.days"
        :collected="week.collected"
        :collected-rest="texts.collectedRest"
        :skips="week.skips"
      />

      <div class="flex flex-col gap-2.5">
        <MoleculesNextMemberChestRow v-for="chest in chests" :key="chest.id" :chest="chest" @open="$emit('chest', chest.id)" />
      </div>
    </div>
  </div>
</template>
