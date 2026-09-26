<script setup lang="ts">
import { computed, ref } from 'vue';
import { failureText } from '~/utils/requestError';
import { toLoadState } from '~/utils/loadState';
import type {
  EmployeeAccountsResponse,
  EmployeeDisabledResponse,
  EmployeeInviteResponse,
  EmployeeInviteRevokeResponse,
  EmployeeInvitesResponse,
  EmployeePasswordResetResponse,
} from '#shared/types/employee';

/**
 * Экран «Сотрудники»: учётки, висящие приглашения, выпуск приглашения, выключение
 * и сброс пароля (issue #132).
 *
 * Привязка к офису сюда не переезжает — она правится на странице офиса, отсюда на неё
 * только ссылки.
 *
 * Данные берутся здесь, а не в компонентах (docs/frontend.md → «Данные в компоненты
 * не ходят»). После каждого действия список перечитывается, а не правится на клиенте:
 * состояние учётки решает сервер.
 */

definePageMeta({
  // Менеджеру этот экран не открыт. Решают ручки, а не эта строка: она лишь уводит
  // на его работу вместо череды отказов (`app/middleware/employees-access.ts`).
  middleware: 'employees-access',
});

useHead({ title: 'Сотрудники — XalqBonus' });

const { data: accounts, status: accountsStatus, refresh: refreshAccounts } =
  await useFetch<EmployeeAccountsResponse>('/api/employees');
const { data: invites, status: invitesStatus, refresh: refreshInvites } =
  await useFetch<EmployeeInvitesResponse>('/api/employee-invites');

const accountsState = computed(() => toLoadState(accountsStatus.value));
const invitesState = computed(() => toLoadState(invitesStatus.value));

const issuing = ref(false);
const issueError = ref<string | null>(null);
const issued = ref<EmployeeInviteResponse | null>(null);

const issue = async (role: EmployeeInviteResponse['role']): Promise<void> => {
  issuing.value = true;
  issueError.value = null;

  try {
    issued.value = await $fetch<EmployeeInviteResponse>('/api/employee-invites', {
      method: 'POST',
      body: { role },
    });
    await refreshInvites();
  } catch (error) {
    issueError.value = failureText(error);
  } finally {
    issuing.value = false;
  }
};

const busyId = ref<string | null>(null);
const actionError = ref<string | null>(null);

/**
 * Все четыре действия устроены одинаково: погасить строку, позвать ручку, перечитать список.
 * Одним путём — чтобы обработка отказа не разошлась между ними на первой правке.
 */
const runAction = async (id: string, request: () => Promise<unknown>): Promise<void> => {
  busyId.value = id;
  actionError.value = null;

  try {
    await request();
    await Promise.all([refreshAccounts(), refreshInvites()]);
  } catch (error) {
    actionError.value = failureText(error);
  } finally {
    busyId.value = null;
  }
};

const nameOf = (employeeId: string): string =>
  accounts.value?.employees.find((account) => account.employeeId === employeeId)?.fullName ??
  'сотрудник';

// Подтверждение спрашивается у действий, которые человек за столом заметит сразу:
// выключенный не войдёт, сброшенный выйдет из веба на всех устройствах.
const disable = (employeeId: string): Promise<void> | undefined => {
  if (!window.confirm(`Выключить учётную запись «${nameOf(employeeId)}»? Войти не выйдет ни в веб, ни в приложение.`)) {
    return;
  }

  return runAction(employeeId, () =>
    $fetch<EmployeeDisabledResponse>(`/api/employees/${employeeId}/disable`, { method: 'POST' }),
  );
};

const enable = (employeeId: string): Promise<void> =>
  runAction(employeeId, () =>
    $fetch<EmployeeDisabledResponse>(`/api/employees/${employeeId}/enable`, { method: 'POST' }),
  );

const resetPassword = (employeeId: string): Promise<void> | undefined => {
  if (
    !window.confirm(
      `Сбросить пароль «${nameOf(employeeId)}»? Из веба сотрудник выйдет на всех устройствах, новый пароль задаст себе сам в приложении.`,
    )
  ) {
    return;
  }

  return runAction(employeeId, () =>
    $fetch<EmployeePasswordResetResponse>(`/api/employees/${employeeId}/password-reset`, {
      method: 'POST',
    }),
  );
};

const revoke = (inviteId: string): Promise<void> =>
  runAction(inviteId, () =>
    $fetch<EmployeeInviteRevokeResponse>(`/api/employee-invites/${inviteId}/revoke`, {
      method: 'POST',
    }),
  );
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Сотрудники</h1>
      <p class="mt-1 text-sm text-slate-500">
        Кто работает в системе и с какой ролью. Закрепление за офисом правится на странице
        офиса — в разделе
        <NuxtLink to="/offices" class="underline underline-offset-2 hover:text-slate-900">
          «Офисы»</NuxtLink
        >.
      </p>
    </div>

    <OrganismsEmployeeInviteForm
      v-if="accounts && accounts.invitableRoles.length > 0"
      :roles="accounts.invitableRoles"
      :issuing="issuing"
      :error="issueError"
      :issued="issued"
      @issue="issue"
      @dismiss="issued = null"
    />

    <OrganismsEmployeeTable
      :accounts-state="accountsState"
      :accounts="accounts?.employees ?? null"
      :invites-state="invitesState"
      :invites="invites?.invites ?? null"
      :busy-id="busyId"
      :error="actionError"
      @disable="disable"
      @enable="enable"
      @reset-password="resetPassword"
      @revoke="revoke"
    />
  </div>
</template>
