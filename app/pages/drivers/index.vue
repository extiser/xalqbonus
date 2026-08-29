<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toLoadState } from '~/utils/loadState';

/**
 * Экран поиска водителя.
 *
 * Запрос живёт в адресе, а не только в поле ввода: найденного водителя показывают
 * коллеге ссылкой, а не пересказом того, что было набрано.
 */

useHead({ title: 'Водители — XalqBonus' });

/** Сколько строк результата на странице. */
const RESULTS_LIMIT = 25;

const route = useRoute();
const router = useRouter();

/** Что искали по адресу строки. Поле ввода при этом живёт своей жизнью до отправки. */
const submittedQuery = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''));

const draftQuery = ref(submittedQuery.value);
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

const submit = (): void => {
  router.push({ query: draftQuery.value ? { q: draftQuery.value } : {} });
};
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Водители</h1>
      <p class="mt-1 text-sm text-slate-500">
        Поиск по всему реестру парка — по номеру удостоверения, телефону и имени. Номер ищется
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
