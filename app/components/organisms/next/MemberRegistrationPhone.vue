<script setup lang="ts">
import type { MemberLanguage } from '~/types/memberView';

/**
 * Регистрация, шаг 2 — номер: `registration/registration-screen.html`.
 *
 * Заголовок, подзаголовок называет, какой номер нужен, и три коротких обещания. Действие
 * одно — внизу. Нажатие открывает системное окно Telegram, оно не наше и здесь не рисуется.
 *
 * Пока сервер проверяет номер (`checking`), гаснут кнопка и переключатель языка: язык уже
 * уехал в запросе, и смена после дала бы экран на одном языке, а ответ — на другом.
 *
 * Значки обещаний стоят по порядку строк: поездка, подарок, звезда акций.
 */
defineProps<{
  texts: {
    title: string;
    lead: string;
    perks: string[];
    ask: string;
    send: string;
    checking: string;
  };
  language: MemberLanguage;
  checking: boolean;
}>();

defineEmits<{ 'update:language': [language: MemberLanguage]; send: [] }>();
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-hidden bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[470px] overflow-hidden">
      <AtomsNextMemberLiveBackdrop variant="registration" />
    </div>

    <MoleculesNextMemberRegistrationHeader>
      <AtomsNextMemberLanguageSwitch
        :model-value="language"
        :disabled="checking"
        @update:model-value="(next) => $emit('update:language', next)"
      />
    </MoleculesNextMemberRegistrationHeader>

    <div class="relative z-[1] flex grow flex-col items-start px-5 pt-[140px] text-left">
      <AtomsNextMemberScreenTitle :text="texts.title" tone="primary" />
      <p class="m-0 mt-3 max-w-[360px] text-[15px] font-normal leading-[1.5] text-xb-secondary">{{ texts.lead }}</p>

      <ul class="m-0 mt-[26px] flex w-full list-none flex-col gap-3 p-0">
        <li v-for="(perk, index) in texts.perks" :key="index" class="flex items-center gap-3 text-[15px] font-normal text-xb-text">
          <span
            class="box-content flex size-[34px] shrink-0 items-center justify-center rounded-[12px] border border-white/8 bg-white/6 text-xb-garnet"
          >
            <svg v-if="index === 0" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path d="M4 16l3-7h10l3 7M6 16h12v3H6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
              <circle cx="8.5" cy="19" r="1" fill="currentColor" />
              <circle cx="15.5" cy="19" r="1" fill="currentColor" />
            </svg>
            <svg v-else-if="index === 1" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <rect x="4" y="9" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.8" />
              <path
                d="M4 13h16M12 9v11M12 9c-2-4-6-3-5-1s5 1 5 1zm0 0c2-4 6-3 5-1s-5 1-5 1z"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
            </svg>
            <svg v-else-if="index === 2" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path
                d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span>{{ perk }}</span>
        </li>
      </ul>
    </div>

    <div class="sticky bottom-0 z-[2]">
      <MoleculesNextMemberPhoneSend
        :ask="texts.ask"
        :send="texts.send"
        :busy="checking"
        :status="checking ? { tone: 'checking', text: texts.checking } : null"
        @send="$emit('send')"
      />
    </div>
  </div>
</template>
