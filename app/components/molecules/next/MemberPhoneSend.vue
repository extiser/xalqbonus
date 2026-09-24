<script setup lang="ts">
import type { MemberPhoneSendStatus } from '~/types/memberView';

/**
 * Низ экранов, которые просят номер: шаг 2 регистрации и повтор
 * (`registration/registration-screen.html`, `registration-retry.html`).
 *
 * Над кнопкой — подсказка про системное окно Telegram: это пояснение к кнопке, а не абзац
 * экрана. Под кнопкой — строка состояния: «Проверяем…» серым, пока идёт запрос, или сбой
 * алым со значком — на её месте, после запроса. Строка держит место и пустой: кнопка
 * не прыгает, когда текст появляется, и низ шага 1 выровнен по ней.
 *
 * Затемнение сверху: низ стоит над прокручиваемым содержимым, и список не обрывается
 * о кнопку. Прилипание к низу экрана задаёт контейнер.
 */
defineProps<{
  ask: string;
  send: string;
  /** Идёт проверка: кнопка гаснет, внутри крутится загрузчик. */
  busy: boolean;
  /** Строка под кнопкой. Нет — место под ней пустое. */
  status: MemberPhoneSendStatus | null;
}>();

defineEmits<{ send: [] }>();
</script>

<template>
  <div class="bg-[linear-gradient(180deg,rgba(11,13,17,0)_0%,#0B0D11_26%)] px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-[22px]">
    <p class="m-0 mb-3.5 text-center text-[13px] font-light leading-[1.5] text-xb-grey">{{ ask }}</p>
    <AtomsNextMemberButton size="l" tone="garnet" :busy="busy" @click="$emit('send')">{{ send }}</AtomsNextMemberButton>
    <p
      v-if="status?.tone === 'failed'"
      class="m-0 mt-3 flex min-h-[18px] items-center justify-center gap-[7px] text-center text-[13px] font-normal text-xb-scarlet"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true" class="shrink-0">
        <circle cx="12" cy="12" r="9" stroke="#FF5C78" stroke-width="1.8" />
        <path d="M12 7.5v5.5" stroke="#FF5C78" stroke-width="2" stroke-linecap="round" />
        <circle cx="12" cy="16.3" r="1.2" fill="#FF5C78" />
      </svg>
      <span>{{ status.text }}</span>
    </p>
    <p v-else class="m-0 mt-3 min-h-[18px] text-center text-[13px] font-light text-xb-grey">{{ status?.text }}</p>
  </div>
</template>
