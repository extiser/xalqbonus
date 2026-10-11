<script setup lang="ts">
import { computed } from 'vue';
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { useNavigationCounts } from '~/composables/useNavigationCounts';
import { useSignOut } from '~/composables/useSignOut';
import { navigationFor } from '~/utils/navigation';

/**
 * Раскладка служебных экранов: шапка сверху, содержимое колонкой под ней.
 *
 * За вошедшим ходит раскладка, а не шапка: шапка — компонент и о ручках не знает
 * (docs/frontend.md → «Данные в компоненты не ходят»). Само значение в состояние кладёт
 * общая проверка маршрута, здесь оно только читается. Числа счётчиков у пунктов шапки — тоже
 * раскладка (`useNavigationCounts`), тем же запросом, что у тёмной.
 */

const employee = useCurrentEmployee();

const items = computed(() => navigationFor(employee.value?.role ?? null));

const counts = useNavigationCounts(items);

const signOut = useSignOut();
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <OrganismsAppHeader :items="items" :employee="employee" :counts="counts" @sign-out="signOut" />
    <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <slot />
    </main>
  </div>
</template>
