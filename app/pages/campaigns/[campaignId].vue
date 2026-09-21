<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useCampaignParticipants } from '~/composables/useCampaignParticipants';
import { useDraftAutosave } from '~/composables/useDraftAutosave';
import { DASH, formatDateTime, formatDayRange, formatNumber, pluralize } from '~/utils/format';
import { campaignStatusLabel, campaignStatusTone } from '~/utils/labels';
import { toLoadState } from '~/utils/loadState';
import { failureText } from '~/utils/requestError';
import type { LoadState } from '~/types/loadState';
import type { SelectOption } from '~/types/selectOption';
import {
  CAMPAIGN_AUDIENCE_EMPTY_TEXT,
  CAMPAIGN_SEGMENT_ARCHIVED_TEXT,
  campaignLaunchProblems,
  campaignLaunchProblemText,
} from '#shared/campaign';
import type {
  Campaign,
  CampaignHalfBreakdown,
  CampaignRequestBody,
  CampaignResponse,
  CampaignWindowRequestBody,
} from '#shared/types/campaign';
import type { SegmentListResponse, SegmentPreviewResponse } from '#shared/types/segment';

/**
 * Экран акции (issue #166). Что на нём можно, решает статус:
 *
 * - новая (`/campaigns/new`) — пустая форма; черновик заводится первым действием, как у
 *   рассылки (issue #148)
 * - черновик — название, короткое имя, сегмент с числом на сегодня, окно половины А,
 *   деление 50 на 50, сохранение само и запуск отдельным подтверждением с числом
 * - идёт — окна, размер снимка, разбивка по состояниям, участники и окно половины Б
 *
 * Новая и заведённый из неё черновик — один экземпляр страницы (`key` ниже): адрес меняется
 * на адрес записи без перехода, и набранное не теряется.
 *
 * Кнопки показываются по статусу с сервера, но решает ручка: запуск не черновика и правка
 * запущенной отвечают отказом.
 */

definePageMeta({
  middleware: 'campaigns-access',
  key: 'campaign-editor',
});

/** Адрес новой акции. Идентификатором не является — ручкам он не уходит. */
const NEW_CAMPAIGN = 'new';

const route = useRoute();
const routeId = computed(() => String(route.params.campaignId));

// За акцией ходим при открытии адреса записи. Смена адреса запрос сама не повторяет
// (`watch: false`): после заведения черновик уже на руках.
const { data, status, refresh } = await useFetch<CampaignResponse>(
  () => `/api/campaigns/${routeId.value}`,
  { immediate: routeId.value !== NEW_CAMPAIGN, watch: false },
);

const campaign = computed<Campaign | null>(() => data.value?.campaign ?? null);
const breakdown = computed<CampaignHalfBreakdown[]>(() => data.value?.breakdown ?? []);

const setCampaign = (next: CampaignResponse): void => {
  data.value = next;
};

const isDraft = computed(() => campaign.value === null || campaign.value.status === 'draft');

/**
 * Поля формы — строками все, включая переключатель: автосохранение сравнивает снимки полей,
 * а строка — единственное, что у него сравнивается без оговорок.
 */
type CampaignFormFields = {
  title: string;
  slug: string;
  segmentId: string;
  startsOn: string;
  endsOn: string;
  splitEnabled: 'yes' | '';
};

const toFields = (source: Campaign | null): CampaignFormFields => ({
  title: source?.title ?? '',
  slug: source?.slug ?? '',
  segmentId: source?.segment?.segmentId ?? '',
  startsOn: source?.halfA.startsOn ?? '',
  endsOn: source?.halfA.endsOn ?? '',
  splitEnabled: source?.splitEnabled ? 'yes' : '',
});

/** То, что на экране. Ответ сервера его не перезаписывает. */
const fields = ref<CampaignFormFields>(toFields(campaign.value));

const splitEnabled = computed({
  get: () => fields.value.splitEnabled === 'yes',
  set: (value: boolean) => {
    fields.value = { ...fields.value, splitEnabled: value ? 'yes' : '' };
  },
});

const state = computed(() =>
  campaign.value !== null || routeId.value === NEW_CAMPAIGN ? 'ready' : toLoadState(status.value),
);

const headingText = computed(
  () => fields.value.title.trim() || (campaign.value ? 'Без названия' : 'Новая акция'),
);

useHead({ title: () => `${headingText.value} — XalqBonus` });

const headerNote = computed(() => {
  const current = campaign.value;

  if (!current) {
    return 'Черновик появится, как только вы начнёте заполнять форму.';
  }

  const phrases = [`Завёл ${current.createdByName}.`];

  if (current.launchedAt) {
    phrases.push(`Запущена ${formatDateTime(current.launchedAt)}.`);
  }

  return phrases.join(' ');
});

// ---------------------------------------------------------------------------
// Черновик
// ---------------------------------------------------------------------------

const toRequestBody = (snapshot: CampaignFormFields): CampaignRequestBody => ({
  ...snapshot,
  splitEnabled: snapshot.splitEnabled === 'yes',
});

/**
 * Сохранение черновика: первое заводит запись и переводит адрес на неё, остальные правят.
 * Адрес меняется заменой: «назад» ведёт в список, а не на пустую форму.
 */
const saveDraft = async (snapshot: CampaignFormFields): Promise<void> => {
  const current = campaign.value;

  if (current === null) {
    const created = await $fetch<CampaignResponse>('/api/campaigns', {
      method: 'POST',
      body: toRequestBody(snapshot),
    });

    setCampaign(created);
    await navigateTo(`/campaigns/${created.campaign.campaignId}`, { replace: true });

    return;
  }

  setCampaign(
    await $fetch<CampaignResponse>(`/api/campaigns/${current.campaignId}`, {
      method: 'PATCH',
      body: toRequestBody(snapshot),
    }),
  );
};

const autosave = useDraftAutosave({
  fields,
  save: saveDraft,
  enabled: () => isDraft.value,
});

// Переход к другой записи на той же странице — историей браузера.
watch(routeId, async (id) => {
  if (id === NEW_CAMPAIGN) {
    data.value = undefined;
    autosave.replace(toFields(null));

    return;
  }

  if (id === campaign.value?.campaignId) {
    return;
  }

  data.value = undefined;
  await refresh();
  autosave.replace(toFields(campaign.value));
});

/**
 * Сегменты для выбора — только рабочие. Выбранный раньше и ушедший в архив остаётся в списке
 * с пометкой: иначе поле показало бы пустой выбор, хотя в черновике сегмент записан.
 */
const { data: segments } = await useFetch<SegmentListResponse>('/api/segments');

const selectedSegment = computed(
  () => segments.value?.segments.find((segment) => segment.segmentId === fields.value.segmentId) ?? null,
);

const segmentArchived = computed(() => (selectedSegment.value?.archivedAt ?? null) !== null);

const segmentOptions = computed<SelectOption[]>(() =>
  (segments.value?.segments ?? [])
    .filter((segment) => segment.archivedAt === null || segment.segmentId === fields.value.segmentId)
    .map((segment) => ({
      value: segment.segmentId,
      label: segment.archivedAt === null ? segment.name : `${segment.name} (в архиве)`,
    })),
);

/**
 * Число водителей выбранного сегмента на сейчас — ручкой предпросмотра сегментов (#165),
 * тем же построителем, которым запуск снимет состав.
 */
const segmentCountState = ref<LoadState>('loading');
const segmentCount = ref<{ total: number; calculatedAt: string } | null>(null);
let segmentCountSequence = 0;

const fetchSegmentCount = (segmentId: string): Promise<SegmentPreviewResponse> =>
  $fetch<SegmentPreviewResponse>(`/api/segments/${segmentId}/preview`);

const loadSegmentCount = async (segmentId: string): Promise<void> => {
  const current = ++segmentCountSequence;

  segmentCount.value = null;

  if (segmentId === '') {
    segmentCountState.value = 'ready';

    return;
  }

  segmentCountState.value = 'loading';

  try {
    const preview = await fetchSegmentCount(segmentId);

    if (current === segmentCountSequence) {
      segmentCount.value = { total: preview.total, calculatedAt: preview.calculatedAt };
      segmentCountState.value = 'ready';
    }
  } catch {
    if (current === segmentCountSequence) {
      segmentCountState.value = 'error';
    }
  }
};

/**
 * Почему «Запустить» закрыта — все причины сразу, теми же фразами, что пришли бы отказом
 * ручки. Считается по тому, что на экране: запускается оно, досохранённое перед запуском.
 */
const launchProblems = computed(() => {
  const problems = campaignLaunchProblems(fields.value).map(campaignLaunchProblemText);

  if (segmentArchived.value) {
    problems.push(CAMPAIGN_SEGMENT_ARCHIVED_TEXT);
  } else if (segmentCount.value?.total === 0) {
    problems.push(CAMPAIGN_AUDIENCE_EMPTY_TEXT);
  }

  return problems;
});

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
 * Подтверждение запуска — своим диалогом (docs/frontend.md → «Подтверждения — свой диалог»).
 * Диалог один на экран, ответ — промисом: действие ждёт его тем же `await`.
 */
type Confirmation = { title: string; message: string };

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

const driversCount = (total: number): string =>
  `${formatNumber(total)} ${pluralize(total, 'водитель', 'водителя', 'водителей')}`;

/**
 * Запуск. Уходит то, что на экране: несохранённое досохраняется перед подтверждением.
 *
 * Число в подтверждении спрашивается заново: страница могла пролежать открытой, а давность
 * поездок за это время сдвинулась. Запуск необратим, и это единственное место, где об этом
 * сказано, — поэтому состав и его заморозка названы в диалоге словами.
 */
const launch = (): Promise<void> =>
  runAction(async () => {
    if (!(await autosave.flush())) {
      return;
    }

    const current = campaign.value;

    if (!current || fields.value.segmentId === '') {
      return;
    }

    const fresh = await fetchSegmentCount(fields.value.segmentId);

    segmentCount.value = { total: fresh.total, calculatedAt: fresh.calculatedAt };

    if (fresh.total === 0) {
      actionError.value = CAMPAIGN_AUDIENCE_EMPTY_TEXT;

      return;
    }

    // Половины режет `ntile(2)`: при нечётном числе лишний уходит в А.
    const control = Math.floor(fresh.total / 2);
    const lines = [`В акцию попадёт ${driversCount(fresh.total)}.`];

    if (splitEnabled.value) {
      lines.push(
        `Из них ${formatNumber(control)} — в контрольную половину Б: им ничего не уходит.`,
      );
    }

    lines.push('', 'Состав фиксируется в момент запуска и пересчитан не будет.');

    const confirmed = await askConfirmation({
      title: `Запустить «${fields.value.title.trim()}»?`,
      message: lines.join('\n'),
    });

    if (!confirmed) {
      return;
    }

    setCampaign(
      await $fetch<CampaignResponse>(`/api/campaigns/${current.campaignId}/launch`, {
        method: 'POST',
      }),
    );
    void participants.load();
  });

// ---------------------------------------------------------------------------
// Идущая акция
// ---------------------------------------------------------------------------

const participants = useCampaignParticipants(() =>
  campaign.value && campaign.value.status !== 'draft' ? campaign.value.campaignId : null,
);

/** Окно Б назначается, пока его нет: деление было, а обе даты пусты. */
const secondHalfOpen = computed(
  () =>
    campaign.value?.status === 'running' &&
    campaign.value.halfB !== null &&
    campaign.value.halfB.startsOn === null,
);

const secondHalf = ref<CampaignWindowRequestBody>({ startsOn: '', endsOn: '' });
const secondHalfError = ref<string | null>(null);
const secondHalfSubmitting = ref(false);

const assignSecondHalf = async (): Promise<void> => {
  const current = campaign.value;

  if (!current) {
    return;
  }

  secondHalfSubmitting.value = true;
  secondHalfError.value = null;

  try {
    setCampaign(
      await $fetch<CampaignResponse>(`/api/campaigns/${current.campaignId}/halves/b`, {
        method: 'PATCH',
        body: secondHalf.value,
      }),
    );
  } catch (error) {
    secondHalfError.value = failureText(error);
  } finally {
    secondHalfSubmitting.value = false;
  }
};

onMounted(() => {
  // Число сегмента — с клиента: запрос с сервера страницы ушёл бы без cookie сотрудника.
  watch(
    () => fields.value.segmentId,
    (segmentId) => {
      if (isDraft.value) {
        void loadSegmentCount(segmentId);
      }
    },
    { immediate: true },
  );

  if (!isDraft.value) {
    void participants.load();
  }
});

onBeforeUnmount(() => {
  // Ушли со страницы с открытым вопросом — это отказ: действие не должно ждать ответа вечно.
  resolveConfirmation(false);
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
    <!-- Запуск — главное действие экрана и красным не бывает: от случайного запуска страхует
         число в диалоге, а не цвет (docs/frontend.md → «Подтверждения — свой диалог»). -->
    <MoleculesConfirmDialog
      :open="confirmation !== null"
      :title="confirmation?.title ?? ''"
      :message="confirmation?.message ?? ''"
      confirm-label="Запустить"
      cancel-label="Отмена"
      tone="primary"
      @confirm="resolveConfirmation(true)"
      @cancel="resolveConfirmation(false)"
    />

    <div>
      <NuxtLink to="/campaigns" class="text-sm text-slate-500 underline underline-offset-2">
        ← Все акции
      </NuxtLink>
      <div class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 class="text-xl font-semibold text-slate-900">{{ headingText }}</h1>
        <AtomsStatusBadge
          v-if="campaign"
          :tone="campaignStatusTone(campaign.status)"
          :label="campaignStatusLabel(campaign.status)"
        />
      </div>
      <p v-if="state === 'ready'" class="mt-1 text-sm text-slate-500">{{ headerNote }}</p>
    </div>

    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем акцию…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Акция не прочиталась. Такой акции нет, или запрос не прошёл."
    />
    <template v-else-if="isDraft">
      <OrganismsCampaignForm
        v-model:title="fields.title"
        v-model:slug="fields.slug"
        v-model:segment-id="fields.segmentId"
        v-model:starts-on="fields.startsOn"
        v-model:ends-on="fields.endsOn"
        v-model:split-enabled="splitEnabled"
        :segment-options="segmentOptions"
        :segment-archived="segmentArchived"
        :segment-count-state="segmentCountState"
        :segment-count="segmentCount"
        :autosave-state="autosave.state.value"
        :autosave-error="autosave.error.value"
        @retry="autosave.retry"
      />

      <MoleculesSectionPanel
        title="Запуск"
        note="Уходит то, что на экране. Состав снимается из сегмента в момент запуска и больше не пересчитывается; правки после запуска нет."
      >
        <AtomsActionButton
          label="Запустить"
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
    </template>

    <template v-else-if="campaign">
      <MoleculesSectionPanel title="Акция">
        <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <MoleculesFactRow label="Короткое имя" :value="campaign.slug ?? DASH" />
          <MoleculesFactRow label="Сегмент" :value="campaign.segment?.name ?? DASH" />
          <MoleculesFactRow
            label="В снимке"
            :value="campaign.audienceSize === null ? DASH : driversCount(campaign.audienceSize)"
          />
          <MoleculesFactRow
            label="Деление"
            :value="campaign.splitEnabled ? '50 на 50, половина Б — контроль' : 'без деления'"
          />
          <MoleculesFactRow
            label="Окно половины А"
            :value="formatDayRange(campaign.halfA.startsOn, campaign.halfA.endsOn)"
          />
          <MoleculesFactRow
            v-if="campaign.halfB"
            label="Окно половины Б"
            :value="
              campaign.halfB.startsOn
                ? formatDayRange(campaign.halfB.startsOn, campaign.halfB.endsOn)
                : 'не назначено'
            "
          />
        </dl>
      </MoleculesSectionPanel>

      <OrganismsCampaignSecondHalfForm
        v-if="secondHalfOpen"
        v-model:starts-on="secondHalf.startsOn"
        v-model:ends-on="secondHalf.endsOn"
        :submitting="secondHalfSubmitting"
        :error="secondHalfError"
        @submit="assignSecondHalf"
      />

      <OrganismsCampaignBreakdown :breakdown="breakdown" />

      <OrganismsCampaignParticipantTable
        v-model:half="participants.half.value"
        v-model:participant-state="participants.participantState.value"
        :state="participants.state.value"
        :data="participants.data.value"
        :split-enabled="campaign.splitEnabled"
        @page="participants.page"
      />
    </template>
  </div>
</template>
