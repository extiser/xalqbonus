import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Ref } from 'vue';

/** Шаг опроса экрана с кодом выдачи, мс. */
export const LIVE_SCREEN_POLL_MS = 5000;

/**
 * Опрос экрана, который ждёт выдачи у стойки (issue #237): код на экране должен исчезнуть сам,
 * как только его выдали, — иначе водитель пойдёт с ним к другой стойке.
 *
 * Опрос идёт, пока экран ждёт (`waiting`) и приложение видно. Свернули Telegram — опрос стоит:
 * возврат из фона перечитывает экран сам, а следующий шаг опроса — через шаг после возврата.
 *
 * Следующий запрос уходит через шаг **после ответа** на предыдущий, а не по часам: два запроса
 * одного экрана одновременно не идут, и медленная сеть не копит очередь. Отказ молчит — в консоль,
 * а на экране остаётся последнее известное состояние: перечитывание никто не нажимал.
 */
export const useLiveScreenPoll = (waiting: Readonly<Ref<boolean>>, refresh: () => Promise<void>): void => {
  /** Приложение на переднем плане. На сервере и до монтирования — нет: таймеров там не заводим. */
  const visible = ref(false);
  const running = computed(() => waiting.value && visible.value);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let requesting = false;

  const stop = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = (): void => {
    stop();

    if (running.value) {
      timer = setTimeout(() => void step(), LIVE_SCREEN_POLL_MS);
    }
  };

  const step = async (): Promise<void> => {
    timer = null;

    // Запрос ещё в пути — следующий шаг заведёт его ответ.
    if (!running.value || requesting) {
      return;
    }

    requesting = true;

    try {
      await refresh();
    } catch (error) {
      console.error('[miniapp] опрос экрана не ответил', error);
    } finally {
      requesting = false;
    }

    schedule();
  };

  watch(running, (now) => {
    if (now) {
      schedule();
    } else {
      stop();
    }
  });

  const onVisibilityChange = (): void => {
    visible.value = document.visibilityState === 'visible';
  };

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange);
    onVisibilityChange();
  });

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    stop();
  });
};
