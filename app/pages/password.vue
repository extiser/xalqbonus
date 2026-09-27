<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAccessNotice, useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { toLoadState } from '~/utils/loadState';
import { failureText } from '~/utils/requestError';
import { PASSWORD_MIN_LENGTH } from '#shared/employee';
import type { EmployeePasswordResponse, EmployeeTelegramLinkResponse } from '#shared/types/employee';

/**
 * Смена своего пароля и привязка Telegram.
 *
 * Только своего: ручки «поставить пароль другому» не существует, и адреса под неё тоже
 * (`server/api/employees/me/password.post.ts`). Забывшему пароль его сбрасывают на экране
 * сотрудников, и новый он задаёт себе сам по ссылке «задать пароль» (issue #267).
 *
 * Telegram привязывается здесь же и по желанию: ссылкой на бота, которую сотрудник выпускает
 * себе сам (issue #267). Нужен он, чтобы приложение сотрудника открывалось в боте.
 *
 * Прежнего пароля не спрашиваем: сюда попадает только тот, кто уже доказал, что он это он,
 * — сессией веба или подписью Mini App.
 *
 * Смена гасит все выданные cookie, включая тот, которым её и делали, поэтому экран
 * заканчивается не возвратом к работе, а формой входа. Это не шероховатость: останься
 * человек работать, «сменил пароль» и «прежние сессии закрыты» перестали бы совпадать.
 */

useHead({ title: 'Смена пароля — Xalq Taxi Bonus' });

const PASSWORD_HINT = `Не короче ${PASSWORD_MIN_LENGTH} символов.`;

const currentEmployee = useCurrentEmployee();
const notice = useAccessNotice();

const password = ref('');
const error = ref<string | null>(null);
const submitting = ref(false);

const {
  data: telegram,
  status: telegramStatus,
} = await useFetch<EmployeeTelegramLinkResponse>('/api/employees/me/telegram-link');

const telegramState = computed(() => toLoadState(telegramStatus.value));
const telegramIssuing = ref(false);
const telegramError = ref<string | null>(null);

const issueTelegramLink = async (): Promise<void> => {
  if (telegramIssuing.value) {
    return;
  }

  telegramIssuing.value = true;
  telegramError.value = null;

  try {
    telegram.value = await $fetch<EmployeeTelegramLinkResponse>('/api/employees/me/telegram-link', {
      method: 'POST',
    });
  } catch (failure) {
    telegramError.value = failureText(failure);
  } finally {
    telegramIssuing.value = false;
  }
};

const submit = async (): Promise<void> => {
  if (submitting.value) {
    return;
  }

  submitting.value = true;
  error.value = null;

  try {
    await $fetch<EmployeePasswordResponse>('/api/employees/me/password', {
      method: 'POST',
      body: { password: password.value },
    });

    password.value = '';

    // Сессия этой вкладки погашена сервером — состояние приводится в соответствие сразу,
    // иначе шапка продолжит показывать имя человека, которого уже не пускают никуда.
    currentEmployee.value = null;
    notice.value = 'Пароль изменён. Прежние сессии закрыты — войдите заново.';

    await navigateTo('/login');
  } catch (failure) {
    error.value = failureText(failure);
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <!-- Ссылка привязки длинная, и блоку Telegram нужно место шире формы пароля. -->
  <div class="max-w-lg space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Смена пароля</h1>
      <p class="mt-1 text-sm text-slate-500">
        Пароль меняется только себе. Смена закрывает все сессии, включая эту.
      </p>
    </div>

    <form class="max-w-sm space-y-4" @submit.prevent="submit">
      <MoleculesFormField
        v-model="password"
        label="Новый пароль"
        type="password"
        autocomplete="new-password"
        :hint="PASSWORD_HINT"
        :error="error"
        autofocus
      />

      <div class="grid">
        <AtomsSubmitButton
          :label="submitting ? 'Меняем…' : 'Сменить пароль'"
          size="large"
          :disabled="submitting"
        />
      </div>
    </form>

    <OrganismsEmployeeTelegramBinding
      :state="telegramState"
      :bound="telegram?.bound ?? false"
      :link="telegram?.link ?? null"
      :issuing="telegramIssuing"
      :error="telegramError"
      @issue="issueTelegramLink"
    />
  </div>
</template>
