<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDemoEditor } from '~/composables/useDemoEditor';
import { useDraftAutosave } from '~/composables/useDraftAutosave';
import type { SurveyFormFields } from '~/types/surveyForm';
import { formatDateTime } from '~/utils/format';
import { failureText } from '~/utils/requestError';
import { toLoadState } from '~/utils/loadState';
import { toSurveyContentInput, toSurveyFormFields } from '~/utils/surveyForm';
import { surveyFreezeProblems, surveyFreezeProblemText } from '#shared/survey';
import type {
  Survey,
  SurveyCreateRequestBody,
  SurveyRequestBody,
  SurveyResponse,
} from '#shared/types/survey';

/**
 * Экран опроса (issue #320). Что на нём можно, решает заморозка:
 *
 * - новый (`/mailings/surveys/new`) — пустая форма; черновик заводится первым символом
 * - черновик — всё правится и сохраняется само; копия и удаление
 * - заморожен — открыт на чтение, кроме названия и даты окончания; копия
 *
 * Новый и заведённый из него черновик — один экземпляр страницы (`key` ниже): адрес меняется
 * на адрес записи без перехода, и набранное не теряется (issue #148).
 *
 * Списка рассылок опроса здесь нет: опрос прикрепляется на экране рассылки (issue #321),
 * а прикреплённый к черновику рассылки черновик опроса не удаляется — отказ ручки говорит,
 * где открепить.
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

const setSurvey = (next: Survey): void => {
  data.value = { survey: next };
};

const frozen = computed(() => survey.value?.frozenAt != null);

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

const headerNote = computed(() => {
  const current = survey.value;

  if (!current) {
    return 'Черновик появится, как только вы начнёте набирать.';
  }

  const phrases = [`Завёл ${current.createdByName}.`];

  if (current.frozenAt) {
    phrases.push(
      `Заморожен ${formatDateTime(current.frozenAt)}: ушёл рассылкой, правятся только название и дата окончания.`,
    );
  }

  return phrases.join(' ');
});

/**
 * Сохранение: первое заводит черновик и переводит адрес на него, остальные правят.
 * Замороженный отправляет только название и срок — содержимое ему сервер не примет.
 */
const saveSurvey = async (snapshot: SurveyFormFields): Promise<void> => {
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
  await refresh();
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

// Ушли со страницы с открытым вопросом — это отказ: действие не должно ждать ответа вечно.
onBeforeUnmount(() => resolveDelete(false));
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

    <div>
      <NuxtLink to="/mailings/surveys" class="text-sm text-slate-500 underline underline-offset-2">
        ← Все опросы
      </NuxtLink>
      <div class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 class="text-xl font-semibold text-slate-900">{{ headingText }}</h1>
        <AtomsStatusBadge
          v-if="survey"
          :tone="frozen ? 'ok' : 'muted'"
          :label="frozen ? 'заморожен' : 'черновик'"
        />
        <AtomsStatusBadge v-if="survey?.closed" tone="warn" label="закрыт по сроку" />
        <AtomsStatusBadge v-if="survey?.isDemo" tone="demo" label="ДЕМО" />
      </div>
      <p v-if="state === 'ready'" class="mt-1 text-sm text-slate-500">{{ headerNote }}</p>
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
      />

      <OrganismsSurveyQuestions v-model:fields="fields" :readonly="frozen || !editable" />

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
