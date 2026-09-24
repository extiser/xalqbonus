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
  <div class="flex min-h-dvh flex-col bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <div class="relative flex flex-col gap-[34px] overflow-hidden px-5 py-[26px]">
      <AtomsNextMemberHeatBackdrop :stage="stage" />

      <!-- Шапка экрана акции — прежняя шапка главной, перенесена сюда как есть до отдельной задачи
           на этот экран: у главной шапка стала липкой и без «обновить» (#201). Центр экрана занят
           дневной целью, поэтому баланс здесь пилюлей в шапке. -->
      <div class="relative flex items-center gap-3">
        <AtomsNextMemberIconButton :label="texts.profile" size="l" @click="$emit('profile')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
            <circle cx="12" cy="8.5" r="3.6" stroke="currentColor" stroke-width="1.8" />
            <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </AtomsNextMemberIconButton>

        <div class="min-w-0 grow">
          <AtomsNextMemberNameplate :name="name" :callsign="callsign" />
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <AtomsNextMemberBalancePill :points="balance" />
          <AtomsNextMemberIconButton :label="texts.refresh" size="l" @click="$emit('refresh')">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.6-5.9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
              <path d="M20 4v4.4h-4.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </AtomsNextMemberIconButton>
        </div>
      </div>

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
