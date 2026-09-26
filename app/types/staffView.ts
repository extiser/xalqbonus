import type { MemberLineView } from '~/types/memberView';

/**
 * Что получают компоненты экранов сотрудника в Mini App (issue #250) — готовыми строками.
 * Собирает их `app/utils/staffViews.ts` из ответов ручек; компоненты не знают контракта сервера.
 */

/** Офис на выборе офиса и в шторке «Сменить». */
export interface StaffOfficeView {
  id: string;
  name: string;
  address: string;
  /** «Ждут выдачи: 3». Нет — никто не ждёт, и строки нет вовсе. */
  awaiting?: string;
}

/** Строка списка «Ждут выдачи» у стойки: заказ или награда. */
export interface StaffDeskRowView {
  id: string;
  /** Вид — цвет метки: заказ зелёный, награда золотая. */
  tone: 'order' | 'reward';
  /** Метка сверху: «Заказ #1042», «Награда · из акции». */
  label: string;
  /** Что: «3 товара · 1 250 баллов» или название приза. */
  title: string;
  /** «Фамилия Имя · позывной» — выделено. Нет ни имени, ни позывного — пусто. */
  driver?: string;
  /** «сегодня, 13:52». */
  when: string;
}

/** Водитель на карточке заказа и награды. */
export interface StaffDriverView {
  /** Первая строка — фамилия. Нет — имени в профиле нет, и шапки карточки нет. */
  lastName?: string;
  givenNames?: string;
  callsign?: string;
  phone?: { display: string; href: string };
}

/** Строка сроков под карточкой: «Оформлен · 26.09, 12:10». */
export interface StaffDateView {
  label: string;
  value: string;
}

export interface StaffOrderView {
  /** «Заказ #1042». */
  title: string;
  driver: StaffDriverView;
  lines: MemberLineView[];
  /** «Сумма» числом: «1 250». */
  total: string;
  dates: StaffDateView[];
  /** Шторка «Выдать заказ #1042?» и «Отменить заказ #1042?». */
  issueTitle: string;
  issueSubtitle: string[];
  cancelTitle: string;
  cancelSubtitle: string[];
}

export interface StaffRewardView {
  driver: StaffDriverView;
  prize: {
    /** «Награда · из акции», «Награда · вручил парк». */
    label: string;
    title: string;
    /** «„Неделя возвращения“, сундук дня». Нет — подписи нет. */
    caption?: string;
    /** У произвольной награды фото нет — значок подарка. */
    icon?: 'gift';
  };
  dates: StaffDateView[];
  /** Шторка «Выдать награду?»: водитель и название. */
  issueSubtitle: string[];
}

/** Плашка исхода у стойки: выдано или отменено — зелёная, отказ — алая. */
export type StaffOutcomeView =
  | {
      tone: 'ok';
      /** «Выдано · заказ #1042». */
      text: string;
      /** «Алиев Шерзод» — белым после точки. Нет имени — нет и его. */
      name?: string;
    }
  | { tone: 'fail'; text: string };

/** Офис сотрудника в профиле: название и адрес. */
export interface StaffProfileOfficeView {
  id: string;
  name: string;
  address: string;
}
