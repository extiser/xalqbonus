<script setup lang="ts">
import { computed } from 'vue';
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { navigationFor } from '~/utils/navigation';

/**
 * Раскладка служебных экранов: шапка сверху, содержимое колонкой под ней.
 *
 * За вошедшим ходит раскладка, а не шапка: шапка — компонент и о ручках не знает
 * (docs/frontend.md → «Данные в компоненты не ходят»). Само значение в состояние кладёт
 * общая проверка маршрута, здесь оно только читается.
 */

const employee = useCurrentEmployee();

const items = computed(() => navigationFor(employee.value?.role ?? null));

/**
 * Выход. Ручка гасит сессию на сервере и удаляет cookie; отказ ручки выходу не мешает —
 * сессии, которую не приняли, уже нет, и держать человека в приложении из-за этого незачем.
 *
 * Сообщения о случившемся нет намеренно: нажавший «Выйти» видит форму входа, и это
 * исчерпывающий ответ. Строка про закрытую на сервере сессию рассказывала бы про наше
 * устройство, до которого вышедшему человеку дела нет.
 */
const signOut = async (): Promise<void> => {
  try {
    await $fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Разбирать нечего: дальше в любом случае форма входа.
  }

  employee.value = null;

  await navigateTo('/login');
};
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <OrganismsAppHeader :items="items" :employee="employee" @sign-out="signOut" />
    <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <slot />
    </main>
  </div>
</template>
