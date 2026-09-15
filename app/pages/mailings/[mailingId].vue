<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDraftAutosave } from '~/composables/useDraftAutosave';
import { formatDateTime, formatNumber, pluralize } from '~/utils/format';
import { mailingStatusLabel, mailingStatusTone } from '~/utils/labels';
import { failureText } from '~/utils/requestError';
import { toLoadState } from '~/utils/loadState';
import {
  MAILING_AUDIENCE_EMPTY_TEXT,
  MAILING_RECALL_WINDOW_HOURS,
  mailingLaunchProblems,
  mailingLaunchProblemText,
  mailingRecallProblemText,
} from '#shared/mailing';
import type {
  Mailing,
  MailingAudienceResponse,
  MailingRequestBody,
  MailingResponse,
} from '#shared/types/mailing';

/**
 * Экран рассылки. Что на нём можно, решает статус:
 *
 * - новая (`/mailings/new`) — пустая форма; черновик заводится первым символом или фото
 * - черновик — тексты и фото на одном экране, сохранение само, число адресатов, запуск
 *   отдельным подтверждением, копия и удаление
 * - идёт — счётчики, которые обновляются сами, и остановка; копии нет
 * - остановлена — счётчики, копия в новый черновик (остановленная не возобновляется) и отзыв
 * - завершена — счётчики, копия и отзыв
 *
 * Новая и заведённый из неё черновик — один экземпляр страницы (`key` ниже): адрес меняется
 * на адрес записи без перехода, и набранное не теряется (issue #148).
 *
 * Кнопки показываются по статусу с сервера, но решает ручка: запуск не черновика и остановка
 * не идущей отвечают отказом.
 */

definePageMeta({
  middleware: 'mailings-access',
  key: 'mailing-editor',
});

/** Адрес новой рассылки. Идентификатором не является — ручкам он не уходит. */
const NEW_MAILING = 'new';

const route = useRoute();
const routeId = computed(() => String(route.params.mailingId));

// За рассылкой ходим при открытии адреса записи. Смена адреса запрос сама не повторяет
// (`watch: false`): после заведения черновик уже на руках, а переход к копии разбирает `watch`
// ниже. Перечитывание идущей рассылки идёт тем же `refresh`.
const { data, status, refresh } = await useFetch<MailingResponse>(
  () => `/api/mailings/${routeId.value}`,
  { immediate: routeId.value !== NEW_MAILING, watch: false },
);

const mailing = computed<Mailing | null>(() => data.value?.mailing ?? null);

const setMailing = (next: Mailing): void => {
  data.value = { mailing: next };
};

const isDraft = computed(() => mailing.value === null || mailing.value.status === 'draft');

const toFields = (source: Mailing | null): MailingRequestBody => ({
  title: source?.title ?? '',
  textRu: source?.textRu ?? '',
  textUz: source?.textUz ?? '',
});

/** То, что на экране. Ответ сервера его не перезаписывает. */
const fields = ref<MailingRequestBody>(toFields(mailing.value));

const state = computed(() =>
  mailing.value !== null || routeId.value === NEW_MAILING ? 'ready' : toLoadState(status.value),
);

const headingText = computed(
  () => fields.value.title.trim() || (mailing.value ? 'Без заголовка' : 'Новая рассылка'),
);

useHead({ title: () => `${headingText.value} — XalqBonus` });

/**
 * Строка под заголовком — фразами через пробел, собранная здесь, а не соседними `<template>`
 * в разметке: пробел между ними Vue при сборке снимает, и фразы слипались
 * («…10:40:15.Остановлена…»).
 */
const headerNote = computed(() => {
  const current = mailing.value;

  if (!current) {
    return 'Черновик появится, как только вы начнёте набирать текст или выберете фото.';
  }

  const phrases = [`Завёл ${current.createdByName}.`];

  if (current.startedAt) {
    phrases.push(`Запущена ${formatDateTime(current.startedAt)}.`);
  }

  if (current.finishedAt) {
    const verb = current.status === 'stopped' ? 'Остановлена' : 'Завершена';

    phrases.push(`${verb} ${formatDateTime(current.finishedAt)}.`);
  }

  return phrases.join(' ');
});

const { data: audience, status: audienceStatus } =
  await useFetch<MailingAudienceResponse>('/api/mailings/audience');

const audienceState = computed(() => toLoadState(audienceStatus.value));

/**
 * Сохранение черновика: первое заводит запись и переводит адрес на неё, остальные правят.
 * Адрес меняется заменой: «назад» ведёт в список, а не на пустую форму.
 */
const saveDraft = async (snapshot: MailingRequestBody): Promise<void> => {
  const current = mailing.value;

  if (current === null) {
    const created = await $fetch<MailingResponse>('/api/mailings', {
      method: 'POST',
      body: snapshot,
    });

    setMailing(created.mailing);
    await navigateTo(`/mailings/${created.mailing.mailingId}`, { replace: true });

    return;
  }

  const updated = await $fetch<MailingResponse>(`/api/mailings/${current.mailingId}`, {
    method: 'PATCH',
    body: snapshot,
  });

  setMailing(updated.mailing);
};

const autosave = useDraftAutosave({
  fields,
  save: saveDraft,
  enabled: () => isDraft.value,
});

// Переход к другой записи на той же странице — копией или историей браузера.
watch(routeId, async (id) => {
  if (id === NEW_MAILING) {
    data.value = undefined;
    autosave.replace(toFields(null));

    return;
  }

  if (id === mailing.value?.mailingId) {
    return;
  }

  data.value = undefined;
  await refresh();
  autosave.replace(toFields(mailing.value));
});

/**
 * Почему «Запустить» закрыта — все причины сразу, теми же фразами, что пришли бы отказом
 * ручки. Считается по тому, что на экране: запускается оно, досохранённое перед запуском.
 */
const launchProblems = computed(() => {
  const problems = mailingLaunchProblems(fields.value, mailing.value?.photoPath != null).map(
    mailingLaunchProblemText,
  );

  if (audience.value?.total === 0) {
    problems.push(MAILING_AUDIENCE_EMPTY_TEXT);
  }

  return problems;
});

const uploading = ref(false);
const photoError = ref<string | null>(null);

/** Фото — в один шаг. Черновика ещё нет — заводим его этим же выбором. */
const upload = async (file: File): Promise<void> => {
  uploading.value = true;
  photoError.value = null;

  try {
    if (mailing.value === null && !(await autosave.saveNow())) {
      photoError.value = autosave.error.value;

      return;
    }

    const current = mailing.value;

    if (!current) {
      return;
    }

    const body = new FormData();

    body.append('photo', file);

    const updated = await $fetch<MailingResponse>(`/api/mailings/${current.mailingId}/photo`, {
      method: 'POST',
      body,
    });

    setMailing(updated.mailing);
  } catch (error) {
    photoError.value = failureText(error);
  } finally {
    uploading.value = false;
  }
};

/** Снятие фото. Потолок счётчика формы возвращается к сообщению без подписи тут же. */
const removePhoto = async (): Promise<void> => {
  const current = mailing.value;

  if (!current) {
    return;
  }

  uploading.value = true;
  photoError.value = null;

  try {
    const updated = await $fetch<MailingResponse>(`/api/mailings/${current.mailingId}/photo`, {
      method: 'DELETE',
    });

    setMailing(updated.mailing);
  } catch (error) {
    photoError.value = failureText(error);
  } finally {
    uploading.value = false;
  }
};

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

/**
 * Подтверждения экрана — своим диалогом, а не браузерным `confirm`: необратимое действие в вебе
 * спрашивает `ConfirmDialog` (issue #148). Диалог один на экран, запрос — промисом: действие
 * ждёт ответа тем же `await`, каким ждало браузерного окна.
 *
 * Фокус, Escape и клик мимо окна отдают отказ (app/components/molecules/ConfirmDialog.vue).
 */
type Confirmation = {
  title: string;
  message: string;
  /** Подпись действием: «Отозвать», а не «ОК». */
  confirmLabel: string;
  /**
   * Красный — только там, где что-то пропадает: остановка, удаление, отзыв. Запуск — главное
   * действие экрана и красным не бывает: иначе цвет перестанет предупреждать. От случайного
   * запуска страхует число адресатов в заголовке, а не цвет.
   */
  tone: 'primary' | 'danger';
};

const confirmation = ref<Confirmation | null>(null);

let answerConfirmation: ((confirmed: boolean) => void) | null = null;

const askConfirmation = (request: Confirmation): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    answerConfirmation = resolve;
    confirmation.value = request;
  });

const resolveConfirmation = (confirmed: boolean): void => {
  answerConfirmation?.(confirmed);
  answerConfirmation = null;
  confirmation.value = null;
};

/**
 * Запуск. Уходит то, что на экране: несохранённое досохраняется перед подтверждением,
 * а не сохранилось — не запускаем, причина уже стоит у отметки сохранения.
 *
 * Число адресатов в подтверждении спрашивается заново: страница могла пролежать открытой,
 * а участники за это время вступали и отвязывались.
 */
const launch = (): Promise<void> =>
  runAction(async () => {
    if (!(await autosave.flush())) {
      return;
    }

    const current = mailing.value;

    if (!current) {
      return;
    }

    const fresh = await $fetch<MailingAudienceResponse>('/api/mailings/audience');

    audience.value = fresh;

    const disabledNote =
      fresh.notificationsDisabled > 0
        ? `Из них ${formatNumber(fresh.notificationsDisabled)} отключили уведомления и сообщения не получат. `
        : '';

    const confirmed = await askConfirmation({
      title: `Разослать «${fields.value.title.trim()}» — ${formatNumber(fresh.total)} адресатам?`,
      message: `${disabledNote}Отозвать отправленное можно только в течение ${MAILING_RECALL_WINDOW_HOURS} часов.`,
      confirmLabel: 'Запустить',
      tone: 'primary',
    });

    if (!confirmed) {
      return;
    }

    const launched = await $fetch<MailingResponse>(`/api/mailings/${current.mailingId}/launch`, {
      method: 'POST',
    });

    setMailing(launched.mailing);
  });

/** Удаление черновика вместе с фото. Правка, не успевшая уехать, бросается — удаляем же. */
const removeDraft = (): Promise<void> =>
  runAction(async () => {
    const confirmed = await askConfirmation({
      title: 'Удалить черновик вместе с фото?',
      message: 'Вернуть его будет нельзя.',
      confirmLabel: 'Удалить',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    await autosave.discard();

    const current = mailing.value;

    if (current) {
      // Адрес приведён к строке: типы маршрутов Nitro сопоставляют шаблон `/api/mailings/${…}`
      // и с `/api/mailings/audience`, у которой есть только `GET`, и не пускают `DELETE`.
      const draftUrl: string = `/api/mailings/${current.mailingId}`;

      await $fetch(draftUrl, { method: 'DELETE' });
    }

    await navigateTo('/mailings');
  });

const stop = (): Promise<void> =>
  runAction(async () => {
    const current = mailing.value;

    if (!current) {
      return;
    }

    const confirmed = await askConfirmation({
      title: 'Остановить рассылку?',
      message:
        'Кто ещё не получил сообщение, уже не получит. Возобновить нельзя — только скопировать в новый черновик.',
      confirmLabel: 'Остановить',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    const stopped = await $fetch<MailingResponse>(`/api/mailings/${current.mailingId}/stop`, {
      method: 'POST',
    });

    setMailing(stopped.mailing);
  });

/**
 * Копия ведёт на свою страницу: следующий шаг — поправить и запустить её. У черновика
 * копируется то, что на экране: несохранённое досохраняется, а не сохранилось — не копируем.
 */
const copy = (): Promise<void> =>
  runAction(async () => {
    if (isDraft.value && !(await autosave.flush())) {
      return;
    }

    const current = mailing.value;

    if (!current) {
      return;
    }

    const created = await $fetch<MailingResponse>(`/api/mailings/${current.mailingId}/copy`, {
      method: 'POST',
    });

    await navigateTo(`/mailings/${created.mailing.mailingId}`);
  });

/**
 * «Сейчас» для остатка окна отзыва. Двигается раз в минуту: остаток показывается часами,
 * и страница, пролежавшая открытой полдня, не должна обещать то, чего Telegram уже не даст.
 */
const NOW_TICK_MS = 60_000;
const now = ref(Date.now());

const HOUR_MS = 3_600_000;

/**
 * Что сейчас с отзывом: можно ли нажать и что написать рядом с кнопкой.
 *
 * Кнопка не прячется ни в одном состоянии, а гаснет с пояснением: исчезнувшая кнопка читается
 * как поломка (issue #150). Решает ручка — экран только не предлагает заведомо отказное.
 */
const recallState = computed((): { available: boolean; note: string } | null => {
  const current = mailing.value;

  if (!current || (current.status !== 'stopped' && current.status !== 'finished')) {
    return null;
  }

  const { recall, counters } = current;
  const tally = `${formatNumber(recall.recalled)} из ${formatNumber(counters.sent)}`;

  if (recall.finishedAt !== null) {
    return { available: false, note: `Отозвано ${tally}.` };
  }

  if (recall.startedAt !== null) {
    return { available: false, note: `Отзыв идёт: снято ${tally}.` };
  }

  if (recall.deadlineAt === null) {
    return { available: false, note: mailingRecallProblemText('nothing_sent') };
  }

  const left = new Date(recall.deadlineAt).getTime() - now.value;

  if (left <= 0) {
    return { available: false, note: mailingRecallProblemText('window_expired') };
  }

  const hours = Math.floor(left / HOUR_MS);

  return {
    available: true,
    note:
      hours === 0
        ? 'Отозвать можно ещё меньше часа.'
        : `Отозвать можно ещё ${hours} ${pluralize(hours, 'час', 'часа', 'часов')}.`,
  };
});

/** Отзыв. Водителю вдогонку ничего не уходит — сообщение просто исчезает из переписки. */
const recall = (): Promise<void> =>
  runAction(async () => {
    const current = mailing.value;

    if (!current) {
      return;
    }

    const recipients = current.counters.sent;

    const confirmed = await askConfirmation({
      title: 'Отозвать рассылку?',
      message: `Сообщение будет удалено у ${formatNumber(recipients)} ${pluralize(recipients, 'водителя', 'водителей', 'водителей')}. Отменить это нельзя.`,
      confirmLabel: 'Отозвать',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    const recalled = await $fetch<MailingResponse>(`/api/mailings/${current.mailingId}/recall`, {
      method: 'POST',
    });

    setMailing(recalled.mailing);
  });

/**
 * Пока рассылка идёт или идёт её отзыв, счётчики перечитываются сами: четыре тысячи адресатов
 * уходят минутами, и смотреть на застывшие нули, нажимая «обновить», — не то, ради чего экран.
 */
const REFRESH_INTERVAL_MS = 5_000;

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let nowTimer: ReturnType<typeof setInterval> | null = null;

const stopRefreshing = (): void => {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
};

const inProgress = computed(() => {
  const current = mailing.value;

  if (!current) {
    return false;
  }

  return (
    current.status === 'running' ||
    (current.recall.startedAt !== null && current.recall.finishedAt === null)
  );
});

onMounted(() => {
  now.value = Date.now();
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, NOW_TICK_MS);

  watch(
    inProgress,
    (active) => {
      stopRefreshing();

      if (active) {
        refreshTimer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
      }
    },
    { immediate: true },
  );
});

onBeforeUnmount(() => {
  stopRefreshing();
  // Ушли со страницы с открытым вопросом — это отказ: действие не должно ждать ответа вечно.
  resolveConfirmation(false);

  if (nowTimer !== null) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
});
</script>

<template>
  <div class="space-y-6">
    <MoleculesConfirmDialog
      :open="autosave.leaveFailureOpen.value"
      title="Уйти без сохранения?"
      :message="`Последняя правка черновика не сохранилась: ${autosave.error.value ?? ''} Если уйти, она пропадёт.`"
      confirm-label="Уйти без сохранения"
      cancel-label="Остаться"
      @confirm="autosave.resolveLeave(true)"
      @cancel="autosave.resolveLeave(false)"
    />
    <MoleculesConfirmDialog
      :open="confirmation !== null"
      :title="confirmation?.title ?? ''"
      :message="confirmation?.message ?? ''"
      :confirm-label="confirmation?.confirmLabel ?? ''"
      :tone="confirmation?.tone ?? 'danger'"
      cancel-label="Отмена"
      @confirm="resolveConfirmation(true)"
      @cancel="resolveConfirmation(false)"
    />

    <div>
      <NuxtLink to="/mailings" class="text-sm text-slate-500 underline underline-offset-2">
        ← Все рассылки
      </NuxtLink>
      <div class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 class="text-xl font-semibold text-slate-900">{{ headingText }}</h1>
        <AtomsStatusBadge
          v-if="mailing"
          :tone="mailingStatusTone(mailing.status)"
          :label="mailingStatusLabel(mailing.status)"
        />
      </div>
      <p v-if="state === 'ready'" class="mt-1 text-sm text-slate-500">{{ headerNote }}</p>
    </div>

    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем рассылку…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Рассылка не прочиталась. Это отказ запроса, а не отсутствие рассылки."
    />
    <template v-else-if="isDraft">
      <OrganismsMailingForm
        v-model:title="fields.title"
        v-model:text-ru="fields.textRu"
        v-model:text-uz="fields.textUz"
        heading="Черновик"
        :mailing="mailing"
        :autosave-state="autosave.state.value"
        :autosave-error="autosave.error.value"
        :audience-state="audienceState"
        :audience="audience ?? null"
        :uploading="uploading"
        :photo-error="photoError"
        @upload="upload"
        @remove-photo="removePhoto"
        @retry="autosave.retry"
      />

      <MoleculesSectionPanel
        title="Запуск"
        note="Уходит то, что на экране. Адресаты фиксируются в момент запуска: кто вступит в программу позже, рассылку не получит. Сообщения уходят очередью, по несколько в секунду."
      >
        <AtomsActionButton
          label="Запустить рассылку"
          tone="primary"
          :disabled="acting || launchProblems.length > 0"
          @click="launch"
        />
        <ul
          v-if="launchProblems.length > 0"
          class="mt-3 list-inside list-disc space-y-0.5 text-sm text-red-700"
        >
          <li v-for="problem in launchProblems" :key="problem">{{ problem }}</li>
        </ul>
        <p v-if="actionError" class="mt-3 text-sm text-red-700">{{ actionError }}</p>
      </MoleculesSectionPanel>

      <MoleculesSectionPanel
        v-if="mailing"
        title="Копия"
        note="Новый черновик с тем же заголовком, текстами и фото. Этот черновик остаётся как есть."
      >
        <AtomsActionButton label="Скопировать в новый черновик" :disabled="acting" @click="copy" />
      </MoleculesSectionPanel>

      <MoleculesSectionPanel
        v-if="mailing"
        title="Удаление"
        note="Черновик удаляется целиком, вместе с фото: адресатов у него ещё нет. Брошенный черновик сам не удаляется — только этой кнопкой."
      >
        <AtomsActionButton
          label="Удалить черновик"
          tone="danger"
          :disabled="acting"
          @click="removeDraft"
        />
      </MoleculesSectionPanel>
    </template>

    <template v-else-if="mailing">
      <MoleculesSectionPanel
        title="Исходы"
        :note="
          mailing.status === 'running'
            ? 'Обновляется каждые пять секунд, пока рассылка идёт.'
            : 'Сумма исходов равна числу адресатов: считаются они одним запросом по снимку. Отзыв исход не меняет — отозванные остаются среди отправленных.'
        "
      >
        <OrganismsMailingCounters :counters="mailing.counters" />

        <div v-if="mailing.status === 'running'" class="mt-4">
          <AtomsActionButton label="Остановить" tone="danger" :disabled="acting" @click="stop" />
          <p v-if="actionError" class="mt-3 text-sm text-red-700">{{ actionError }}</p>
        </div>

        <div v-else-if="recallState" class="mt-4">
          <div class="flex flex-wrap items-center gap-3">
            <AtomsActionButton
              label="Скопировать в новый черновик"
              :disabled="acting"
              @click="copy"
            />
            <AtomsActionButton
              label="Отозвать"
              tone="danger"
              :disabled="acting || !recallState.available"
              @click="recall"
            />
            <p class="text-sm text-slate-500">{{ recallState.note }}</p>
          </div>
          <p v-if="actionError" class="mt-3 text-sm text-red-700">{{ actionError }}</p>
        </div>
      </MoleculesSectionPanel>

      <OrganismsMailingContent :mailing="mailing" />
    </template>
  </div>
</template>
