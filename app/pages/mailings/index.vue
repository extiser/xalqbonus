<script setup lang="ts">
import { computed, ref } from 'vue';
import { failureText } from '~/utils/requestError';
import { toLoadState } from '~/utils/loadState';
import type {
  MailingAudienceResponse,
  MailingListResponse,
  MailingRequestBody,
  MailingResponse,
} from '#shared/types/mailing';

/**
 * Раздел «Рассылки»: список и заведение черновика (issue #136).
 *
 * Фото, запуск и остановка живут на странице рассылки: фото — файл и уезжает своим запросом
 * к уже заведённому черновику, а запуск — решение, которому не место в форме заведения.
 */

definePageMeta({
  middleware: 'mailings-access',
});

useHead({ title: 'Рассылки — XalqBonus' });

const { data, status, refresh } = await useFetch<MailingListResponse>('/api/mailings');

const state = computed(() => toLoadState(status.value));

const { data: audience, status: audienceStatus } =
  await useFetch<MailingAudienceResponse>('/api/mailings/audience');

const audienceState = computed(() => toLoadState(audienceStatus.value));

const saving = ref(false);
const saveError = ref<string | null>(null);

/** Заведение ведёт на страницу рассылки: следующие шаги — фото и запуск — там. */
const create = async (body: MailingRequestBody): Promise<void> => {
  saving.value = true;
  saveError.value = null;

  try {
    const created = await $fetch<MailingResponse>('/api/mailings', { method: 'POST', body });

    await refresh();
    await navigateTo(`/mailings/${created.mailing.mailingId}`);
  } catch (error) {
    saveError.value = failureText(error);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Рассылки</h1>
      <p class="mt-1 text-sm text-slate-500">
        Сообщение всем участникам программы в Telegram с кнопкой «Открыть приложение». Черновик
        правится сколько угодно; отправленное не отзывается.
      </p>
    </div>

    <OrganismsMailingTable :state="state" :mailings="data?.mailings ?? null" />

    <OrganismsMailingForm
      title="Новая рассылка"
      submit-label="Сохранить черновик"
      :mailing="null"
      :saving="saving"
      :error="saveError"
      :audience-state="audienceState"
      :audience="audience ?? null"
      @submit="create"
    />
  </div>
</template>
