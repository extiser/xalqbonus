<script setup lang="ts">
import { formatDateTime, formatNumber } from '~/utils/format';
import type { LoadState } from '~/types/loadState';
import type { SurveyGroup, SurveyResultsResponse } from '#shared/types/surveyResults';

/**
 * Рассылки, которыми ушёл опрос, и сводная воронка по ним (issue #325).
 *
 * В сводке человек один, сколько бы рассылок его ни захватило: получивший основную рассылку
 * и напоминание — одна строка круга, со своим состоянием в опросе. Ответы и срезы — на экране
 * рассылки: там таблица по её снимку.
 *
 * Под сводной воронкой — «Сегмент из итогов» (issue #356): кнопка заводит сегмент-список
 * из группы. Числа у кнопок — свои (`groups`), а не строк воронки: в «Отказался» воронки есть
 * и прошедшие после отказа, а в группе «отказались» их нет. Запрос шлёт страница.
 */
defineProps<{
  state: LoadState;
  results: SurveyResultsResponse | null;
  /** Видит ли вошедший блок сегмента: роль сегментов и право на демо этого опроса. */
  canCreateSegment: boolean;
  /** Группа, по которой сейчас заводится сегмент. `null` — ничего не заводится. */
  creatingGroup: SurveyGroup | null;
  segmentError: string | null;
}>();

const emit = defineEmits<{ createSegment: [group: SurveyGroup] }>();

const SEGMENT_GROUPS: { group: SurveyGroup; label: string }[] = [
  { group: 'not_completed', label: 'Не прошли' },
  { group: 'declined', label: 'Отказались' },
  { group: 'completed', label: 'Прошли' },
];
</script>

<template>
  <MoleculesSectionPanel
    title="Рассылки и итоги"
    note="«Отправлено» — адресатов в снимке рассылки, «прошли» — из них прошли опрос, какой бы рассылкой его ни открыли. Ответы по вопросам и срезы — на экране рассылки."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем рассылки опроса…" />
    <MoleculesStateNotice
      v-else-if="state === 'error' || results === null"
      state="error"
      message="Рассылки опроса не прочитались. Это отказ запроса, а не отсутствие рассылок."
    />
    <MoleculesStateNotice
      v-else-if="results.mailings.length === 0"
      state="empty"
      message="Опрос ещё не уходил ни одной рассылкой."
    />
    <div v-else class="space-y-6">
      <ul>
        <li
          v-for="mailing in results.mailings"
          :key="mailing.mailingId"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 py-3 first:border-t-0"
        >
          <div class="min-w-48 flex-1">
            <NuxtLink
              :to="`/mailings/${mailing.mailingId}`"
              class="text-sm font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-600"
            >
              {{ mailing.title ?? 'Без заголовка' }}
            </NuxtLink>
            <p class="mt-0.5 text-xs text-slate-500">Запущена {{ formatDateTime(mailing.startedAt) }}</p>
          </div>
          <div class="text-right">
            <p class="text-xs text-slate-500">отправлено / прошли</p>
            <p class="font-mono text-sm text-slate-900 tabular-nums">
              {{ formatNumber(mailing.sent) }} / {{ formatNumber(mailing.completed) }}
            </p>
          </div>
        </li>
      </ul>
      <div>
        <h3 class="text-sm font-semibold text-slate-900">Сводная воронка</h3>
        <p class="mt-1 text-sm text-slate-500">По всем рассылкам опроса, люди без повторов.</p>
        <div class="mt-2">
          <OrganismsSurveyFunnel :results="results.summary" :slice="null" />
        </div>
      </div>
      <div v-if="canCreateSegment">
        <h3 class="text-sm font-semibold text-slate-900">Сегмент из итогов</h3>
        <p class="mt-1 text-sm text-slate-500">
          Список людей на эту минуту. Он не пересчитывается — на него можно отправить
          напоминание, акцию или подарок.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <AtomsActionButton
            v-for="{ group, label } in SEGMENT_GROUPS"
            :key="group"
            :label="`${label} · ${formatNumber(results.groups[group])}`"
            :disabled="creatingGroup !== null || results.groups[group] === 0"
            @click="emit('createSegment', group)"
          />
        </div>
        <p v-if="segmentError" class="mt-2 text-sm text-red-700">{{ segmentError }}</p>
      </div>
    </div>
  </MoleculesSectionPanel>
</template>
