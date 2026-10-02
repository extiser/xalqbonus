<script setup lang="ts">
import type { SurveyFormFields, SurveyFormQuestion } from '~/types/surveyForm';
import { surveyQuestionTypeLabel } from '~/utils/labels';
import { newSurveyFormKey } from '~/utils/surveyForm';
import { SURVEY_QUESTION_TYPES, surveyQuestionHasOptions } from '#shared/survey';
import type { SurveyQuestionType } from '#shared/types/survey';
import type { SelectOption } from '~/types/selectOption';

/**
 * Вопросы опроса с вариантами (issue #320): добавляются, удаляются и переставляются.
 *
 * У вопроса — тип и галочка «Обязательный»; у вопроса с одним или несколькими ответами —
 * варианты, тоже в две колонки RU и UZ, и галочка «Можно свой ответ» (issue #335). У варианта
 * вопроса с несколькими ответами — галочка «Исключающий». У шкалы значения 1–5 фиксированы,
 * у свободного текста вариантов нет — вместо списка стоит пояснение.
 *
 * Варианты и галочки при смене типа не стираются, а только не уходят: тип, переключённый
 * по ошибке, возвращается вместе с набранным.
 *
 * `readonly` — опрос заморожен или демо у того, кто демо не правит: всё видно, кнопок нет.
 */
defineProps<{
  readonly: boolean;
}>();

const fields = defineModel<SurveyFormFields>('fields', { required: true });

const TYPE_OPTIONS: SelectOption[] = SURVEY_QUESTION_TYPES.map((type) => ({
  value: type,
  label: surveyQuestionTypeLabel(type),
}));

const isQuestionType = (value: string): value is SurveyQuestionType =>
  (SURVEY_QUESTION_TYPES as readonly string[]).includes(value);

const setType = (question: SurveyFormQuestion, value: string): void => {
  if (isQuestionType(value)) {
    question.type = value;
  }
};

/** Переставляет строку списка на шаг. За край не уходит — кнопки там погашены. */
const move = <Item,>(items: Item[], index: number, step: -1 | 1): void => {
  const target = index + step;
  const item = items[index];
  const neighbour = items[target];

  if (item === undefined || neighbour === undefined) {
    return;
  }

  items[index] = neighbour;
  items[target] = item;
};

const addQuestion = (): void => {
  fields.value.questions.push({
    key: newSurveyFormKey(),
    type: 'single',
    textRu: '',
    textUz: '',
    required: true,
    allowOwnAnswer: false,
    options: [],
  });
};

const addOption = (question: SurveyFormQuestion): void => {
  question.options.push({ key: newSurveyFormKey(), textRu: '', textUz: '', exclusive: false });
};

const SCALE_NOTE = 'Шкала от 1 до 5: значения фиксированы, вариантов нет.';
const TEXT_NOTE = 'Водитель отвечает своими словами. Вариантов нет.';
const EXCLUSIVE_NOTE = 'Исключающий вариант снимает остальные отметки — например, «Такого не было».';
</script>

<template>
  <MoleculesSectionPanel
    title="Вопросы"
    note="Водитель видит их по одному, в этом порядке, на языке своего профиля."
  >
    <div class="space-y-4">
      <MoleculesStateNotice
        v-if="fields.questions.length === 0"
        state="empty"
        message="Вопросов пока нет."
      />

      <fieldset
        v-for="(question, questionIndex) in fields.questions"
        :key="question.key"
        :disabled="readonly"
        class="min-w-0 space-y-3 rounded-md border border-slate-200 p-3 sm:p-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm font-semibold text-slate-900">Вопрос {{ questionIndex + 1 }}</p>
          <div v-if="!readonly" class="flex flex-wrap gap-2">
            <AtomsActionButton
              label="Выше"
              :disabled="questionIndex === 0"
              @click="move(fields.questions, questionIndex, -1)"
            />
            <AtomsActionButton
              label="Ниже"
              :disabled="questionIndex === fields.questions.length - 1"
              @click="move(fields.questions, questionIndex, 1)"
            />
            <AtomsActionButton
              label="Удалить вопрос"
              tone="danger"
              @click="fields.questions.splice(questionIndex, 1)"
            />
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 sm:items-end">
          <MoleculesSelectField
            :model-value="question.type"
            label="Тип"
            :options="TYPE_OPTIONS"
            :disabled="readonly"
            @update:model-value="(value) => setType(question, value)"
          />
          <div class="flex flex-wrap gap-x-6 gap-y-2">
            <MoleculesCheckboxField v-model="question.required" label="Обязательный" />
            <MoleculesCheckboxField
              v-if="surveyQuestionHasOptions(question.type)"
              v-model="question.allowOwnAnswer"
              label="Можно свой ответ"
            />
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <MoleculesTextAreaField v-model="question.textRu" label="Вопрос, RU" :rows="2" />
          <MoleculesTextAreaField v-model="question.textUz" label="Вопрос, UZ" :rows="2" />
        </div>

        <div v-if="surveyQuestionHasOptions(question.type)" class="space-y-2">
          <p class="text-sm font-medium text-slate-700">Варианты ответа</p>
          <p v-if="question.options.length === 0" class="text-sm text-slate-500">
            Вариантов пока нет.
          </p>
          <div
            v-for="(option, optionIndex) in question.options"
            :key="option.key"
            class="grid gap-2 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0 sm:items-center"
            :class="question.type === 'multiple' ? 'sm:grid-cols-[auto_1fr_1fr_auto_auto]' : 'sm:grid-cols-[auto_1fr_1fr_auto]'"
          >
            <span class="text-sm text-slate-500 tabular-nums">{{ optionIndex + 1 }}.</span>
            <AtomsTextInput v-model="option.textRu" type="text" aria-label="Вариант, RU" placeholder="RU" />
            <AtomsTextInput v-model="option.textUz" type="text" aria-label="Вариант, UZ" placeholder="UZ" />
            <MoleculesCheckboxField
              v-if="question.type === 'multiple'"
              v-model="option.exclusive"
              label="Исключающий"
            />
            <div v-if="!readonly" class="flex flex-wrap gap-2">
              <AtomsActionButton
                label="Выше"
                :disabled="optionIndex === 0"
                @click="move(question.options, optionIndex, -1)"
              />
              <AtomsActionButton
                label="Ниже"
                :disabled="optionIndex === question.options.length - 1"
                @click="move(question.options, optionIndex, 1)"
              />
              <AtomsActionButton
                label="Убрать"
                tone="danger"
                @click="question.options.splice(optionIndex, 1)"
              />
            </div>
          </div>
          <p v-if="question.type === 'multiple'" class="text-sm text-slate-500">{{ EXCLUSIVE_NOTE }}</p>
          <AtomsActionButton v-if="!readonly" label="Добавить вариант" @click="addOption(question)" />
        </div>
        <p v-else class="text-sm text-slate-500">
          {{ question.type === 'scale' ? SCALE_NOTE : TEXT_NOTE }}
        </p>
      </fieldset>

      <AtomsActionButton v-if="!readonly" label="Добавить вопрос" @click="addQuestion" />
    </div>
  </MoleculesSectionPanel>
</template>
