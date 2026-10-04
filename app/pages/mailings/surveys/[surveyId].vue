<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { useDemoEditor } from '~/composables/useDemoEditor';
import { useDraftAutosave } from '~/composables/useDraftAutosave';
import type { SurveyFormFields } from '~/types/surveyForm';
import { formatDateTime, formatDayKey, formatMinuteDateTime } from '~/utils/format';
import { surveyClosedLabel } from '~/utils/labels';
import { failureField, failureMessage, failureText } from '~/utils/requestError';
import { toLoadState } from '~/utils/loadState';
import { toSurveyContentInput, toSurveyFormFields } from '~/utils/surveyForm';
import { SEGMENT_ROLES } from '#shared/access';
import type { SegmentResponse } from '#shared/types/segment';
import { surveyFreezeProblems, surveyFreezeProblemText } from '#shared/survey';
import type {
  Survey,
  SurveyCreateRequestBody,
  SurveyRequestBody,
  SurveyResponse,
} from '#shared/types/survey';
import type {
  SurveyGroup,
  SurveyResultsResponse,
  SurveySegmentRequestBody,
} from '#shared/types/surveyResults';

/**
 * Экран опроса (issue #320). Что на нём можно, решает заморозка:
 *
 * - новый (`/mailings/surveys/new`) — пустая форма; черновик заводится первым символом
 * - черновик — всё правится и сохраняется само; копия и удаление
 * - заморожен — открыт на чтение, кроме названия и даты окончания; копия; «Завершить опрос»
 *   в шапке, пока он не закрыт (issue #348)
 * - завершён досрочно — как замороженный, но и последний день не правится
 *
 * Новый и заведённый из него черновик — один экземпляр страницы (`key` ниже): адрес меняется
 * на адрес записи без перехода, и набранное не теряется (issue #148).
 *
 * Опрос прикрепляется на экране рассылки (issue #321), а прикреплённый к черновику рассылки
 * черновик опроса не удаляется — отказ ручки говорит, где открепить. Здесь — рассылки, которыми
 * опрос уже ушёл, и сводная воронка по ним (issue #325). Под ней — сегмент-список из группы
 * итогов (issue #356): после заведения — переход на его страницу.
 *
 * **Демо** (issue #212): поле «Демо» нового опроса видит только тот, кто правит демо.
 * Демо-опрос у остальных открыт на чтение — без автосохранения и кнопок.
 */

definePageMeta({
  middleware: 'mailings-access',
  key: 'survey-editor',
});

/** Адрес нового опроса. Идентификатором не является — ручкам он не уходит. */
const NEW_SURVEY = 'new';

const route = useRoute();
const routeId = computed(() => String(route.params.surveyId));

// Смена адреса запрос сама не повторяет (`watch: false`): после заведения черновик уже
// на руках, а переход к копии разбирает `watch` ниже.
const { data, status, refresh } = await useFetch<SurveyResponse>(
  () => `/api/surveys/${routeId.value}`,
  { immediate: routeId.value !== NEW_SURVEY, watch: false },
);

const survey = computed<Survey | null>(() => data.value?.survey ?? null);

/** Рассылки опроса и сводная воронка (issue #325). У нового опроса их нет и быть не может. */
const {
  data: resultsData,
  status: resultsStatus,
  refresh: refreshResults,
} = await useFetch<SurveyResultsResponse>(() => `/api/surveys/${routeId.value}/results`, {
  immediate: routeId.value !== NEW_SURVEY,
  watch: false,
});

const setSurvey = (next: Survey): void => {
  data.value = { survey: next };
};

const frozen = computed(() => survey.value?.frozenAt != null);

/** Завершён досрочно (issue #348): отметка не снимается, последний день не правится. */
const finished = computed(() => survey.value?.finishedAt != null);

const { ownsDemo, canEdit } = useDemoEditor();

/** Поле «Демо» нового опроса. Уходит только заведением. */
const demo = ref(false);

/** Правит ли вошедший этот опрос: демо — только тот, кто правит демо. */
const editable = computed(() => canEdit(survey.value?.isDemo ?? false));

/** То, что на экране. Ответ сервера его не перезаписывает. */
const fields = ref<SurveyFormFields>(toSurveyFormFields(survey.value));

const state = computed(() =>
  survey.value !== null || routeId.value === NEW_SURVEY ? 'ready' : toLoadState(status.value),
);

const headingText = computed(
  () => fields.value.title.trim() || (survey.value ? 'Без названия' : 'Новый опрос'),
);

useHead({ title: () => `${headingText.value} — Xalq Taxi Bonus` });

/** Бейдж закрытого: «завершён досрочно» или «закрыт по сроку». */
const closedLabel = computed(() => (survey.value ? surveyClosedLabel(survey.value) : null));

/**
 * Последний день — не раньше сегодняшнего по Ташкенту (issue #348): прошлое календарь
 * не предлагает. Сравнивает сервер, тем же календарным днём; здесь — только подсказка полю.
 */
const endsOnMin = computed(() => formatDayKey(new Date()));

/** Отказ сервера по последнему дню — встаёт у поля, а не только у отметки сохранения. */
const endsOnError = ref<string | null>(null);

const headerNote = computed(() => {
  const current = survey.value;

  if (!current) {
    return 'Черновик появится, как только вы начнёте набирать.';
  }

  const phrases = [`Завёл ${current.createdByName}.`];

  if (current.frozenAt) {
    phrases.push(
      current.finishedAt
        ? `Заморожен ${formatDateTime(current.frozenAt)}: ушёл рассылкой, правится только название.`
        : `Заморожен ${formatDateTime(current.frozenAt)}: ушёл рассылкой, правятся только название и дата окончания.`,
    );
  }

  return phrases.join(' ');
});

/**
 * Сохранение: первое заводит черновик и переводит адрес на него, остальные правят.
 * Замороженный отправляет только название и срок — содержимое ему сервер не примет.
 */
const saveSurvey = async (snapshot: SurveyFormFields): Promise<void> => {
  try {
    await sendSurvey(snapshot);
    endsOnError.value = null;
  } catch (error) {
    endsOnError.value = failureField(error) === 'endsOn' ? failureMessage(error) : null;

    throw error;
  }
};

const sendSurvey = async (snapshot: SurveyFormFields): Promise<void> => {
  const current = survey.value;
  const settings = { title: snapshot.title, endsOn: snapshot.endsOn };

  if (current === null) {
    const created = await $fetch<SurveyResponse>('/api/surveys', {
      method: 'POST',
      body: {
        ...settings,
        content: toSurveyContentInput(snapshot),
        isDemo: demo.value,
      } satisfies SurveyCreateRequestBody,
    });

    setSurvey(created.survey);
    await navigateTo(`/mailings/surveys/${created.survey.surveyId}`, { replace: true });

    return;
  }

  const body: SurveyRequestBody = current.frozenAt
    ? settings
    : { ...settings, content: toSurveyContentInput(snapshot) };

  const updated = await $fetch<SurveyResponse>(`/api/surveys/${current.surveyId}`, {
    method: 'PATCH',
    body,
  });

  setSurvey(updated.survey);
};

const autosave = useDraftAutosave({
  fields,
  save: saveSurvey,
  enabled: () => editable.value,
});

// Переход к другой записи на той же странице — копией или историей браузера.
watch(routeId, async (id) => {
  if (id === NEW_SURVEY) {
    data.value = undefined;
    demo.value = false;
    autosave.replace(toSurveyFormFields(null));

    return;
  }

  if (id === survey.value?.surveyId) {
    return;
  }

  data.value = undefined;
  resultsData.value = undefined;
  await Promise.all([refresh(), refreshResults()]);
  autosave.replace(toSurveyFormFields(survey.value));
});

/**
 * Чего не хватает, чтобы опрос ушёл рассылкой, — по тому, что на экране. Отказывать будет
 * запуск рассылки с опросом, здесь — чтобы недописанное было видно до него.
 */
const freezeProblems = computed(() =>
  surveyFreezeProblems(fields.value).map(surveyFreezeProblemText),
);

const acting = ref(false);
const actionError = ref<string | null>(null);

const runAction = async (request: () => Promise<void>): Promise<void> => {
  acting.value = true;
  actionError.value = null;

  try {
    await request();
  } catch (error) {
    actionError.value = failureText(error);
  } finally {
    acting.value = false;
  }
};

/** Удаление — своим диалогом, а не браузерным `confirm` (docs/frontend.md → «Подтверждения»). */
const deleteConfirmOpen = ref(false);

let answerDelete: ((confirmed: boolean) => void) | null = null;

const resolveDelete = (confirmed: boolean): void => {
  deleteConfirmOpen.value = false;
  answerDelete?.(confirmed);
  answerDelete = null;
};

/**
 * Копия ведёт на свою страницу. У черновика копируется то, что на экране: несохранённое
 * досохраняется, а не сохранилось — не копируем.
 */
const copy = (): Promise<void> =>
  runAction(async () => {
    if (!(await autosave.flush())) {
      return;
    }

    const current = survey.value;

    if (!current) {
      return;
    }

    const created = await $fetch<SurveyResponse>(`/api/surveys/${current.surveyId}/copy`, {
      method: 'POST',
    });

    await navigateTo(`/mailings/surveys/${created.survey.surveyId}`);
  });

/** Удаление черновика с вопросами. Правка, не успевшая уехать, бросается — удаляем же. */
const removeDraft = (): Promise<void> =>
  runAction(async () => {
    deleteConfirmOpen.value = true;

    const confirmed = await new Promise<boolean>((resolve) => {
      answerDelete = resolve;
    });

    if (!confirmed) {
      return;
    }

    await autosave.discard();

    const current = survey.value;

    if (current) {
      // Адрес приведён к строке: типы маршрутов Nitro сопоставляют шаблон с соседними ручками
      // и иначе не пускают `DELETE` (как на экране рассылки).
      const draftUrl: string = `/api/surveys/${current.surveyId}`;

      await $fetch(draftUrl, { method: 'DELETE' });
    }

    await navigateTo('/mailings/surveys');
  });

/**
 * «Завершить опрос» (issue #348) — у замороженного и ещё не закрытого, тем, кто правит опрос.
 * Черновик не завершается: он никуда не уходил.
 */
const canFinish = computed(
  () => survey.value !== null && frozen.value && !survey.value.closed && editable.value,
);

const finishConfirmOpen = ref(false);

let answerFinish: ((confirmed: boolean) => void) | null = null;

const resolveFinish = (confirmed: boolean): void => {
  finishConfirmOpen.value = false;
  answerFinish?.(confirmed);
  answerFinish = null;
};

/**
 * Досрочное завершение — после подтверждения: вернуть опрос нельзя. Набранное название
 * досохраняется до него, как перед копией.
 */
const finishSurvey = (): Promise<void> =>
  runAction(async () => {
    finishConfirmOpen.value = true;

    const confirmed = await new Promise<boolean>((resolve) => {
      answerFinish = resolve;
    });

    if (!confirmed || !(await autosave.flush())) {
      return;
    }

    const current = survey.value;

    if (!current) {
      return;
    }

    const updated = await $fetch<SurveyResponse>(`/api/surveys/${current.surveyId}/finish`, {
      method: 'POST',
    });

    setSurvey(updated.survey);
  });

/**
 * «Сегмент из итогов» (issue #356) — тем, кто заводит сегменты, и, у демо-опроса, только тому,
 * кто правит демо: из него выходит демо-сегмент. Решает всё равно ручка.
 */
const employee = useCurrentEmployee();

const canCreateSegment = computed(
  () =>
    employee.value !== null && SEGMENT_ROLES.includes(employee.value.role) && editable.value,
);

const creatingGroup = ref<SurveyGroup | null>(null);
const segmentError = ref<string | null>(null);

const createSegment = async (group: SurveyGroup): Promise<void> => {
  const current = survey.value;

  if (!current) {
    return;
  }

  creatingGroup.value = group;
  segmentError.value = null;

  try {
    const created = await $fetch<SegmentResponse>(`/api/surveys/${current.surveyId}/segments`, {
      method: 'POST',
      body: { group } satisfies SurveySegmentRequestBody,
    });

    await navigateTo(`/segments/${created.segment.segmentId}`);
  } catch (error) {
    segmentError.value = failureText(error);
  } finally {
    creatingGroup.value = null;
  }
};

// Ушли со страницы с открытым вопросом — это отказ: действие не должно ждать ответа вечно.
onBeforeUnmount(() => {
  resolveDelete(false);
  resolveFinish(false);
});
</script>

<template>
  <div class="space-y-6">
    <MoleculesConfirmDialog
      :open="autosave.leaveFailureOpen.value"
      title="Уйти без сохранения?"
      :message="`Последняя правка опроса не сохранилась: ${autosave.error.value ?? ''} Если уйти, она пропадёт.`"
      confirm-label="Уйти без сохранения"
      cancel-label="Остаться"
      @confirm="autosave.resolveLeave(true)"
      @cancel="autosave.resolveLeave(false)"
    />
    <MoleculesConfirmDialog
      :open="deleteConfirmOpen"
      title="Удалить черновик опроса вместе с вопросами?"
      message="Вернуть его будет нельзя."
      confirm-label="Удалить"
      tone="danger"
      cancel-label="Отмена"
      @confirm="resolveDelete(true)"
      @cancel="resolveDelete(false)"
    />
    <MoleculesConfirmDialog
      :open="finishConfirmOpen"
      :title="`Завершить «${headingText}» сейчас?`"
      message="Водители больше не смогут отвечать, вернуть опрос нельзя."
      confirm-label="Завершить"
      tone="danger"
      cancel-label="Отмена"
      @confirm="resolveFinish(true)"
      @cancel="resolveFinish(false)"
    />

    <div>
      <NuxtLink to="/mailings/surveys" class="text-sm text-slate-500 underline underline-offset-2">
        ← Все опросы
      </NuxtLink>
      <div class="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 class="text-xl font-semibold text-slate-900">{{ headingText }}</h1>
          <AtomsStatusBadge
            v-if="survey"
            :tone="frozen ? 'ok' : 'muted'"
            :label="frozen ? 'заморожен' : 'черновик'"
          />
          <AtomsStatusBadge v-if="closedLabel" tone="warn" :label="closedLabel" />
          <AtomsStatusBadge v-if="survey?.isDemo" tone="demo" label="ДЕМО" />
        </div>
        <AtomsActionButton
          v-if="canFinish"
          label="Завершить опрос"
          tone="danger"
          :disabled="acting"
          @click="finishSurvey"
        />
      </div>
      <p v-if="state === 'ready'" class="mt-1 text-sm text-slate-500">{{ headerNote }}</p>
      <p v-if="survey?.finishedAt" class="mt-1 text-sm text-slate-700">
        Завершён досрочно {{ formatMinuteDateTime(survey.finishedAt) }} —
        {{ survey.finishedByName }}
      </p>
      <p v-if="survey?.isDemo" class="mt-1 text-sm text-slate-500">
        Демо-опрос.
        {{ editable ? '' : 'Менять его может только владелец.' }}
      </p>
    </div>

    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем опрос…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Опрос не прочитался. Это отказ запроса, а не отсутствие опроса."
    />
    <template v-else>
      <MoleculesSectionPanel v-if="survey === null && ownsDemo" title="Кому">
        <MoleculesDemoField
          v-model="demo"
          hint="Демо-опрос уходит только демо-рассылками, живой — только живыми."
        />
      </MoleculesSectionPanel>

      <OrganismsSurveyForm
        v-model:fields="fields"
        :content-readonly="frozen"
        :readonly="!editable"
        :finished="finished"
        :ends-on-min="endsOnMin"
        :ends-on-error="endsOnError"
      />

      <OrganismsSurveyQuestions v-model:fields="fields" :readonly="frozen || !editable" />

      <OrganismsSurveyMailings
        v-if="frozen"
        :state="toLoadState(resultsStatus)"
        :results="resultsData ?? null"
        :can-create-segment="canCreateSegment"
        :creating-group="creatingGroup"
        :segment-error="segmentError"
        @create-segment="createSegment"
      />

      <MoleculesAutosaveStatus
        v-if="editable"
        :state="autosave.state.value"
        :error="autosave.error.value"
        @retry="autosave.retry"
      />

      <MoleculesSectionPanel
        v-if="!frozen"
        title="Готовность"
        note="Опрос уходит рассылкой только полным: все тексты на русском и узбекском, название и последний день. Черновик сохраняется и недописанным."
      >
        <ul
          v-if="freezeProblems.length > 0"
          class="list-inside list-disc space-y-0.5 text-sm text-red-700"
        >
          <li v-for="problem in freezeProblems" :key="problem">{{ problem }}</li>
        </ul>
        <p v-else class="text-sm text-slate-700">Всё заполнено на обоих языках.</p>
      </MoleculesSectionPanel>

      <MoleculesSectionPanel
        v-if="survey && editable"
        title="Копия"
        :note="
          frozen
            ? 'Новый черновик со всеми вопросами, вариантами и настройками — его можно править. За копию водитель получит баллы снова: это новый опрос.'
            : 'Новый черновик со всеми вопросами, вариантами и настройками. Этот черновик остаётся как есть.'
        "
      >
        <AtomsActionButton label="Копировать" :disabled="acting" @click="copy" />
      </MoleculesSectionPanel>

      <MoleculesSectionPanel
        v-if="survey && editable && !frozen"
        title="Удаление"
        note="Черновик удаляется целиком, вместе с вопросами. Брошенный черновик сам не удаляется — только этой кнопкой."
      >
        <AtomsActionButton
          label="Удалить черновик"
          tone="danger"
          :disabled="acting"
          @click="removeDraft"
        />
      </MoleculesSectionPanel>

      <p v-if="actionError" class="text-sm text-red-700">{{ actionError }}</p>
    </template>
  </div>
</template>
