import type { Language } from '#server/generated/prisma/enums';

/**
 * Тексты бота — ключами в коде, а не строками в базе.
 *
 * Таблица переводов старого бота не переносится (`#18`), а экранов здесь меньше десяти:
 * таблица ради них — это второе место, где живёт текст, и вопрос «почему бот сказал так»
 * начинает требовать запроса к базе.
 *
 * **Языка два, и они разные.** В старом боте из 236 строк переводов у 223 узбекский
 * побайтово равнялся русскому: язык спрашивался, писался в базу и показывал русский текст.
 * Здесь оба языка написаны по-настоящему; узбекский перед выкатом вычитывает парк,
 * и правится он здесь же — другого места у текста нет.
 */

/**
 * Ключи всех текстов бота — экранов диалога и уведомлений. Новый текст — новый ключ здесь,
 * и сразу оба языка.
 */
export type TextKey =
  | 'select_language'
  | 'button_language_ru'
  | 'button_language_uz'
  | 'ask_phone'
  | 'button_send_phone'
  | 'checking_phone'
  | 'contact_not_own'
  | 'linked'
  | 'linked_new'
  | 'not_in_registry'
  | 'not_in_park'
  | 'profile_fired'
  | 'several_profiles'
  | 'person_already_linked'
  | 'telegram_already_linked'
  | 'park_api_unavailable'
  | 'notification_welcome_bonus';

const TEXTS: Readonly<Record<TextKey, Readonly<Record<Language, string>>>> = {
  select_language: {
    ru: 'Tilni tanlang: / Выберите язык:',
    uz: 'Tilni tanlang: / Выберите язык:',
  },
  button_language_ru: { ru: '🇷🇺 Русский', uz: '🇷🇺 Русский' },
  button_language_uz: { ru: "🇺🇿 O'zbek", uz: "🇺🇿 O'zbek" },
  ask_phone: {
    ru: 'Нажмите кнопку ниже, чтобы отправить свой номер телефона — мы найдём вас в базе таксопарка.',
    uz: "Telefon raqamingizni yuborish uchun pastdagi tugmani bosing — biz sizni taksopark ma'lumotlar bazasidan topamiz.",
  },
  button_send_phone: {
    ru: '📱 Отправить номер телефона',
    uz: '📱 Telefon raqamini yuborish',
  },
  checking_phone: {
    ru: 'Проверяем ваш номер в базе таксопарка, это займёт несколько секунд…',
    uz: "Telefon raqamingiz taksopark ma'lumotlar bazasida tekshirilmoqda, bu bir necha soniya davom etadi…",
  },
  contact_not_own: {
    ru: 'Отправьте, пожалуйста, свой номер телефона кнопкой ниже — чужой контакт мы принять не можем.',
    uz: "Iltimos, pastdagi tugma bilan o'z telefon raqamingizni yuboring — boshqa shaxsning kontaktini qabul qila olmaymiz.",
  },
  linked: {
    ru: 'Добро пожаловать, {name}! Ваш баланс: {points}.',
    uz: 'Xush kelibsiz, {name}! Hisobingiz: {points}.',
  },
  linked_new: {
    ru: 'Добро пожаловать, {name}! Спасибо, что выбрали Xalq Taxi. Завершите первые 5 поездок и получите 300 баллов — их можно обменять на подарки в наших офисах.',
    uz: "Xush kelibsiz, {name}! Xalq Taxi'ni tanlaganingiz uchun rahmat. Birinchi 5 ta safarni yakunlang va 300 ball oling — ularni ofislarimizdagi sovg'alarga almashtirish mumkin.",
  },
  not_in_registry: {
    ru: 'Не получилось привязать номер автоматически — в данных таксопарка чего-то не хватает. Это чинится только в офисе: подойдите в любой офис Xalq Taxi с водительским удостоверением.',
    uz: "Raqamni avtomatik bog'lash imkoni bo'lmadi — taksopark ma'lumotlarida nimadir yetishmayapti. Bu faqat ofisda hal qilinadi: haydovchilik guvohnomangiz bilan Xalq Taxi'ning istalgan ofisiga murojaat qiling.",
  },
  /**
   * Четыре абзаца намеренно: исход несёт три разных положения — водитель прислал не тот
   * номер, данные оформленного сегодня ещё не доехали, водитель уволен (телефонов
   * нерабочих профилей Fleet API не отдаёт, и до `profile_fired` дело не доходит).
   * Различить их в коде сегодня нечем, поэтому человек находит себя в одной из строк.
   */
  not_in_park: {
    ru: [
      'Этот номер не числится за водителем Xalq Taxi.',
      'Проверьте, тот ли номер вы отправили: привязка идёт по номеру, на который вы оформлены в таксопарке.',
      'Если вы оформились сегодня, данные появятся в течение суток — попробуйте завтра.',
      'Если работаете давно и номер верный, подойдите в офис с водительским удостоверением.',
    ].join('\n\n'),
    uz: [
      'Bu raqam Xalq Taxi haydovchisiga biriktirilmagan.',
      "Qaysi raqamni yuborganingizni tekshiring: bog'lash siz taksoparkda ro'yxatdan o'tgan raqam bo'yicha amalga oshiriladi.",
      "Agar bugun rasmiylashtirilgan bo'lsangiz, ma'lumotlar bir kun ichida paydo bo'ladi — ertaga urinib ko'ring.",
      "Agar ancha vaqtdan beri ishlayotgan bo'lsangiz va raqam to'g'ri bo'lsa, haydovchilik guvohnomangiz bilan ofisga murojaat qiling.",
    ].join('\n\n'),
  },
  profile_fired: {
    ru: 'По данным таксопарка вы сейчас не работаете в Xalq Taxi, поэтому привязать номер автоматически мы не можем. Если это не так, подойдите в любой офис с водительским удостоверением.',
    uz: "Taksopark ma'lumotlariga ko'ra siz hozir Xalq Taxi'da ishlamaysiz, shuning uchun raqamni avtomatik bog'lay olmaymiz. Agar bu noto'g'ri bo'lsa, haydovchilik guvohnomangiz bilan istalgan ofisga murojaat qiling.",
  },
  several_profiles: {
    ru: 'На ваш номер в таксопарке заведено несколько профилей, и мы не можем определить, который ваш. Подойдите в любой офис Xalq Taxi с водительским удостоверением — менеджер разберётся и привяжет ваш Telegram.',
    uz: "Sizning raqamingizga taksoparkda bir nechta profil ochilgan va qaysi biri sizniki ekanini aniqlay olmaymiz. Haydovchilik guvohnomangiz bilan Xalq Taxi'ning istalgan ofisiga murojaat qiling — menejer aniqlab, Telegram'ingizni bog'laydi.",
  },
  person_already_linked: {
    ru: 'Вы уже зарегистрированы в программе, но с другого аккаунта Telegram. Откройте бота с него — баллы на месте. Если доступа к тому аккаунту больше нет, подойдите в офис с водительским удостоверением.',
    uz: "Siz dasturda allaqachon ro'yxatdan o'tgansiz, lekin boshqa Telegram akkaunti orqali. Botni o'sha akkauntdan oching — ballaringiz joyida. Agar o'sha akkauntga kira olmasangiz, haydovchilik guvohnomangiz bilan ofisga murojaat qiling.",
  },
  telegram_already_linked: {
    ru: 'Этот Telegram уже привязан к другому водителю: один аккаунт нельзя использовать для двух человек. Если вы пользуетесь общим телефоном, откройте бота со своего аккаунта Telegram. Если это ошибка, подойдите в любой офис с водительским удостоверением.',
    uz: "Bu Telegram boshqa haydovchiga biriktirilgan: bitta akkauntdan ikki kishi foydalana olmaydi. Agar umumiy telefondan foydalanayotgan bo'lsangiz, botni o'z Telegram akkauntingizdan oching. Agar bu xato bo'lsa, haydovchilik guvohnomangiz bilan istalgan ofisga murojaat qiling.",
  },
  park_api_unavailable: {
    ru: 'Не удалось проверить номер — база таксопарка сейчас не отвечает. Попробуйте, пожалуйста, через несколько минут.',
    uz: "Raqamni tekshirib bo'lmadi — taksopark ma'lumotlar bazasi hozir javob bermayapti. Iltimos, bir necha daqiqadan so'ng qayta urinib ko'ring.",
  },
  notification_welcome_bonus: {
    ru: '🎁 Вам начислено {points} баллов за первые 5 поездок! Обменять их на подарки можно в любом офисе Xalq Taxi.',
    uz: "🎁 Birinchi 5 ta safaringiz uchun sizga {points} ball hisoblandi! Ularni Xalq Taxi'ning istalgan ofisida sovg'alarga almashtirishingiz mumkin.",
  },
};

/**
 * Офис парка.
 *
 * Таблицы офисов в `xb` нет: она не переносится и появляется этапом 8. До тех пор офисы
 * живут здесь тремя записями, а не готовой строкой сообщения: список собирается кодом,
 * и когда таблица появится, поменяется источник данных, а не текст.
 *
 * Telegram-контактов и имён менеджеров тут нет намеренно: водителю нужен адрес и телефон,
 * а имя менеджера меняется чаще, чем офис.
 */
type Office = {
  name: Readonly<Record<Language, string>>;
  latitude: number;
  longitude: number;
  /** Режим работы. Показывается всегда: у ТТЗ он не круглосуточный. */
  hours: Readonly<Record<Language, string>>;
  phone: string;
};

const OFFICES: readonly Office[] = [
  {
    name: { ru: 'Сергели', uz: 'Sergeli' },
    latitude: 41.219328,
    longitude: 69.243491,
    hours: { ru: '24/7', uz: '24/7' },
    phone: '+998 99 695 66 44',
  },
  {
    name: { ru: 'Кадышева', uz: 'Kadisheva' },
    latitude: 41.289547,
    longitude: 69.343994,
    hours: { ru: '24/7', uz: '24/7' },
    phone: '+998 99 795 66 42',
  },
  {
    name: { ru: 'ТТЗ', uz: 'TTZ' },
    latitude: 41.360032,
    longitude: 69.38894,
    hours: { ru: '09:00–19:00', uz: '09:00–19:00' },
    phone: '+998 99 795 66 43',
  },
];

/** Долгота первой — как в ссылках старого бота, и как их читает сам Яндекс. */
const mapLink = (office: Office): string =>
  `https://yandex.ru/navi/?whatshere[point]=${office.longitude},${office.latitude}&whatshere[zoom]=18`;

/**
 * Экранирование для `parse_mode: HTML`.
 *
 * Имя водителя приходит из чужой системы и подставляется в разметку: угловая скобка
 * в имени иначе ломает сообщение целиком, и водитель не получает ничего.
 */
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Название ссылкой на карту, затем режим работы и телефон. */
const officeLine = (office: Office, language: Language): string =>
  `• <a href="${mapLink(office)}">${escapeHtml(office.name[language])}</a> — ${escapeHtml(
    office.hours[language],
  )}, ${escapeHtml(office.phone)}`;

/** Список офисов, которым кончается сообщение «в офис». */
export const officesBlock = (language: Language): string =>
  OFFICES.map((office) => officeLine(office, language)).join('\n');

/**
 * Число баллов в человеческом виде: разряды разделены неразрывным пробелом.
 *
 * Неразрывным намеренно: Telegram переносит строку по обычному пробелу, и «12 300»
 * на узком экране разъезжается на две строки, читаясь как два числа.
 */
export const formatPoints = (points: bigint): string =>
  points.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');

/**
 * Текст экрана. Подстановки — по именам в фигурных скобках.
 *
 * Значения подстановок экранируются здесь: сообщения уходят с `parse_mode: HTML`,
 * и единственное место, где в разметку попадает чужая строка, — это оно.
 */
export const text = (
  key: TextKey,
  language: Language,
  values: Readonly<Record<string, string>> = {},
): string => {
  const template = TEXTS[key][language];

  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, escapeHtml(value)),
    template,
  );
};

/**
 * Сообщение «в офис» целиком: причина отказа и список офисов под ней.
 *
 * Ключом, а не одним зашитым текстом: причин отказа шесть, и список офисов нужен
 * каждой — но зовёт в него каждая своими словами, потому что два исхода из шести
 * решаются не походом через город, а нажатием.
 */
export const withOffices = (key: TextKey, language: Language): string =>
  `${text(key, language)}\n\n${officesBlock(language)}`;
