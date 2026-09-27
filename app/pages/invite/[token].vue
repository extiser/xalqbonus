<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { employeeRoleLabel } from '~/utils/labels';
import { failureCode, failureField, failureText } from '~/utils/requestError';
import { WEB_LANGUAGE } from '#shared/denials';
import { inviteDeadText } from '#shared/employeeLinks';
import { formatPhone } from '#shared/phone';
import type {
  EmployeeInviteDeadOutcome,
  EmployeeInviteLookupResponse,
  EmployeeLoginResponse,
} from '#shared/types/employee';

/**
 * Приглашение сотрудника (issue #267): открывший ссылку видит, кем его приглашают, задаёт пароль
 * и сразу входит — `/invite/<токен>`.
 *
 * Страница открыта без входа (`auth.global.ts`): учётки у человека ещё нет. Имя, роль и телефон
 * задал приглашающий — здесь они только показываются. Мёртвая ссылка — одна строка по исходу,
 * та же, которой ответит ручка, если ссылка умрёт, пока человек набирает пароль
 * (`shared/employeeLinks.ts`).
 */

definePageMeta({
  // Без раскладки, как вход: в шапке служебной части имя вошедшего и разделы, а у открывшего
  // приглашение нет ни того, ни другого.
  layout: false,
});

useHead({ title: 'Приглашение — Xalq Taxi Bonus' });

const route = useRoute();
const currentEmployee = useCurrentEmployee();
const token = computed(() => String(route.params.token ?? ''));

const { data, status } = await useFetch<EmployeeInviteLookupResponse>(
  () => `/api/employee-invites/by-token/${encodeURIComponent(token.value)}`,
);

/** Ссылка умерла, пока человек был на странице: ответ ручки принятия важнее прочитанного. */
const diedWhileOpen = ref<EmployeeInviteDeadOutcome | null>(null);

const DEAD_OUTCOMES: readonly EmployeeInviteDeadOutcome[] = ['not_found', 'expired', 'accepted', 'revoked'];

const isDeadOutcome = (code: string | null): code is EmployeeInviteDeadOutcome =>
  code !== null && (DEAD_OUTCOMES as readonly string[]).includes(code);

const dead = computed<EmployeeInviteDeadOutcome | null>(() => {
  if (diedWhileOpen.value !== null) {
    return diedWhileOpen.value;
  }

  return data.value && data.value.outcome !== 'live' ? data.value.outcome : null;
});

const facts = computed(() => {
  const invite = data.value;

  if (!invite || invite.outcome !== 'live') {
    return [];
  }

  return [
    { label: 'Имя', value: invite.fullName },
    { label: 'Роль', value: employeeRoleLabel(invite.role) },
    { label: 'Телефон для входа', value: formatPhone(invite.phoneE164).display },
  ];
});

const submitting = ref(false);
const passwordError = ref<string | null>(null);
const error = ref<string | null>(null);

const accept = async (password: string): Promise<void> => {
  if (submitting.value) {
    return;
  }

  submitting.value = true;
  passwordError.value = null;
  error.value = null;

  try {
    const response = await $fetch<EmployeeLoginResponse>('/api/employee-invites/accept', {
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
        <h1 class="text-xl font-semibold text-slate-900">Приглашение в Xalq Taxi Bonus</h1>
        <p v-if="!dead && data?.outcome === 'live'" class="mt-1 text-sm text-slate-500">
          Задайте пароль — по нему и телефону вы будете входить.
        </p>
      </div>

      <MoleculesStateNotice v-if="status === 'pending'" state="loading" message="Читаем приглашение…" />
      <MoleculesStateNotice
        v-else-if="status === 'error'"
        state="error"
        message="Приглашение не прочиталось. Проверьте связь и обновите страницу."
      />
      <div v-else-if="dead" class="space-y-3">
        <p class="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {{ inviteDeadText(dead, WEB_LANGUAGE) }}
        </p>
        <NuxtLink
          v-if="dead === 'accepted'"
          to="/login"
          class="text-sm text-slate-900 underline underline-offset-2 hover:text-slate-700"
        >
          Войти
        </NuxtLink>
      </div>
      <OrganismsEmployeeLinkPasswordForm
        v-else
        :facts="facts"
        submit-label="Принять и войти"
        :submitting="submitting"
        :password-error="passwordError"
        :error="error"
        @submit="accept"
      />
    </div>
  </div>
</template>
