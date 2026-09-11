import { hash, verify } from '@node-rs/argon2';

import { PASSWORD_MIN_LENGTH } from '#server/services/employees/config';

/**
 * Пароль сотрудника: хеширование и сверка.
 *
 * `argon2id` — решение из docs/decisions.md, а не выбор реализации: он единственный
 * из ходовых алгоритмов дорог и по времени, и по памяти, то есть перебор на видеокарте
 * не даёт выигрыша на порядки.
 *
 * Параметры не задаются: берутся умолчания библиотеки. Своя подборка стоимости имела бы
 * смысл, если бы её кто-то замерял на боевой машине и пересматривал; неподтверждённые
 * числа в коде хуже умолчаний, которые сопровождает автор библиотеки.
 *
 * Соль отдельным полем не хранится — она внутри строки хеша, как и параметры. Поэтому
 * сверка не требует ничего, кроме самой строки, и смена параметров не ломает старые
 * пароли.
 */

/** Пароль короче предела до хеширования не доходит: длина — единственное требование. */
export class PasswordTooShortError extends Error {
  constructor() {
    super(`пароль короче ${PASSWORD_MIN_LENGTH} символов`);
    this.name = 'PasswordTooShortError';
  }
}

/**
 * Годен ли пароль. Требование одно — длина.
 *
 * Обязательных цифр, регистров и знаков препинания нет намеренно: они выгоняют людей
 * в предсказуемые замены вроде `Parol2026!`, а стойкость дают длина и неповторение.
 */
export const isPasswordAcceptable = (password: string): boolean =>
  password.length >= PASSWORD_MIN_LENGTH;

export const hashPassword = async (password: string): Promise<string> => {
  if (!isPasswordAcceptable(password)) {
    throw new PasswordTooShortError();
  }

  return hash(password);
};

/**
 * Сверяет пароль с хешем. Отказ — это `false`, а не исключение.
 *
 * Испорченная строка хеша тоже даёт `false`: библиотека на неразбираемом хеше бросает,
 * а вход по битой учётке обязан кончаться отказом, а не пятисоткой — иначе одна кривая
 * строка в базе превращает форму входа в ошибку сервера.
 */
export const verifyPassword = async (passwordHash: string, password: string): Promise<boolean> => {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
};
