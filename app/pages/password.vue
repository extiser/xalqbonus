<script setup lang="ts">
import { ref } from 'vue';
import { useAccessNotice, useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { failureText } from '~/utils/requestError';
import type { EmployeePasswordResponse } from '#shared/types/employee';

/**
 * Смена своего пароля.
 *
 * Только своего: ручки «поставить пароль другому» не существует, и адреса под неё тоже
 * (`server/api/employees/me/password.post.ts`). Забывшему пароль его сбрасывает владелец
 * тем же приглашением.
 *
 * Прежнего пароля не спрашиваем: сюда попадает только тот, кто уже доказал, что он это он,
 * — сессией веба или подписью Mini App.
 *
 * Смена гасит все выданные cookie, включая тот, которым её и делали, поэтому экран
 * заканчивается не возвратом к работе, а формой входа. Это не шероховатость: останься
 * человек работать, «сменил пароль» и «прежние сессии закрыты» перестали бы совпадать.
 */

useHead({ title: 'Смена пароля — XalqBonus' });

const PASSWORD_HINT = 'Не короче десяти символов.';

const currentEmployee = useCurrentEmployee();
const notice = useAccessNotice();

const password = ref('');
const error = ref<string | null>(null);
const submitting = ref(false);

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
  <div class="max-w-sm space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">Смена пароля</h1>
      <p class="mt-1 text-sm text-slate-500">
        Пароль меняется только себе. Смена закрывает все сессии, включая эту.
      </p>
    </div>

    <form class="space-y-4" @submit.prevent="submit">
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
  </div>
</template>
