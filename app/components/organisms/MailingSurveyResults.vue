<script setup lang="ts">
import { surveyActivitySliceNote } from '~/utils/surveyResults';
import type { LoadState } from '~/types/loadState';
import type { SelectOption } from '~/types/selectOption';
import type { MailingSurveyResults } from '#shared/types/surveyResults';

/**
 * Итоги опроса у рассылки (issue #325) — одним разделом: срез, переключатель «только
 * прошедшие», выгрузка, воронка с «Где бросают» и ответы по вопросам.
 *
 * Данные приходят свойством, выбор уходит моделью: запрос делает страница
 * (`useMailingSurveyResults`). Прежние числа стоят на экране, пока едут новые: таблица
 * не моргает на каждом переключении.
 */
defineProps<{
  state: LoadState;
  results: MailingSurveyResults | null;
  error: string | null;
  sliceOptions: SelectOption[];
  exportUrl: string | null;
}>();

const slice = defineModel<string>('slice', { required: true });
const completedOnly = defineModel<boolean>('completedOnly', { required: true });
</script>

<template>
  <MoleculesSectionPanel
    title="Итоги опроса"
    note="По людям снимка этой рассылки — по их состоянию в опросе, какой бы рассылкой они его ни открыли. «Отправлено» — все адресаты снимка, «доставлено» — сообщение ушло; доли — от доставленных."
  >
    <div class="flex flex-wrap items-end gap-4">
      <div class="w-full sm:w-80">
        <MoleculesSelectField v-model="slice" label="Срез" :options="sliceOptions">
          <option value="">Без среза</option>
        </MoleculesSelectField>
      </div>
      <MoleculesCheckboxField v-model="completedOnly" label="Ответы только прошедших" />
      <AtomsActionLink label="Скачать CSV" :href="exportUrl" download />
    </div>
    <p v-if="results && surveyActivitySliceNote(results.slice)" class="mt-2 text-sm text-slate-500">
      {{ surveyActivitySliceNote(results.slice) }}
    </p>
    <p class="mt-2 text-xs text-slate-500">
      В файле — строка на каждого адресата снимка с позывным, языком, метками воронки по Ташкенту
      и ответами; срез — колонкой.
    </p>

    <div class="mt-6">
      <MoleculesStateNotice
        v-if="results === null && state === 'loading'"
        state="loading"
        message="Считаем итоги…"
      />
      <MoleculesStateNotice
        v-else-if="state === 'error'"
        state="error"
        :message="error ?? 'Итоги не посчитались. Это отказ запроса, а не отсутствие ответов.'"
      />
      <MoleculesStateNotice
        v-else-if="results && results.funnel.sent[0] === 0"
        state="empty"
        message="В снимке рассылки нет ни одного адресата."
      />
      <div v-else-if="results" class="space-y-8">
        <p v-if="state === 'loading'" class="text-sm text-slate-500">Пересчитываем…</p>
        <OrganismsSurveyFunnel :results="results" :slice="results.slice" />
        <div>
          <h3 class="text-sm font-semibold text-slate-900">Ответы по вопросам</h3>
          <p class="mt-1 text-sm text-slate-500">
            {{
              results.completedOnly
                ? 'Только прошедшие опрос.'
                : 'Все сохранённые ответы — и прошедших, и бросивших: число ответивших показывает, сколько дошло до вопроса.'
            }}
          </p>
          <div class="mt-4">
            <OrganismsSurveyAnswers
              :questions="results.questions"
              :columns="results.columns"
              :slice="results.slice"
            />
          </div>
        </div>
      </div>
    </div>
  </MoleculesSectionPanel>
</template>
