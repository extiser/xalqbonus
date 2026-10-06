<script setup lang="ts">
import { formatNumber } from '~/utils/format';
import { surveyQuestionTypeLabel } from '~/utils/labels';
import { countWithShare, surveyResultsColumnLabel } from '~/utils/surveyResults';
import type {
  SurveyQuestionResult,
  SurveyResultsColumn,
  SurveyResultsSlice,
  SurveyTextResult,
} from '#shared/types/surveyResults';

/**
 * Ответы по вопросам (issue #325): на каждый вопрос — сколько ответили и сколько пропустили,
 * варианты, шкала со средним, тексты.
 *
 * Считаются все сохранённые ответы — и прошедших, и бросивших: число ответивших показывает,
 * сколько дошло до вопроса. Пропуск необязательного — не «ответил».
 * Доля варианта — от ответивших на вопрос в той же колонке.
 */
const props = defineProps<{
  questions: SurveyQuestionResult[];
  columns: SurveyResultsColumn[];
  slice: SurveyResultsSlice | null;
}>();

const SCALE_MEAN_DIGITS = 1;

const formatMean = (mean: number | null): string =>
  mean === null ? '—' : mean.toLocaleString('ru-RU', { maximumFractionDigits: SCALE_MEAN_DIGITS });

/** Подпись ответа текстом: при срезе — в какую колонку попал ответивший. */
const textGroup = (text: SurveyTextResult): string | null =>
  text.column === null ? null : surveyResultsColumnLabel(text.column, props.slice);
</script>

<template>
  <div class="space-y-8">
    <p v-if="questions.length === 0" class="text-sm text-slate-500">В опросе нет вопросов.</p>
    <article v-for="question in questions" :key="question.questionId" class="space-y-2">
      <div>
        <h3 class="text-sm font-semibold text-slate-900">
          {{ question.position }}. {{ question.textRu ?? 'Без текста' }}
        </h3>
        <p class="text-xs text-slate-500">
          {{ surveyQuestionTypeLabel(question.type) }}{{ question.required ? '' : ' · необязательный' }}
        </p>
        <p v-if="question.type === 'multiple'" class="mt-1 text-xs text-slate-500">
          Доли — от ответивших людей: вариантов выбирают несколько, и сумма долей больше 100 %.
        </p>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs text-slate-500">
            <tr>
              <th class="py-2 pr-4 font-medium" />
              <th
                v-for="column in columns"
                :key="column"
                class="py-2 pr-4 text-right font-medium whitespace-nowrap last:pr-0"
              >
                {{ surveyResultsColumnLabel(column, slice) }}
              </th>
            </tr>
          </thead>
          <tbody class="text-slate-900">
            <tr class="border-t border-slate-100">
              <td class="py-2 pr-4 text-slate-500">Ответили</td>
              <td
                v-for="(column, columnIndex) in columns"
                :key="column"
                class="py-2 pr-4 text-right whitespace-nowrap tabular-nums last:pr-0"
              >
                {{ formatNumber(question.answered[columnIndex] ?? 0) }}
              </td>
            </tr>
            <tr v-if="!question.required" class="border-t border-slate-100">
              <td class="py-2 pr-4 text-slate-500">Пропустили</td>
              <td
                v-for="(column, columnIndex) in columns"
                :key="column"
                class="py-2 pr-4 text-right whitespace-nowrap tabular-nums last:pr-0"
              >
                {{ formatNumber(question.skipped[columnIndex] ?? 0) }}
              </td>
            </tr>
            <tr v-for="option in question.options" :key="option.optionId" class="border-t border-slate-100">
              <td class="py-2 pr-4">{{ option.textRu ?? 'Без текста' }}</td>
              <td
                v-for="(column, columnIndex) in columns"
                :key="column"
                class="py-2 pr-4 text-right whitespace-nowrap tabular-nums last:pr-0"
              >
                {{ countWithShare(option.people[columnIndex] ?? 0, question.answered[columnIndex] ?? 0) }}
              </td>
            </tr>
            <tr v-if="question.ownAnswer" class="border-t border-slate-100">
              <td class="py-2 pr-4">Свой вариант</td>
              <td
                v-for="(column, columnIndex) in columns"
                :key="column"
                class="py-2 pr-4 text-right whitespace-nowrap tabular-nums last:pr-0"
              >
                {{
                  countWithShare(
                    question.ownAnswer.people[columnIndex] ?? 0,
                    question.answered[columnIndex] ?? 0,
                  )
                }}
              </td>
            </tr>
            <template v-if="question.scale">
              <tr v-for="entry in question.scale.values" :key="entry.value" class="border-t border-slate-100">
                <td class="py-2 pr-4">{{ entry.value }}</td>
                <td
                  v-for="(column, columnIndex) in columns"
                  :key="column"
                  class="py-2 pr-4 text-right whitespace-nowrap tabular-nums last:pr-0"
                >
                  {{ countWithShare(entry.people[columnIndex] ?? 0, question.answered[columnIndex] ?? 0) }}
                </td>
              </tr>
              <tr class="border-t border-slate-100">
                <td class="py-2 pr-4 font-medium">Среднее</td>
                <td
                  v-for="(column, columnIndex) in columns"
                  :key="column"
                  class="py-2 pr-4 text-right font-medium whitespace-nowrap tabular-nums last:pr-0"
                >
                  {{ formatMean(question.scale.mean[columnIndex] ?? null) }}
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <MoleculesSurveyTextList
        v-if="question.ownAnswer && question.ownAnswer.texts.length > 0"
        title="Свой вариант — словами"
        :texts="question.ownAnswer.texts.map((text) => ({ text: text.text, group: textGroup(text) }))"
      />
      <template v-if="question.texts">
        <MoleculesSurveyTextList
          v-if="question.texts.length > 0"
          title="Ответы, свежие первыми"
          :texts="question.texts.map((text) => ({ text: text.text, group: textGroup(text) }))"
        />
        <p v-else class="text-sm text-slate-500">Ответов текстом нет.</p>
      </template>
    </article>
  </div>
</template>
