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

/**
 * Карточка водителя: после неё на вопрос «откуда у водителя столько баллов» отвечают
 * глазами, а не запросом в psql.
 *
 * Два запроса, а не один: карточка читается один раз, а история листается, и пересчитывать
 * сверку кэша с журналом на каждом перелистывании незачем.
 *
 * Человек, которого нет в программе, открывается этой же карточкой — с пустыми разделами
 * и подписью причины. Пустая карточка здесь содержательный ответ, а не ошибка.
 *
 * Демо-водитель помечен «ДЕМО» (issue #212). Баллы и награды ему правят те же роли, что живому:
 * демо-водитель — тренажёр, на нём учат менеджеров и админов (решение Руслана 26-09-2026).
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

// Награды — своей ручкой: читаются отдельно от карточки и живут своим порядком (issue #175).
const {
  data: rewards,
  status: rewardsStatus,
} = await useFetch(() => `/api/drivers/${personId.value}/rewards`);

// Устройства — своей ручкой, как награды: с чего водитель открывал приложение (issue #223).
const {
  data: devices,
  status: devicesStatus,
} = await useFetch(() => `/api/drivers/${personId.value}/devices`);

const cardState = computed(() => toLoadState(cardStatus.value));
const historyState = computed(() => toLoadState(historyStatus.value));
const rewardsState = computed(() => toLoadState(rewardsStatus.value));
const devicesState = computed(() => toLoadState(devicesStatus.value));

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
 * Вход в раздел «Награды» с этим водителем видят роли из `REWARD_GRANT_ROLES` — и только
 * у водителя в программе: человеку вне её вручить некуда (issue #219). Форма выдачи живёт
 * в разделе: там же подарок баллами, товар и своя награда. Решает ручка, проверка здесь
 * только прячет кнопку.
 */
const canGrant = computed(
  () =>
    employee.value !== null &&
    REWARD_GRANT_ROLES.includes(employee.value.role) &&
    card.value?.membership !== null &&
    card.value?.membership !== undefined,
);
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
        <AtomsStatusBadge v-if="card?.isDemo" tone="demo" label="ДЕМО" />
      </div>
      <p v-if="card?.isDemo" class="mt-1 text-sm text-slate-500">
        Демо-водитель: заказывает только в демо-офисе. Живым его не посчитает ни сегмент,
        ни акция, и в итоги баллов он не входит.
      </p>
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
      <div v-if="canGrant">
        <AtomsActionButton
          label="Вручить награду"
          @click="navigateTo({ path: '/rewards', query: { personId } })"
        />
      </div>
      <OrganismsDriverRewards :state="rewardsState" :data="rewards ?? null" />
      <OrganismsDriverMembership :card="card" />
      <OrganismsDriverParkProfiles :card="card" />
      <OrganismsDriverDevices :state="devicesState" :data="devices ?? null" />
      <OrganismsDriverOperations
        :state="historyState"
        :data="history ?? null"
        :is-member="card.membership !== null"
        @page="historyOffset = $event"
      />
    </template>
  </div>
</template>
