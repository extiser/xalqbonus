import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { failureText } from '~/utils/requestError';

/**
 * Черновик, который сохраняет себя сам (issue #148).
 *
 * Запись заводится при первом действии, а не при открытии формы, и дальше правка уезжает
 * в базу с задержкой после того, как перестали печатать. Отдельного «Сохранить» у черновика
 * нет: запуск рассылки и публикация товара судят по сохранённому, а человек смотрит
 * на экран — и поправленная опечатка, не уехавшая в базу, ушла бы водителям прежней
 * (прогон 15-09-2026).
 *
 * **Истина — то, что на экране.** Поля формы принадлежат странице и ответом сервера
 * не перезаписываются: иначе знаки, набранные, пока шёл запрос, пропадали бы. Что сохранено,
 * композабл помнит снимком полей, и «есть несохранённое» — это расхождение экрана со снимком.
 *
 * Запросы идут по одному: правка, пришедшая во время запроса, уезжает следующим, а не рядом —
 * два параллельных `PATCH` приходили бы в базу в любом порядке.
 *
 * Как сохранять, решает страница (`save`): заводит черновик, если записи ещё нет, или правит
 * заведённую. Композабл за данными не ходит и про ручки не знает.
 */

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed';

/** Сколько ждать после последнего знака. Меньше — запрос на каждую букву, больше — «не сохранилось». */
const AUTOSAVE_DELAY_MS = 800;

type AutosaveOptions<Fields extends Record<string, string>> = {
  /** Поля формы — то, что на экране. */
  fields: Ref<Fields>;
  /** Сохраняет снимок полей. Отказ — исключением: его текст встанет рядом с отметкой. */
  save: (snapshot: Fields) => Promise<void>;
  /** Сохраняет ли себя форма сейчас: опубликованный товар и запущенная рассылка — нет. */
  enabled: () => boolean;
};

export const useDraftAutosave = <Fields extends Record<string, string>>(
  options: AutosaveOptions<Fields>,
) => {
  const state = ref<AutosaveState>('idle');
  const error = ref<string | null>(null);

  const serialize = (fields: Fields): string => JSON.stringify(fields);

  /** Снимок того, что лежит в базе. Поля, равные ему, сохранять не нужно. */
  let savedSnapshot = serialize(options.fields.value);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<boolean> | null = null;

  const isDirty = (): boolean => serialize(options.fields.value) !== savedSnapshot;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const saveOnce = async (): Promise<boolean> => {
    const snapshot = serialize(options.fields.value);

    state.value = 'saving';
    error.value = null;

    try {
      await options.save(JSON.parse(snapshot) as Fields);
      savedSnapshot = snapshot;

      return true;
    } catch (failure) {
      state.value = 'failed';
      error.value = failureText(failure);

      return false;
    }
  };

  /**
   * Досохраняет всё, что есть на экране. `force` — сохранить, даже если полей не трогали:
   * так заводится черновик, когда первым действием выбрали файл.
   *
   * `false` — сохранить не вышло, причина в `error`.
   */
  const drain = async (force: boolean): Promise<boolean> => {
    clearTimer();

    while (running) {
      await running;
    }

    let mustSave = force;

    while (mustSave || isDirty()) {
      mustSave = false;
      running = saveOnce();

      const saved = await running;

      running = null;

      if (!saved) {
        return false;
      }
    }

    if (state.value === 'saving') {
      state.value = 'saved';
    }

    return true;
  };

  watch(
    options.fields,
    () => {
      if (!options.enabled() || !isDirty()) {
        return;
      }

      state.value = 'saving';
      clearTimer();
      timer = setTimeout(() => void drain(false), AUTOSAVE_DELAY_MS);
    },
    { deep: true },
  );

  /**
   * Подменяет поля прочитанной записью — при переходе к другой записи. Подменённое считается
   * сохранённым: оно только что пришло из базы.
   */
  const replace = (next: Fields): void => {
    clearTimer();
    options.fields.value = next;
    savedSnapshot = serialize(next);
    state.value = 'idle';
    error.value = null;
  };

  /**
   * Бросает несохранённое — перед удалением черновика: правка, уехавшая после удаления,
   * ответила бы «такой записи нет». Ждёт запрос, который уже в пути.
   */
  const discard = async (): Promise<void> => {
    clearTimer();

    while (running) {
      await running;
    }

    savedSnapshot = serialize(options.fields.value);
    state.value = 'idle';
  };

  /**
   * Открыт ли диалог «правка не сохранилась». Рисует его страница — `ConfirmDialog`, тот же,
   * что у опубликованного товара: композабл разметки не знает, а браузерный `confirm` в вебе
   * не используется.
   */
  const leaveFailureOpen = ref(false);
  let answerLeave: ((leave: boolean) => void) | null = null;

  // Уход со страницы досохраняет набранное и, если вышло, ничего не спрашивает. Не вышло —
  // переход ждёт ответа диалога, а не теряет правку молча.
  onBeforeRouteLeave(async () => {
    if (!options.enabled() || (await drain(false))) {
      return true;
    }

    leaveFailureOpen.value = true;

    return new Promise<boolean>((resolve) => {
      answerLeave = resolve;
    });
  });

  /** Ответ диалога: `true` — уйти без несохранённой правки. */
  const resolveLeave = (leave: boolean): void => {
    leaveFailureOpen.value = false;
    answerLeave?.(leave);
    answerLeave = null;
  };

  /**
   * Перезагрузку и закрытие вкладки дождаться нельзя — можно только предупредить.
   *
   * Предупреждаем, когда есть несохранённое: таймер автосохранения не сработал, запрос
   * не вернулся или последняя попытка провалилась (отметка «Не сохранено»). Третье — главное:
   * висящий таймер уедет сам, а провалившаяся правка не уедет, пока человек не наберёт что-то
   * ещё. Когда всё сохранено, вопрос браузера был бы ложной тревогой.
   */
  const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
    const unsaved = timer !== null || running !== null || state.value === 'failed';

    if (options.enabled() && unsaved) {
      event.preventDefault();
    }
  };

  onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload));

  onBeforeUnmount(() => {
    clearTimer();
    window.removeEventListener('beforeunload', warnBeforeUnload);
  });

  return {
    state,
    error,
    /** Досохранить набранное перед действием, которое судит по сохранённому. */
    flush: (): Promise<boolean> => drain(false),
    /** Сохранить сейчас, даже нетронутое, — чтобы запись появилась. */
    saveNow: (): Promise<boolean> => drain(true),
    replace,
    discard,
    leaveFailureOpen,
    resolveLeave,
  };
};
