<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { formatDateTime, formatNumber } from '~/utils/format';
import { mailingStatusLabel, mailingStatusTone } from '~/utils/labels';
import { failureText } from '~/utils/requestError';
import { toLoadState } from '~/utils/loadState';
import {
  MAILING_CAPTION_MAX_LENGTH,
  MAILING_TEXT_MAX_LENGTH,
  mailingLengthProblem,
} from '#shared/mailing';
import type {
  MailingAudienceResponse,
  MailingRequestBody,
  MailingResponse,
} from '#shared/types/mailing';

/**
 * Страница рассылки. Что на ней можно, решает статус:
 *
 * - черновик — правка, фото, число адресатов и запуск отдельным подтверждением
 * - идёт — счётчики, которые обновляются сами, и остановка
 * - остановлена — счётчики и копия в новый черновик: остановленная не возобновляется
 * - завершена — счётчики
 *
 * Кнопки показываются по статусу с сервера, но решает ручка: запуск не черновика и остановка
 * не идущей отвечают отказом.
 */

definePageMeta({
  middleware: 'mailings-access',
});

const route = useRoute();
const mailingId = computed(() => String(route.params.mailingId));

const { data, status, refresh } = await useFetch<MailingResponse>(
  () => `/api/mailings/${mailingId.value}`,
);

useHead({ title: () => `${data.value?.mailing.title ?? 'Рассылка'} — XalqBonus` });

const state = computed(() => toLoadState(status.value));
const mailing = computed(() => data.value?.mailing ?? null);
const isDraft = computed(() => mailing.value?.status === 'draft');

/**
 * Строка под заголовком — фразами через пробел, собранная здесь, а не соседними `<template>`
 * в разметке: пробел между ними Vue при сборке снимает, и фразы слипались
 * («…10:40:15.Остановлена…»).
 */
const headerNote = computed(() => {
  const current = mailing.value;

  if (!current) {
    return '';
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

/** Подсказка под полем фото — числа из `shared/mailing.ts`, а не вписанные руками. */
const photoNote = `Необязательно. С фото сообщение уходит подписью к нему — потолок ${formatNumber(MAILING_CAPTION_MAX_LENGTH)} знаков вместо ${formatNumber(MAILING_TEXT_MAX_LENGTH)}.`;

const { data: audience, status: audienceStatus } =
  await useFetch<MailingAudienceResponse>('/api/mailings/audience');

const audienceState = computed(() => toLoadState(audienceStatus.value));

/**
 * Почему «Запустить» закрыта — той же фразой, что пришла бы отказом ручки. Считается
 * по сохранённому черновику: запускается он, а не то, что набрано в форме.
 */
const launchProblem = computed(() =>
  mailing.value
    ? mailingLengthProblem(mailing.value.textRu, mailing.value.textUz, mailing.value.photoPath !== null)
    : null,
);

const saving = ref(false);
const saveError = ref<string | null>(null);

const save = async (body: MailingRequestBody): Promise<void> => {
  saving.value = true;
  saveError.value = null;

  try {
    await $fetch<MailingResponse>(`/api/mailings/${mailingId.value}`, { method: 'PATCH', body });
    await refresh();
  } catch (error) {
    saveError.value = failureText(error);
  } finally {
    saving.value = false;
  }
};

const uploading = ref(false);
const photoError = ref<string | null>(null);

const upload = async (file: File): Promise<void> => {
  uploading.value = true;
  photoError.value = null;

  const body = new FormData();

  body.append('photo', file);

  try {
    await $fetch<MailingResponse>(`/api/mailings/${mailingId.value}/photo`, { method: 'POST', body });
    await refresh();
  } catch (error) {
    photoError.value = failureText(error);
  } finally {
    uploading.value = false;
  }
};

/**
 * Снятие фото. После ответа рассылка перечитывается, форма получает черновик без фото —
 * и потолок её счётчика возвращается к сообщению без подписи тут же.
 */
const removePhoto = async (): Promise<void> => {
  uploading.value = true;
  photoError.value = null;

  try {
    await $fetch<MailingResponse>(`/api/mailings/${mailingId.value}/photo`, { method: 'DELETE' });
    await refresh();
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
 * Запуск. Число адресатов в подтверждении спрашивается заново: страница могла пролежать
 * открытой, а участники за это время вступали и отвязывались. Запускается сохранённый
 * черновик, а не набранное в форме.
 */
const launch = (): Promise<void> =>
  runAction(async () => {
    const current = mailing.value;

    if (!current) {
      return;
    }

    const fresh = await $fetch<MailingAudienceResponse>('/api/mailings/audience');

    const disabledNote =
      fresh.notificationsDisabled > 0
        ? ` Из них ${formatNumber(fresh.notificationsDisabled)} отключили уведомления и сообщения не получат.`
        : '';

    if (
      !window.confirm(
        `Разослать «${current.title}» — ${formatNumber(fresh.total)} адресатам?${disabledNote} Уходит сохранённый черновик. Отправленное не отзывается.`,
      )
    ) {
      return;
    }

    await $fetch<MailingResponse>(`/api/mailings/${mailingId.value}/launch`, { method: 'POST' });
    await refresh();
  });

const stop = (): Promise<void> =>
  runAction(async () => {
    if (
      !window.confirm(
        'Остановить рассылку? Кто ещё не получил сообщение, уже не получит. Возобновить нельзя — только скопировать в новый черновик.',
      )
    ) {
      return;
    }

    await $fetch<MailingResponse>(`/api/mailings/${mailingId.value}/stop`, { method: 'POST' });
    await refresh();
  });

/** Копия ведёт на свою страницу: следующий шаг — поправить и запустить её. */
const copy = (): Promise<void> =>
  runAction(async () => {
    const created = await $fetch<MailingResponse>(`/api/mailings/${mailingId.value}/copy`, {
      method: 'POST',
    });

    await navigateTo(`/mailings/${created.mailing.mailingId}`);
  });

/**
 * Пока рассылка идёт, счётчики перечитываются сами: четыре тысячи адресатов уходят минутами,
 * и смотреть на застывшие нули, нажимая «обновить», — не то, ради чего экран.
 */
const REFRESH_INTERVAL_MS = 5_000;

let refreshTimer: ReturnType<typeof setInterval> | null = null;

const stopRefreshing = (): void => {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
};

onMounted(() => {
  watch(
    () => mailing.value?.status,
    (current) => {
      stopRefreshing();

      if (current === 'running') {
        refreshTimer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
      }
    },
    { immediate: true },
  );
});

onBeforeUnmount(stopRefreshing);
</script>

<template>
  <div class="space-y-6">
    <div>
      <NuxtLink to="/mailings" class="text-sm text-slate-500 underline underline-offset-2">
        ← Все рассылки
      </NuxtLink>
      <div class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 class="text-xl font-semibold text-slate-900">{{ mailing?.title ?? 'Рассылка' }}</h1>
        <AtomsStatusBadge
          v-if="mailing"
          :tone="mailingStatusTone(mailing.status)"
          :label="mailingStatusLabel(mailing.status)"
        />
      </div>
      <p v-if="mailing" class="mt-1 text-sm text-slate-500">{{ headerNote }}</p>
    </div>

    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем рассылку…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Рассылка не прочиталась. Это отказ запроса, а не отсутствие рассылки."
    />
    <template v-else-if="mailing">
      <template v-if="isDraft">
        <OrganismsMailingForm
          title="Черновик"
          submit-label="Сохранить"
          :mailing="mailing"
          :saving="saving"
          :error="saveError"
          :audience-state="audienceState"
          :audience="audience ?? null"
          @submit="save"
        />

        <OrganismsPhotoForm
          :photo-path="mailing.photoPath"
          :updated-at="mailing.updatedAt"
          :name="mailing.title"
          :uploading="uploading"
          :error="photoError"
          :note="photoNote"
          removable
          @upload="upload"
          @remove="removePhoto"
        />

        <MoleculesSectionPanel
          title="Запуск"
          note="Адресаты фиксируются в момент запуска: кто вступит в программу позже, рассылку не получит. Сообщения уходят очередью, по несколько в секунду."
        >
          <AtomsActionButton
            label="Запустить рассылку"
            tone="primary"
            :disabled="acting || launchProblem !== null"
            @click="launch"
          />
          <p v-if="launchProblem" class="mt-3 text-sm text-red-700">
            {{ launchProblem }} Считается сохранённый черновик.
          </p>
          <p v-else-if="actionError" class="mt-3 text-sm text-red-700">{{ actionError }}</p>
        </MoleculesSectionPanel>
      </template>

      <template v-else>
        <MoleculesSectionPanel
          title="Исходы"
          :note="
            mailing.status === 'running'
              ? 'Обновляется каждые пять секунд, пока рассылка идёт.'
              : 'Сумма исходов равна числу адресатов: считаются они одним запросом по снимку.'
          "
        >
          <OrganismsMailingCounters :counters="mailing.counters" />

          <div v-if="mailing.status === 'running' || mailing.status === 'stopped'" class="mt-4">
            <AtomsActionButton
              v-if="mailing.status === 'running'"
              label="Остановить"
              tone="danger"
              :disabled="acting"
              @click="stop"
            />
            <AtomsActionButton
              v-else
              label="Скопировать в новый черновик"
              :disabled="acting"
              @click="copy"
            />
            <p v-if="actionError" class="mt-3 text-sm text-red-700">{{ actionError }}</p>
          </div>
        </MoleculesSectionPanel>

        <OrganismsMailingContent :mailing="mailing" />
      </template>
    </template>
  </div>
</template>
