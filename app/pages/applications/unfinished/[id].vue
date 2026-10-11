<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { PhArrowLeft } from '@phosphor-icons/vue';
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { formatDate, formatWaitDuration } from '~/utils/format';
import { toLoadState } from '~/utils/loadState';
import { failureText } from '~/utils/requestError';
import { PROMO_ROLES } from '#shared/access';
import type {
  UnfinishedCard,
  UnfinishedCardResponse,
  UnfinishedDismissResponse,
  UnfinishedReplyResponse,
} from '#shared/types/applications';

/**
 * Карточка человека из «Не закончили» (issue #475) — экран
 * `_reference/design/web/applications/04-unfinished-card.html`, адрес `/applications/unfinished/{id}`.
 * Открывается строкой вкладки «Не закончили».
 *
 * В шапке — что он не закончил заявку, кто ведёт, когда нажал `/start` и сколько ждёт ответа;
 * справа — «Убрать из списка», без окна подтверждения: убрать не значит удалить. У убранного
 * кнопки нет, карточка открывается по прямой ссылке. Ниже — Telegram, переписка с ответом
 * из админки, сверка, откуда пришёл и ход заявки. Подал заявку — карточка уходит в её карточку.
 */

definePageMeta({
  layout: 'web',
  middleware: 'applications-access',
});

const route = useRoute();
const employee = useCurrentEmployee();

const LIST_PATH = '/applications?filter=unfinished';

const draftId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''));

const cardUrl = computed((): string => `/api/applications/unfinished/${encodeURIComponent(draftId.value)}`);

const { data: response, status, error, refresh } = await useFetch<UnfinishedCardResponse>(cardUrl);

/** Черновик закончен заявкой — в карточку заявки, без записи в истории: назад — в список. */
const closedApplicationId = computed((): string | null =>
  response.value && 'applicationId' in response.value ? response.value.applicationId : null,
);

const openApplication = async (applicationId: string): Promise<void> => {
  await navigateTo(`/applications/${encodeURIComponent(applicationId)}`, { replace: true });
};

if (closedApplicationId.value !== null) {
  await openApplication(closedApplicationId.value);
}

// Заявку могли подать, пока карточка открыта: перечитанная после ответа, она уводит туда же.
watch(closedApplicationId, async (applicationId) => {
  if (applicationId !== null) await openApplication(applicationId);
});

const card = computed((): UnfinishedCard | null =>
  response.value && 'draft' in response.value ? response.value : null,
);

useHead({ title: computed(() => `${card.value?.draft.telegramName ?? 'Не закончил'} — Заявки — Xalq Taxi Bonus`) });

const state = computed(() => toLoadState(status.value));

const missing = computed(() => error.value?.statusCode === 404);

// «Ждёт ответа» считается от этого момента; раз в минуту он сдвигается.
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

/** Как часто карточка перечитывает себя, пока открыта на экране, мс. */
const REFRESH_MS = 30_000;

let refresher: ReturnType<typeof setInterval> | null = null;

// Человек меняет карточку из Telegram, пока она открыта: пишет, присылает номер, нажимает `/start`
// и возвращается в список. Без перечитывания на экране оставалось бы прежнее — без новых сообщений
// и без «Убрать из списка» у вернувшегося.
const refreshVisible = (): void => {
  if (document.visibilityState === 'visible' && !sending.value && !dismissing.value) void refresh();
};

onMounted(() => {
  now.value = Date.now();
  clock = setInterval(() => {
    now.value = Date.now();
  }, 60_000);
  refresher = setInterval(refreshVisible, REFRESH_MS);
  document.addEventListener('visibilitychange', refreshVisible);
});

onBeforeUnmount(() => {
  if (clock) clearInterval(clock);
  if (refresher) clearInterval(refresher);
  document.removeEventListener('visibilitychange', refreshVisible);
});

const waitingText = computed((): string | null => {
  const since = card.value?.draft.waitingSince ?? null;

  return since === null ? null : formatWaitDuration(now.value - new Date(since).getTime());
});

const promoPath = computed((): string | undefined =>
  card.value && employee.value !== null && PROMO_ROLES.includes(employee.value.role)
    ? `/promo/${encodeURIComponent(card.value.draft.promoCode)}`
    : undefined,
);

const source = computed(() =>
  card.value === null
    ? null
    : {
        promoCode: card.value.draft.promoCode,
        promoName: card.value.draft.promoName,
        touchedAt: card.value.draft.startedAt,
      },
);

// Убрать из списка

const dismissing = ref(false);
const dismissError = ref<string | null>(null);

const dismiss = async (): Promise<void> => {
  if (dismissing.value) return;

  dismissing.value = true;
  dismissError.value = null;

  try {
    await $fetch<UnfinishedDismissResponse>(`${cardUrl.value}/dismiss`, { method: 'POST' });
    await navigateTo(LIST_PATH);
  } catch (failure) {
    dismissError.value = failureText(failure);
  } finally {
    dismissing.value = false;
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
    await $fetch<UnfinishedReplyResponse>(`${cardUrl.value}/messages`, { method: 'POST', body: { text } });
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
          :to="LIST_PATH"
          class="inline-flex items-center gap-1.5 self-start font-manrope text-[14px] font-semibold text-web-title no-underline hover:text-web-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
        >
          <PhArrowLeft aria-hidden="true" class="size-4" />Заявки
        </NuxtLink>
        <AtomsWebPageTitle :label="card?.draft.telegramName ?? 'Не закончил'" />
        <div
          v-if="card"
          class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-2 font-manrope text-[14px] text-web-title"
        >
          <span>не закончил заявку</span>
          <span v-if="card.draft.handledBy !== null">ведёт <b class="font-semibold text-web-text">{{ card.draft.handledBy }}</b></span>
          <span v-else>никто не ведёт</span>
          <span>нажал /start {{ formatDate(card.draft.startedAt) }}</span>
          <span v-if="waitingText !== null" class="font-semibold text-web-cyan">ждёт ответа {{ waitingText }}</span>
        </div>
      </div>
      <div v-if="card && !card.draft.dismissed" class="flex flex-col items-end gap-2 max-web:items-start">
        <AtomsWebActionButton label="Убрать из списка" size="page" :disabled="dismissing" @click="dismiss" />
        <AtomsWebFormAlert v-if="dismissError !== null" :text="dismissError" />
      </div>
    </div>

    <div v-if="(state === 'loading' && !response) || closedApplicationId !== null" class="px-1">
      <AtomsWebHint text="Загружаем карточку…" />
    </div>
    <div v-else-if="missing" class="px-1">
      <AtomsWebHint text="Такого человека в списке нет. Список — во вкладке «Не закончили» раздела «Заявки»." />
    </div>
    <div v-else-if="!card" class="px-1">
      <AtomsWebHint :text="error ? failureText(error) : 'Карточка не загрузилась. Это отказ запроса.'" />
    </div>
    <MoleculesWebBento v-else>
      <OrganismsWebUnfinishedPerson :draft="card.draft" />
      <OrganismsWebUnfinishedChat
        v-model:draft="draft"
        :card="card"
        :now="now"
        :sending="sending"
        :send-error="sendError"
        @send="send"
      />
      <MoleculesWebTile :cols="4" :rows="2" :medium="6" title="Сверка">
        <div class="mt-3.5 font-manrope text-[18px] font-semibold text-web-text">Не сверяли</div>
        <p class="m-0 mt-1.5 font-manrope text-[14px] leading-[1.5] text-web-title">
          Номер сверяется с реестром парка при подаче заявки. Заявку он не подал.
        </p>
      </MoleculesWebTile>
      <OrganismsWebApplicationSource
        v-if="source !== null"
        :source="source"
        channel="bot"
        touched-label="Нажал /start"
        :promo-path="promoPath"
      />
      <OrganismsWebUnfinishedSteps :draft="card.draft" />
    </MoleculesWebBento>
  </div>
</template>
