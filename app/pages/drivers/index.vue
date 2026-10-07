<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toLoadState } from '~/utils/loadState';

/**
 * Экран поиска водителя.
 *
 * Запрос живёт в состоянии записи истории (`history.state`), а не в адресе: адрес остаётся
 * `/drivers`. Набирают сюда телефон и номер ВУ, а адрес страницы Яндекс Метрика читает сама,
 * в обход наших просмотров, — запрос в адресе уезжал бы ей при каждой загрузке (issue #432).
 * Состояние записи переживает и «назад» из карточки водителя, и перезагрузку вкладки:
 * браузер хранит его вместе с записью, а роутер при старте дописывает своё поверх, не стирая.
 *
 * Отрисованная сервером страница запроса не знает — состояние есть только у браузера, — поэтому
 * результаты поднимаются после монтирования.
 */

useHead({ title: 'Водители — Xalq Taxi Bonus' });

/** Сколько строк результата на странице. */
const RESULTS_LIMIT = 25;

/** Ключ запроса в `history.state`. Остальные ключи там — роутера. */
const QUERY_STATE_KEY = 'driverQuery';

const router = useRouter();

/** Что искали в этой записи истории. Поле ввода при этом живёт своей жизнью до отправки. */
const submittedQuery = ref('');

const draftQuery = ref('');
const offset = ref(0);

const { data, status } = await useFetch('/api/drivers', {
  query: { query: submittedQuery, limit: RESULTS_LIMIT, offset },
});

const state = computed(() => toLoadState(status.value));

// Новый запрос всегда начинается с первой страницы: смещение от прежнего запроса показало бы
// пустоту там, где результаты есть.
watch(submittedQuery, () => {
  offset.value = 0;
});

/** Запрос из состояния текущей записи истории. Нет его — пустая строка. */
const readStateQuery = (): string => {
  const historyState: unknown = window.history.state;

  if (typeof historyState !== 'object' || historyState === null || !(QUERY_STATE_KEY in historyState)) {
    return '';
  }

  const value: unknown = historyState[QUERY_STATE_KEY];

  return typeof value === 'string' ? value : '';
};

const restoreQuery = (): void => {
  submittedQuery.value = readStateQuery();
  draftQuery.value = submittedQuery.value;
};

onMounted(restoreQuery);

// Новый поиск и «назад»/«вперёд» между двумя поисками — та же страница с тем же адресом:
// она не пересоздаётся, а роутер меняет только маршрут. Запрос перечитывается из записи,
// на которую пришли. Уход на другую страницу не в счёт — у её записи запроса нет.
watch(router.currentRoute, (current) => {
  if (current.path === '/drivers') {
    restoreQuery();
  }
});

// `force`: адрес тот же, и без него роутер счёл бы переход повтором и записи не завёл.
const submit = (): void => {
  void router.push({ path: '/drivers', state: { [QUERY_STATE_KEY]: draftQuery.value }, force: true });
};
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Водители</h1>
      <p class="mt-1 text-sm text-slate-500">
        Поиск по всему реестру парка — по номеру удостоверения, телефону, имени и позывному.
        Номер ищется
        по нормализованному значению: диктуют его с кириллицей, с префиксом
        <span class="font-mono">UZ</span> и без, через дефис и пробелы.
      </p>
    </div>

    <MoleculesDriverSearchForm v-model="draftQuery" @submit="submit" />

    <OrganismsDriverSearchResults
      :state="state"
      :data="data ?? null"
      @page="offset = $event"
    />
  </div>
</template>
