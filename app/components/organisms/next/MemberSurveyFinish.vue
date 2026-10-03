<script setup lang="ts">
import type { MemberLanguage } from '~/types/memberView';

/**
 * Финал опроса и экран «опрос закрыт» — `_reference/design/survey/finish.html`, `closed.html`.
 * Устроены одинаково: шапка, заголовок на той же высоте, что на экране открытия, текст и одна
 * гранатовая кнопка внизу.
 *
 * Финал — все полоски белые и карточка «+50 — баллов уже на балансе» (`gain`), у опроса без
 * награды карточки нет. «Опрос закрыт» — без полосок и без карточки.
 *
 * Карточка — своя, вне шкалы намеренно, и в `MemberCard` / `MemberBigNumber` не сводится:
 * по размеру текста, цифра Unbounded 40/600 (решение Руслана 03-10-2026, `survey.md` → п. 5
 * сверки; CSS карточки в снимке `finish.html` — отвергнутая проба).
 */
defineProps<{
  /** Полоски сторис. Нет — экран «опрос закрыт». */
  bars: { count: number; filled: number } | null;
  title: string;
  lead: string;
  gain: { amount: string; caption: string } | null;
  button: string;
}>();

const language = defineModel<MemberLanguage>('language', { required: true });

defineEmits<{ action: [] }>();
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-clip bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[470px] overflow-hidden">
      <AtomsNextMemberLiveBackdrop variant="registration" />
    </div>

    <MoleculesNextMemberSurveyHeader v-model:language="language" :bars="bars" />

    <div class="relative z-[1] grow px-5 pt-16">
      <AtomsNextMemberScreenTitle :text="title" tone="primary" />
      <p class="m-0 mt-3 max-w-[380px] text-[15px] leading-[1.5] font-normal whitespace-pre-line text-xb-secondary">{{ lead }}</p>

      <div
        v-if="gain"
        class="mt-7 inline-block rounded-[20px] border border-white/8 bg-white/5 px-[22px] pt-[18px] pb-4"
      >
        <div class="font-unbounded text-[40px] leading-none font-semibold tracking-[-2px] text-xb-text">{{ gain.amount }}</div>
        <div class="mt-2 text-[14px] font-normal text-xb-light">{{ gain.caption }}</div>
      </div>
    </div>

    <div
      class="sticky bottom-0 z-[2] flex flex-col gap-2.5 bg-[linear-gradient(180deg,rgba(11,13,17,0)_0%,#0B0D11_26%)] px-5 pt-[22px] pb-[calc(20px+env(safe-area-inset-bottom))]"
    >
      <AtomsNextMemberButton size="l" tone="garnet" @click="$emit('action')">{{ button }}</AtomsNextMemberButton>
    </div>
  </div>
</template>
