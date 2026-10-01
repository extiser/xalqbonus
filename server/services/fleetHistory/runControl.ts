/**
 * Остановка прогона истории по сигналу (issue #317).
 *
 * Прогон идёт часами в разовом контейнере, и `docker stop` — штатный способ его прервать.
 * Сигнал не роняет процесс, а взводит `AbortSignal`: ожидания обрываются сразу, очередная
 * страница не запрашивается, сутки сохраняют частичные итоги, и итог запуска печатается.
 * Запрос, уже ушедший в сеть, дожидается ответа — клиент Fleet не меняется.
 */

export class StopRequestedError extends Error {
  constructor() {
    super('прогон остановлен сигналом');
    this.name = 'StopRequestedError';
  }
}

export const throwIfStopped = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new StopRequestedError();
  }
};

/** Пауза, которую сигнал обрывает: ждать конца десятиминутного `cooldown` при остановке незачем. */
export const sleepUnlessStopped = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new StopRequestedError());
      return;
    }

    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new StopRequestedError());
    };

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);

    signal.addEventListener('abort', onAbort, { once: true });
  });
