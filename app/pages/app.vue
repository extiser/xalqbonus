<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  INIT_DATA_HEADER,
  type Language,
  type MiniAppMemberScreen,
  type MiniAppRegisterResponse,
  type MiniAppStateResponse,
  type RegistrationScreenTexts,
} from '#shared/types/miniapp';
import { useMemberHistory } from '~/composables/useMemberHistory';
import {
  hasSignedInitData,
  loadTelegramWebApp,
  TELEGRAM_SDK_URL,
  type TelegramWebApp,
} from '~/composables/useTelegramWebApp';

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

useHead({
  title: 'XalqBonus',
  /**
   * Скрипт Telegram — тегом в `<head>` этой страницы, и только этой: веб-морда парка
   * ходить на `telegram.org` не должна, поэтому не `nuxt.config.ts`.
   *
   * Ни `async`, ни `defer`: обычный блокирующий тег в отрисованной сервером странице
   * исполняется до гидрации, то есть до того, как Vue Router тронет адрес и раскодирует
   * хеш с подписанной строкой. Вставка того же скрипта из `onMounted` опаздывает
   * ровно на это и получает огрызок вместо личности (issue #90).
   */
  script: [{ src: TELEGRAM_SDK_URL }],
});

/**
 * Два текста, которых нет в серверном словаре, — и не по недосмотру: показываются они ровно
 * тогда, когда сервер не ответил или его не спрашивали вовсе. Спросить у него перевод
 * в этот момент не у кого.
 *
 * На двух языках сразу, как экран выбора языка в боте: чей это человек, мы здесь ещё
 * не знаем. Всё остальное, включая ответ устаревшему клиенту, приезжает с сервера
 * на языке водителя — к тому моменту экран регистрации уже загружен.
 */
const OPEN_FROM_TELEGRAM =
  'Ilovani Telegram orqali oching. / Откройте приложение через Telegram.';
const LOAD_FAILED =
  "Ma'lumotlarni yuklab bo'lmadi. Qaytadan urinib ko'ring. / Не удалось загрузить данные. Попробуйте ещё раз.";

/** Что показываем прямо сейчас. Загрузка и отказ различаются намеренно: они значат разное. */
type Stage = 'loading' | 'error' | 'member' | 'registration';

const stage = ref<Stage>('loading');
const errorMessage = ref('');

/** Экран участника: баланс, имя, отметка свежести и обещание бонуса новичку. */
const member = ref<MiniAppMemberScreen | null>(null);

const texts = ref<Record<Language, RegistrationScreenTexts> | null>(null);
const language = ref<Language>('ru');
const sending = ref(false);
const result = ref<MiniAppRegisterResponse | null>(null);

let webApp: TelegramWebApp | null = null;

/**
 * История участника. Своим запросом, а не полем экрана: экран читается один раз, а история
 * листается кнопкой, и пересобирать ради каждой страницы весь экран незачем.
 */
const memberHistory = useMemberHistory(() => webApp?.initData ?? '');

const applyState = (state: MiniAppStateResponse): void => {
  if (state.screen === 'member') {
    member.value = state;
    stage.value = 'member';

    // История догружается следом, своим состоянием: её отказ гасит список, а не экран
    // с балансом — баланс уже прочитан и врать о нём нечему.
    void memberHistory.loadFirstPage();

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

/** Спрашивает сервер, что показать этому человеку, и показывает. */
const loadState = async (): Promise<void> => {
  if (!webApp) {
    return;
  }

  try {
    applyState(
      await $fetch<MiniAppStateResponse>('/api/miniapp/me', {
        headers: { [INIT_DATA_HEADER]: webApp.initData },
      }),
    );
  } catch (error) {
    // Текст на экране прежний — причина отказа водителю ничего не чинит. Но в консоли
    // она обязана быть: это единственное окно наружу, которое у Mini App есть, и без
    // записи `malformed` и `hash_mismatch` снаружи выглядят одинаково (issue #90).
    console.error('[miniapp] не удалось получить состояние экрана', error);
    failWith(LOAD_FAILED);
  }
};

onMounted(async () => {
  webApp = await loadTelegramWebApp();

  // Ни объекта Telegram, ни строки с подписью — значит страницу открыли не из мессенджера.
  // Это не поломка, и разбирать её незачем: человеку нужно сказать, где дверь.
  //
  // Признак — `hash` и `auth_date` в строке, а не её непустота: в обычном браузере SDK
  // отдаёт непустой огрызок, и по пустоте человек вне Telegram получал бы сообщение
  // о поломке вместо указания, где вход.
  if (!webApp || !hasSignedInitData(webApp.initData)) {
    failWith(OPEN_FROM_TELEGRAM);

    return;
  }

  webApp.ready();
  webApp.expand();

  await loadState();
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
      // участника. Экран участника перечитывается у сервера целиком, а не собирается
      // из ответа привязки: баланс, отметка свежести и обещание бонуса приходят оттуда же,
      // откуда придут при следующем открытии приложения, — иначе первый экран нового
      // участника отличался бы от всех последующих.
      await loadState();

      return;
    }

    result.value = response;
  } catch (error) {
    // Отказ ручки — не исход привязки: сервер до правил не дошёл, и говорить человеку
    // «подойдите в офис» не за что. В консоль пишется то, что случилось на самом деле.
    console.error('[miniapp] не удалось отправить номер на привязку', error);
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
    // Клиент старее Bot API 6.9: вызова в объекте нет вовсе, и номер внутри приложения
    // взять нечем. Текст свой, а не «откройте приложение через Telegram»: человек уже
    // в Telegram, и по той подсказке ему делать нечего — чинится это обновлением клиента.
    //
    // Нажать кнопку можно только с экрана регистрации, а значит тексты уже загружены
    // и язык выбран: ответ идёт на нём, а не на двух сразу.
    failWith(texts.value?.[language.value].outdatedClient ?? OPEN_FROM_TELEGRAM);

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

  <div v-else-if="stage === 'member' && member" class="flex flex-col gap-2">
    <OrganismsMemberSummary
      :balance-title="member.texts.balanceTitle"
      :balance="member.balance"
      :name="member.name"
      :updated-note="member.updatedNote"
      :promise="member.promise"
    />

    <OrganismsMemberHistory
      :state="memberHistory.state.value"
      :operations="memberHistory.operations.value"
      :has-more="memberHistory.nextCursor.value !== null"
      :loading-more="memberHistory.loadingMore.value"
      :more-failed="memberHistory.moreFailed.value"
      :texts="member.texts"
      @more="memberHistory.loadMore()"
    />
  </div>

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
