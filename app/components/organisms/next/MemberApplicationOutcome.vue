<script setup lang="ts">
import type { MemberLanguage, MemberOfficeView } from '~/types/memberView';

/**
 * Исход заявки кандидата (issue #456) — один экран на три вида (`kind`):
 *
 * - `accepted` — «{имя}, заявка принята», `_reference/design/application/02-accepted.html`;
 * - `repeat` — «{имя}, заявка уже отправлена» с днём заявки, `04-repeat.html`;
 * - `failed` — сбой отправки, `03-failed.html`: повтор основной кнопкой, под ней строка — сбой
 *   алым или, пока идёт повтор (`busy`), «Отправляем заявку…»; «Написать менеджеру» — серой
 *   второй кнопкой.
 *
 * Общие у всех — шапка, живой фон, заголовок на высоте экрана заявки и офис карточкой. Номер
 * в строке под заголовком — белым и неразрывно: по нему свяжутся, кандидат сверяет его глазами.
 * Строка приходит частями — до номера и после, — номер ставит экран.
 */
type OutcomeKind = 'accepted' | 'repeat' | 'failed';

withDefaults(
  defineProps<{
    kind: OutcomeKind;
    language: MemberLanguage;
    title: string;
    /** Строка под заголовком: текст до номера, номер, текст после. У `failed` номера нет. */
    lead: { before: string; phone: string; after: string };
    officeTitle: string;
    offices: MemberOfficeView[];
    mapLabel: string;
    writeManager: string;
    /** `failed`: повтор, строка сбоя и строка ожидания. */
    send?: string;
    error?: string;
    sending?: string;
    busy?: boolean;
  }>(),
  { send: '', error: '', sending: '', busy: false },
);

defineEmits<{
  'update:language': [language: MemberLanguage];
  map: [office: MemberOfficeView];
  write: [];
  send: [];
}>();
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
      <AtomsNextMemberScreenTitle :text="title" tone="primary" />
      <p class="m-0 mt-3 max-w-[380px] text-[15px] font-normal leading-[1.5] text-xb-secondary">
        {{ lead.before }}<b v-if="lead.phone" class="font-semibold whitespace-nowrap text-xb-text">{{ lead.phone }}</b>{{ lead.after }}
      </p>

      <div class="mt-7 mb-2 px-0.5">
        <AtomsNextMemberGroupLabel :label="officeTitle" />
      </div>
      <div class="flex flex-col gap-2.5">
        <MoleculesNextMemberOfficeCard
          v-for="office in offices"
          :key="office.name"
          :office="office"
          :texts="{ map: mapLabel }"
          @map="$emit('map', office)"
        />
      </div>
    </div>

    <div
      class="sticky bottom-0 z-[2] bg-[linear-gradient(180deg,rgba(11,13,17,0)_0%,#0B0D11_26%)] px-5 pt-[22px] pb-[calc(20px+env(safe-area-inset-bottom))]"
    >
      <template v-if="kind === 'failed'">
        <AtomsNextMemberButton size="l" tone="garnet" :busy="busy" @click="$emit('send')">{{ send }}</AtomsNextMemberButton>
        <p v-if="busy" class="m-0 mt-3 min-h-[18px] text-center text-[13px] font-light text-xb-grey">{{ sending }}</p>
        <p v-else class="m-0 mt-3 flex min-h-[18px] items-center justify-center gap-[7px] text-center text-[13px] font-normal text-xb-scarlet">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true" class="shrink-0">
            <circle cx="12" cy="12" r="9" stroke="#FF5C78" stroke-width="1.8" />
            <path d="M12 7.5v5.5" stroke="#FF5C78" stroke-width="2" stroke-linecap="round" />
            <circle cx="12" cy="16.3" r="1.2" fill="#FF5C78" />
          </svg>
          <span>{{ error }}</span>
        </p>
        <div class="mt-3">
          <AtomsNextMemberButton size="l" tone="grey" @click="$emit('write')">
            <span class="inline-flex items-center gap-2.5">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                <path
                  d="M4.5 11.6 19 5.5l-2.6 13.2-4.6-3.9-2.6 2.4.4-4.2 6.2-5.6-7.7 4.6-3.6-1.3Z"
                  stroke="#F4F6F8"
                  stroke-width="1.7"
                  stroke-linejoin="round"
                />
              </svg>
              {{ writeManager }}
            </span>
          </AtomsNextMemberButton>
        </div>
      </template>

      <AtomsNextMemberButton v-else size="l" tone="garnet" @click="$emit('write')">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
          <path
            d="M4.5 11.6 19 5.5l-2.6 13.2-4.6-3.9-2.6 2.4.4-4.2 6.2-5.6-7.7 4.6-3.6-1.3Z"
            stroke="#fff"
            stroke-width="1.7"
            stroke-linejoin="round"
          />
        </svg>
        {{ writeManager }}
      </AtomsNextMemberButton>
    </div>
  </div>
</template>
