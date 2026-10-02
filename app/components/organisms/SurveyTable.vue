<script setup lang="ts">
import { formatCalendarDate, formatDate, formatNumber } from '~/utils/format';
import type { SurveyListItem } from '#shared/types/survey';
import type { LoadState } from '~/types/loadState';

/**
 * Список опросов: название, состояние, число вопросов, баллы и дата окончания (issue #320).
 *
 * Состояние — черновик или заморожен; «закрыт по сроку» — отдельной пометкой рядом, а не
 * третьим значением: черновик с прошедшей датой всё ещё правится, а замороженный, срок
 * которого продлили, снова открыт. Демо помечены так же, как в списке рассылок.
 */
defineProps<{
  state: LoadState;
  surveys: SurveyListItem[] | null;
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Опросы"
    note="Опрос замораживается, когда уходит первая рассылка с ним: после этого правятся только название и дата окончания."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем опросы…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Опросы не прочитались. Это отказ запроса, а не отсутствие опросов."
    />
    <MoleculesStateNotice
      v-else-if="!surveys || surveys.length === 0"
      state="empty"
      message="Опросов ещё не было."
    />
    <ul v-else>
      <li
        v-for="survey in surveys"
        :key="survey.surveyId"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 py-3 first:border-t-0"
      >
        <div class="min-w-48 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <NuxtLink
              :to="`/mailings/surveys/${survey.surveyId}`"
              class="text-sm font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-600"
            >
              {{ survey.title ?? 'Без названия' }}
            </NuxtLink>
            <AtomsStatusBadge
              :tone="survey.frozenAt ? 'ok' : 'muted'"
              :label="survey.frozenAt ? 'заморожен' : 'черновик'"
            />
            <AtomsStatusBadge v-if="survey.closed" tone="warn" label="закрыт по сроку" />
            <AtomsStatusBadge v-if="survey.isDemo" tone="demo" label="ДЕМО" />
          </div>
          <p class="mt-0.5 text-xs text-slate-500">
            Заведён {{ formatDate(survey.createdAt) }} · {{ survey.createdByName }}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-slate-500">вопросов / баллы / до какого дня</p>
          <p class="font-mono text-sm text-slate-900 tabular-nums">
            {{ formatNumber(survey.questionCount) }} / {{ formatNumber(survey.points) }} /
            {{ formatCalendarDate(survey.endsOn) }}
          </p>
        </div>
      </li>
    </ul>
  </MoleculesSectionPanel>
</template>
