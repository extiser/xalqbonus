import { onScopeDispose, ref } from 'vue';
import { INIT_DATA_HEADER } from '#shared/types/miniapp';
import type { MemberGiftDenialCode, MiniAppGiftClaimResponse, MiniAppGiftsShownBody } from '#shared/types/rewards';
import { failureCode, failureMessage } from '~/utils/requestError';

/**
 * «Забрать» подарок от Xalq Taxi (issue #220) — одно состояние на шторку, главную и раздел наград:
 * какие подарки ждут ответа, какие лопаются, у каких строка отказа и идёт ли «Забрать всё».
 * Поведение — `_reference/design/gifts/main-screen-gifts-take.html`.
 *
 * Сам список подарков держит `useMemberRewards`; отсюда он только перечитывается и теряет подарки,
 * когда их карточка доиграла. Какие подарки держать в списке, пока их нет в свежем ответе, решает
 * `holds`: ждущий ответа, забранный, лопающийся и отказанный.
 *
 * Отказ ручки (`gift_not_claimable`, `gift_not_found`) говорит её текстом на языке водителя, и список
 * перечитывается: подарка у водителя уже нет. Карточка при этом стоит со строкой отказа, пока шторка
 * открыта или водитель в разделе (`dismissDenied`, `settle`). Сеть и прочие сбои — «Не удалось
 * забрать подарок…», подарок можно забрать снова.
 */

const GIFT_DENIALS: ReadonlySet<string> = new Set<MemberGiftDenialCode>(['gift_not_found', 'gift_not_claimable']);

/** Шаг лопания при «Забрать всё» — как в макете и на `/design`. */
const TAKE_ALL_STEP_MS = 480;

export const useMemberGifts = (
  readInitData: () => string,
  hooks: {
    /** Баланс после зачисления — в общий источник: шапка и главная наберут к нему. */
    setBalance: (balancePoints: number) => void;
    /** Перечитать список подарков: после отказа он врёт. */
    reload: () => Promise<void>;
    /** Подарок уходит из списка. */
    remove: (rewardId: string) => void;
    /** «Не удалось забрать подарок. Попробуйте ещё раз.» на языке водителя. */
    readTakeFailed: () => string;
  },
) => {
  const busy = ref<string[]>([]);
  const popping = ref<string[]>([]);
  const errors = ref<Record<string, string>>({});
  const takingAll = ref(false);

  /** Запрос в пути — поштучный или в «Забрать всё». */
  const inFlight = new Set<string>();
  /** Баллы на балансе, карточка ждёт своей очереди лопнуть. */
  const claimed = new Set<string>();
  /** Отказанные ручкой: подарка у водителя нет, карточка стоит ради строки отказа. */
  const denied = new Set<string>();
  /** Ушли с экрана, пока запрос был в пути: карточки нет, лопать нечего. */
  const abandoned = new Set<string>();
  const popTimers = new Set<ReturnType<typeof setTimeout>>();
  /** Раньше этого времени следующий подарок «Забрать всё» не лопается. */
  let nextPopAt = 0;

  const holds = (rewardId: string): boolean =>
    inFlight.has(rewardId) || claimed.has(rewardId) || denied.has(rewardId) || popping.value.includes(rewardId);

  const setError = (rewardId: string, text: string | null): void => {
    const { [rewardId]: _dropped, ...rest } = errors.value;

    errors.value = text === null ? rest : { ...rest, [rewardId]: text };
  };

  const pop = (rewardId: string): void => {
    claimed.delete(rewardId);
    popping.value = [...popping.value, rewardId];
  };

  /** Лопание по очереди: не раньше, чем через шаг после предыдущего. */
  const popInTurn = (rewardId: string): void => {
    const now = Date.now();
    const delay = Math.max(0, nextPopAt - now);

    nextPopAt = now + delay + TAKE_ALL_STEP_MS;

    if (delay === 0) {
      pop(rewardId);

      return;
    }

    const timer = setTimeout(() => {
      popTimers.delete(timer);
      pop(rewardId);
    }, delay);

    popTimers.add(timer);
  };

  /** Один запрос «Забрать». `true` — баллы на балансе, карточку пора лопать. */
  const claim = async (rewardId: string): Promise<boolean> => {
    inFlight.add(rewardId);
    setError(rewardId, null);

    try {
      const response = await $fetch<MiniAppGiftClaimResponse>(
        `/api/miniapp/gifts/${encodeURIComponent(rewardId)}/claim`,
        { method: 'POST', headers: { [INIT_DATA_HEADER]: readInitData() } },
      );

      hooks.setBalance(response.balancePoints);

      if (abandoned.delete(rewardId)) {
        hooks.remove(rewardId);

        return false;
      }

      claimed.add(rewardId);

      return true;
    } catch (error) {
      console.error('[miniapp] подарок не забрался', error);

      const code = failureCode(error);
      const refused = code !== null && GIFT_DENIALS.has(code);

      if (abandoned.delete(rewardId)) {
        if (refused) {
          hooks.remove(rewardId);
        }
      } else if (refused) {
        denied.add(rewardId);
        setError(rewardId, failureMessage(error) ?? hooks.readTakeFailed());
      } else {
        setError(rewardId, hooks.readTakeFailed());
      }

      if (refused) {
        void hooks.reload();
      }

      return false;
    } finally {
      inFlight.delete(rewardId);
    }
  };

  /** «Забрать» у одной карточки: ожидание на её кнопке, удача — лопается сразу. */
  const take = async (rewardId: string): Promise<void> => {
    if (takingAll.value || holds(rewardId)) {
      return;
    }

    busy.value = [...busy.value, rewardId];

    const taken = await claim(rewardId);

    busy.value = busy.value.filter((busyId) => busyId !== rewardId);

    if (taken) {
      pop(rewardId);
    }
  };

  /**
   * «Забрать всё» — по подарку за раз, в порядке списка, каждый своим запросом и своим исходом
   * (решение Руслана 24-09-2026): забранные лопаются по очереди, незабранные остаются со своей
   * ошибкой. Отказанные раньше не повторяются — их подарка у водителя уже нет.
   */
  const takeAll = async (rewardIds: readonly string[]): Promise<void> => {
    if (takingAll.value) {
      return;
    }

    takingAll.value = true;
    nextPopAt = 0;
    rewardIds.filter((rewardId) => !denied.has(rewardId)).forEach((rewardId) => setError(rewardId, null));

    try {
      for (const rewardId of rewardIds) {
        if (!holds(rewardId) && (await claim(rewardId))) {
          popInTurn(rewardId);
        }
      }
    } finally {
      takingAll.value = false;
    }
  };

  /** Место карточки схлопнулось — подарка больше нет нигде. */
  const popped = (rewardId: string): void => {
    popping.value = popping.value.filter((poppingId) => poppingId !== rewardId);
    setError(rewardId, null);
    hooks.remove(rewardId);
  };

  /** Шторка закрыта: отказанные уходят вместе со строкой отказа, прочие ошибки гаснут. */
  const dismissDenied = (): void => {
    denied.forEach((rewardId) => hooks.remove(rewardId));
    denied.clear();
    errors.value = {};
  };

  /**
   * Водитель ушёл с экрана: карточек под ним больше нет, и доиграть им негде. Забранные уходят
   * из списка сразу, отказанные — тоже, запросы в пути доигрывают без карточки.
   */
  const settle = (): void => {
    popTimers.forEach((timer) => clearTimeout(timer));
    popTimers.clear();
    [...popping.value, ...claimed].forEach((rewardId) => hooks.remove(rewardId));
    popping.value = [];
    claimed.clear();
    inFlight.forEach((rewardId) => abandoned.add(rewardId));
    busy.value = [];
    dismissDenied();
  };

  /**
   * Отметка «шторку видел» — всем показанным. Ответ не ждётся и отказ не показывается: не дошла —
   * шторка покажется сама при следующем открытии приложения.
   */
  const markShown = (rewardIds: readonly string[]): void => {
    const body: MiniAppGiftsShownBody = { rewardIds: [...rewardIds] };

    $fetch('/api/miniapp/gifts/shown', {
      method: 'POST',
      headers: { [INIT_DATA_HEADER]: readInitData() },
      body,
    }).catch((error: unknown) => {
      console.error('[miniapp] отметка «шторку видел» не записалась', error);
    });
  };

  onScopeDispose(() => popTimers.forEach((timer) => clearTimeout(timer)));

  return { busy, popping, errors, takingAll, holds, take, takeAll, popped, dismissDenied, settle, markShown };
};
