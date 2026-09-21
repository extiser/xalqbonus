<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { DISPLAY_TIME_ZONE_LABEL } from '~/utils/format';
import { toLoadState } from '~/utils/loadState';
import { failureField, failureText } from '~/utils/requestError';
import { POINTS_ADJUST_ROLES, REWARD_GRANT_ROLES } from '#shared/access';
import type {
  ManualPointsField,
  ManualPointsRequestBody,
  ManualPointsResponse,
} from '#shared/types/driver';
import type {
  ManualRewardField,
  ManualRewardRequestBody,
  ManualRewardResponse,
  RewardGrantOptionsResponse,
} from '#shared/types/rewards';
import type { SelectOption } from '~/types/selectOption';

/**
 * Карточка водителя: после неё на вопрос «откуда у водителя столько баллов» отвечают
 * глазами, а не запросом в psql.
 *
 * Два запроса, а не один: карточка читается один раз, а история листается, и пересчитывать
 * сверку кэша с журналом на каждом перелистывании незачем.
 *
 * Человек, которого нет в программе, открывается этой же карточкой — с пустыми разделами
 * и подписью причины. Пустая карточка здесь содержательный ответ, а не ошибка.
 */

/** Сколько операций журнала на странице. */
const HISTORY_LIMIT = 25;

const route = useRoute();
const personId = computed(() => String(route.params.personId));
const historyOffset = ref(0);

const {
  data: card,
  status: cardStatus,
  error: cardError,
  refresh: refreshCard,
} = await useFetch(() => `/api/drivers/${personId.value}`);

const {
  data: history,
  status: historyStatus,
  refresh: refreshHistory,
} = await useFetch(
  () => `/api/drivers/${personId.value}/history`,
  { query: { limit: HISTORY_LIMIT, offset: historyOffset } },
);

const cardState = computed(() => toLoadState(cardStatus.value));
const historyState = computed(() => toLoadState(historyStatus.value));

/** Человека нет — это ответ, а не отказ запроса, и звучать он обязан по-разному. */
const isMissing = computed(() => cardError.value?.statusCode === 404);

const fullName = computed(() => {
  const profile = card.value?.profiles[0];

  if (!profile) {
    return 'Водитель';
  }

  return [profile.lastName, profile.firstName, profile.middleName]
    .filter((part): part is string => Boolean(part))
    .join(' ');
});

useHead({ title: () => `${fullName.value} — XalqBonus` });

const employee = useCurrentEmployee();

/**
 * Форму правки видят роли из `POINTS_ADJUST_ROLES` — сегодня все, — и только у человека
 * со счётом. Проверка дублирует серверную и ничего не решает: решает ручка.
 */
const canAdjust = computed(
  () =>
    employee.value !== null &&
    POINTS_ADJUST_ROLES.includes(employee.value.role) &&
    card.value?.balance !== null &&
    card.value?.balance !== undefined,
);

const adjusting = ref(false);
const adjustError = ref<string | null>(null);
const adjustErrorField = ref<ManualPointsField | null>(null);
const adjustmentsApplied = ref(0);

/**
 * Правка, затем перечитывание карточки и истории: баланс и сверка живут в одной ручке,
 * строка операции — в другой, и обновить одну без другой значит показать новый баланс
 * рядом со старым журналом.
 */
const adjustPoints = async (body: ManualPointsRequestBody): Promise<void> => {
  adjusting.value = true;
  adjustError.value = null;
  adjustErrorField.value = null;

  try {
    await $fetch<ManualPointsResponse>(`/api/drivers/${personId.value}/points`, {
      method: 'POST',
      body,
    });
    adjustmentsApplied.value += 1;
    historyOffset.value = 0;
    await Promise.all([refreshCard(), refreshHistory()]);
  } catch (error) {
    const field = failureField(error);
    adjustError.value = failureText(error);
    adjustErrorField.value = field === 'amount' || field === 'note' ? field : null;
  } finally {
    adjusting.value = false;
  }
};

/**
 * Выдачу награды видят роли из `REWARD_GRANT_ROLES` — тем же правилом, что правку баллов, —
 * и только у водителя в программе: человеку вне её награду вручить некуда, он не видит
 * ни раздела, ни кода (issue #172). Решает ручка, проверка здесь только прячет форму.
 */
const canGrant = computed(
  () =>
    employee.value !== null &&
    REWARD_GRANT_ROLES.includes(employee.value.role) &&
    card.value?.balance !== null &&
    card.value?.balance !== undefined,
);

// Офисы и товары для формы выдачи — один раз при открытии карточки. Ручка открыта тем же
// ролям, что и выдача: списки каталога и офисов менеджеру закрыты.
const { data: grantOptions } = await useFetch<RewardGrantOptionsResponse>(
  '/api/rewards/grant-options',
  { immediate: canGrant.value },
);

const grantOfficeOptions = computed<SelectOption[]>(() =>
  (grantOptions.value?.offices ?? []).map((office) => ({ value: office.officeId, label: office.name })),
);

const grantProductOptions = computed<SelectOption[]>(() =>
  (grantOptions.value?.products ?? []).map((product) => ({
    value: product.productId,
    label: product.promo ? `${product.name} — для акции` : product.name,
  })),
);

const granting = ref(false);
const grantError = ref<string | null>(null);
const grantErrorField = ref<ManualRewardField | null>(null);
const grantsApplied = ref(0);
const grantNotice = ref<string | null>(null);

const GRANT_FIELDS: readonly ManualRewardField[] = [
  'kind',
  'points',
  'productId',
  'title',
  'officeId',
  'lifetimeDays',
  'note',
];

/**
 * Выдача, затем перечитывание карточки и истории: награда баллами меняет баланс и встаёт
 * строкой в журнал, и обновить одно без другого значит показать их несогласованными.
 */
const grantReward = async (body: ManualRewardRequestBody): Promise<void> => {
  granting.value = true;
  grantError.value = null;
  grantErrorField.value = null;
  grantNotice.value = null;

  try {
    const result = await $fetch<ManualRewardResponse>(`/api/drivers/${personId.value}/rewards`, {
      method: 'POST',
      body,
    });

    grantsApplied.value += 1;
    grantNotice.value = result.code
      ? `Выдано. Код для стойки: ${result.code}`
      : 'Выдано: баллы зачислены.';
    historyOffset.value = 0;
    await Promise.all([refreshCard(), refreshHistory()]);
  } catch (error) {
    const field = failureField(error);
    grantError.value = failureText(error);
    grantErrorField.value = GRANT_FIELDS.find((known) => known === field) ?? null;
  } finally {
    granting.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">
    <div>
      <NuxtLink
        to="/drivers"
        class="text-sm text-slate-500 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-900"
      >
        ← к поиску
      </NuxtLink>
      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 class="text-xl font-semibold text-slate-900">{{ fullName }}</h1>
        <AtomsStatusBadge
          v-if="card"
          :tone="card.membership ? 'ok' : 'muted'"
          :label="card.membership ? 'в программе' : 'в программе не состоит'"
        />
      </div>
      <p class="mt-1 text-xs text-slate-400">Время показано в зоне {{ DISPLAY_TIME_ZONE_LABEL }}</p>
    </div>

    <MoleculesStateNotice
      v-if="cardState === 'loading'"
      state="loading"
      message="Читаем карточку…"
    />
    <MoleculesStateNotice
      v-else-if="isMissing"
      state="empty"
      message="Человека с таким идентификатором в реестре парка нет."
    />
    <MoleculesStateNotice
      v-else-if="cardState === 'error' || !card"
      state="error"
      message="Карточка не прочиталась. Это отказ запроса, а не отсутствие такого водителя."
    />
    <template v-else>
      <OrganismsDriverIdentity :card="card" />
      <OrganismsDriverBalance :card="card" />
      <OrganismsDriverPointsAdjustment
        v-if="canAdjust"
        :saving="adjusting"
        :error="adjustError"
        :error-field="adjustErrorField"
        :applied-count="adjustmentsApplied"
        @submit="adjustPoints"
      />
      <OrganismsDriverRewardGrant
        v-if="canGrant"
        :office-options="grantOfficeOptions"
        :product-options="grantProductOptions"
        :saving="granting"
        :error="grantError"
        :error-field="grantErrorField"
        :applied-count="grantsApplied"
        :notice="grantNotice"
        @submit="grantReward"
      />
      <OrganismsDriverMembership :card="card" />
      <OrganismsDriverParkProfiles :card="card" />
      <OrganismsDriverOperations
        :state="historyState"
        :data="history ?? null"
        :is-member="card.membership !== null"
        @page="historyOffset = $event"
      />
    </template>
  </div>
</template>
