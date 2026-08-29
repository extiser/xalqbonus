<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { DISPLAY_TIME_ZONE_LABEL } from '~/utils/format';
import { toLoadState } from '~/utils/loadState';

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
} = await useFetch(() => `/api/drivers/${personId.value}`);

const { data: history, status: historyStatus } = await useFetch(
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
