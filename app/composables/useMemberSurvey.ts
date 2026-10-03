import { computed, ref } from 'vue';
import type {
  MemberSurvey,
  MemberSurveyAnswer,
  MemberSurveyQuestion,
  MiniAppSurveyAnswerRequestBody,
  MiniAppSurveyResponse,
} from '#shared/types/memberSurvey';
import { INIT_DATA_HEADER, type Language } from '#shared/types/miniapp';

/**
 * Страница опроса в Mini App (issue #323): опрос, экран внутри него, черновики ответов
 * и сохранение по одному.
 *
 * Запросы живут здесь, а не в компонентах (docs/frontend.md → «Данные в компоненты не ходят»).
 * Личность уходит заголовком с подписанной строкой — идентификатора человека в запросе нет.
 *
 * Язык опроса — свой: с языка профиля, переключателем внутри опроса и без запроса к серверу.
 * Язык приложения он не меняет (решение Руслана 03-10-2026).
 */

/** Экран внутри опроса. */
export type MemberSurveyScreen = 'intro' | 'question' | 'finish' | 'closed';

/** Черновик ответа на вопрос — то, что сейчас на экране, до «Далее». */
export type MemberSurveyDraft = {
  optionIds: string[];
  /** Поле «Своего варианта» открыто. */
  ownOpen: boolean;
  ownText: string;
  textValue: string;
  scaleValue: number | null;
};

const EMPTY_DRAFT: MemberSurveyDraft = {
  optionIds: [],
  ownOpen: false,
  ownText: '',
  textValue: '',
  scaleValue: null,
};

const draftOf = (answer: MemberSurveyAnswer): MemberSurveyDraft => ({
  optionIds: answer.optionIds,
  ownOpen: answer.ownText !== null,
  ownText: answer.ownText ?? '',
  textValue: answer.textValue ?? '',
  scaleValue: answer.scaleValue,
});

/** Свой ответ в черновике — только из открытого поля и не из одних пробелов. */
const draftOwnText = (draft: MemberSurveyDraft): string | null =>
  draft.ownOpen && draft.ownText.trim() !== '' ? draft.ownText.trim() : null;

/** Есть ли в черновике ответ — то, что зажигает «Далее» и убирает «Пропустить». */
export const draftHasValue = (question: MemberSurveyQuestion, draft: MemberSurveyDraft): boolean => {
  if (question.type === 'text') {
    return draft.textValue.trim() !== '';
  }

  if (question.type === 'scale') {
    return draft.scaleValue !== null;
  }

  return draft.optionIds.length > 0 || draftOwnText(draft) !== null;
};

const answerHasValue = (answer: MemberSurveyAnswer): boolean =>
  answer.optionIds.length > 0 || answer.ownText !== null || answer.textValue !== null || answer.scaleValue !== null;

/**
 * Первый вопрос без ответа — с него открывается начатый опрос. Пропущенный необязательный —
 * отвеченный: человек его видел. Обязательный без значения — без ответа. Отвечены все, а опрос
 * не пройден — последний.
 */
const firstUnansweredIndex = (survey: MemberSurvey): number => {
  const questions = survey.views[survey.language].questions;
  const index = questions.findIndex((question) => {
    const answer = survey.answers.find((candidate) => candidate.questionId === question.questionId);

    return !answer || (question.required && !answerHasValue(answer));
  });

  return index === -1 ? Math.max(questions.length - 1, 0) : index;
};

export const useMemberSurvey = (readInitData: () => string) => {
  const survey = ref<MemberSurvey | null>(null);
  const language = ref<Language>('ru');
  const screen = ref<MemberSurveyScreen>('intro');
  const index = ref(0);
  const drafts = ref<Record<string, MemberSurveyDraft>>({});
  const saving = ref(false);
  const saveFailed = ref(false);

  const headers = () => ({ [INIT_DATA_HEADER]: readInitData() });

  const view = computed(() => survey.value?.views[language.value] ?? null);
  const question = computed(() => view.value?.questions[index.value] ?? null);
  const draft = computed(() => (question.value ? (drafts.value[question.value.questionId] ?? EMPTY_DRAFT) : EMPTY_DRAFT));

  /** Ответ сервера: опрос, черновики из сохранённых ответов, экран по этапу. */
  const apply = (next: MemberSurvey): void => {
    survey.value = next;
    drafts.value = Object.fromEntries(next.answers.map((answer) => [answer.questionId, draftOf(answer)]));

    if (next.stage === 'finish' || next.stage === 'closed') {
      screen.value = next.stage;
    } else if (next.stage === 'questions') {
      screen.value = 'question';
    } else {
      screen.value = 'intro';
    }
  };

  /**
   * Открывает опрос: экран выбирает этап — начатый открывается на первом вопросе без ответа.
   * `false` — опроса нет, он недоступен или не прочитался: остаётся главная, как без параметра.
   */
  const open = async (surveyId: string): Promise<boolean> => {
    try {
      const response = await $fetch<MiniAppSurveyResponse>(`/api/miniapp/surveys/${surveyId}`, { headers: headers() });

      if (!response.survey) {
        return false;
      }

      language.value = response.survey.language;
      apply(response.survey);
      index.value = firstUnansweredIndex(response.survey);
      saveFailed.value = false;

      return true;
    } catch (error) {
      console.error('[miniapp] не удалось открыть опрос', error);

      return false;
    }
  };

  const reset = (): void => {
    survey.value = null;
    drafts.value = {};
    index.value = 0;
    screen.value = 'intro';
    saving.value = false;
    saveFailed.value = false;
  };

  const updateDraft = (change: (current: MemberSurveyDraft) => MemberSurveyDraft): void => {
    const current = question.value;

    if (!current || saving.value) {
      return;
    }

    drafts.value = { ...drafts.value, [current.questionId]: change(draft.value) };
    saveFailed.value = false;
  };

  /**
   * Нажатие на вариант. Один ответ — выбор гасит соседние и закрывает «Свой вариант». Несколько —
   * выбор не гасит соседние; исключающий снимает остальные отметки и свой ответ, отметка любого
   * другого снимает исключающий.
   */
  const toggleOption = (optionId: string): void => {
    const current = question.value;

    if (!current) {
      return;
    }

    updateDraft((state) => {
      if (current.type === 'single') {
        return { ...state, optionIds: [optionId], ownOpen: false };
      }

      if (state.optionIds.includes(optionId)) {
        return { ...state, optionIds: state.optionIds.filter((chosen) => chosen !== optionId) };
      }

      const option = current.options.find((candidate) => candidate.optionId === optionId);

      if (option?.exclusive) {
        return { ...state, optionIds: [optionId], ownOpen: false, ownText: '' };
      }

      const exclusiveIds = current.options.filter((candidate) => candidate.exclusive).map((candidate) => candidate.optionId);

      return { ...state, optionIds: [...state.optionIds.filter((chosen) => !exclusiveIds.includes(chosen)), optionId] };
    });
  };

  /** «Свой вариант»: строка становится полем. У одного ответа — вместо варианта, у нескольких — вместе. */
  const openOwn = (): void => {
    const current = question.value;

    if (!current) {
      return;
    }

    updateDraft((state) => {
      if (current.type === 'single') {
        return { ...state, optionIds: [], ownOpen: true };
      }

      const exclusiveIds = current.options.filter((candidate) => candidate.exclusive).map((candidate) => candidate.optionId);

      return { ...state, optionIds: state.optionIds.filter((chosen) => !exclusiveIds.includes(chosen)), ownOpen: true };
    });
  };

  const setOwnText = (text: string): void => updateDraft((state) => ({ ...state, ownText: text }));
  const setTextValue = (text: string): void => updateDraft((state) => ({ ...state, textValue: text }));
  const setScale = (value: number): void => updateDraft((state) => ({ ...state, scaleValue: value }));

  const hasValue = computed(() => (question.value ? draftHasValue(question.value, draft.value) : false));
  const canNext = computed(() => hasValue.value || question.value?.required === false);
  const skip = computed(() => !hasValue.value && question.value?.required === false);

  const start = (): void => {
    screen.value = 'question';
    index.value = survey.value ? firstUnansweredIndex(survey.value) : 0;
    saveFailed.value = false;
  };

  /** «Назад»: к прошлому вопросу с его сохранённым ответом, с первого — на экран открытия. */
  const back = (): void => {
    if (saving.value) {
      return;
    }

    saveFailed.value = false;

    if (index.value === 0) {
      screen.value = 'intro';

      return;
    }

    index.value -= 1;
  };

  /**
   * «Далее»: ответ уезжает на сервер, и экран выбирает ответ — следующий вопрос, финал или «опрос
   * закрыт». Последний вопрос, после которого опрос не пройден, ведёт к первому без ответа.
   * Отказ — строка над кнопками, «Далее» снова нажимается.
   */
  const next = async (): Promise<void> => {
    const current = question.value;
    const currentSurvey = survey.value;

    if (!current || !currentSurvey || saving.value || !canNext.value) {
      return;
    }

    const state = draft.value;
    const usesOptions = current.type === 'single' || current.type === 'multiple';
    const body: MiniAppSurveyAnswerRequestBody = {
      questionId: current.questionId,
      optionIds: usesOptions ? state.optionIds : [],
      ownText: usesOptions ? draftOwnText(state) : null,
      textValue: current.type === 'text' && state.textValue.trim() !== '' ? state.textValue.trim() : null,
      scaleValue: current.type === 'scale' ? state.scaleValue : null,
    };

    saving.value = true;
    saveFailed.value = false;

    try {
      const response = await $fetch<MiniAppSurveyResponse>(`/api/miniapp/surveys/${currentSurvey.surveyId}/answers`, {
        method: 'POST',
        headers: headers(),
        body,
      });

      if (!response.survey) {
        throw new Error('опрос больше недоступен');
      }

      const total = response.survey.views[response.survey.language].questions.length;
      const isLast = index.value >= total - 1;

      apply(response.survey);

      if (response.survey.stage === 'questions') {
        index.value = isLast ? firstUnansweredIndex(response.survey) : index.value + 1;
      }
    } catch (error) {
      console.error('[miniapp] не удалось сохранить ответ', error);
      saveFailed.value = true;
    } finally {
      saving.value = false;
    }
  };

  /** Кнопка отказа: метка уходит на сервер, а экран закрывается сразу — водителю ждать нечего. */
  const decline = async (): Promise<void> => {
    const surveyId = survey.value?.surveyId;

    if (!surveyId) {
      return;
    }

    try {
      await $fetch(`/api/miniapp/surveys/${surveyId}/decline`, { method: 'POST', headers: headers() });
    } catch (error) {
      console.error('[miniapp] не удалось записать отказ от опроса', error);
    }
  };

  /** Кнопка перехода в приложение на финале — тем же устройством, что отказ. */
  const markApp = async (): Promise<void> => {
    const surveyId = survey.value?.surveyId;

    if (!surveyId) {
      return;
    }

    try {
      await $fetch(`/api/miniapp/surveys/${surveyId}/app`, { method: 'POST', headers: headers() });
    } catch (error) {
      console.error('[miniapp] не удалось записать переход в приложение', error);
    }
  };

  return {
    survey,
    language,
    screen,
    index,
    view,
    question,
    draft,
    saving,
    saveFailed,
    canNext,
    skip,
    open,
    reset,
    start,
    back,
    next,
    toggleOption,
    openOwn,
    setOwnText,
    setTextValue,
    setScale,
    decline,
    markApp,
  };
};
