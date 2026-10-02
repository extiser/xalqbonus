<script setup lang="ts">
import type { SurveyFormFields } from '~/types/surveyForm';
import type { SurveyTextField } from '#shared/types/survey';

/**
 * Опрос без вопросов: название, срок, баллы и тексты экранов на двух языках (issue #320).
 *
 * Тексты — в две колонки, RU и UZ рядом: перевод пишется и сверяется построчно, и вопрос
 * «а это переведено?» решается одним взглядом. Обязательных полей нет — черновик заводится
 * первым символом; чего не хватает до рассылки, страница перечисляет отдельно.
 *
 * `contentReadonly` — опрос заморожен: тексты и баллы закрыты, а название и срок правятся
 * (служебное название ответы не трогает, срок может понадобиться продлить).
 * `readonly` — закрыто всё: демо-опрос у того, кто демо не правит.
 */
defineProps<{
  contentReadonly: boolean;
  readonly: boolean;
}>();

const fields = defineModel<SurveyFormFields>('fields', { required: true });

type TextPair = {
  label: string;
  ru: SurveyTextField;
  uz: SurveyTextField;
  /** Многострочное поле — экраны; однострочное — подписи кнопок. */
  multiline: boolean;
  hint: string;
};

const TEXT_PAIRS: TextPair[] = [
  {
    label: 'Вступление',
    ru: 'introRu',
    uz: 'introUz',
    multiline: true,
    hint: 'Экран открытия опроса: зачем он и что водитель получит.',
  },
  {
    label: 'Кнопка отказа',
    ru: 'declineButtonRu',
    uz: 'declineButtonUz',
    multiline: false,
    hint: 'На экране открытия: «Закрыть», «Не интересует».',
  },
  {
    label: 'Финал',
    ru: 'finishRu',
    uz: 'finishUz',
    multiline: true,
    hint: 'Экран после последнего ответа.',
  },
  {
    label: 'Кнопка перехода в приложение',
    ru: 'appButtonRu',
    uz: 'appButtonUz',
    multiline: false,
    hint: 'На финале.',
  },
];
</script>

<template>
  <MoleculesSectionPanel title="Опрос">
    <div class="space-y-4">
      <fieldset :disabled="readonly" class="grid min-w-0 gap-4 sm:grid-cols-3">
        <div class="sm:col-span-3">
          <MoleculesFormField
            v-model="fields.title"
            label="Название"
            type="text"
            hint="Для списка опросов. Водителю не уходит."
          />
        </div>
        <MoleculesFormField
          v-model="fields.endsOn"
          label="Последний день"
          type="date"
          hint="Опрос закрыт с 00:00 следующего дня по Ташкенту."
        />
        <fieldset :disabled="readonly || contentReadonly" class="min-w-0">
          <MoleculesNumberField
            v-model="fields.points"
            label="Баллы за опрос"
            :min="0"
            hint="Ноль — опрос без награды."
          />
        </fieldset>
      </fieldset>

      <fieldset :disabled="readonly || contentReadonly" class="min-w-0 space-y-4">
        <div
          v-for="pair in TEXT_PAIRS"
          :key="pair.label"
          class="space-y-1 border-t border-slate-200 pt-4"
        >
          <p class="text-sm font-medium text-slate-900">{{ pair.label }}</p>
          <p class="text-sm text-slate-500">{{ pair.hint }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <template v-if="pair.multiline">
              <MoleculesTextAreaField v-model="fields[pair.ru]" label="RU" :rows="4" />
              <MoleculesTextAreaField v-model="fields[pair.uz]" label="UZ" :rows="4" />
            </template>
            <template v-else>
              <MoleculesFormField v-model="fields[pair.ru]" label="RU" type="text" />
              <MoleculesFormField v-model="fields[pair.uz]" label="UZ" type="text" />
            </template>
          </div>
        </div>
      </fieldset>
    </div>
  </MoleculesSectionPanel>
</template>
