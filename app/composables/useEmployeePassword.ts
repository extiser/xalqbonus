import { ref } from 'vue';
import { failureText } from '~/utils/requestError';
import type { EmployeePasswordResponse } from '#shared/types/employee';

/**
 * Пароль для входа в веб — из Mini App сотрудника, у которого пароля ещё нет (issue #130).
 *
 * Ручка та же, что у страницы `/password` в вебе. Разница только в двери: здесь человека
 * подтверждает заголовок с `initData`, а cookie веба в приложении нет вовсе.
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

  /** Пароль сохранён этим экраном. Снимается повторным открытием пункта. */
  const saved = ref(false);

  /** Отправляет пароль. `true` — сохранён: признак экрана сотрудника приводит в соответствие страница. */
  const submit = async (): Promise<boolean> => {
    if (submitting.value) {
      return false;
    }

    submitting.value = true;
    error.value = null;

    try {
      await $fetch<EmployeePasswordResponse>('/api/employees/me/password', {
        method: 'POST',
        headers: readHeaders(),
        body: { password: password.value },
      });

      password.value = '';
      saved.value = true;

      return true;
    } catch (failure) {
      error.value = failureText(failure);

      return false;
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
