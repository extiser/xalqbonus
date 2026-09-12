<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAccessNotice, useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { failureText } from '~/utils/requestError';
import type { EmployeeLoginResponse } from '#shared/types/employee';

/**
 * Вход сотрудника: телефон и пароль, больше ничего.
 *
 * Ни регистрации, ни восстановления пароля здесь нет и не будет: учётка заводится
 * приглашением, а забывшему пароль его сбрасывает владелец (docs/decisions.md →
 * «Учётка сотрудника и роли»).
 *
 * Отказы показываются ровно так, как их развёл сервер, своего разбора причин здесь нет:
 * единый текст на неверный телефон и неверный пароль — не небрежность, а условие. Форма,
 * отвечающая «такого телефона нет», становится способом узнать, кто заведён в системе.
 *
 * Своих текстов отказа здесь тоже нет ни одного, включая запасной: они живут в словаре
 * (`shared/denials.ts`), иначе «войти не вышло» этого экрана однажды разойдётся с тем,
 * что про то же самое говорит соседний.
 */

definePageMeta({
  // Без раскладки: в шапке служебной части имя вошедшего, выход и переходы по разделам —
  // всё то, чего у не вошедшего нет.
  layout: false,
});

useHead({ title: 'Вход — XalqBonus' });

const route = useRoute();
const currentEmployee = useCurrentEmployee();
const notice = useAccessNotice();

const phone = ref('');
const password = ref('');
const error = ref<string | null>(null);
const submitting = ref(false);

/**
 * Куда человек шёл до того, как его завернули на вход.
 *
 * Принимается только путь внутри приложения: `next`, пришедший из адресной строки,
 * пишет кто угодно, и без проверки ссылка «войдите в XalqBonus» уводила бы на чужой сайт
 * сразу после удачного входа.
 */
const destination = (): string => {
  const next = route.query.next;

  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) {
    return '/drivers';
  }

  return next;
};

const submit = async (): Promise<void> => {
  if (submitting.value) {
    return;
  }

  submitting.value = true;
  error.value = null;
  notice.value = null;

  try {
    const response = await $fetch<EmployeeLoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { phone: phone.value, password: password.value },
    });

    currentEmployee.value = response.employee;

    await navigateTo(destination());
  } catch (failure) {
    error.value = failureText(failure);
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 font-sans text-slate-900">
    <div class="w-full max-w-sm">
      <h1 class="text-xl font-semibold text-slate-900">XalqBonus</h1>
      <p class="mt-1 text-sm text-slate-500">Вход для сотрудников парка</p>

      <p v-if="notice" class="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
        {{ notice }}
      </p>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <MoleculesFormField
          v-model="phone"
          label="Телефон"
          type="tel"
          autocomplete="username"
          placeholder="+998 90 123 45 67"
          autofocus
        />
        <MoleculesFormField
          v-model="password"
          label="Пароль"
          type="password"
          autocomplete="current-password"
        />

        <p v-if="error" class="text-sm text-red-700">{{ error }}</p>

        <!-- Сетка, а не класс на кнопке: ширину ставит контейнер, и кнопка о ней не знает. -->
        <div class="grid">
          <AtomsSubmitButton
            :label="submitting ? 'Входим…' : 'Войти'"
            size="large"
            :disabled="submitting"
          />
        </div>
      </form>
    </div>
  </div>
</template>
