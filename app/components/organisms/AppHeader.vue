<script setup lang="ts">
import { useRoute } from 'vue-router';
import type { NavigationItem } from '~/utils/navigation';
import type { EmployeeIdentity } from '#shared/types/employee';

/**
 * Шапка служебной части: имя системы, переходы между экранами и кто сейчас работает.
 *
 * Имя вошедшего здесь не для красоты: на один компьютер в офисе садятся по очереди,
 * и вопрос «под кем я сейчас» должен иметь ответ до того, как человек что-то сделает.
 *
 * За данными компонент не ходит и выход сам не делает: принимает готовое свойством
 * и отдаёт событие наверх (docs/frontend.md → «Данные в компоненты не ходят»).
 */
defineProps<{
  items: NavigationItem[];
  employee: EmployeeIdentity | null;
}>();

const emit = defineEmits<{ signOut: [] }>();

const route = useRoute();

/**
 * Пункт считается текущим и на вложенных страницах: карточка водителя живёт по адресу
 * `/drivers/<id>`, и шапка, гаснущая при переходе в неё, теряет ответ на вопрос
 * «где я сейчас».
 */
const isCurrent = (path: string): boolean =>
  route.path === path || route.path.startsWith(`${path}/`);
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
      <NuxtLink to="/" class="text-base font-semibold text-slate-900">XalqBonus</NuxtLink>
      <nav class="flex flex-wrap gap-x-4 gap-y-1">
        <NuxtLink
          v-for="item in items"
          :key="item.path"
          :to="item.path"
          class="rounded-md px-2 py-1 text-sm font-medium transition-colors"
          :class="
            isCurrent(item.path)
              ? 'bg-slate-100 text-slate-900'
              : 'text-slate-500 hover:text-slate-900'
          "
        >
          {{ item.title }}
        </NuxtLink>
      </nav>

      <div v-if="employee" class="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
        <span class="text-sm font-medium text-slate-900">{{ employee.fullName }}</span>
        <NuxtLink
          to="/password"
          class="rounded-md px-2 py-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          Смена пароля
        </NuxtLink>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          @click="emit('signOut')"
        >
          Выйти
        </button>
      </div>
    </div>
  </header>
</template>
