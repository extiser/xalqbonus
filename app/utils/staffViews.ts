import type { MiniAppEmployeeScreen } from '#shared/types/miniapp';
import type { DeskOffice, OfficeOrder } from '#shared/types/orders';
import type { DeskItemResponse, OfficeReward } from '#shared/types/rewards';
import type { MemberLineView } from '~/types/memberView';
import type {
  StaffDeskRowView,
  StaffDriverView,
  StaffOfficeView,
  StaffOrderView,
  StaffOutcomeView,
  StaffRewardView,
} from '~/types/staffView';
import { DISPLAY_TIME_ZONE, formatDate, pluralize } from '~/utils/format';
import { formatPoints, photoUrl } from '~/utils/memberViews';

/**
 * Экраны сотрудника в Mini App (issue #250): ответы ручек стойки — в готовые строки компонентов.
 *
 * Тексты здесь, а не в словаре сервера: служебная часть одноязычна, и экраны сотрудника
 * говорят по-русски на клиенте (docs/frontend.md → «Язык»). Слова — дословно из макетов
 * `_reference/design/staff/`.
 */

/** Роль словом — в шапке и в профиле. */
export const STAFF_ROLE_LABELS: Readonly<Record<MiniAppEmployeeScreen['role'], string>> = {
  owner: 'Владелец',
  admin: 'Админ',
  manager: 'Менеджер',
};

/**
 * Номер пункта пароля — одно на экран и бота. Его же дословно цитирует бот после принятия
 * приглашения (`invite_accepted` в `server/bot/texts.ts`): меняется здесь — меняется и там.
 */
export const EMPLOYEE_PASSWORD_LABEL = 'Пароль для входа с компьютера';

/** Имени в профиле водителя нет — чем его заменить в вопросе шторки. */
const NAME_MISSING = 'Имени в профиле нет — сверьте позывной';

const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const CLOCK = new Intl.DateTimeFormat('ru-RU', {
  timeZone: DISPLAY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * «Когда» в строке стойки: «сегодня, 13:52», «вчера, 18:44», раньше — «24.09, 16:05».
 *
 * Сутки календарные, от полуночи по Ташкенту, — как у дней в истории баллов сейчас
 * (`formatDayKey` на сервере): «вчера» у стойки и в истории означает одно и то же.
 */
export const formatDeskMoment = (value: string, now: Date): string => {
  const moment = new Date(value);
  const day = DAY_KEY.format(moment);

  if (day === DAY_KEY.format(now)) {
    return `сегодня, ${CLOCK.format(moment)}`;
  }

  if (day === DAY_KEY.format(new Date(now.getTime() - DAY_MS))) {
    return `вчера, ${CLOCK.format(moment)}`;
  }

  return formatDate(value);
};

const pointsWord = (points: number): string => pluralize(points, 'балл', 'балла', 'баллов');

/** Сколько штук в заказе — сумма количеств по строкам, со словом: «3 товара». */
const orderQuantity = (order: OfficeOrder): string => {
  const quantity = order.lines.reduce((sum, line) => sum + line.quantity, 0);

  return `${quantity} ${pluralize(quantity, 'товар', 'товара', 'товаров')}`;
};

const orderPoints = (order: OfficeOrder): string => `${formatPoints(order.totalPoints)} ${pointsWord(order.totalPoints)}`;

/** «Фамилия Имя · позывной». Нет ни того, ни другого — `undefined`. */
const driverLine = (driverName: string | null, callsign: string | null): string | undefined => {
  const parts = [driverName, callsign].filter((part): part is string => part !== null && part !== '');

  return parts.length === 0 ? undefined : parts.join(' · ');
};

/** Водитель в подзаголовке шторки: без имени вопрос просит сверить позывной. */
const sheetDriverLine = (driverName: string | null, callsign: string | null): string =>
  driverLine(driverName ?? NAME_MISSING, callsign) ?? NAME_MISSING;

/** Метка награды: откуда она. */
const rewardLabel = (reward: OfficeReward): string =>
  reward.source === 'campaign' ? 'Награда · из акции' : 'Награда · вручил парк';

/**
 * Подпись приза на карточке: у награды акции — «„Название акции“» и через запятую пояснение,
 * у ручной — пояснение. Нечего сказать — подписи нет.
 */
const rewardCaption = (reward: OfficeReward): string | undefined => {
  if (reward.source === 'campaign') {
    const parts = [reward.campaignTitle ? `„${reward.campaignTitle}“` : null, reward.sourceNote].filter(
      (part): part is string => part !== null && part !== '',
    );

    return parts.length === 0 ? undefined : parts.join(', ');
  }

  return reward.sourceNote ?? undefined;
};

export const staffOfficeView = (office: DeskOffice): StaffOfficeView => ({
  id: office.officeId,
  name: office.name,
  address: office.address,
  awaiting: office.awaitingCount > 0 ? `Ждут выдачи: ${office.awaitingCount}` : undefined,
});

export const deskItemId = (item: DeskItemResponse): string =>
  item.kind === 'order' ? item.order.orderId : item.reward.rewardId;

export const staffDeskRowView = (item: DeskItemResponse, now: Date): StaffDeskRowView => {
  if (item.kind === 'order') {
    const { order } = item;

    return {
      id: order.orderId,
      tone: 'order',
      label: `Заказ #${order.number}`,
      title: `${orderQuantity(order)} · ${orderPoints(order)}`,
      driver: driverLine(order.driverName, order.callsign),
      when: formatDeskMoment(order.createdAt, now),
    };
  }

  const { reward } = item;

  return {
    id: reward.rewardId,
    tone: 'reward',
    label: rewardLabel(reward),
    title: reward.title,
    driver: driverLine(reward.driverName, reward.callsign),
    when: formatDeskMoment(reward.createdAt, now),
  };
};

/**
 * Водитель на карточке. Имя приходит одной строкой «Фамилия Имя», собранной сервером в этом
 * порядке (`deskDriverName`), и делится по первому пробелу: фамилия — первой строкой, остальное —
 * второй.
 */
const staffDriverView = (driverName: string | null, callsign: string | null, phone: string | null): StaffDriverView => {
  const name = driverName?.trim() ?? '';
  const space = name.indexOf(' ');

  return {
    lastName: name === '' ? undefined : space === -1 ? name : name.slice(0, space),
    givenNames: space === -1 ? undefined : name.slice(space + 1),
    callsign: callsign ?? undefined,
    // Номер из реестра бывает с пробелами и скобками: в ссылку звонка — только плюс и цифры.
    phone: phone ? { display: phone, href: `tel:${phone.replace(/[^\d+]/g, '')}` } : undefined,
  };
};

export const staffOrderView = (order: OfficeOrder): StaffOrderView => {
  const lines: MemberLineView[] = order.lines.map((line) => ({
    id: line.productId,
    title: line.name,
    caption: `${line.quantity} шт. × ${formatPoints(line.unitPoints)}`,
    image: photoUrl(line.photoPath, line.photoUpdatedAt),
    price: formatPoints(line.quantity * line.unitPoints),
  }));
  const driver = sheetDriverLine(order.driverName, order.callsign);

  return {
    title: `Заказ #${order.number}`,
    driver: staffDriverView(order.driverName, order.callsign, order.phone),
    lines,
    total: formatPoints(order.totalPoints),
    dates: [
      { label: 'Оформлен', value: formatDate(order.createdAt) },
      { label: 'Забрать до', value: formatDate(order.expiresAt) },
    ],
    issueTitle: `Выдать заказ #${order.number}?`,
    issueSubtitle: [driver, `${orderQuantity(order)} на сумму ${orderPoints(order)}`],
    cancelTitle: `Отменить заказ #${order.number}?`,
    cancelSubtitle: [driver, 'Баллы вернутся водителю, товар — в остатки.'],
  };
};

export const staffRewardView = (reward: OfficeReward): StaffRewardView => ({
  driver: staffDriverView(reward.driverName, reward.callsign, reward.phone),
  prize: {
    label: rewardLabel(reward),
    title: reward.title,
    caption: rewardCaption(reward),
    image: photoUrl(reward.photoPath, reward.photoUpdatedAt),
    icon: reward.kind === 'custom' ? 'gift' : undefined,
  },
  dates: [
    { label: 'Вручена', value: formatDate(reward.createdAt) },
    { label: 'Забрать до', value: formatDate(reward.expiresAt) },
  ],
  issueSubtitle: [sheetDriverLine(reward.driverName, reward.callsign), reward.title],
});

/** Плашка после выдачи: «Выдано · заказ #1042 · Алиев Шерзод», «Выдано · Тряпка · Алиев Шерзод». */
export const issuedOutcome = (item: DeskItemResponse): StaffOutcomeView =>
  item.kind === 'order'
    ? { tone: 'ok', text: `Выдано · заказ #${item.order.number}`, name: item.order.driverName ?? undefined }
    : { tone: 'ok', text: `Выдано · ${item.reward.title}`, name: item.reward.driverName ?? undefined };

/** Плашка после отмены: «Отменено · заказ #1042 · Алиев Шерзод». */
export const cancelledOutcome = (order: OfficeOrder): StaffOutcomeView => ({
  tone: 'ok',
  text: `Отменено · заказ #${order.number}`,
  name: order.driverName ?? undefined,
});
