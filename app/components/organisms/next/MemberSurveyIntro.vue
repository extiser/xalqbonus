<script setup lang="ts">
import type { MemberSurveyTextPart } from '#shared/types/memberSurvey';
import type { MemberLanguage } from '~/types/memberView';

/**
 * Экран открытия опроса — `_reference/design/survey/intro.html`. Сюда водитель попадает
 * по кнопке «✍️ Пройти опрос» из рассылки или с плашки «Пройдите опрос» на главной.
 *
 * Стиль регистрации (`MemberRegistrationPhone`): живой фон, заголовок и текст слева, строки
 * условий с иконками, всё нажимаемое внизу. Полоски пустые — ни одного вопроса не пройдено.
 * Основное действие над серой кнопкой отказа, как в шторках.
 *
 * Значки условий — по смыслу строки (`kind`), а не по порядку: строки о баллах у опроса без
 * награды нет.
 */
defineProps<{
  questionCount: number;
  texts: {
    title: string;
    lead: string;
    terms: { kind: 'questions' | 'points' | 'until' | 'saved'; parts: MemberSurveyTextPart[] }[];
    start: string;
    decline: string;
  };
}>();

const language = defineModel<MemberLanguage>('language', { required: true });

defineEmits<{ start: []; decline: [] }>();
</script>

<template>
  <!-- Высота — остаток окна под полосой «Демо-аккаунт», а не окно: см. `MemberSurveyQuestion`. -->
  <div class="relative flex min-h-[calc(100dvh-var(--xb-demo-offset))] flex-col overflow-clip bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[470px] overflow-hidden">
      <AtomsNextMemberLiveBackdrop variant="registration" />
    </div>

    <MoleculesNextMemberSurveyHeader v-model:language="language" :bars="{ count: questionCount, filled: 0 }" />

    <div class="relative z-[1] grow px-5 pt-16">
      <AtomsNextMemberScreenTitle :text="texts.title" tone="primary" />
      <p class="m-0 mt-3 max-w-[380px] text-[15px] leading-[1.5] font-normal whitespace-pre-line text-xb-secondary">{{ texts.lead }}</p>

      <ul class="m-0 mt-[26px] flex list-none flex-col gap-3 p-0">
        <li v-for="term in texts.terms" :key="term.kind" class="flex items-center gap-3 text-[15px] font-normal text-xb-text">
          <span
            class="box-content flex size-[34px] shrink-0 items-center justify-center rounded-[12px] border border-white/8 bg-white/6 text-xb-garnet"
          >
            <svg v-if="term.kind === 'questions'" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <svg v-else-if="term.kind === 'points'" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8" />
              <path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            <svg v-else-if="term.kind === 'until'" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" stroke-width="1.8" />
              <path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path d="M5 12l4 4 10-10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span>
            <template v-for="(part, index) in term.parts" :key="index">
              <b v-if="part.strong" class="font-bold">{{ part.text }}</b>
              <template v-else>{{ part.text }}</template>
            </template>
          </span>
        </li>
      </ul>
    </div>

    <div
      class="sticky bottom-0 z-[2] flex flex-col gap-2.5 bg-[linear-gradient(180deg,rgba(11,13,17,0)_0%,#0B0D11_26%)] px-5 pt-[22px] pb-[calc(20px+env(safe-area-inset-bottom))]"
    >
      <AtomsNextMemberButton size="l" tone="garnet" @click="$emit('start')">{{ texts.start }}</AtomsNextMemberButton>
      <AtomsNextMemberButton size="l" tone="grey" @click="$emit('decline')">{{ texts.decline }}</AtomsNextMemberButton>
    </div>
  </div>
</template>
