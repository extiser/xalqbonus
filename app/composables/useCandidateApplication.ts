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
        submittedAtText: state.submittedAtText,
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
        submittedAtText: response.submittedAtText,
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

      // Строку контакта сервер не принял — подпись не сошлась или строка просрочена. Повтор той же
      // строкой не поможет никогда: экран заявки с вписанным именем, и «Отправить заявку» откроет
      // окно номера заново.
      if (code === 'contact_rejected') {
        lastBody = null;
        declined.value = false;
        view.value = 'form';

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
        template.replaceAll('{date}', sent.submittedAtText[language.value]),
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
