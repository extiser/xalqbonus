import { ref } from 'vue';
import { failureText } from '~/utils/requestError';
import type { EmployeePasswordResponse } from '#shared/types/employee';

/**
 * Пароль для входа в веб — из Mini App сотрудника (issue #130).
 *
 * Ручка та же, что у страницы `/password` в вебе: задать и сменить — одно действие, и отдельного
 * «задать» у неё нет. Разница только в двери: здесь человека подтверждает заголовок с `initData`,
 * а cookie веба в приложении нет вовсе.
 *
 * Поэтому и конец другой. Веб после смены уводит на форму входа — его собственный cookie погашен.
 * Здесь гасить нечего: экран остаётся экраном сотрудника и говорит, что пароль сохранён.
 *
 * Текст отказа — тот, что прислала ручка (`failureText`): правило длины живёт при ней,
 * и второй текст про то же на экране разошёлся бы с веб-страницей.
 */
export const useEmployeePassword = (readHeaders: () => Record<string, string>) => {
  const password = ref('');
  const submitting = ref(false);
  const error = ref<string | null>(null);

  /** Пароль сохранён этим экраном. Снимается следующей отправкой и повторным открытием пункта. */
  const saved = ref(false);

  const submit = async (): Promise<void> => {
    if (submitting.value) {
      return;
    }

    submitting.value = true;
    error.value = null;
    saved.value = false;

    try {
      await $fetch<EmployeePasswordResponse>('/api/employees/me/password', {
        method: 'POST',
        headers: readHeaders(),
        body: { password: password.value },
      });

      password.value = '';
      saved.value = true;
    } catch (failure) {
      error.value = failureText(failure);
    } finally {
      submitting.value = false;
    }
  };

  /** Пункт открыт заново: прошлый ввод, отказ и подтверждение к нему не относятся. */
  const reset = (): void => {
    password.value = '';
    error.value = null;
    saved.value = false;
  };

  return { password, submitting, error, saved, submit, reset };
};
