import { computed, ref } from 'vue';
import { formatPhone } from '#shared/phone';
import {
  INIT_DATA_HEADER,
  type ApplicationScreenTexts,
  type CandidateApplicationView,
  type Language,
  type MemberOffice,
  type MiniAppApplicationRequestBody,
  type MiniAppApplicationResponse,
  type MiniAppApplicationScreen,
  type MiniAppApplicationSentScreen,
} from '#shared/types/miniapp';
import type { TelegramWebApp } from '~/composables/useTelegramWebApp';
import type { MemberOfficeView } from '~/types/memberView';
import { failureCode } from '~/utils/requestError';

/**
 * Заявка кандидата в Mini App (issue #456): экран заявки, окна Telegram, отправка, повтор
 * и исходы. Страница выбирает стадию по ответу сервера и рисует компоненты — решения здесь.
 *
 * Путь: имя → «Отправить заявку» → окно номера (`requestContact`) → окно «Разрешить боту писать»,
 * только если писать боту ещё нельзя → `POST /api/miniapp/applications`. На Telegram, где окна
 * номера нет, номер вводится руками, и окон нет вовсе.
 *
 * Состояния ожидания без выхода нет: окно номера, закрытое свайпом, колбэк не зовёт вовсе
 * (docs/miniapp.md), поэтому кнопка гаснет только на время запроса к серверу — его конец
 * приходит всегда.
 */

/** Что сейчас на экране: заявка или один из исходов. */
type ApplicationView = 'form' | 'accepted' | 'repeat' | 'failed';

type ApplicationScreenState = MiniAppApplicationScreen | MiniAppApplicationSentScreen;

/** Версия Bot API, с которой есть окна номера и «Разрешить боту писать». */
const CONTACT_WINDOWS_VERSION = '6.9';

const PARK_TIME_ZONE = 'Asia/Tashkent';

/** День `YYYY-MM-DD` по Ташкенту. */
const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: PARK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DAY_MS = 24 * 60 * 60 * 1_000;

/** День словом — «8 октября», «8-oktabr»: форму слова даёт `Intl` на языке экрана, как на сервере. */
const DAY_MONTH_WORD: Readonly<Record<Language, Intl.DateTimeFormat>> = {
  ru: new Intl.DateTimeFormat('ru-RU', { timeZone: PARK_TIME_ZONE, day: 'numeric', month: 'long' }),
  uz: new Intl.DateTimeFormat('uz-Latn-UZ', { timeZone: PARK_TIME_ZONE, day: 'numeric', month: 'long' }),
};

/**
 * День заявки на «Заявка уже отправлена»: сегодня и вчера — словами, иначе день и месяц.
 * Сутки — по Ташкенту, как у всего, что видит водитель.
 */
const submittedDay = (submittedAt: string, texts: ApplicationScreenTexts, language: Language, now: Date): string => {
  const moment = new Date(submittedAt);
  const day = DAY_KEY.format(moment);

  if (day === DAY_KEY.format(now)) {
    return texts.dateToday;
  }

  if (day === DAY_KEY.format(new Date(now.getTime() - DAY_MS))) {
    return texts.dateYesterday;
  }

  // Неразрывно: «8 октября» не разрывается переносом строки.
  return texts.dateDay.replaceAll('{date}', DAY_MONTH_WORD[language].format(moment).replaceAll(' ', ' '));
};

/** Строка с номером частями: номер экран ставит белым. */
const splitLead = (template: string, phone: string): { before: string; phone: string; after: string } => {
  const [before = '', after = ''] = template.split('{phone}');

  return { before, phone, after };
};

const officeView = (office: MemberOffice, texts: ApplicationScreenTexts): MemberOfficeView => ({
  label: texts.officeLabel,
  name: office.name,
  address: office.address,
  hours: office.workHours,
  phone: office.phone === null ? null : formatPhone(office.phone).display,
  mapUrl: office.mapUrl,
});

export type CandidateApplicationDependencies = {
  initData: () => string;
  webApp: () => TelegramWebApp | null;
  /**
   * Перечитать состояние приложения: ответ «участник» или «сотрудник» значит, что экран заявки
   * этому человеку не положен, и показать надо его настоящий экран.
   */
  reload: () => Promise<void>;
  /** Заявка принята — цель Метрики. */
  onAccepted: () => void;
};

export const useCandidateApplication = (dependencies: CandidateApplicationDependencies) => {
  const screen = ref<ApplicationScreenState | null>(null);
  const language = ref<Language>('ru');
  const view = ref<ApplicationView>('form');
  const application = ref<CandidateApplicationView | null>(null);

  const name = ref('');
  const manualPhone = ref('');
  /** В окне номера нажали «Отмена». */
  const declined = ref(false);
  /** Запрос к серверу в пути. */
  const sending = ref(false);

  /** Тело последней отправки — повтор после сбоя уходит им же, без окон Telegram. */
  let lastBody: MiniAppApplicationRequestBody | null = null;

  /** Показывает экран из ответа `GET /api/miniapp/me`. «Заявка уже отправлена» — это исход `repeat`. */
  const open = (state: ApplicationScreenState): void => {
    screen.value = state;
    language.value = state.language;
    declined.value = false;
    sending.value = false;
    lastBody = null;

    if (state.screen === 'application_sent') {
      application.value = {
        name: state.name,
        phone: state.phone,
        submittedAt: state.submittedAt,
        writeAllowed: state.writeAllowed,
      };
      view.value = 'repeat';

      return;
    }

    application.value = null;
    view.value = 'form';
  };

  /**
   * Telegram без окна номера: `requestContact` и `requestWriteAccess` появились в Bot API 6.9.
   * Нечем сравнить версию — тоже старый: сравнение появилось ещё раньше.
   */
  const oldClient = computed(() => {
    const webApp = dependencies.webApp();

    return !(webApp?.isVersionAtLeast?.(CONTACT_WINDOWS_VERSION) ?? false) || !webApp?.requestContact;
  });

  const texts = computed(() => screen.value?.texts[language.value] ?? null);

  const send = async (body: MiniAppApplicationRequestBody): Promise<void> => {
    lastBody = body;
    sending.value = true;

    try {
      const response = await $fetch<MiniAppApplicationResponse>('/api/miniapp/applications', {
        method: 'POST',
        headers: { [INIT_DATA_HEADER]: dependencies.initData() },
        body,
      });

      application.value = {
        name: response.name,
        phone: response.phone,
        submittedAt: response.submittedAt,
        writeAllowed: response.writeAllowed,
      };
      language.value = response.language;
      view.value = response.outcome;

      if (response.outcome === 'accepted') {
        dependencies.onAccepted();
      }
    } catch (error) {
      // Участник и сотрудник заявку не подают: экран перечитывается и становится их экраном.
      const code = failureCode(error);

      if (code === 'member' || code === 'employee') {
        await dependencies.reload();

        return;
      }

      // Сеть, сервер, таймаут и остальные отказы — сбой отправки с повтором тем же телом.
      console.error('[miniapp] заявка кандидата не отправлена', error);
      view.value = 'failed';
    } finally {
      sending.value = false;
    }
  };

  /**
   * «Отправить заявку»: окно номера, окно «Разрешить боту писать» — если писать боту ещё нельзя, —
   * и отправка. «Отмена» в окне номера — заявка не уходит, над кнопкой объяснение; закрытие окна
   * свайпом не зовёт ничего, и кнопка просто остаётся нажимаемой.
   */
  const submit = (): void => {
    if (sending.value) {
      return;
    }

    const base = { name: name.value, writeAccessGranted: false, language: language.value };

    if (oldClient.value) {
      void send({ ...base, contactData: null, manualPhone: manualPhone.value });

      return;
    }

    const webApp = dependencies.webApp();

    webApp?.requestContact?.((shared, contact) => {
      if (!shared || contact?.status !== 'sent' || !contact.response) {
        declined.value = true;

        return;
      }

      declined.value = false;
      const contactData = contact.response;
      const requestWriteAccess = webApp.requestWriteAccess;

      // Писать уже можно — второе окно незачем: ответ сервер возьмёт из `initData`.
      if (webApp.initDataUnsafe?.user?.allows_write_to_pm === true || !requestWriteAccess) {
        void send({ ...base, contactData, manualPhone: null });

        return;
      }

      // «Не разрешать» — заявка уходит всё равно, менеджер позвонит.
      requestWriteAccess((granted) => {
        void send({ ...base, contactData, manualPhone: null, writeAccessGranted: granted === true });
      });
    });
  };

  /** «Отправить заявку ещё раз» — то же тело, без окон Telegram. */
  const retry = (): void => {
    if (lastBody && !sending.value) {
      void send(lastBody);
    }
  };

  /** «Написать менеджеру» — чат с ботом внутри Telegram. */
  const writeManager = (): void => {
    const url = screen.value?.managerChatUrl;

    if (url) {
      dependencies.webApp()?.openTelegramLink?.(url);
    }
  };

  /** Свойства `MemberApplicationForm`. */
  const form = computed(() => {
    const current = texts.value;

    return view.value === 'form' && current
      ? { texts: current, language: language.value, old: oldClient.value, declined: declined.value, busy: sending.value }
      : null;
  });

  /** Свойства `MemberApplicationOutcome`. */
  const outcome = computed(() => {
    const current = texts.value;
    const state = screen.value;

    if (view.value === 'form' || !current || !state) {
      return null;
    }

    const shared = {
      language: language.value,
      officeTitle: current.officeTitle,
      offices: state.offices.map((office) => officeView(office, current)),
      mapLabel: current.mapLabel,
      writeManager: current.writeManager,
    };

    if (view.value === 'failed') {
      return {
        ...shared,
        kind: 'failed' as const,
        title: current.failedTitle,
        lead: { before: current.failedLead, phone: '', after: '' },
        send: current.failedSend,
        error: current.failedError,
        sending: current.sending,
        busy: sending.value,
      };
    }

    const sent = application.value;

    if (!sent) {
      return null;
    }

    if (view.value === 'accepted') {
      return {
        ...shared,
        kind: 'accepted' as const,
        title: current.acceptedTitle.replaceAll('{name}', sent.name),
        lead: splitLead(sent.writeAllowed ? current.leadWrite : current.leadCall, sent.phone),
      };
    }

    const template = sent.writeAllowed ? current.repeatLeadWrite : current.repeatLeadCall;

    return {
      ...shared,
      kind: 'repeat' as const,
      title: current.repeatTitle.replaceAll('{name}', sent.name),
      lead: splitLead(
        template.replaceAll('{date}', submittedDay(sent.submittedAt, current, language.value, new Date())),
        sent.phone,
      ),
    };
  });

  return {
    screen,
    language,
    view,
    name,
    manualPhone,
    form,
    outcome,
    open,
    submit,
    retry,
    writeManager,
  };
};
