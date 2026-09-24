<script setup lang="ts">
import type { MemberLanguage } from '~/types/memberView';

/**
 * Регистрация, шаг 1 — выбор языка: `registration/registration-language.html`.
 *
 * Экран двуязычный целиком: язык ещё не выбран. Узбекский первым — крупно и белым, русский
 * тише. Внизу подпись и две равные серые кнопки: ни один язык не главный. Нажатие сразу
 * ведёт на шаг 2, «Далее» нет — выбор из двух и есть действие.
 *
 * Нажимаемое стоит там же, где кнопка номера на шаге 2: снизу 50 — это 20 полей и 30 строки
 * «Проверяем…» под кнопкой шага 2, так низ последней кнопки на той же высоте. Приветствие
 * на той же высоте, что заголовок шага 2: переход между шагами не дёргает экран.
 */
defineProps<{
  welcome: Record<MemberLanguage, { title: string; lead: string }>;
  selectLanguage: string;
  languageUz: string;
  languageRu: string;
}>();

defineEmits<{ select: [language: MemberLanguage] }>();
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-hidden bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[470px] overflow-hidden">
      <AtomsNextMemberLiveBackdrop variant="registration" />
    </div>

    <MoleculesNextMemberRegistrationHeader />

    <div class="relative z-[1] flex grow flex-col items-start px-5 pt-[140px] text-left">
      <div class="flex flex-col gap-[26px]">
        <MoleculesNextMemberTextBlock :title="welcome.uz.title" :paragraphs="[welcome.uz.lead]" tone="primary" />
        <MoleculesNextMemberTextBlock :title="welcome.ru.title" :paragraphs="[welcome.ru.lead]" tone="secondary" />
      </div>
    </div>

    <div class="relative z-[2] px-5 pb-[calc(50px+env(safe-area-inset-bottom))] pt-[22px]">
      <p class="m-0 mb-3.5 text-left text-[13px] font-light leading-[1.5] text-xb-grey">{{ selectLanguage }}</p>
      <div class="flex w-full flex-col gap-2.5">
        <AtomsNextMemberButton size="l" tone="choice" @click="$emit('select', 'uz')">{{ languageUz }}</AtomsNextMemberButton>
        <AtomsNextMemberButton size="l" tone="choice" @click="$emit('select', 'ru')">{{ languageRu }}</AtomsNextMemberButton>
      </div>
    </div>
  </div>
</template>
