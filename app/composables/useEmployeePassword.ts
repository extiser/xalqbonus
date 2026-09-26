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
 *
 * Отказ сначала отдаётся странице через `reportDenial` — как у стойки (`useOfficeDesk`):
 * отказ двери заменяет экран целиком, и решает это страница, а не композабл.
 *
 * Повтор пароля (issue #250) сверяется здесь, до запроса: не совпал — `mismatch`, и запрос
 * не уходит. В ручку уезжает одно поле — повтор нужен только человеку, чтобы не задать пароль
 * с опечаткой, которой он не видел.
 */
export const useEmployeePassword = (
  readHeaders: () => Record<string, string>,
  reportDenial: (error: unknown) => boolean = () => false,
) => {
  const password = ref('');
  const repeat = ref('');

  /** Повтор не совпал с паролем — на последней попытке «Сохранить». */
  const mismatch = ref(false);

  const submitting = ref(false);
  const error = ref<string | null>(null);

  /** Пароль сохранён этим экраном. Снимается повторным открытием пункта. */
  const saved = ref(false);

  /** Отправляет пароль. `true` — сохранён: признак экрана сотрудника приводит в соответствие страница. */
  const submit = async (): Promise<boolean> => {
    if (submitting.value || saved.value) {
      return false;
    }

    error.value = null;
    mismatch.value = password.value !== repeat.value;

    if (mismatch.value) {
      return false;
    }

    submitting.value = true;

    try {
      await $fetch<EmployeePasswordResponse>('/api/employees/me/password', {
        method: 'POST',
        headers: readHeaders(),
        body: { password: password.value },
      });

      // Поля остаются заполненными под плашкой «сохранён», как в макете: экран подтверждает
      // введённое, а не показывает пустую форму. Стирает их повторное открытие пункта.
      saved.value = true;

      return true;
    } catch (failure) {
      if (reportDenial(failure)) {
        return false;
      }

      error.value = failureText(failure);

      return false;
    } finally {
      submitting.value = false;
    }
  };

  /** Пункт открыт заново: прошлый ввод, отказ и подтверждение к нему не относятся. */
  const reset = (): void => {
    password.value = '';
    repeat.value = '';
    mismatch.value = false;
    error.value = null;
    saved.value = false;
  };

  return { password, repeat, mismatch, submitting, error, saved, submit, reset };
};
