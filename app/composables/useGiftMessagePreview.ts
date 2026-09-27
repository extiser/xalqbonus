import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GiftMessagePreviewResponse } from '#shared/types/rewards';

/**
 * Системный текст подарка по тому, что сейчас набрано в форме «Вручить» (issue #236): что
 * уйдёт водителю, если своё поле пусто, и строка, что встанет под своим текстом. Ручная
 * награда устроена так же (issue #266) — со своей ручкой и своими полями: `url` и `readSource`.
 *
 * Собирает его сервер — той же сборкой, что сообщение водителю, — и форма показывает ровно
 * то, что уйдёт. Перечитывается по мере правки суммы, повода и даты, не чаще раза в 300 мс;
 * пока новый не пришёл, стоит прежний. Отказ предпросмотра тоже оставляет прежний: форма
 * вручает и без него, а сервер при раздаче меряет длину сам.
 *
 * Запросы живут здесь, а не в компоненте (docs/frontend.md → «Данные в компоненты не ходят»).
 */

/** Пауза после правки поля: сумму и повод набирают по знаку, и спрашивать каждый незачем. */
const PREVIEW_DELAY_MS = 300;

export const useGiftMessagePreview = <Body extends object>(url: string, readSource: () => Body) => {
  const preview = ref<GiftMessagePreviewResponse | null>(null);

  /** Номер последнего запроса: ответ на прежний набор, приехавший позже, не показывается. */
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const load = async (): Promise<void> => {
    const current = ++sequence;

    try {
      const response = await $fetch<GiftMessagePreviewResponse>(url, {
        method: 'POST',
        body: readSource(),
      });

      if (current === sequence) {
        preview.value = response;
      }
    } catch {
      // Прежний текст остаётся: правка следующего поля спросит снова.
    }
  };

  const schedule = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      void load();
    }, PREVIEW_DELAY_MS);
  };

  watch(() => readSource(), schedule, { deep: true });

  onMounted(() => {
    void load();
  });

  onBeforeUnmount(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });

  return { preview };
};
