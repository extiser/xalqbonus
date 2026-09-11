<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  INIT_DATA_HEADER,
  type Language,
  type MiniAppRegisterResponse,
  type MiniAppStateResponse,
  type RegistrationScreenTexts,
} from '#shared/types/miniapp';
import { loadTelegramWebApp, type TelegramWebApp } from '~/composables/useTelegramWebApp';

/**
 * Экран водителя: регистрация в программе или приветствие участника.
 *
 * Личность приходит от Telegram подписанной строкой и уезжает на сервер заголовком
 * с каждым запросом. Своего входа и своей сессии здесь нет и не будет: они означали бы
 * учётную запись на четыре тысячи человек и восстановление доступа к ней
 * (docs/miniapp.md → «Личность приходит от мессенджера»).
 *
 * Всё происходит на клиенте: `initData` живёт в странице, открытой Telegram, и на сервере
 * при отрисовке её не существует. Поэтому запрос состояния идёт из `onMounted`, а не
 * через `useFetch`.
 */

definePageMeta({ layout: 'miniapp' });

useHead({ title: 'XalqBonus' });

/**
 * Два текста, которых нет в серверном словаре, — и не по недосмотру: показываются они ровно
 * тогда, когда сервер не ответил или его не спрашивали вовсе. Спросить у него перевод
 * в этот момент не у кого.
 *
 * На двух языках сразу, как экран выбора языка в боте: чей это человек, мы здесь ещё
 * не знаем.
 */
const OPEN_FROM_TELEGRAM =
  'Ilovani Telegram orqali oching. / Откройте приложение через Telegram.';
const LOAD_FAILED =
  "Ma'lumotlarni yuklab bo'lmadi. Qaytadan urinib ko'ring. / Не удалось загрузить данные. Попробуйте ещё раз.";

/** Что показываем прямо сейчас. Загрузка и отказ различаются намеренно: они значат разное. */
type Stage = 'loading' | 'error' | 'member' | 'registration';

const stage = ref<Stage>('loading');
const errorMessage = ref('');

/** Приветствие участника: имя и баланс. Собрано сервером на его собственном языке. */
const memberMessage = ref('');

const texts = ref<Record<Language, RegistrationScreenTexts> | null>(null);
const language = ref<Language>('ru');
const sending = ref(false);
const result = ref<MiniAppRegisterResponse | null>(null);

let webApp: TelegramWebApp | null = null;

const applyState = (state: MiniAppStateResponse): void => {
  if (state.screen === 'member') {
    memberMessage.value = state.message;
    stage.value = 'member';

    return;
  }

  texts.value = state.texts;
  language.value = state.language;
  stage.value = 'registration';
};

const failWith = (message: string): void => {
  errorMessage.value = message;
  stage.value = 'error';
};

onMounted(async () => {
  webApp = await loadTelegramWebApp();

  // Ни объекта Telegram, ни подписанной строки — значит страницу открыли не из мессенджера.
  // Это не поломка, и разбирать её незачем: человеку нужно сказать, где дверь.
  if (!webApp || webApp.initData.trim() === '') {
    failWith(OPEN_FROM_TELEGRAM);

    return;
  }

  webApp.ready();
  webApp.expand();

  try {
    applyState(
      await $fetch<MiniAppStateResponse>('/api/miniapp/me', {
        headers: { [INIT_DATA_HEADER]: webApp.initData },
      }),
    );
  } catch {
    failWith(LOAD_FAILED);
  }
});

/** Отправляет подписанную строку контакта на сервер и показывает исход. */
const register = async (contactData: string): Promise<void> => {
  if (!webApp) {
    return;
  }

  sending.value = true;

  try {
    const response = await $fetch<MiniAppRegisterResponse>('/api/miniapp/register', {
      method: 'POST',
      headers: { [INIT_DATA_HEADER]: webApp.initData },
      body: { contactData, language: language.value },
    });

    if (response.outcome === 'linked') {
      // Привязались — экрана регистрации у этого человека больше нет, как и у всякого
      // участника. Язык здесь уже его собственный: у перенесённого из старой базы тот,
      // что лежал в `person_settings`, а не выбранный минуту назад.
      memberMessage.value = response.message;
      stage.value = 'member';

      return;
    }

    result.value = response;
  } catch {
    // Отказ ручки — не исход привязки: сервер до правил не дошёл, и говорить человеку
    // «подойдите в офис» не за что.
    failWith(LOAD_FAILED);
  } finally {
    sending.value = false;
  }
};

/**
 * Нажатие «поделиться номером».
 *
 * Экран после нажатия не меняется и кнопка не гаснет. Причина не в удобстве: закрытие
 * системного окна свайпом не вызывает колбэк **вовсе** — ни ответа, ни события, — и любое
 * состояние ожидания здесь стало бы состоянием, из которого нет выхода (docs/miniapp.md).
 */
const share = (): void => {
  const requestContact = webApp?.requestContact;

  if (!requestContact) {
    // Клиент старее Bot API 6.9: номер у него внутри приложения взять нечем.
    failWith(OPEN_FROM_TELEGRAM);

    return;
  }

  requestContact((shared, contact) => {
    // Отказ возвращает экран в исходное состояние: кнопка на месте и нажимается снова.
    if (!shared || contact?.status !== 'sent' || !contact.response) {
      return;
    }

    void register(contact.response);
  });
};
</script>

<template>
  <p v-if="stage === 'loading'" class="py-10 text-center text-base text-slate-500">…</p>

  <p v-else-if="stage === 'error'" class="py-10 text-center text-base leading-relaxed text-red-700">
    {{ errorMessage }}
  </p>

  <p v-else-if="stage === 'member'" class="whitespace-pre-line py-6 text-lg leading-relaxed">
    {{ memberMessage }}
  </p>

  <OrganismsDriverRegistration
    v-else-if="texts"
    :texts="texts[language]"
    :language="language"
    :sending="sending"
    :result="result"
    @update:language="language = $event"
    @share="share"
  />
</template>
