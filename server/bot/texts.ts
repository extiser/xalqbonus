import type { Language } from '#server/generated/prisma/enums';
// Относительным путём, а не через `#shared`: этот модуль собирается ещё и в воркер,
// а там из псевдонимов настроен один `#server` (package.json → `build:worker`).
import type { OfficeContact } from '../../shared/types/miniapp';

/**
 * Тексты, которые система говорит водителю и сотруднику, — ключами в коде, а не строками
 * в базе.
 *
 * Читателей два: бот и экран Mini App. Файл остался здесь, где был написан, а не переехал
 * следом за регистрацией: словарь один, и делить его по получателям значит заводить второе
 * место, куда придётся дописывать узбекский.
 *
 * Таблица переводов старого бота не переносится (`#18`), а экранов здесь меньше десяти:
 * таблица ради них — это второе место, где живёт текст, и вопрос «почему система сказала
 * так» начинает требовать запроса к базе.
 *
 * **Языка два, и они разные.** В старом боте из 236 строк переводов у 223 узбекский
 * побайтово равнялся русскому: язык спрашивался, писался в базу и показывал русский текст.
 * Здесь оба языка написаны по-настоящему; узбекский перед выкатом вычитывает парк,
 * и правится он здесь же — другого места у текста нет.
 */

/**
 * Ключи всех текстов — экранов, исходов привязки и уведомлений. Новый текст — новый ключ
 * здесь, и сразу оба языка.
 */
export type TextKey =
  | 'start_greeting'
  | 'button_open_app'
  | 'select_language'
  | 'button_language_ru'
  | 'button_language_uz'
  | 'ask_phone'
  | 'button_send_phone'
  | 'checking_phone'
  | 'client_outdated'
  | 'contact_not_own'
  | 'linked'
  | 'linked_new'
  | 'welcome_bonus_promise'
  | 'balance_title'
  | 'data_updated'
  | 'history_empty'
  | 'history_failed'
  | 'button_show_more'
  | 'button_refresh'
  | 'day_today'
  | 'day_yesterday'
  | 'reason_trip'
  | 'reason_welcome'
  | 'reason_opening'
  | 'reason_order_spend'
  | 'reason_order_refund'
  | 'reason_manual_credit'
  | 'reason_manual_debit'
  | 'reason_raffle'
  | 'reason_expire'
  | 'reason_correction'
  | 'not_in_registry'
  | 'not_in_park'
  | 'profile_fired'
  | 'several_profiles'
  | 'person_already_linked'
  | 'telegram_already_linked'
  | 'link_closed_in_history'
  | 'employee_account'
  | 'check_unavailable'
  | 'notification_welcome_bonus'
  | 'invite_ask_contact'
  | 'invite_accepted'
  | 'invite_not_found'
  | 'invite_expired'
  | 'invite_already_accepted'
  | 'invite_revoked'
  | 'invite_contact_not_own'
  | 'invite_phone_invalid'
  | 'invite_driver_link_exists'
  | 'invite_employee_exists';

const TEXTS: Readonly<Record<TextKey, Readonly<Record<Language, string>>>> = {
  /**
   * Единственный экран, оставшийся у бота от регистрации.
   *
   * Про кнопку под собой он не говорит ни слова намеренно: на машине без `TG_MINIAPP_URL`
   * кнопки нет вовсе, и приглашение нажать то, чего не видно, — худшее из состояний
   * (server/bot/greeting.ts).
   */
  start_greeting: {
    ru: 'Xalq Taxi — бонусная программа для водителей: за поездки начисляются баллы, а обменять их на подарки можно в офисах парка. Регистрация и баланс живут в приложении.',
    uz: "Xalq Taxi — haydovchilar uchun bonus dasturi: safarlar uchun ball hisoblanadi, ularni park ofislarida sovg'alarga almashtirish mumkin. Ro'yxatdan o'tish va hisob ilovada.",
  },
  button_open_app: {
    ru: '🎁 Открыть приложение',
    uz: '🎁 Ilovani ochish',
  },
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
  /**
   * Клиент Telegram старее Bot API 6.9: вызова `requestContact` в нём нет вовсе, и взять
   * номер внутри приложения нечем.
   *
   * Отдельным текстом от «откройте приложение через Telegram»: тот адресован человеку,
   * открывшему страницу в обычном браузере, и человеку в устаревшем Telegram он советует
   * ровно то, что тот уже сделал.
   */
  client_outdated: {
    ru: 'Ваш Telegram устарел: поделиться номером внутри приложения в нём нельзя. Обновите Telegram до последней версии и откройте приложение снова.',
    uz: "Telegram ilovangiz eskirgan: uning ichida raqam bilan bo'lishish mumkin emas. Telegram'ni so'nggi versiyaga yangilang va ilovani qaytadan oching.",
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
  /**
   * Обещание бонуса за первые поездки на экране участника — тому, у кого в журнале нет
   * ни одной поездки.
   *
   * Своим текстом, а не `linked_new`: там обещание идёт следом за приветствием, потому что
   * это единственное сообщение на экране после привязки. Здесь имя водителя уже стоит
   * в шапке под балансом, и второе «Добро пожаловать, {name}!» подряд — это имя, прочитанное
   * дважды. Подстановок у ключа нет вовсе: обещание ни к кому не обращается.
   */
  welcome_bonus_promise: {
    ru: 'Завершите первые 5 поездок и получите 300 баллов — их можно обменять на подарки в наших офисах.',
    uz: "Birinchi 5 ta safarni yakunlang va 300 ball oling — ularni ofislarimizdagi sovg'alarga almashtirish mumkin.",
  },
  balance_title: {
    ru: 'Ваш баланс',
    uz: 'Hisobingiz',
  },
  /**
   * Время последнего успешного прогона заказов.
   *
   * Стоит под балансом, потому что поездки приезжают прогоном, а не в момент завершения
   * заказа: водитель, закрывший заказ минуту назад, своей поездки не увидит — и эта строка
   * объясняет почему, до того как он придёт с вопросом в офис.
   */
  data_updated: {
    ru: 'Данные обновлены в {time}',
    uz: "Ma'lumotlar {time} da yangilandi",
  },
  /**
   * Пустая история. Подписывается всегда: у нового участника операций нет ни одной,
   * и голый пустой список читается как поломка приложения.
   */
  history_empty: {
    ru: 'Здесь будет история начислений',
    uz: "Bu yerda ballar tarixi ko'rinadi",
  },
  history_failed: {
    ru: 'Не удалось загрузить историю. Попробуйте ещё раз.',
    uz: "Tarixni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
  },
  button_show_more: {
    ru: 'Показать ещё',
    uz: "Yana ko'rsatish",
  },
  /**
   * Кнопка обновления на экране участника. На экране стоит значком, а текст читает
   * экранный диктор — и он же всплывает подсказкой.
   */
  button_refresh: {
    ru: 'Обновить',
    uz: 'Yangilash',
  },
  day_today: {
    ru: 'Сегодня',
    uz: 'Bugun',
  },
  day_yesterday: {
    ru: 'Вчера',
    uz: 'Kecha',
  },
  /**
   * Причины операций человеческим языком — по одному тексту на значение `point_reason`.
   *
   * Водителю называется то, что с ним произошло, а не то, как это устроено в журнале:
   * ни второй стороны перевода, ни ключа идемпотентности он не видит и видеть не должен.
   */
  reason_trip: {
    ru: 'Поездка',
    uz: 'Safar',
  },
  reason_welcome: {
    ru: 'Бонус за первые поездки',
    uz: 'Birinchi safarlar uchun bonus',
  },
  reason_opening: {
    ru: 'Перенос баланса',
    uz: "Balansning o'tkazilishi",
  },
  reason_order_spend: {
    ru: 'Обмен на товар',
    uz: 'Mahsulotga almashtirildi',
  },
  reason_order_refund: {
    ru: 'Возврат заказа',
    uz: 'Buyurtma qaytarildi',
  },
  /** Ручная правка сотрудника. Разведена по знаку суммы: одним словом это два разных события. */
  reason_manual_credit: {
    ru: 'Начислено сотрудником',
    uz: 'Xodim tomonidan hisoblandi',
  },
  reason_manual_debit: {
    ru: 'Списано сотрудником',
    uz: 'Xodim tomonidan yechildi',
  },
  reason_raffle: {
    ru: 'Розыгрыш',
    uz: "Qur'a",
  },
  reason_expire: {
    ru: 'Сгорание баллов',
    uz: 'Ballar muddati tugadi',
  },
  /**
   * Сверка журнала (`recon`) и склейка двойников (`merge`) — одним текстом на обе причины.
   *
   * Намеренно: объяснять водителю, чем перепроверка отличается от объединения учётных
   * записей, незачем, а два разных слова про одно и то же он прочтёт как две разные
   * непонятные вещи.
   */
  reason_correction: {
    ru: 'Корректировка',
    uz: 'Tuzatish',
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
  /**
   * Пара «человек + чат» закрыта в истории: её закрыл оператор или склейка двойников.
   *
   * Отдельным текстом, а не общим «вы уже зарегистрированы с другого аккаунта»: тот зовёт
   * человека открыть бота с прежнего Telegram, а здесь прежнего Telegram нет — это и есть
   * тот самый, и активной привязки не осталось ни у кого. Совет «откройте с того аккаунта»
   * отправил бы его пробовать то, что заведомо не сработает.
   */
  link_closed_in_history: {
    ru: 'Связь этого Telegram с вашей учётной записью была закрыта раньше. Восстановить её может только сотрудник парка: подойдите в офис с водительским удостоверением.',
    uz: "Bu Telegram hisobingiz bilan bog'lanishi avval yopilgan. Uni faqat park xodimi tiklashi mumkin: haydovchilik guvohnomangiz bilan ofisga murojaat qiling.",
  },
  /**
   * Седьмой исход привязки: контакт прислал сотрудник парка.
   *
   * Списка офисов под ним нет намеренно, в отличие от семи отказов «в офис»: сотрудник
   * в офисе и так работает, а нужное ему действие — открыть приложение кнопкой меню.
   */
  employee_account: {
    ru: 'Этот аккаунт заведён как сотрудник парка. Регистрация водителя для него недоступна: откройте приложение кнопкой меню.',
    uz: "Bu akkaunt park xodimi sifatida ro'yxatdan o'tgan. Unga haydovchi sifatida ro'yxatdan o'tish mumkin emas: ilovani menyu tugmasi orqali oching.",
  },
  /**
   * Проверка не прошла — и неважно, у кого именно отказало.
   *
   * Один текст на два исхода, `park_api_unavailable` и `internal_failure`: водителю от нашей
   * внутренней разницы ни холодно ни жарко, а действие у него одно и то же — подождать
   * и нажать ещё раз.
   *
   * Про парк текст больше не утверждает ничего. Прежняя формулировка называла виновником
   * базу таксопарка, и это оказалось враньём в самом частом случае: у нас не было заполнено
   * окружение, и запрос в парк не уходил вовсе (issue #95).
   */
  check_unavailable: {
    ru: 'Сейчас не получилось проверить ваш номер. Попробуйте, пожалуйста, через несколько минут.',
    uz: "Hozir raqamingizni tekshirib bo'lmadi. Iltimos, bir necha daqiqadan so'ng qayta urinib ko'ring.",
  },
  notification_welcome_bonus: {
    ru: '🎁 Вам начислено {points} баллов за первые 5 поездок! Обменять их на подарки можно в любом офисе Xalq Taxi.',
    uz: "🎁 Birinchi 5 ta safaringiz uchun sizga {points} ball hisoblandi! Ularni Xalq Taxi'ning istalgan ofisida sovg'alarga almashtirishingiz mumkin.",
  },

  // Приглашение сотрудника. Отказы разведены по причинам все до одного: учётка заводится
  // в офисе, рядом с тем, кто выписал ссылку, и «что-то пошло не так» здесь означает
  // разговор двух людей, которые оба не понимают, что чинить.
  invite_ask_contact: {
    ru: 'Вас приглашают сотрудником Xalq Taxi. Нажмите кнопку ниже, чтобы подтвердить номер телефона — по нему вы будете входить в систему.',
    uz: "Sizni Xalq Taxi xodimi sifatida taklif qilishmoqda. Telefon raqamingizni tasdiqlash uchun pastdagi tugmani bosing — tizimga shu raqam orqali kirasiz.",
  },
  invite_accepted: {
    ru: 'Готово, {name}: учётная запись сотрудника создана. Откройте приложение кнопкой меню и задайте себе пароль — он понадобится для входа с компьютера.',
    uz: "Tayyor, {name}: xodim hisobi yaratildi. Menyu tugmasi orqali ilovani oching va o'zingizga parol belgilang — u kompyuterdan kirish uchun kerak bo'ladi.",
  },
  invite_not_found: {
    ru: 'Такого приглашения нет. Проверьте, полностью ли скопирована ссылка, или попросите выписать новую.',
    uz: "Bunday taklif topilmadi. Havola to'liq nusxalanganini tekshiring yoki yangisini so'rang.",
  },
  invite_expired: {
    ru: 'Срок действия приглашения истёк — ссылка живёт двое суток. Попросите выписать новую.',
    uz: "Taklif muddati tugagan — havola ikki kun amal qiladi. Yangisini so'rang.",
  },
  invite_already_accepted: {
    ru: 'Этим приглашением уже воспользовались: ссылка одноразовая. Если учётную запись завели не вы, сообщите тому, кто выписал ссылку.',
    uz: "Bu takliddan allaqachon foydalanilgan: havola bir martalik. Agar hisobni siz yaratmagan bo'lsangiz, havolani bergan xodimga xabar bering.",
  },
  invite_revoked: {
    ru: 'Приглашение отозвано. Если это ошибка, попросите выписать новую ссылку.',
    uz: "Taklif bekor qilingan. Agar bu xato bo'lsa, yangi havola so'rang.",
  },
  invite_contact_not_own: {
    ru: 'Отправьте, пожалуйста, свой номер телефона кнопкой ниже — чужой контакт мы принять не можем.',
    uz: "Iltimos, pastdagi tugma bilan o'z telefon raqamingizni yuboring — boshqa shaxsning kontaktini qabul qila olmaymiz.",
  },
  invite_phone_invalid: {
    ru: 'Не получилось разобрать ваш номер телефона. Учётную запись сотрудника заводят на узбекский номер вида +998 XX XXX XX XX.',
    uz: "Telefon raqamingizni aniqlay olmadik. Xodim hisobi +998 XX XXX XX XX ko'rinishidagi o'zbek raqamiga ochiladi.",
  },
  invite_driver_link_exists: {
    ru: 'Этот аккаунт Telegram или этот номер уже зарегистрирован как водитель Xalq Taxi. Водителем и сотрудником одновременно быть нельзя: сообщите тому, кто выписал ссылку, — он закроет водительскую регистрацию или заведёт вас на другой аккаунт.',
    uz: "Bu Telegram akkaunti yoki bu raqam Xalq Taxi haydovchisi sifatida ro'yxatdan o'tgan. Bir vaqtning o'zida ham haydovchi, ham xodim bo'lish mumkin emas: havolani bergan xodimga ayting — u haydovchi ro'yxatini yopadi yoki sizni boshqa akkauntga biriktiradi.",
  },
  invite_employee_exists: {
    ru: 'На этот аккаунт Telegram или на этот номер уже заведена учётная запись сотрудника. Откройте приложение кнопкой меню — вы уже в системе.',
    uz: "Bu Telegram akkaunti yoki bu raqam uchun xodim hisobi allaqachon mavjud. Menyu tugmasi orqali ilovani oching — siz tizimdasiz.",
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
 * Офисы на языке водителя — данными, а не готовым куском разметки.
 *
 * Раньше отсюда уходила склеенная строка с тегами `<a>`: получателем был Telegram,
 * и разметка была его. Получатель сменился на экран приложения, и склеенный HTML пришлось
 * бы вставлять в страницу через `v-html` — то есть отдавать разметку месту, которое
 * её не писало. Список отдаётся полями, а как он выглядит, решает компонент.
 */
export const officeContacts = (language: Language): OfficeContact[] =>
  OFFICES.map((office) => ({
    name: office.name[language],
    hours: office.hours[language],
    phone: office.phone,
    mapUrl: mapLink(office),
  }));

/**
 * Экранирование для `parse_mode: HTML`.
 *
 * Имя водителя приходит из чужой системы и подставляется в разметку: угловая скобка
 * в имени иначе ломает сообщение целиком, и водитель не получает ничего.
 */
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Число баллов в человеческом виде: разряды разделены неразрывным пробелом.
 *
 * Неразрывным намеренно: Telegram переносит строку по обычному пробелу, и «12 300»
 * на узком экране разъезжается на две строки, читаясь как два числа.
 */
export const formatPoints = (points: bigint): string =>
  points.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');

/** Подстановки по именам в фигурных скобках. Экранирование — забота вызывающего. */
const render = (
  key: TextKey,
  language: Language,
  values: Readonly<Record<string, string>>,
  escape: (value: string) => string,
): string =>
  Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, escape(value)),
    TEXTS[key][language],
  );

/**
 * Текст сообщения бота. Подстановки экранируются под разметку Telegram.
 *
 * Сообщения уходят с `parse_mode: HTML`, и единственное место, где в разметку попадает
 * чужая строка — имя водителя из реестра парка, — это оно. Угловая скобка в имени иначе
 * ломает сообщение целиком, и водитель не получает ничего.
 */
export const text = (
  key: TextKey,
  language: Language,
  values: Readonly<Record<string, string>> = {},
): string => render(key, language, values, escapeHtml);

/**
 * Тот же текст для экрана приложения — без экранирования.
 *
 * Разметки у получателя нет: Vue подставляет строку текстовым узлом и экранирует сам.
 * Прогони мы её через `escapeHtml`, водитель с амперсандом в имени увидел бы `&amp;`
 * буквально — то самое враньё экрана, только с другой стороны.
 *
 * Двумя функциями над одним словарём, а не флагом в аргументах: экранирование —
 * свойство получателя, а не текста, и получателей ровно два.
 */
export const plainText = (
  key: TextKey,
  language: Language,
  values: Readonly<Record<string, string>> = {},
): string => render(key, language, values, (value) => value);
