<script setup lang="ts">
import { formatNumber } from '~/utils/format';
import { SURVEY_FUNNEL_STAGES, countWithShare, surveyResultsColumnLabel } from '~/utils/surveyResults';
import type { SurveyFunnelResults, SurveyResultsSlice } from '#shared/types/surveyResults';

/**
 * Воронка опроса и «Где бросают» (issue #325) — у рассылки и сводно у опроса.
 *
 * Числа — людей; доля — от «доставлено» той же колонки. «Отказался» и «начал» — две ветви
 * после «открыл», а не ступени одной лестницы: отказавшийся может потом начать.
 */
defineProps<{
  results: SurveyFunnelResults;
  slice: SurveyResultsSlice | null;
}>();
</script>

<template>
  <div class="space-y-6">
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="text-xs text-slate-500">
          <tr>
            <th class="py-2 pr-4 font-medium">Этап</th>
            <th
              v-for="column in results.columns"
              :key="column"
              class="py-2 pr-4 text-right font-medium whitespace-nowrap last:pr-0"
            >
              {{ surveyResultsColumnLabel(column, slice) }}
            </th>
          </tr>
        </thead>
        <tbody class="text-slate-900">
          <tr
            v-for="{ stage, label } in SURVEY_FUNNEL_STAGES"
            :key="stage"
            class="border-t border-slate-100"
          >
            <td class="py-2 pr-4" :class="stage === 'declined' || stage === 'started' ? 'pl-4' : ''">
              {{ label }}
            </td>
            <td
              v-for="(column, columnIndex) in results.columns"
              :key="column"
              class="py-2 pr-4 text-right whitespace-nowrap tabular-nums last:pr-0"
            >
              {{
                stage === 'sent'
                  ? formatNumber(results.funnel.sent[columnIndex] ?? 0)
                  : countWithShare(
                      results.funnel[stage][columnIndex] ?? 0,
                      results.funnel.delivered[columnIndex] ?? 0,
                    )
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div>
      <h3 class="text-sm font-semibold text-slate-900">Где бросают</h3>
      <p class="mt-1 text-sm text-slate-500">
        Не прошли опрос, и последний сохранённый ответ — на этом вопросе. Отказавшийся, который
        потом начал, считается здесь же.
      </p>
      <p v-if="results.dropOff.length === 0" class="mt-2 text-sm text-slate-500">
        В опросе нет вопросов.
      </p>
      <div v-else class="mt-2 overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs text-slate-500">
            <tr>
              <th class="py-2 pr-4 font-medium">Вопрос</th>
              <th
                v-for="column in results.columns"
                :key="column"
                class="py-2 pr-4 text-right font-medium whitespace-nowrap last:pr-0"
              >
                {{ surveyResultsColumnLabel(column, slice) }}
              </th>
            </tr>
          </thead>
          <tbody class="text-slate-900">
            <tr v-for="row in results.dropOff" :key="row.questionId" class="border-t border-slate-100">
              <td class="py-2 pr-4">{{ row.position }}. {{ row.textRu ?? 'Без текста' }}</td>
              <td
                v-for="(column, columnIndex) in results.columns"
                :key="column"
                class="py-2 pr-4 text-right whitespace-nowrap tabular-nums last:pr-0"
              >
                {{ formatNumber(row.people[columnIndex] ?? 0) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
