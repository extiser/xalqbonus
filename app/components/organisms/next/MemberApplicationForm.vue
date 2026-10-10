<script setup lang="ts">
import { computed } from 'vue';
import { CANDIDATE_NAME_MAX_LENGTH, MANUAL_PHONE_DIGITS, readCandidateName } from '#shared/candidateApplications';
import type { MemberLanguage } from '~/types/memberView';

/**
 * Экран заявки кандидата (issue #456) — `_reference/design/application/01-form.html`.
 *
 * Шапка и живой фон — как у регистрации, заголовок и строка под ним. Всё нажимаемое — внизу,
 * в зоне пальца: поле «Имя», строка-подсказка про окна Telegram, «Отправить заявку» и строка
 * условий со сноской. Окна Telegram не наши и здесь не рисуются.
 *
 * `declined` — в окне номера нажали «Отмена»: подсказка над кнопкой сменяется объяснением
 * розовым, кнопка остаётся нажимаемой. `old` — Telegram без окна номера (`#old` макета): второе
 * поле — номер после `+998`, подсказки про окна нет. Пока идёт запрос (`busy`), гаснут кнопка
 * и язык: язык уже уехал в заявке.
 */
const props = defineProps<{
  texts: {
    title: string;
    lead: string;
    nameLabel: string;
    namePlaceholder: string;
    phoneLabel: string;
    ask: string;
    declined: string;
    send: string;
    sending: string;
    termsCommission: string;
    termsCommissionNote: string;
    termsBonus: string;
    termsBonusNote: string;
    termsLegend: string;
  };
  language: MemberLanguage;
  old: boolean;
  declined: boolean;
  busy: boolean;
}>();

defineEmits<{ 'update:language': [language: MemberLanguage]; send: [] }>();

const name = defineModel<string>('name', { required: true });
const phone = defineModel<string>('phone', { required: true });

/** Кнопка гаснет, пока нет имени — и девяти цифр номера на старом Telegram. */
const ready = computed(() => {
  const phoneReady = !props.old || phone.value.replace(/\D/g, '').length === MANUAL_PHONE_DIGITS;

  return readCandidateName(name.value) !== null && phoneReady;
});
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-clip bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[470px] overflow-hidden">
      <AtomsNextMemberLiveBackdrop variant="registration" />
    </div>

    <MoleculesNextMemberRegistrationHeader>
      <AtomsNextMemberLanguageSwitch
        :model-value="language"
        :disabled="busy"
        @update:model-value="(next) => $emit('update:language', next)"
      />
    </MoleculesNextMemberRegistrationHeader>

    <div class="relative z-[1] flex grow flex-col px-5 pt-16 text-left">
      <AtomsNextMemberScreenTitle :text="texts.title" tone="primary" />
      <p class="m-0 mt-3 max-w-[380px] text-[15px] font-normal leading-[1.5] text-xb-secondary">{{ texts.lead }}</p>
    </div>

    <div
      class="sticky bottom-0 z-[2] bg-[linear-gradient(180deg,rgba(11,13,17,0)_0%,#0B0D11_26%)] px-5 pt-4 pb-[calc(20px+env(safe-area-inset-bottom))]"
    >
      <div class="mb-3 flex flex-col gap-2.5">
        <AtomsNextMemberSurveyField
          v-model="name"
          variant="line"
          :label="texts.nameLabel"
          :placeholder="texts.namePlaceholder"
          :maxlength="CANDIDATE_NAME_MAX_LENGTH"
          autocomplete="given-name"
        />
        <AtomsNextMemberPhoneField v-if="old" v-model="phone" :label="texts.phoneLabel" />
      </div>

      <p
        v-if="!old"
        class="m-0 mb-3 min-h-[39px] text-center text-[13px] font-light leading-[1.5]"
        :class="declined ? 'text-[#FFB4C2]' : 'text-xb-grey'"
      >{{ declined ? texts.declined : texts.ask }}</p>

      <AtomsNextMemberButton size="l" tone="garnet" :disabled="!ready" :busy="busy" @click="$emit('send')">
        {{ texts.send }}
      </AtomsNextMemberButton>
      <p v-if="busy" class="m-0 mt-2.5 text-center text-[13px] font-light text-xb-grey">{{ texts.sending }}</p>

      <ul
        class="m-0 mt-3.5 flex list-none flex-wrap justify-center gap-x-3.5 gap-y-1 p-0 text-[12.5px] font-normal leading-[1.45] text-xb-grey"
      >
        <li class="flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" class="shrink-0 text-xb-garnet">
            <path d="M6 18L18 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" stroke-width="2" />
            <circle cx="16.5" cy="16.5" r="2.5" stroke="currentColor" stroke-width="2" />
          </svg>
          <span><b class="font-semibold text-xb-secondary">{{ texts.termsCommission }}</b> {{ texts.termsCommissionNote }}</span>
        </li>
        <li class="flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" class="shrink-0 text-xb-garnet">
            <rect x="4" y="9" width="16" height="11" rx="2" stroke="currentColor" stroke-width="2" />
            <path
              d="M4 13h16M12 9v11M12 9c-2-4-6-3-5-1s5 1 5 1zm0 0c2-4 6-3 5-1s-5 1-5 1z"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
            />
          </svg>
          <span><b class="font-semibold text-xb-secondary">{{ texts.termsBonus }}</b> {{ texts.termsBonusNote }}</span>
        </li>
      </ul>
      <p class="m-0 mt-1.5 text-center text-[11.5px] font-light leading-[1.4] text-xb-muted">{{ texts.termsLegend }}</p>
    </div>
  </div>
</template>
