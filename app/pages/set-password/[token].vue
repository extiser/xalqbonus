<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { failureCode, failureField, failureText } from '~/utils/requestError';
import { WEB_LANGUAGE } from '#shared/denials';
import { passwordLinkDeadText } from '#shared/employeeLinks';
import { formatPhone } from '#shared/phone';
import type {
  EmployeeAccessLinkDeadOutcome,
  EmployeeLoginResponse,
  EmployeePasswordLinkLookupResponse,
} from '#shared/types/employee';

/**
 * Пароль после сброса (issue #267): `/set-password/<токен>` — ссылку выпускает сброс пароля
 * на экране сотрудников, и её пересылают человеку, как приглашение. Новый пароль он задаёт сам
 * и сразу входит. Устроена по образцу страницы приглашения (`/invite/<токен>`).
 *
 * Страница открыта без входа (`auth.global.ts`): пароль сброшен, и войти человеку нечем.
 */

definePageMeta({
  layout: false,
});

useHead({ title: 'Задать пароль — Xalq Taxi Bonus' });

const route = useRoute();
const currentEmployee = useCurrentEmployee();
const token = computed(() => String(route.params.token ?? ''));

const { data, status } = await useFetch<EmployeePasswordLinkLookupResponse>(
  () => `/api/employees/password-links/by-token/${encodeURIComponent(token.value)}`,
);

/** Ссылка умерла, пока человек был на странице: ответ ручки важнее прочитанного. */
const diedWhileOpen = ref<EmployeeAccessLinkDeadOutcome | null>(null);

const DEAD_OUTCOMES: readonly EmployeeAccessLinkDeadOutcome[] = ['not_found', 'expired', 'used', 'revoked'];

const isDeadOutcome = (code: string | null): code is EmployeeAccessLinkDeadOutcome =>
  code !== null && (DEAD_OUTCOMES as readonly string[]).includes(code);

const dead = computed<EmployeeAccessLinkDeadOutcome | null>(() => {
  if (diedWhileOpen.value !== null) {
    return diedWhileOpen.value;
  }

  return data.value && data.value.outcome !== 'live' ? data.value.outcome : null;
});

const facts = computed(() => {
  const link = data.value;

  if (!link || link.outcome !== 'live') {
    return [];
  }

  return [
    { label: 'Имя', value: link.fullName },
    { label: 'Телефон для входа', value: formatPhone(link.phoneE164).display },
  ];
});

const submitting = ref(false);
const passwordError = ref<string | null>(null);
const error = ref<string | null>(null);

const consume = async (password: string): Promise<void> => {
  if (submitting.value) {
    return;
  }

  submitting.value = true;
  passwordError.value = null;
  error.value = null;

  try {
    const response = await $fetch<EmployeeLoginResponse>('/api/employees/password-links/consume', {
      method: 'POST',
      body: { token: token.value, password },
    });

    currentEmployee.value = response.employee;

    await navigateTo('/');
  } catch (failure) {
    const code = failureCode(failure);

    if (isDeadOutcome(code)) {
      diedWhileOpen.value = code;
    } else if (failureField(failure) === 'password') {
      passwordError.value = failureText(failure);
    } else {
      error.value = failureText(failure);
    }
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 font-sans text-slate-900">
    <div class="w-full max-w-sm space-y-6">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Новый пароль в Xalq Taxi Bonus</h1>
        <p v-if="!dead && data?.outcome === 'live'" class="mt-1 text-sm text-slate-500">
          Пароль сбросили — придумайте новый. Знать его будете только вы.
        </p>
      </div>

      <MoleculesStateNotice v-if="status === 'pending'" state="loading" message="Читаем ссылку…" />
      <MoleculesStateNotice
        v-else-if="status === 'error'"
        state="error"
        message="Ссылка не прочиталась. Проверьте связь и обновите страницу."
      />
      <div v-else-if="dead" class="space-y-3">
        <p class="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {{ passwordLinkDeadText(dead, WEB_LANGUAGE) }}
        </p>
        <NuxtLink
          v-if="dead === 'used'"
          to="/login"
          class="text-sm text-slate-900 underline underline-offset-2 hover:text-slate-700"
        >
          Войти
        </NuxtLink>
      </div>
      <OrganismsEmployeeLinkPasswordForm
        v-else
        :facts="facts"
        submit-label="Задать пароль и войти"
        :submitting="submitting"
        :password-error="passwordError"
        :error="error"
        @submit="consume"
      />
    </div>
  </div>
</template>
