<script setup lang="ts">
import { computed, ref } from 'vue';
import { failureField, failureText } from '~/utils/requestError';
import { formatNumber, pluralize } from '~/utils/format';
import { toLoadState } from '~/utils/loadState';
import type { DemoTripsResponse } from '#shared/types/driver';
import type {
  DemoDriverHideResponse,
  DemoGenerateField,
  DemoGenerateRequestBody,
  DemoGenerateResponse,
  DemoInviteResponse,
  DemoInviteRevokeResponse,
  DemoManagerCreateResponse,
  DemoManagerOfficesResponse,
  DemoOverviewResponse,
  DemoViewerStateResponse,
} from '#shared/types/demo';

/**
 * Раздел «Демо» (issue #252): пульт демо для владельца — зрители по приглашению,
 * демо-водители, генератор, демо-менеджер и сводка демо-сущностей.
 *
 * Данные — одним запросом здесь, а не в компонентах (docs/frontend.md → «Данные в компоненты
 * не ходят»). После каждого действия сводка перечитывается целиком: состояние решает сервер.
 */

definePageMeta({
  // Только владельцу. Решают ручки; строка лишь уводит остальных на их работу.
  middleware: 'demo-access',
});

useHead({ title: 'Демо — XalqBonus' });

const { data: overview, status, refresh } = await useFetch<DemoOverviewResponse>('/api/demo');

const state = computed(() => toLoadState(status.value));

// ---------------------------------------------------------------------------
// Зрители
// ---------------------------------------------------------------------------

const issuing = ref(false);
const issueError = ref<string | null>(null);
/** Только что выпущенное: его строку страница выделяет, ссылка — в самой строке. */
const issuedInviteId = ref<string | null>(null);

const issue = async (label: string): Promise<void> => {
  issuing.value = true;
  issueError.value = null;

  try {
    const issued = await $fetch<DemoInviteResponse>('/api/demo/invites', { method: 'POST', body: { label } });

    issuedInviteId.value = issued.invite.inviteId;
    await refresh();
  } catch (error) {
    issueError.value = failureText(error);
  } finally {
    issuing.value = false;
  }
};

const viewerBusyKey = ref<string | null>(null);
const viewerError = ref<string | null>(null);

/** Три действия над зрителями устроены одинаково: погасить строку, позвать ручку, перечитать. */
const runViewerAction = async (key: string, request: () => Promise<unknown>): Promise<void> => {
  viewerBusyKey.value = key;
  viewerError.value = null;

  try {
    await request();
    await refresh();
  } catch (error) {
    viewerError.value = failureText(error);
  } finally {
    viewerBusyKey.value = null;
  }
};

const revoke = (inviteId: string): Promise<void> =>
  runViewerAction(inviteId, () =>
    $fetch<DemoInviteRevokeResponse>(`/api/demo/invites/${inviteId}/revoke`, { method: 'POST' }),
  );

const labelOf = (telegramUserId: string): string =>
  overview.value?.viewers.find((viewer) => viewer.telegramUserId === telegramUserId)?.label ?? 'зритель';

const disable = (telegramUserId: string): Promise<void> | undefined => {
  if (!window.confirm(`Выключить зрителя «${labelOf(telegramUserId)}»? Приложение откроет ему регистрацию.`)) {
    return;
  }

  return runViewerAction(telegramUserId, () =>
    $fetch<DemoViewerStateResponse>(`/api/demo/viewers/${telegramUserId}/disable`, { method: 'POST' }),
  );
};

const enable = (telegramUserId: string): Promise<void> =>
  runViewerAction(telegramUserId, () =>
    $fetch<DemoViewerStateResponse>(`/api/demo/viewers/${telegramUserId}/enable`, { method: 'POST' }),
  );

// ---------------------------------------------------------------------------
// Демо-водители
// ---------------------------------------------------------------------------

const driverBusyId = ref<string | null>(null);
const driverError = ref<string | null>(null);
const tripsResult = ref<{ personId: string; text: string } | null>(null);

const describeTrips = (result: DemoTripsResponse): string => {
  const trips = `${formatNumber(result.written)} ${pluralize(result.written, 'поездка', 'поездки', 'поездок')}`;
  const points = `${formatNumber(result.awarded)} ${pluralize(result.awarded, 'балл', 'балла', 'баллов')}`;
  const welcome = result.welcomeAwarded > 0 ? ' и приветственные 300' : '';

  return `Добавлено ${trips}, начислено ${points}${welcome}`;
};

// Кнопка гаснет на время запроса: двойное нажатие записало бы поездки дважды.
const addTrips = async (personId: string, count: number, endedAt: string): Promise<void> => {
  driverBusyId.value = personId;
  driverError.value = null;
  tripsResult.value = null;

  try {
    const result = await $fetch<DemoTripsResponse>(`/api/drivers/${personId}/demo-trips`, {
      method: 'POST',
      body: { count, endedAt },
    });

    tripsResult.value = { personId, text: describeTrips(result) };
    await refresh();
  } catch (error) {
    driverError.value = failureText(error);
  } finally {
    driverBusyId.value = null;
  }
};

const hide = async (personId: string): Promise<void> => {
  if (!window.confirm('Спрятать демо-водителя? Он пропадёт из раздела, из сегментов и из поиска. Вернуть его нельзя.')) {
    return;
  }

  driverBusyId.value = personId;
  driverError.value = null;

  try {
    await $fetch<DemoDriverHideResponse>(`/api/demo/drivers/${personId}/hide`, { method: 'POST' });
    await refresh();
  } catch (error) {
    driverError.value = failureText(error);
  } finally {
    driverBusyId.value = null;
  }
};

// ---------------------------------------------------------------------------
// Генератор
// ---------------------------------------------------------------------------

const GENERATE_FIELDS: readonly DemoGenerateField[] = [
  'count',
  'balanceMin',
  'balanceMax',
  'tripsMin',
  'tripsMax',
  'lastTripDaysMin',
  'lastTripDaysMax',
  'programMember',
];

const generating = ref(false);
const generateError = ref<string | null>(null);
const generateErrorField = ref<DemoGenerateField | null>(null);
const generateResult = ref<string | null>(null);

const generate = async (body: DemoGenerateRequestBody): Promise<void> => {
  generating.value = true;
  generateError.value = null;
  generateErrorField.value = null;
  generateResult.value = null;

  try {
    const result = await $fetch<DemoGenerateResponse>('/api/demo/drivers/generate', { method: 'POST', body });

    generateResult.value = `Заведено ${formatNumber(result.created)} ${pluralize(
      result.created,
      'демо-водитель',
      'демо-водителя',
      'демо-водителей',
    )}.`;
    await refresh();
  } catch (error) {
    generateError.value = failureText(error);
    generateErrorField.value = GENERATE_FIELDS.find((field) => field === failureField(error)) ?? null;
  } finally {
    generating.value = false;
  }
};

// ---------------------------------------------------------------------------
// Демо-менеджер
// ---------------------------------------------------------------------------

const managerSaving = ref(false);
const managerError = ref<string | null>(null);

const runManagerAction = async (request: () => Promise<unknown>): Promise<void> => {
  managerSaving.value = true;
  managerError.value = null;

  try {
    await request();
    await refresh();
  } catch (error) {
    managerError.value = failureText(error);
  } finally {
    managerSaving.value = false;
  }
};

const createManager = (phone: string): Promise<void> =>
  runManagerAction(() =>
    $fetch<DemoManagerCreateResponse>('/api/demo/manager', { method: 'POST', body: { phone } }),
  );

const saveManagerOffices = (officeIds: string[]): Promise<void> =>
  runManagerAction(() =>
    $fetch<DemoManagerOfficesResponse>('/api/demo/manager/offices', { method: 'PUT', body: { officeIds } }),
  );
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Демо</h1>
      <p class="mt-1 text-sm text-slate-500">
        Витрина программы для показа: зрители, их демо-водители, генератор водителей под сегменты
        и демо-менеджер. Демо не входит ни в одну общую цифру.
      </p>
    </div>

    <!-- Перечитывание после действия не прячет блоки за «читаем»: формы в них хранят ввод. -->
    <MoleculesStateNotice
      v-if="!overview && state === 'loading'"
      state="loading"
      message="Читаем демо…"
    />
    <MoleculesStateNotice
      v-else-if="!overview"
      state="error"
      message="Демо не прочиталось. Это отказ запроса, а не пустое демо."
    />

    <template v-else>
      <OrganismsDemoViewers
        :invites="overview.invites"
        :viewers="overview.viewers"
        :issuing="issuing"
        :issue-error="issueError"
        :issued-invite-id="issuedInviteId"
        :busy-key="viewerBusyKey"
        :error="viewerError"
        @issue="issue"
        @revoke="revoke"
        @disable="disable"
        @enable="enable"
      />

      <OrganismsDemoDrivers
        :drivers="overview.drivers"
        :busy-person-id="driverBusyId"
        :trips-result="tripsResult"
        :error="driverError"
        @add-trips="addTrips"
        @hide="hide"
      />

      <OrganismsDemoGenerator
        :generating="generating"
        :error="generateError"
        :error-field="generateErrorField"
        :result="generateResult"
        @generate="generate"
      />

      <OrganismsDemoManager
        :manager="overview.manager"
        :demo-offices="overview.demoOffices"
        :saving="managerSaving"
        :error="managerError"
        @create="createManager"
        @save-offices="saveManagerOffices"
      />

      <OrganismsDemoEntities :demo-offices="overview.demoOffices" :entities="overview.entities" />
    </template>
  </div>
</template>
