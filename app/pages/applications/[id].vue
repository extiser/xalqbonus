<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { PhArrowLeft } from '@phosphor-icons/vue';
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { formatDate, formatWaitDuration } from '~/utils/format';
import { toLoadState } from '~/utils/loadState';
import { failureText } from '~/utils/requestError';
import { PROMO_ROLES } from '#shared/access';
import type { ApplicationMarkStatus } from '#shared/candidateApplications';
import type { ApplicationCard, ApplicationReplyResponse, ApplicationStatusResponse } from '#shared/types/applications';

/**
 * Карточка заявки (issue #471) — экран `_reference/design/web/applications/02-card.html`, адрес
 * `/applications/{id}`. Открывается строкой списка заявок.
 *
 * В шапке — статус, кто ведёт, когда подана, сколько ждёт ответа и отметки: «Оформлен» и «Отказ»
 * у открытой заявки, «Вернуть в работу» у закрытой. Отметки без окна подтверждения: ошибочную
 * снимает «Вернуть в работу». Ниже — кандидат, переписка с ответом из админки, сверка, откуда
 * пришёл и ход заявки.
 */

definePageMeta({
  layout: 'web',
  middleware: 'applications-access',
});

const route = useRoute();
const employee = useCurrentEmployee();

const applicationId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''));

// Адрес — строкой, а тип ответа — явно: по шаблону адреса типы Nitro не отличают карточку
// `/api/applications/{id}` от соседней `/api/applications/waiting-count`.
const cardUrl = computed((): string => `/api/applications/${encodeURIComponent(applicationId.value)}`);

const { data: card, status, error, refresh } = await useFetch<ApplicationCard>(cardUrl);

useHead({ title: computed(() => `${card.value?.application.name ?? 'Заявка'} — Заявки — Xalq Taxi Bonus`) });

const state = computed(() => toLoadState(status.value));

const missing = computed(() => error.value?.statusCode === 404);

// «Ждёт ответа» считается от этого момента; раз в минуту он сдвигается.
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  now.value = Date.now();
  clock = setInterval(() => {
    now.value = Date.now();
  }, 60_000);
});

onBeforeUnmount(() => {
  if (clock) clearInterval(clock);
});

const waitingText = computed((): string | null => {
  const since = card.value?.application.waitingSince ?? null;

  return since === null ? null : formatWaitDuration(now.value - new Date(since).getTime());
});

const promoPath = computed((): string | undefined =>
  card.value && employee.value !== null && PROMO_ROLES.includes(employee.value.role)
    ? `/promo/${encodeURIComponent(card.value.source.promoCode)}`
    : undefined,
);

// Отметки

const marking = ref(false);
const markError = ref<string | null>(null);

const mark = async (next: ApplicationMarkStatus): Promise<void> => {
  if (marking.value) return;

  marking.value = true;
  markError.value = null;

  try {
    await $fetch<ApplicationStatusResponse>(`${cardUrl.value}/status`, { method: 'POST', body: { status: next } });
    await refresh();
  } catch (failure) {
    markError.value = failureText(failure);
  } finally {
    marking.value = false;
  }
};

// Ответ из админки

const draft = ref('');
const sending = ref(false);
const sendError = ref<string | null>(null);

const send = async (text: string): Promise<void> => {
  if (sending.value) return;

  sending.value = true;
  sendError.value = null;

  try {
    await $fetch<ApplicationReplyResponse>(`${cardUrl.value}/messages`, { method: 'POST', body: { text } });
    draft.value = '';
    await refresh();
  } catch (failure) {
    // Текст не теряется: отказ — плашкой над полем, поле остаётся как было.
    sendError.value = failureText(failure);
  } finally {
    sending.value = false;
  }
};
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4 px-1 pt-1.5 pb-5 max-web:px-0.5 max-web:pt-1 max-web:pb-3.5">
      <div class="flex min-w-0 grow basis-80 flex-col gap-2">
        <NuxtLink
          to="/applications"
          class="inline-flex items-center gap-1.5 self-start font-manrope text-[14px] font-semibold text-web-title no-underline hover:text-web-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
        >
          <PhArrowLeft aria-hidden="true" class="size-4" />Заявки
        </NuxtLink>
        <AtomsWebPageTitle :label="card?.application.name ?? 'Заявка'" />
        <div
          v-if="card"
          class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-2 font-manrope text-[14px] text-web-title"
        >
          <AtomsWebStatusPill :status="card.application.status" />
          <span v-if="card.application.handledBy !== null">ведёт <b class="font-semibold text-web-text">{{ card.application.handledBy }}</b></span>
          <span v-else>никто не ведёт</span>
          <span>подана {{ formatDate(card.application.createdAt) }}</span>
          <span v-if="waitingText !== null" class="font-semibold text-web-cyan">ждёт ответа {{ waitingText }}</span>
        </div>
      </div>
      <div v-if="card" class="flex flex-col items-end gap-2 max-web:items-start">
        <div class="flex flex-wrap items-center gap-2.5">
          <template v-if="card.application.status === 'new' || card.application.status === 'in_progress'">
            <AtomsWebActionButton label="Оформлен" size="page" variant="hired" :disabled="marking" @click="mark('hired')" />
            <AtomsWebActionButton label="Отказ" size="page" variant="rejected" :disabled="marking" @click="mark('rejected')" />
          </template>
          <AtomsWebActionButton
            v-else
            label="Вернуть в работу"
            size="page"
            :disabled="marking"
            @click="mark('in_progress')"
          />
        </div>
        <AtomsWebFormAlert v-if="markError !== null" :text="markError" />
      </div>
    </div>

    <div v-if="state === 'loading' && !card" class="px-1">
      <AtomsWebHint text="Загружаем заявку…" />
    </div>
    <div v-else-if="missing" class="px-1">
      <AtomsWebHint text="Такой заявки нет. Список заявок — в разделе «Заявки»." />
    </div>
    <div v-else-if="!card" class="px-1">
      <AtomsWebHint :text="error ? failureText(error) : 'Заявка не загрузилась. Это отказ запроса.'" />
    </div>
    <MoleculesWebBento v-else>
      <OrganismsWebApplicationCandidate :application="card.application" />
      <OrganismsWebApplicationChat
        v-model:draft="draft"
        :card="card"
        :now="now"
        :sending="sending"
        :send-error="sendError"
        @send="send"
      />
      <OrganismsWebApplicationMatch :match="card.match" :now="now" />
      <OrganismsWebApplicationSource :source="card.source" :channel="card.application.channel" :promo-path="promoPath" />
      <OrganismsWebApplicationSteps :card="card" :now="now" />
    </MoleculesWebBento>
  </div>
</template>
