<script setup lang="ts">
import type { MemberSurveyQuestion } from '#shared/types/memberSurvey';
import type { MemberLanguage } from '~/types/memberView';

/**
 * Экран вопроса опроса — `_reference/design/survey/question-single-own.html`, `question-multiple.html`,
 * `question-text.html`, `question-scale.html`. Вопрос на экран, как сторис.
 *
 * Надзаголовок «Вопрос N из M», вопрос, подсказка по типу. Внизу «Назад» — квадрат 52 в цветах
 * вторичной L, в рост с «Далее» — и «Далее». Переход к следующему вопросу — только через «Далее»,
 * у всех типов (решение Руслана 03-10-2026).
 *
 * «Далее» обязательного вопроса без ответа погашено. У необязательного без ответа основная кнопка
 * серая и называется «Пропустить» (`skip`); отдельной кнопки «Пропустить» нет.
 *
 * Варианты `multiple` идут за вопросом и прокручиваются, «Назад» и «Далее» прилипают
 * к низу; у остальных типов ответы стоят внизу, в зоне большого пальца.
 *
 * Помещается — прокрутки нет (issue #346). Экран высотой в остаток окна под полосой
 * «Демо-аккаунт», а не в окно: с полосой страница выходила на 44 px выше окна, прокручивалась
 * всегда, и прилипший низ накрывал последний вариант. Свободное место забирает блок вопроса
 * (`grow`) — варианты прижаты к низу; не хватает места — прокрутка.
 *
 * Состояния ответа здесь нет: черновик (`answer`) держит страница, нажатия уходят событиями.
 */
const props = defineProps<{
  bars: { count: number; filled: number };
  question: MemberSurveyQuestion;
  answer: {
    optionIds: string[];
    /** Поле «Своего варианта» открыто. */
    ownOpen: boolean;
    ownText: string;
    textValue: string;
    scaleValue: number | null;
  };
  /** «Далее» нажимается. */
  canNext: boolean;
  /** Необязательный вопрос без ответа: серая «Пропустить» вместо «Далее». */
  skip: boolean;
  /** Ответ сохраняется. */
  saving: boolean;
  /** Ответ не сохранился — строка над кнопками. */
  failed: string | null;
  texts: {
    next: string;
    skip: string;
    back: string;
    ownAnswer: string;
    placeholder: string;
    scaleLow: string;
    scaleHigh: string;
  };
}>();

const language = defineModel<MemberLanguage>('language', { required: true });

defineEmits<{
  option: [optionId: string];
  own: [];
  'update:ownText': [text: string];
  'update:textValue': [text: string];
  scale: [value: number];
  next: [];
  back: [];
}>();

const SCALE = [1, 2, 3, 4, 5] as const;
</script>

<template>
  <div class="relative flex min-h-[calc(100dvh-var(--xb-demo-offset))] flex-col overflow-clip bg-xb-screen font-manrope leading-[normal] text-xb-text">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[470px] overflow-hidden">
      <AtomsNextMemberLiveBackdrop variant="registration" />
    </div>

    <MoleculesNextMemberSurveyHeader v-model:language="language" :bars="bars" />

    <div class="relative z-[1] grow px-5 pt-16">
      <!-- Флексом, а не абзацем: строка абзаца выше подписи 12 px и сдвигает её вниз. -->
      <div class="mb-2.5 flex"><AtomsNextMemberEyebrow :label="question.number" /></div>
      <AtomsNextMemberScreenTitle :text="question.text" tone="primary" />
      <p class="m-0 mt-3 text-[15px] leading-[1.5] font-normal text-xb-secondary">{{ question.hint }}</p>
    </div>

    <!-- Варианты нескольких ответов — за вопросом, прокручиваются вместе с экраном. -->
    <div v-if="question.type === 'multiple'" class="relative z-[1] px-5 pt-[26px]">
      <div class="flex flex-col gap-2.5">
        <AtomsNextMemberSurveyChoice
          v-for="option in question.options"
          :key="option.optionId"
          :text="option.text"
          mark="check"
          :selected="answer.optionIds.includes(option.optionId)"
          @select="$emit('option', option.optionId)"
        />
        <template v-if="question.allowOwnAnswer">
          <AtomsNextMemberSurveyField
            v-if="answer.ownOpen"
            variant="own"
            :label="texts.ownAnswer"
            :placeholder="texts.placeholder"
            :model-value="answer.ownText"
            @update:model-value="(text) => $emit('update:ownText', text)"
          />
          <AtomsNextMemberSurveyChoice v-else :text="texts.ownAnswer" mark="own" @select="$emit('own')" />
        </template>
      </div>
    </div>

    <div
      class="sticky bottom-0 z-[2] px-5 pt-[22px] pb-[calc(20px+env(safe-area-inset-bottom))]"
      :class="
        question.type === 'multiple'
          ? 'bg-[linear-gradient(180deg,rgba(11,13,17,0)_0%,#0B0D11_40%)]'
          : 'bg-[linear-gradient(180deg,rgba(11,13,17,0)_0%,#0B0D11_12%)]'
      "
    >
      <div v-if="question.type === 'single'" class="flex flex-col gap-2.5">
        <AtomsNextMemberSurveyChoice
          v-for="option in question.options"
          :key="option.optionId"
          :text="option.text"
          mark="radio"
          :selected="answer.optionIds.includes(option.optionId)"
          @select="$emit('option', option.optionId)"
        />
        <template v-if="question.allowOwnAnswer">
          <AtomsNextMemberSurveyField
            v-if="answer.ownOpen"
            variant="own"
            :label="texts.ownAnswer"
            :placeholder="texts.placeholder"
            :model-value="answer.ownText"
            @update:model-value="(text) => $emit('update:ownText', text)"
          />
          <AtomsNextMemberSurveyChoice v-else :text="texts.ownAnswer" mark="own" @select="$emit('own')" />
        </template>
      </div>

      <AtomsNextMemberSurveyField
        v-else-if="question.type === 'text'"
        variant="text"
        :placeholder="texts.placeholder"
        :model-value="answer.textValue"
        @update:model-value="(text) => $emit('update:textValue', text)"
      />

      <template v-else-if="question.type === 'scale'">
        <div class="grid grid-cols-5 gap-2" role="radiogroup">
          <button
            v-for="value in SCALE"
            :key="value"
            type="button"
            role="radio"
            :aria-checked="answer.scaleValue === value"
            class="relative z-[1] h-[60px] cursor-pointer rounded-[16px] border font-manrope text-[20px] font-bold text-xb-text transition-[background-color,border-color] duration-150"
            :class="
              answer.scaleValue === value
                ? 'border-xb-garnet bg-[rgba(232,54,93,0.14)]'
                : 'border-white/8 bg-xb-button-grey active:bg-[#2A2E35]'
            "
            @click="$emit('scale', value)"
          >
            {{ value }}
          </button>
        </div>
        <div class="mx-0.5 mt-2.5 flex justify-between text-[12px] font-light text-xb-grey">
          <span>{{ texts.scaleLow }}</span>
          <span>{{ texts.scaleHigh }}</span>
        </div>
      </template>

      <p v-if="props.failed" class="m-0 mt-3 text-[13px] leading-[1.4] font-normal text-xb-scarlet-soft" role="alert">{{ props.failed }}</p>

      <div
        class="flex gap-2.5"
        :class="question.type === 'multiple' ? '' : question.type === 'scale' ? 'mt-[18px]' : 'mt-4'"
      >
        <button
          type="button"
          :aria-label="texts.back"
          class="relative z-[1] flex size-[52px] shrink-0 cursor-pointer items-center justify-center rounded-[16px] border border-white/8 bg-xb-button-grey text-xb-text active:bg-[#2A2E35]"
          @click="$emit('back')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <!-- Обёртка отдаёт кнопке остаток строки: L во всю ширину и не сжимается сама. -->
        <div class="min-w-0 flex-1">
          <AtomsNextMemberButton
            size="l"
            :tone="skip ? 'grey' : 'garnet'"
            :disabled="!canNext"
            :busy="saving"
            @click="$emit('next')"
          >
            {{ skip ? texts.skip : texts.next }}
          </AtomsNextMemberButton>
        </div>
      </div>
    </div>
  </div>
</template>
