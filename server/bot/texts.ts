import type { Language } from '#server/generated/prisma/enums';
// Относительным путём, а не через `#shared`: этот модуль собирается ещё и в воркер,
// а там из псевдонимов настроен один `#server` (package.json → `build:worker`).
import type { OfficeContact } from '../../shared/types/miniapp';
import { escapeHtml } from '../../shared/telegramHtml';

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
  | 'employee_greeting'
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
  | 'trips_counted'
  | 'trips_not_received'
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
  | 'history_order_reason'
  | 'button_exchange_points'
  | 'button_my_orders'
  | 'button_back'
  | 'request_failed'
  | 'offices_title'
  | 'offices_empty'
  | 'offices_failed'
  | 'office_open_map'
  | 'showcase_empty'
  | 'showcase_failed'
  | 'product_no_photo'
  | 'unit_pieces'
  | 'unit_points'
  | 'showcase_in_stock'
  | 'cart_total'
  | 'cart_balance_after'
  | 'button_checkout'
  | 'checkout_nothing_selected'
  | 'checkout_over_balance'
  | 'confirm_title'
  | 'confirm_note'
  | 'button_place_order'
  | 'button_edit_order'
  | 'order_title'
  | 'order_code_title'
  | 'order_expires'
  | 'order_status_pending'
  | 'order_status_issued'
  | 'order_status_cancelled'
  | 'order_cancel_reason_driver'
  | 'order_cancel_reason_employee'
  | 'order_cancel_reason_expired'
  | 'button_cancel_order'
  | 'cancel_order_question'
  | 'button_cancel_order_yes'
  | 'button_cancel_order_no'
  | 'orders_title'
  | 'orders_empty'
  | 'orders_failed'
  | 'button_my_rewards'
  | 'rewards_title'
  | 'rewards_empty'
  | 'rewards_failed'
  | 'reward_code_title'
  | 'reward_state_credited'
  | 'reward_state_awaiting'
  | 'reward_state_issued'
  | 'reward_state_expired'
  | 'reward_origin_manual'
  | 'reward_origin_campaign'
  | 'order_denied_office_unavailable'
  | 'order_denied_product_unavailable'
  | 'order_denied_insufficient_stock'
  | 'order_denied_insufficient_points'
  | 'order_denied_not_found'
  | 'order_denied_not_pending'
  | 'campaign_window'
  | 'campaign_state_invited'
  | 'campaign_state_joined'
  | 'campaign_state_declined'
  | 'button_campaign_join'
  | 'campaign_decline'
  | 'campaign_week_day'
  | 'campaign_week_counter'
  | 'campaign_week_last_day'
  | 'campaign_week_prizes'
  | 'campaign_week_every_goal'
  | 'campaign_week_no_skips'
  | 'campaign_today_goal_near'
  | 'campaign_today_goal_taken'
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
  /**
   * Приветствие сотруднику парка — на то же любое сообщение и с той же кнопкой запуска.
   *
   * Своим текстом, потому что водительский зовёт регистрироваться и копить баллы, а у сотрудника
   * в приложении своя работа (T25). Про кнопку не говорит по той же причине, что и водительское.
   */
  employee_greeting: {
    ru: 'Xalq Taxi — рабочее место сотрудника парка. Выдача заказов водителям по коду и отмена заказов — в приложении.',
    uz: "Xalq Taxi — park xodimining ish joyi. Haydovchilarga buyurtmalarni kod bo'yicha berish va buyurtmalarni bekor qilish — ilovada.",
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
   * До какого момента учтены поездки — время последнего успешного прогона заказов.
   *
   * Стоит под балансом, потому что поездки приезжают прогоном, а не в момент завершения
   * заказа: водитель, закрывший заказ минуту назад, своей поездки не увидит — и эта строка
   * объясняет почему, до того как он придёт с вопросом в офис.
   *
   * Называет поездки, а не «данные»: начисления сотрудником и списания пишутся в момент
   * операции и в отметку не входят. «Данные обновлены в 19:26» под записью «сегодня 10:39»
   * читалась как «баланс пересчитан раньше операции, которая уже в списке» (issue #133).
   *
   * Дата всегда полная и стоит перед временем, без «сегодня» и «вчера»: «до 19:26 12.09»
   * читалось задом наперёд, сначала час, потом день (issue #142).
   */
  trips_counted: {
    ru: 'Поездки учтены до {date}, {time}',
    uz: 'Safarlar {date} soat {time} gacha hisobga olingan',
  },
  /**
   * Отметка, когда успешного прогона не было ни одного — первые минуты после выката.
   *
   * Строкой, а не пустотой: без неё кнопка обновления висит одна, без единого слова
   * (стенд, PR #152). Не предупреждение: данных нет, а не синхронизация отстала.
   */
  trips_not_received: {
    ru: 'Данные о поездках ещё не поступали',
    uz: "Safarlar haqida ma'lumotlar hali kelmagan",
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
  /**
   * Списание и возврат по заказу — причина и номер, без лишних слов. Номер тот же, что
   * водитель видел на экране заказа, и отменённый заказ читается в истории парой строк.
   */
  history_order_reason: {
    ru: '{reason} · № {number}',
    uz: '{reason} · № {number}',
  },

  // Витрина и заказ в Mini App (issue #121). Числа на экране стоят цифрами, а единицы —
  // «шт.» и «баллов» — отдельными ключами: склонять число в коде значит писать правило
  // русского языка, которого у узбекского нет.
  button_exchange_points: {
    ru: 'Обменять баллы',
    uz: 'Ballarni almashtirish',
  },
  button_my_orders: {
    ru: 'Мои заказы',
    uz: 'Buyurtmalarim',
  },
  /** Возврат на прошлый экран, когда у клиента нет системной кнопки «назад». */
  button_back: {
    ru: 'Назад',
    uz: 'Orqaga',
  },
  /** Запрос не дошёл до ответа: сервер сказать ничего не мог, говорит экран. */
  request_failed: {
    ru: 'Приложение не ответило. Проверьте связь и попробуйте ещё раз.',
    uz: "Ilova javob bermadi. Aloqani tekshirib, qaytadan urinib ko'ring.",
  },
  offices_title: {
    ru: 'Выберите офис',
    uz: 'Ofisni tanlang',
  },
  offices_empty: {
    ru: 'Офисы, где можно обменять баллы, пока не открыты.',
    uz: "Ballarni almashtirish mumkin bo'lgan ofislar hozircha ochilmagan.",
  },
  offices_failed: {
    ru: 'Не удалось загрузить офисы. Попробуйте ещё раз.',
    uz: "Ofislarni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
  },
  office_open_map: {
    ru: 'На карте',
    uz: 'Xaritada',
  },
  /** Пустая витрина говорит словами, а не показывает пустую сетку. */
  showcase_empty: {
    ru: 'В этом офисе пока нечего взять.',
    uz: "Bu ofisda hozircha olish mumkin bo'lgan mahsulot yo'q.",
  },
  showcase_failed: {
    ru: 'Не удалось загрузить товары. Попробуйте ещё раз.',
    uz: "Mahsulotlarni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
  },
  product_no_photo: {
    ru: 'без фото',
    uz: 'rasmsiz',
  },
  unit_pieces: {
    ru: 'шт.',
    uz: 'dona',
  },
  unit_points: {
    ru: 'баллов',
    uz: 'ball',
  },
  showcase_in_stock: {
    ru: 'В наличии',
    uz: 'Mavjud',
  },
  cart_total: {
    ru: 'Сумма',
    uz: 'Jami',
  },
  cart_balance_after: {
    ru: 'Останется на балансе',
    uz: 'Hisobda qoladi',
  },
  button_checkout: {
    ru: 'Оформить',
    uz: 'Rasmiylashtirish',
  },
  checkout_nothing_selected: {
    ru: 'Выберите товар, чтобы оформить заказ.',
    uz: 'Buyurtma berish uchun mahsulot tanlang.',
  },
  checkout_over_balance: {
    ru: 'Сумма больше вашего баланса — уберите что-нибудь из заказа.',
    uz: "Jami summa hisobingizdan ko'p — buyurtmadan biror narsani olib tashlang.",
  },
  confirm_title: {
    ru: 'Проверьте заказ',
    uz: 'Buyurtmani tekshiring',
  },
  /** Оговорка перед оформлением: заказ у нас касса, баллы уходят сразу, а не на стойке. */
  confirm_note: {
    ru: 'Баллы спишутся сейчас. Они вернутся, если отменить заказ или не забрать его в течение суток.',
    uz: 'Ballar hozir yechiladi. Buyurtmani bekor qilsangiz yoki bir kun ichida olmasangiz, ular qaytariladi.',
  },
  button_place_order: {
    ru: 'Оформить заказ',
    uz: 'Buyurtma berish',
  },
  button_edit_order: {
    ru: 'Изменить',
    uz: "O'zgartirish",
  },
  order_title: {
    ru: 'Заказ № {number}',
    uz: 'Buyurtma № {number}',
  },
  order_code_title: {
    ru: 'Код для выдачи — назовите его в офисе',
    uz: 'Olish kodi — uni ofisda ayting',
  },
  order_expires: {
    ru: 'Заберите до {moment}',
    uz: '{moment} gacha olib keting',
  },
  order_status_pending: {
    ru: 'Ждёт выдачи',
    uz: 'Berilishini kutmoqda',
  },
  order_status_issued: {
    ru: 'Выдан {moment}',
    uz: '{moment} da berildi',
  },
  order_status_cancelled: {
    ru: 'Отменён {moment}',
    uz: '{moment} da bekor qilindi',
  },
  order_cancel_reason_driver: {
    ru: 'Вы отменили заказ',
    uz: 'Buyurtmani siz bekor qildingiz',
  },
  order_cancel_reason_employee: {
    ru: 'Отменил сотрудник офиса',
    uz: 'Ofis xodimi bekor qildi',
  },
  order_cancel_reason_expired: {
    ru: 'Не забрали за сутки',
    uz: 'Bir kun ichida olinmadi',
  },
  button_cancel_order: {
    ru: 'Отменить заказ',
    uz: 'Buyurtmani bekor qilish',
  },
  cancel_order_question: {
    ru: 'Отменить заказ? Баллы вернутся на баланс.',
    uz: 'Buyurtma bekor qilinsinmi? Ballar hisobingizga qaytadi.',
  },
  button_cancel_order_yes: {
    ru: 'Да, отменить',
    uz: 'Ha, bekor qilish',
  },
  button_cancel_order_no: {
    ru: 'Не отменять',
    uz: 'Bekor qilmaslik',
  },
  orders_title: {
    ru: 'Мои заказы',
    uz: 'Buyurtmalarim',
  },
  orders_empty: {
    ru: 'Заказов пока нет.',
    uz: "Hozircha buyurtmalar yo'q.",
  },
  orders_failed: {
    ru: 'Не удалось загрузить заказы. Попробуйте ещё раз.',
    uz: "Buyurtmalarni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
  },

  // Раздел «Мои награды» (issue #172). Узбекский — черновой: вычитывает переводчик одной
  // волной ближе к выкату.
  button_my_rewards: {
    ru: 'Мои награды',
    uz: 'Mukofotlarim',
  },
  rewards_title: {
    ru: 'Мои награды',
    uz: 'Mukofotlarim',
  },
  rewards_empty: {
    ru: 'Наград пока нет.',
    uz: "Hozircha mukofotlar yo'q.",
  },
  rewards_failed: {
    ru: 'Не удалось загрузить награды. Попробуйте ещё раз.',
    uz: "Mukofotlarni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
  },
  reward_code_title: {
    ru: 'Код для выдачи — покажите этот экран в офисе',
    uz: "Olish kodi — bu ekranni ofisda ko'rsating",
  },
  reward_state_credited: {
    ru: 'На балансе',
    uz: 'Hisobingizda',
  },
  reward_state_awaiting: {
    ru: 'Ждёт в офисе до {date}',
    uz: '{date} gacha ofisda kutmoqda',
  },
  reward_state_issued: {
    ru: 'Получена {moment}',
    uz: '{moment} da olindi',
  },
  reward_state_expired: {
    ru: 'Срок вышел {date} — награда не получена',
    uz: "Muddat {date} da tugadi — mukofot olinmagan",
  },
  reward_origin_manual: {
    ru: 'Вручил парк',
    uz: 'Park tomonidan berildi',
  },
  reward_origin_campaign: {
    ru: 'Акция «{title}»',
    uz: '«{title}» aksiyasi',
  },

  // Отказы оформления и отмены. Разведены по причинам: экран обязан сказать, чего именно
  // не хватило, — баллов, товара на полке или открытого офиса, — потому что и действие
  // у водителя в каждом случае своё.
  order_denied_office_unavailable: {
    ru: 'Этот офис сейчас не принимает заказы. Выберите другой офис.',
    uz: 'Bu ofis hozir buyurtma qabul qilmaydi. Boshqa ofisni tanlang.',
  },
  order_denied_product_unavailable: {
    ru: 'Один из товаров больше нельзя заказать. Вернитесь к витрине и соберите заказ заново.',
    uz: "Mahsulotlardan birini endi buyurtma qilib bo'lmaydi. Vitrinaga qaytib, buyurtmani qaytadan yig'ing.",
  },
  /** Кто-то успел забрать товар, пока водитель листал витрину: называем, чего и сколько. */
  order_denied_insufficient_stock: {
    ru: '«{product}» осталось меньше, чем в заказе: доступно {available}. Измените количество.',
    uz: "«{product}» buyurtmadagidan kam qoldi: mavjud {available}. Miqdorni o'zgartiring.",
  },
  order_denied_insufficient_points: {
    ru: 'На балансе не хватает баллов на этот заказ.',
    uz: 'Bu buyurtma uchun hisobingizda ball yetarli emas.',
  },
  /** Чужой заказ и несуществующий — один отказ: подтверждать чужой номер незачем. */
  order_denied_not_found: {
    ru: 'Такого заказа нет.',
    uz: "Bunday buyurtma yo'q.",
  },
  order_denied_not_pending: {
    ru: 'Этот заказ уже выдан или отменён.',
    uz: 'Bu buyurtma allaqachon berilgan yoki bekor qilingan.',
  },

  // Экран акции — рабочий минимум (issue #166): сроки, состояние строкой и два действия.
  // Оформление по макетам приезжает своей задачей и переодевает эти же строки.
  //
  // Состояния названы теми же словами, что в админке (`app/utils/labels.ts` →
  // `PARTICIPANT_STATE_LABELS`): приглашён, участвует, отказался. Меняется слово здесь —
  // меняется и там: сотрудник сверяет экран водителя со списком участников.
  campaign_window: {
    ru: 'Сроки акции: {from} — {to}',
    uz: 'Aksiya muddati: {from} — {to}',
  },
  /**
   * Приглашён и ещё не решил. Одна строка на `invited` и `opened`: для водителя это одно
   * и то же — экран он видит впервые или снова, а разница нужна только замеру.
   */
  campaign_state_invited: {
    ru: 'Вы приглашены в акцию.',
    uz: 'Siz aksiyaga taklif qilingansiz.',
  },
  campaign_state_joined: {
    ru: 'Вы участвуете в акции.',
    uz: 'Siz aksiyada ishtirok etyapsiz.',
  },
  campaign_state_declined: {
    ru: 'Вы отказались от участия в акции.',
    uz: "Siz aksiyada ishtirok etishdan voz kechdingiz.",
  },
  button_campaign_join: {
    ru: 'Участвовать',
    uz: 'Ishtirok etish',
  },
  campaign_decline: {
    ru: 'Отказаться',
    uz: 'Voz kechish',
  },

  // Блок недели и дневной цели (issue #168). Строки — по таблицам верха и низа
  // `product/design/comeback/03-member-week-states.md` и шаблону `03-member-heat-scale.md`;
  // выбор строки — `server/services/campaigns/weekProgress.ts`. Строки со счётом и склонением
  // живут ниже, в `COUNTED_TEXTS`.
  //
  // Строка низа узкая: на 320 в ней около двадцати двух знаков в 11 px. При правке текста
  // ширину надо мерить в браузере, а не прикидывать (эталон, раздел «Нижняя строка»).
  campaign_week_day: {
    ru: 'День {day} из {total}',
    uz: '{day}-kun, jami {total}',
  },
  /** Счётчик зачётных дней. Число уже зажато на пятёрке — «6 из 5» не бывает. */
  campaign_week_counter: {
    ru: '{done} из {total} дней',
    uz: '{total} kundan {done}',
  },
  campaign_week_last_day: {
    ru: 'последний день',
    uz: 'oxirgi kun',
  },
  /** «Призы», а не «сундуки»: сундуки дня открываются сразу, а в конце недели их два — большой и приветственный. */
  campaign_week_prizes: {
    ru: 'призы в конце недели',
    uz: "hafta oxirida sovg'alar",
  },
  campaign_week_every_goal: {
    ru: 'каждые 5 поездок — сундук',
    uz: 'har 5 safar — sandiq',
  },
  campaign_week_no_skips: {
    ru: 'пропусков не осталось',
    uz: "o'tkazib yuborishga kun qolmadi",
  },
  /** Одна поездка до цели — «рядом» вместо «ждёт»; остальное как в общем шаблоне. */
  campaign_today_goal_near: {
    ru: 'Сундук дня рядом: всего 1 поездка',
    uz: "Kun sandig'i yaqin: atigi 1 ta safar",
  },
  campaign_today_goal_taken: {
    ru: 'Ура! Сундук дня ваш!',
    uz: "Hurra! Kun sandig'i sizniki!",
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
  /**
   * Приглашение принято — дальше человеку нужен пароль для веба.
   *
   * Название пункта цитируется дословно и на узбекском тоже по-русски: экран сотрудника
   * одноязычный (docs/frontend.md → «Язык»), и найти пункт человек должен глазами, а не переводом.
   * Меняется `EMPLOYEE_PASSWORD_LABEL` в `app/pages/app.vue` — меняется и здесь (issue #130).
   */
  invite_accepted: {
    ru: 'Готово, {name}: учётная запись сотрудника создана. Чтобы входить с компьютера, откройте приложение кнопкой меню и задайте пароль в пункте «Пароль для входа с компьютера».',
    uz: "Tayyor, {name}: xodim hisobi yaratildi. Kompyuterdan kirish uchun menyu tugmasi orqali ilovani oching va «Пароль для входа с компьютера» bo'limida parol belgilang.",
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
 * Число баллов в человеческом виде: разряды разделены неразрывным пробелом.
 *
 * Неразрывным намеренно: Telegram переносит строку по обычному пробелу, и «12 300»
 * на узком экране разъезжается на две строки, читаясь как два числа.
 */
export const formatPoints = (points: bigint): string =>
  points.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');

/**
 * Строки со счётом — по формам числительного: 1 день, 2–4 дня, 5 дней.
 *
 * Отдельным словарём, а не тремя ключами на строку: форма выбирается правилом языка
 * (`Intl.PluralRules`), и ключ, выбранный вызывающим по числу вручную, однажды забыл бы
 * про «11 дней» и «21 день». У узбекского числительное не склоняется — формы у него одинаковые,
 * а правило отдаёт ему только `one` и `other`.
 */
type CountedForms = Readonly<{ one: string; few: string; many: string }>;

export type CountedTextKey =
  | 'reward_points'
  | 'campaign_week_chest_days'
  | 'campaign_week_last_days'
  | 'campaign_week_days_left'
  | 'campaign_week_skips_left'
  | 'campaign_today_trips'
  | 'campaign_today_goal_waiting';

const COUNTED_TEXTS: Readonly<Record<CountedTextKey, Readonly<Record<Language, CountedForms>>>> = {
  /** Награда баллами в разделе «Мои награды»: «300 баллов». */
  reward_points: {
    ru: {
      one: '{count} балл',
      few: '{count} балла',
      many: '{count} баллов',
    },
    uz: {
      one: '{count} ball',
      few: '{count} ball',
      many: '{count} ball',
    },
  },
  campaign_week_chest_days: {
    ru: {
      one: 'ещё {count} день с сундуками',
      few: 'ещё {count} дня с сундуками',
      many: 'ещё {count} дней с сундуками',
    },
    uz: {
      one: 'yana {count} kun sandiqlar bilan',
      few: 'yana {count} kun sandiqlar bilan',
      many: 'yana {count} kun sandiqlar bilan',
    },
  },
  /**
   * «Последние N дня». Один день сюда не приходит — у него своя строка «последний день»,
   * `campaign_week_last_day`; форма `one` стоит для полноты словаря.
   */
  campaign_week_last_days: {
    ru: {
      one: 'последний день',
      few: 'последние {count} дня',
      many: 'последние {count} дней',
    },
    uz: {
      one: 'oxirgi {count} kun',
      few: 'oxirgi {count} kun',
      many: 'oxirgi {count} kun',
    },
  },
  /** Слова «всего» здесь нет никогда: оно занято дневной целью, где значит «это немного». */
  campaign_week_days_left: {
    ru: {
      one: 'остался {count} день',
      few: 'осталось {count} дня',
      many: 'осталось {count} дней',
    },
    uz: {
      one: '{count} kun qoldi',
      few: '{count} kun qoldi',
      many: '{count} kun qoldi',
    },
  },
  campaign_week_skips_left: {
    ru: {
      one: 'ещё {count} пропуск в запасе',
      few: 'ещё {count} пропуска в запасе',
      many: 'ещё {count} пропусков в запасе',
    },
    uz: {
      one: "zaxirada yana {count} kun o'tkazib yuborish",
      few: "zaxirada yana {count} kun o'tkazib yuborish",
      many: "zaxirada yana {count} kun o'tkazib yuborish",
    },
  },
  campaign_today_trips: {
    ru: {
      one: 'Сегодня {count} поездка',
      few: 'Сегодня {count} поездки',
      many: 'Сегодня {count} поездок',
    },
    uz: {
      one: 'Bugun {count} ta safar',
      few: 'Bugun {count} ta safar',
      many: 'Bugun {count} ta safar',
    },
  },
  /**
   * «Сундук дня ждёт: всего N поездок», где N — остаток до пяти. Один шаблон на все состояния —
   * один перевод вместо шести; «всего» выбрано осознанно: оно переводит число из условия
   * в оценку «это немного» (`03-member-heat-scale.md`).
   */
  campaign_today_goal_waiting: {
    ru: {
      one: 'Сундук дня ждёт: всего {count} поездка',
      few: 'Сундук дня ждёт: всего {count} поездки',
      many: 'Сундук дня ждёт: всего {count} поездок',
    },
    uz: {
      one: "Kun sandig'i kutmoqda: atigi {count} ta safar",
      few: "Kun sandig'i kutmoqda: atigi {count} ta safar",
      many: "Kun sandig'i kutmoqda: atigi {count} ta safar",
    },
  },
};

const PLURAL_RULES: Readonly<Record<Language, Intl.PluralRules>> = {
  ru: new Intl.PluralRules('ru'),
  uz: new Intl.PluralRules('uz'),
};

/** Форма числительного по правилу языка. `other` у русского — дробные, у узбекского — всё, кроме единицы. */
const countedForm = (language: Language, count: number): keyof CountedForms => {
  const category = PLURAL_RULES[language].select(count);

  return category === 'one' || category === 'few' ? category : 'many';
};

/** Строка со счётом для экрана приложения — без экранирования, как `plainText`. */
export const countedPlainText = (key: CountedTextKey, language: Language, count: number): string =>
  COUNTED_TEXTS[key][language][countedForm(language, count)].replaceAll('{count}', String(count));

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
