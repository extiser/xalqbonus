import type { Language } from '#server/generated/prisma/enums';
// Относительным путём, а не через `#shared`: этот модуль собирается ещё и в воркер,
// а там из псевдонимов настроен один `#server` (package.json → `build:worker`).
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
  | 'client_outdated_title'
  | 'registration_welcome_title'
  | 'registration_welcome_lead'
  | 'registration_title'
  | 'registration_lead'
  | 'registration_perk_auto'
  | 'registration_perk_gifts'
  | 'registration_perk_chests'
  | 'miniapp_send_phone'
  | 'registration_office_title'
  | 'registration_retry_title'
  | 'registration_retry_note'
  | 'registration_retry_send'
  | 'registration_retry_failed'
  | 'registration_ids_title'
  | 'registration_phone_label'
  | 'registration_telegram_id_label'
  | 'registration_copy_phone'
  | 'registration_copy_telegram_id'
  | 'registration_offices_title'
  | 'office_label'
  | 'office_map'
  | 'employee_denied_title'
  | 'employee_denied_text'
  | 'contact_not_own'
  | 'linked_new'
  | 'welcome_bonus_promise'
  | 'balance_title'
  | 'balance_updated'
  | 'trips_counted'
  | 'trips_not_received'
  | 'history_title'
  | 'history_all'
  | 'history_empty'
  | 'history_failed'
  | 'profile_title'
  | 'profile_callsign'
  | 'profile_license'
  | 'profile_phone_missing'
  | 'profile_license_show'
  | 'profile_license_hide'
  | 'profile_settings'
  | 'profile_language'
  | 'profile_reset'
  | 'profile_reset_title'
  | 'profile_reset_note'
  | 'profile_reset_kept'
  | 'button_reset'
  | 'button_cancel'
  | 'language_sheet_subtitle'
  | 'language_name_ru'
  | 'language_name_uz'
  | 'button_save'
  | 'button_close'
  | 'button_retry'
  | 'button_yes'
  | 'button_no'
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
  | 'reason_campaign'
  | 'history_order_reason'
  | 'button_exchange_points'
  | 'button_back'
  | 'request_failed'
  | 'offices_empty'
  | 'offices_failed'
  | 'showcase_empty'
  | 'showcase_failed'
  | 'unit_pieces'
  | 'unit_points'
  | 'cart_total'
  | 'cart_balance_after'
  | 'button_checkout'
  | 'checkout_nothing_selected'
  | 'checkout_over_balance'
  | 'confirm_title'
  | 'confirm_note'
  | 'button_place_order'
  | 'catalog_title'
  | 'catalog_all'
  | 'catalog_empty'
  | 'office_sheet_title'
  | 'office_sheet_subtitle'
  | 'office_change'
  | 'office_change_warning'
  | 'stock_pieces'
  | 'sale_label'
  | 'stepper_decrease'
  | 'stepper_increase'
  | 'stepper_increase_more'
  | 'order_title'
  | 'order_code_title'
  | 'order_expires_short'
  | 'order_status_pending'
  | 'order_state_issued'
  | 'order_state_cancelled'
  | 'order_amount_spent'
  | 'order_amount_returned'
  | 'order_action_code'
  | 'order_action_view'
  | 'order_office_title'
  | 'order_lines_title'
  | 'order_line_each'
  | 'order_cancel_reason_driver'
  | 'order_cancel_reason_employee'
  | 'order_cancel_reason_expired'
  | 'button_cancel_order'
  | 'cancel_order_question'
  | 'cancel_order_hint'
  | 'orders_title'
  | 'orders_all'
  | 'orders_group_pending'
  | 'orders_group_past'
  | 'group_empty'
  | 'orders_empty'
  | 'orders_failed'
  | 'rewards_title'
  | 'rewards_all'
  | 'reward_code_inside'
  | 'rewards_empty'
  | 'rewards_failed'
  | 'reward_code_title'
  | 'reward_screen_title'
  | 'rewards_group_awaiting'
  | 'rewards_group_past'
  | 'reward_state_credited'
  | 'reward_state_awaiting'
  | 'reward_word_awaiting'
  | 'reward_word_issued'
  | 'reward_word_expired'
  | 'reward_until'
  | 'reward_claim_until'
  | 'reward_expired_reason'
  | 'reward_expired_reason_full'
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
  | 'campaign_chests_day_title'
  | 'campaign_chests_three_days_title'
  | 'campaign_chests_week_title'
  | 'campaign_chests_day_idle'
  | 'campaign_chests_day_opened'
  | 'campaign_chests_to_open'
  | 'campaign_chest_opened'
  | 'campaign_chest_unreachable'
  | 'campaign_chest_week_condition'
  | 'campaign_chest_card_ahead'
  | 'campaign_chest_card_trips'
  | 'campaign_chest_card_open'
  | 'campaign_chest_card_missed'
  | 'campaign_chest_prize'
  | 'campaign_chest_rewards_hint'
  | 'campaign_chest_denied_campaign'
  | 'campaign_chest_denied_not_earned'
  | 'campaign_chest_denied_prize'
  | 'campaign_finish_awaiting_title'
  | 'campaign_finish_awaiting'
  | 'campaign_finish_open_chests_title'
  | 'campaign_finish_open_chests'
  | 'campaign_finish_completed_title'
  | 'campaign_finish_thanks_title'
  | 'campaign_finish_collected'
  | 'campaign_finish_three_days'
  | 'campaign_finish_week'
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
  | 'notification_campaign_finished_chests'
  | 'notification_campaign_finished_returned'
  | 'notification_campaign_finished_joined'
  | 'notification_campaign_finished_not_joined'
  | 'notification_campaign_chests_revealed'
  | 'notification_revealed_points_line'
  | 'notification_revealed_office_line'
  | 'notification_revealed_pickup'
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
  // Регистрация в Mini App (issue #194) — по макетам `_reference/design/registration/`.
  // Узбекские тексты новых ключей черновые: вычитывает переводчик одной волной ближе к выкату.
  /**
   * Шаг 1 двуязычный целиком — язык ещё не выбран, — поэтому подпись и кнопки одинаковы
   * на обоих языках.
   */
  select_language: {
    ru: 'Tilni tanlang / Выберите язык',
    uz: 'Tilni tanlang / Выберите язык',
  },
  button_language_ru: { ru: 'Русский', uz: 'Русский' },
  button_language_uz: { ru: "O'zbekcha", uz: "O'zbekcha" },
  /** Приветствие шага 1. Переносы строк — из макета: заголовок стоит в две строки. */
  registration_welcome_title: {
    ru: 'Добро пожаловать\nв XalqTaxi BonusBot',
    uz: "XalqTaxi BonusBot'ga\nxush kelibsiz!",
  },
  registration_welcome_lead: {
    ru: 'Здесь копятся ваши баллы за поездки —\nих можно обменять на подарки в офисах парка.',
    uz: "Bu yerda safarlaringiz uchun ballar to'planadi — ularni park ofislarida sovg'alarga almashtirish mumkin.",
  },
  registration_title: {
    ru: 'Баллы за каждую поездку',
    uz: 'Har bir safar uchun ball',
  },
  /**
   * Называет, **какой** номер нужен: самый частый отказ — `not_in_park`, не тот номер,
   * и сказать это лучше до ошибки, чем после.
   */
  registration_lead: {
    ru: 'Отправьте номер телефона, на который вы оформлены в таксопарке, — и программа заработает.',
    uz: "Taksoparkda ro'yxatdan o'tgan telefon raqamingizni yuboring — dastur ishga tushadi.",
  },
  /**
   * Три обещания шага 2. Ни курса, ни приветственного бонуса: курс заморожен подсчётом,
   * а на регистрацию попадают и перенесённые водители, которым бонус не положен.
   */
  registration_perk_auto: {
    ru: 'Начисляются автоматически после поездки',
    uz: 'Safardan keyin avtomatik hisoblanadi',
  },
  registration_perk_gifts: {
    ru: 'Подарки в офисах парка',
    uz: "Park ofislarida sovg'alar",
  },
  registration_perk_chests: {
    ru: 'Акции с сундуками и призами',
    uz: 'Sandiq va sovrinli aksiyalar',
  },
  /** Подсказка над кнопкой номера: окно Telegram не наше, и что в нём нажать, говорим заранее. */
  ask_phone: {
    ru: 'Telegram спросит разрешение отправить номер — нажмите «Поделиться».',
    uz: "Telegram raqamni yuborishga ruxsat so'raydi — «Ulashish» tugmasini bosing.",
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
    ru: 'Ваш Telegram устарел: поделиться номером внутри приложения в нём нельзя.\n\nОбновите Telegram до последней версии и откройте приложение снова.',
    uz: "Telegram ilovangiz eskirgan: uning ichida raqam bilan bo'lishish mumkin emas.\n\nTelegram'ni so'nggi versiyaga yangilang va ilovani qaytadan oching.",
  },
  client_outdated_title: {
    ru: 'Обновите Telegram',
    uz: "Telegram'ni yangilang",
  },
  /**
   * Кнопка номера в приложении — своим ключом, а не `button_send_phone`: у бота на кнопке
   * значок, а в приложении кнопка своя и значка не носит.
   */
  miniapp_send_phone: {
    ru: 'Отправить номер телефона',
    uz: 'Telefon raqamini yuborish',
  },
  /** Заголовок отказа «в офис» — и нейтрального отказа сотруднику: у них один и тот же. */
  registration_office_title: {
    ru: 'Нужно зайти в офис',
    uz: 'Ofisga kelishingiz kerak',
  },
  registration_retry_title: {
    ru: 'Не получилось проверить номер',
    uz: "Raqamni tekshirib bo'lmadi",
  },
  /** Второй абзац повтора — под текстом исхода: что делать, если повтор не помогает. */
  registration_retry_note: {
    ru: 'Если не получается с нескольких попыток — обратитесь в ближайший офис Xalq Taxi.',
    uz: "Bir necha urinishdan keyin ham bo'lmasa — eng yaqin Xalq Taxi ofisiga murojaat qiling.",
  },
  registration_retry_send: {
    ru: 'Отправить номер ещё раз',
    uz: 'Raqamni qayta yuborish',
  },
  /**
   * Строка сбоя под кнопкой повтора. Сформулирована так, чтобы не выглядело, будто мы сами
   * номер не проверили.
   */
  registration_retry_failed: {
    ru: 'Проверка номера не прошла — попробуйте ещё раз',
    uz: "Raqam tekshiruvidan o'tmadi — qayta urinib ko'ring",
  },
  /**
   * «Покажите менеджеру» — номер и Telegram ID на каждом отказе: единственные признаки,
   * по которым в базе можно найти попытку.
   */
  registration_ids_title: {
    ru: 'Покажите менеджеру',
    uz: "Menejerga ko'rsating",
  },
  registration_phone_label: {
    ru: 'Телефон',
    uz: 'Telefon',
  },
  registration_telegram_id_label: {
    ru: 'Telegram ID',
    uz: 'Telegram ID',
  },
  /** Подписи кнопок копирования для экранного чтеца: на экране у кнопок слов нет. */
  registration_copy_phone: {
    ru: 'Скопировать номер',
    uz: 'Raqamni nusxalash',
  },
  registration_copy_telegram_id: {
    ru: 'Скопировать Telegram ID',
    uz: "Telegram ID'ni nusxalash",
  },
  registration_offices_title: {
    ru: 'Офисы Xalq Taxi',
    uz: 'Xalq Taxi ofislari',
  },
  /** Подпись перед именем офиса: «Офис · Кадышева». Имя приходит из базы как есть. */
  office_label: {
    ru: 'Офис',
    uz: 'Ofis',
  },
  office_map: {
    ru: 'Открыть в Яндекс Картах',
    uz: 'Yandex Kartada ochish',
  },
  /**
   * Сотрудник с выключенной учёткой открыл приложение. Текст двери веба (`shared/denials.ts`)
   * здесь не берётся: экран устроен как отказ регистрации — с номером и Telegram ID, — и тексты
   * у него из этого словаря.
   */
  employee_denied_title: {
    ru: 'Доступ закрыт',
    uz: 'Kirish yopilgan',
  },
  employee_denied_text: {
    ru: 'Чтобы его вернуть, обратитесь к руководителю парка.',
    uz: 'Uni qaytarish uchun park rahbariga murojaat qiling.',
  },
  contact_not_own: {
    ru: 'Отправьте, пожалуйста, свой номер телефона кнопкой ниже — чужой контакт мы принять не можем.',
    uz: "Iltimos, pastdagi tugma bilan o'z telefon raqamingizni yuboring — boshqa shaxsning kontaktini qabul qila olmaymiz.",
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
    ru: 'Ваши баллы',
    uz: 'Ballaringiz',
  },
  /**
   * Строка под балансом на главной — время последнего успешного прогона заказов, тот же момент,
   * что в `trips_counted`. Даты нет, как в макете (Руслан, 25-09-2026).
   */
  balance_updated: {
    ru: 'Обновлено в {time}',
    uz: '{time} da yangilandi',
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
  history_title: {
    ru: 'История баллов',
    uz: 'Ballar tarixi',
  },
  /** Ссылка в шапке блока истории на главной — в раздел. */
  history_all: {
    ru: 'Вся история',
    uz: 'Butun tarix',
  },
  history_empty: {
    ru: 'Здесь будет история начислений',
    uz: "Bu yerda ballar tarixi ko'rinadi",
  },
  history_failed: {
    ru: 'Не удалось загрузить историю. Попробуйте ещё раз.',
    uz: "Tarixni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
  },
  /** Кнопка-аватар в шапке главной. На экране она значок, текст читает экранный диктор. */
  profile_title: {
    ru: 'Профиль',
    uz: 'Profil',
  },
  // Раздел «Профиль» (issue #216) — по макетам `_reference/design/profile/`. Подписи «Телефон»
  // и «Telegram ID» — те же ключи, что у «Покажите менеджеру» на регистрации: смысл один.
  profile_callsign: {
    ru: 'Позывной',
    uz: 'Pozivnoy',
  },
  profile_license: {
    ru: 'Номер ВУ',
    uz: 'Guvohnoma raqami',
  },
  /** Телефона у профиля нет: у нерабочей учётки парк его не отдаёт. */
  profile_phone_missing: {
    ru: 'нет в парке',
    uz: "parkda yo'q",
  },
  /** Подписи глазика у номера ВУ — для экранного чтеца: на экране у кнопки слов нет. */
  profile_license_show: {
    ru: 'Показать номер целиком',
    uz: "Raqamni to'liq ko'rsatish",
  },
  profile_license_hide: {
    ru: 'Скрыть номер',
    uz: 'Raqamni yashirish',
  },
  profile_settings: {
    ru: 'Настройки',
    uz: 'Sozlamalar',
  },
  /** Строка настроек и заголовок шторки языка. */
  profile_language: {
    ru: 'Язык',
    uz: 'Til',
  },
  profile_reset: {
    ru: 'Сбросить сессию',
    uz: 'Seansni qayta boshlash',
  },
  /** Шторка подтверждения сброса: вопрос и два абзаца пояснения под ним. */
  profile_reset_title: {
    ru: 'Сбросить сессию?',
    uz: 'Seans qayta boshlansinmi?',
  },
  profile_reset_note: {
    ru: 'Приложение закроется, а бот пришлёт кнопку «Открыть приложение» — нажмите её, и всё загрузится заново.',
    uz: "Ilova yopiladi, bot esa «Ilovani ochish» tugmasini yuboradi — uni bosing, hammasi qaytadan yuklanadi.",
  },
  profile_reset_kept: {
    ru: 'Профиль и баллы не изменятся.',
    uz: "Profil va ballar o'zgarmaydi.",
  },
  button_reset: {
    ru: 'Сбросить',
    uz: 'Qayta boshlash',
  },
  button_cancel: {
    ru: 'Отменить',
    uz: 'Bekor qilish',
  },
  language_sheet_subtitle: {
    ru: 'Приложение и уведомления бота — на этом языке',
    uz: 'Ilova va bot bildirishnomalari — shu tilda',
  },
  /**
   * Названия языков в шторке — на самих языках, одинаковые на любом экране: узбекоговорящий
   * найдёт «O'zbek» и на русском. Не ключи шага 1 регистрации: там «O'zbekcha», здесь — как
   * в макете шторки.
   */
  language_name_ru: { ru: 'Русский', uz: 'Русский' },
  language_name_uz: { ru: "O'zbek", uz: "O'zbek" },
  button_save: {
    ru: 'Сохранить',
    uz: 'Saqlash',
  },
  button_close: {
    ru: 'Закрыть',
    uz: 'Yopish',
  },
  /** Повтор запроса, который не прочитался, — в блоках главной и в разделах. */
  button_retry: {
    ru: 'Повторить',
    uz: 'Qayta urinish',
  },
  /** Ответ на вопрос шторки — «Отменить заказ?». */
  button_yes: {
    ru: 'Да',
    uz: 'Ha',
  },
  button_no: {
    ru: 'Нет',
    uz: "Yo'q",
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
  /** Массовое начисление и приз сундука акции — одним словом: и то и другое водитель знает как акцию. */
  reason_campaign: {
    ru: 'Акция',
    uz: 'Aksiya',
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
  /** Возврат на прошлый экран — своей кнопкой: системная кнопка Telegram в приложении не используется. */
  button_back: {
    ru: 'Назад',
    uz: 'Orqaga',
  },
  /** Запрос не дошёл до ответа: сервер сказать ничего не мог, говорит экран. */
  request_failed: {
    ru: 'Приложение не ответило. Проверьте связь и попробуйте ещё раз.',
    uz: "Ilova javob bermadi. Aloqani tekshirib, qaytadan urinib ko'ring.",
  },
  offices_empty: {
    ru: 'Офисы, где можно обменять баллы, пока не открыты.',
    uz: "Ballarni almashtirish mumkin bo'lgan ofislar hozircha ochilmagan.",
  },
  offices_failed: {
    ru: 'Не удалось загрузить офисы. Попробуйте ещё раз.',
    uz: "Ofislarni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
  },
  /** Пустая витрина говорит словами, а не показывает пустую сетку. */
  showcase_empty: {
    ru: 'Здесь появятся товары, которые можно взять за баллы в этом офисе. Сейчас их нет — загляните в другой офис.',
    uz: "Bu yerda shu ofisda ballarga olish mumkin bo'lgan mahsulotlar paydo bo'ladi. Hozircha ular yo'q — boshqa ofisga qarab ko'ring.",
  },
  showcase_failed: {
    ru: 'Не удалось загрузить товары. Попробуйте ещё раз.',
    uz: "Mahsulotlarni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
  },
  unit_pieces: {
    ru: 'шт.',
    uz: 'dona',
  },
  unit_points: {
    ru: 'баллов',
    uz: 'ball',
  },
  cart_total: {
    ru: 'Сумма',
    uz: 'Jami',
  },
  /** Итог на витрине одной строкой: «Сумма · 2 310», «Останется · 140» — короткие, чтобы держались на 320. */
  cart_balance_after: {
    ru: 'Останется',
    uz: 'Qoladi',
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
  /** Шапка каталога и блок каталога на главной. */
  catalog_title: {
    ru: 'Каталог',
    uz: 'Katalog',
  },
  catalog_all: {
    ru: 'Весь каталог',
    uz: 'Butun katalog',
  },
  /** Блок каталога на главной, когда товаров нет ни в одном офисе. */
  catalog_empty: {
    ru: 'Здесь появятся товары, которые можно взять за баллы.',
    uz: "Bu yerda ballarga olish mumkin bo'lgan mahsulotlar paydo bo'ladi.",
  },
  /** Шторка выбора офиса — и при первом входе в каталог, и при смене. */
  office_sheet_title: {
    ru: 'Где заберёте товары?',
    uz: 'Mahsulotlarni qayerdan olasiz?',
  },
  office_sheet_subtitle: {
    ru: 'Выберите офис. В каждом свой набор, и заказ забирается там, где вы его оформили.',
    uz: "Ofisni tanlang. Har birida o'z to'plami bor, buyurtma esa rasmiylashtirilgan joydan olinadi.",
  },
  /** Смена офиса со строки «Офис · …» над витриной. */
  office_change: {
    ru: 'Сменить',
    uz: "O'zgartirish",
  },
  /** Над кнопками шторки офиса: отмечен другой офис, а корзина не пуста. */
  office_change_warning: {
    ru: 'Корзина очистится: в другом офисе свой набор',
    uz: "Savat tozalanadi: boshqa ofisda o'z to'plami bor",
  },
  /**
   * Остаток на пилюле плитки: «8 шт». Подставляет экран — число приходит с витриной,
   * а тексты раньше неё, с экраном участника.
   */
  stock_pieces: {
    ru: '{count} шт',
    uz: '{count} dona',
  },
  /** Слово на пилюле скидки. Одно на оба языка — так в макете. */
  sale_label: {
    ru: 'SALE',
    uz: 'SALE',
  },
  /** Подписи кнопок счётчика «− N +» — для экранного чтеца: на экране слов нет. */
  stepper_decrease: {
    ru: 'Убрать одну',
    uz: 'Bittasini olib tashlash',
  },
  stepper_increase: {
    ru: 'Добавить',
    uz: "Qo'shish",
  },
  stepper_increase_more: {
    ru: 'Добавить ещё',
    uz: "Yana qo'shish",
  },
  order_title: {
    ru: 'Заказ № {number}',
    uz: 'Buyurtma № {number}',
  },
  order_code_title: {
    ru: 'Код для выдачи — назовите его в офисе',
    uz: 'Olish kodi — uni ofisda ayting',
  },
  /** Срок висящего заказа после слова состояния: «Ждёт выдачи · заберите до 23.09, 14:32». */
  order_expires_short: {
    ru: 'заберите до {moment}',
    uz: '{moment} gacha olib keting',
  },
  order_status_pending: {
    ru: 'Ждёт выдачи',
    uz: 'Berilishini kutmoqda',
  },
  /** Слова состояния закрытого заказа — без даты: момент стоит отдельно, после точки. */
  order_state_issued: {
    ru: 'Выдан',
    uz: 'Berildi',
  },
  order_state_cancelled: {
    ru: 'Отменён',
    uz: 'Bekor qilindi',
  },
  /** Подпись под суммой закрытого заказа: что стало с баллами. */
  order_amount_spent: {
    ru: 'списано со счёта',
    uz: 'hisobdan yechildi',
  },
  order_amount_returned: {
    ru: 'вернулось на счёт',
    uz: 'hisobga qaytdi',
  },
  /** Строка-действие внизу карточки заказа: у висящего зовёт за кодом, у закрытого — посмотреть. */
  order_action_code: {
    ru: 'Код для выдачи — внутри',
    uz: 'Olish kodi — ichida',
  },
  order_action_view: {
    ru: 'Просмотреть',
    uz: "Ko'rish",
  },
  order_office_title: {
    ru: 'Где забрать',
    uz: 'Qayerdan olish',
  },
  order_lines_title: {
    ru: 'Состав заказа',
    uz: 'Buyurtma tarkibi',
  },
  /** Хвост подписи строки состава, когда штук больше одной: «2 шт. · 150 баллов за штуку». */
  order_line_each: {
    ru: 'за штуку',
    uz: 'donasi uchun',
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
  /** Заголовок шторки отмены. Что станет с баллами — отдельной строкой под ним, `cancel_order_hint`. */
  cancel_order_question: {
    ru: 'Отменить заказ?',
    uz: 'Buyurtma bekor qilinsinmi?',
  },
  /** Подзаголовок шторки отмены: последствие отдельно от вопроса, чтобы его прочитали (Руслан, 25-09-2026). */
  cancel_order_hint: {
    ru: 'Баллы вернутся на баланс.',
    uz: 'Ballar hisobingizga qaytadi.',
  },
  orders_title: {
    ru: 'Мои заказы',
    uz: 'Buyurtmalarim',
  },
  /** Ссылка в шапке блока заказов на главной — в раздел. */
  orders_all: {
    ru: 'Все заказы',
    uz: 'Barcha buyurtmalar',
  },
  /** Подписи групп раздела «Мои заказы»; счётчик у ждущих ставит экран. */
  orders_group_pending: {
    ru: 'Ждут выдачи',
    uz: 'Berilishini kutmoqda',
  },
  orders_group_past: {
    ru: 'История заказов',
    uz: 'Buyurtmalar tarixi',
  },
  /** Строка под группой, в которой ничего нет, — группа остаётся на месте с нулём. */
  group_empty: {
    ru: 'Здесь пусто',
    uz: "Bu yer bo'sh",
  },
  /** Заказов не было — на главной и в пустом разделе, одним текстом. */
  orders_empty: {
    ru: 'Здесь появятся товары, которые вы обменяете на баллы.',
    uz: "Bu yerda ballarga almashtirgan mahsulotlaringiz paydo bo'ladi.",
  },
  orders_failed: {
    ru: 'Не удалось загрузить заказы. Попробуйте ещё раз.',
    uz: "Buyurtmalarni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
  },

  // Раздел «Мои награды» (issue #172). Узбекский — черновой: вычитывает переводчик одной
  // волной ближе к выкату.
  rewards_title: {
    ru: 'Мои награды',
    uz: 'Mukofotlarim',
  },
  /** Ссылка в шапке блока наград на главной — в раздел. */
  rewards_all: {
    ru: 'Все награды',
    uz: 'Barcha mukofotlar',
  },
  /** Обещание кода на карточке ждущей награды на главной: самого кода там нет. */
  reward_code_inside: {
    ru: 'код внутри',
    uz: 'kod ichida',
  },
  /** Наград не было — на главной и в пустом разделе, одним текстом. */
  rewards_empty: {
    ru: 'Здесь появятся награды из акций и подарки от парка — баллы, товары и призы.',
    uz: "Bu yerda aksiyalardan mukofotlar va parkdan sovg'alar paydo bo'ladi — ballar, mahsulotlar va sovrinlar.",
  },
  rewards_failed: {
    ru: 'Не удалось загрузить награды. Попробуйте ещё раз.',
    uz: "Mukofotlarni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
  },
  reward_code_title: {
    ru: 'Код для выдачи — покажите этот экран в офисе',
    uz: "Olish kodi — bu ekranni ofisda ko'rsating",
  },
  /** Заголовок экрана награды и подпись строки награды на нём — одно слово, как в макете. */
  reward_screen_title: {
    ru: 'Награда',
    uz: 'Mukofot',
  },
  /** Подписи групп раздела «Мои награды»; счётчик у ждущих ставит экран. */
  rewards_group_awaiting: {
    ru: 'Ждут в офисе',
    uz: 'Ofisda kutmoqda',
  },
  rewards_group_past: {
    ru: 'История наград',
    uz: 'Mukofotlar tarixi',
  },
  /** Слово состояния баллов — и в разделе, и на главной, где после точки стоит дата. */
  reward_state_credited: {
    ru: 'На балансе',
    uz: 'Hisobingizda',
  },
  /** Строка ждущей на главной целиком: порядок слов на узбекском другой, склейка на клиенте его сломала бы. */
  reward_state_awaiting: {
    ru: 'Ждёт в офисе до {date}',
    uz: '{date} gacha ofisda kutmoqda',
  },
  /** Слова состояния награды — без даты: она стоит после точки, `reward_until` или датой. */
  reward_word_awaiting: {
    ru: 'Ждёт в офисе',
    uz: 'Ofisda kutmoqda',
  },
  reward_word_issued: {
    ru: 'Получена',
    uz: 'Olindi',
  },
  reward_word_expired: {
    ru: 'Срок вышел',
    uz: 'Muddati tugadi',
  },
  /** Срок ждущей после слова состояния в разделе: «Ждёт в офисе · до 5 октября». */
  reward_until: {
    ru: 'до {date}',
    uz: '{date} gacha',
  },
  /** Срок ждущей на экране награды: «Ждёт в офисе · заберите до 5 октября». */
  reward_claim_until: {
    ru: 'заберите до {date}',
    uz: '{date} gacha olib keting',
  },
  /** Причина сгоревшей — строкой под состоянием: короче в разделе, целиком на экране награды. */
  reward_expired_reason: {
    ru: 'Не забрали в офисе до срока',
    uz: 'Muddatida ofisdan olinmadi',
  },
  reward_expired_reason_full: {
    ru: 'Не забрали в офисе до срока — награда сгорела',
    uz: "Muddatida ofisdan olinmadi — mukofot yo'qoldi",
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
  // Лестница сундуков (issue #181) — по `product/design/comeback/03-member-chests-states.md`
  // и `04-day-chests-sheet.md`. Какая строка к какому состоянию — `memberProgress.ts`.
  campaign_chests_day_title: {
    ru: 'Сундуки дня',
    uz: 'Kun sandiqlari',
  },
  campaign_chests_three_days_title: {
    ru: 'Сундук трёх дней',
    uz: "Uch kun sandig'i",
  },
  campaign_chests_week_title: {
    ru: 'Сундук недели',
    uz: "Hafta sandig'i",
  },
  /** Сундуков дня ещё нет — строка говорит условие. */
  campaign_chests_day_idle: {
    ru: 'по одному за взятый день',
    uz: 'har bir olingan kun uchun bittadan',
  },
  /** Все заработанные сундуки дня открыты; сколько — счётчиком рядом. */
  campaign_chests_day_opened: {
    ru: 'открыты',
    uz: 'ochildi',
  },
  campaign_chests_to_open: {
    ru: 'К открытию: {count}',
    uz: 'Ochishga: {count}',
  },
  /** Открытый сундук — ступени и карточки дня одним словом. */
  campaign_chest_opened: {
    ru: 'открыт',
    uz: 'ochildi',
  },
  campaign_chest_unreachable: {
    ru: 'не в этот раз',
    uz: 'bu safar emas',
  },
  /** Условие недели. Порог — пятёрка, форма «дней» при нём не меняется. */
  campaign_chest_week_condition: {
    ru: 'за {required} дней из {total}',
    uz: '{total} kundan {required} kun uchun',
  },
  campaign_chest_card_ahead: {
    ru: 'впереди',
    uz: 'oldinda',
  },
  /** Счёт дня на карточке — у сегодняшнего и у упущенного. «0 из 5» остаётся (04-day-chests-sheet.md). */
  campaign_chest_card_trips: {
    ru: '{trips} из {goal}',
    uz: '{goal} dan {trips}',
  },
  campaign_chest_card_open: {
    ru: 'открыть',
    uz: 'ochish',
  },
  campaign_chest_card_missed: {
    ru: 'упущен',
    uz: "o'tkazib yuborildi",
  },
  /** Что выпало, — после открытия. */
  campaign_chest_prize: {
    ru: 'Ваш приз: {prize}',
    uz: "Sovg'angiz: {prize}",
  },
  campaign_chest_rewards_hint: {
    ru: 'Посмотреть награду можно в разделе «Мои награды и призы»',
    uz: "Mukofotni «Mukofotlarim va sovg'alarim» bo'limida ko'rish mumkin",
  },
  /**
   * Акция водителю уже не видна: сундуки вскрыты в 21:00, пока экран был открыт, или окно
   * кончилось у не вступившего.
   */
  campaign_chest_denied_campaign: {
    ru: 'Акция сейчас недоступна',
    uz: 'Aksiya hozir mavjud emas',
  },
  campaign_chest_denied_not_earned: {
    ru: 'Этот сундук пока не ваш',
    uz: 'Bu sandiq hali sizniki emas',
  },
  /**
   * Выпавшего товара не оказалось на полке. Приз не называется намеренно: знай водитель,
   * что выпало, повторное нажатие стало бы осознанной пересдачей.
   */
  campaign_chest_denied_prize: {
    ru: 'Приз сейчас недоступен, попробуйте позже или подойдите в офис',
    uz: "Sovg'a hozir mavjud emas, keyinroq urinib ko'ring yoki ofisga murojaat qiling",
  },
  // Завершённая акция (issue #182) — рабочий минимум строками; макет — планировочная T50.
  // Какое состояние когда — `describeCampaignFinish` в `memberProgress.ts`.
  /**
   * Не дотянул, итог не подведён. Итог не объявляется: опоздавшая поездка ещё может дозачесть
   * прошлый день, и «не дотянули», отменённое через минуту, хуже молчания.
   */
  campaign_finish_awaiting_title: {
    ru: 'Акция для вас завершена',
    uz: 'Aksiya siz uchun yakunlandi',
  },
  campaign_finish_awaiting: {
    ru: 'Итоги подводятся утром — загляните после 09:00.',
    uz: "Natijalar ertalab chiqariladi — soat 09:00 dan keyin qarang.",
  },
  campaign_finish_open_chests_title: {
    ru: 'Акция закончена',
    uz: 'Aksiya tugadi',
  },
  /** Неоткрытое вскроется само в 21:00, и сказать об этом — честнее, чем торопить молча. */
  campaign_finish_open_chests: {
    ru: 'Откройте сундуки и заберите подарки. В 21:00 неоткрытые откроются сами.',
    uz: "Sandiqlarni oching va sovg'alaringizni oling. Soat 21:00 da ochilmaganlari o'zi ochiladi.",
  },
  campaign_finish_completed_title: {
    ru: 'Поздравляем, {name}! Ваша акция завершена',
    uz: 'Tabriklaymiz, {name}! Aksiyangiz yakunlandi',
  },
  /** Не дотянул до недели: поздравлять не с чем, перечень собранного — второй строкой. */
  campaign_finish_thanks_title: {
    ru: 'Акция завершена. Спасибо за участие, {name}!',
    uz: 'Aksiya yakunlandi. Ishtirokingiz uchun rahmat, {name}!',
  },
  campaign_finish_collected: {
    ru: 'Собрано: {list}',
    uz: "To'plandi: {list}",
  },
  campaign_finish_three_days: {
    ru: 'сундук трёх дней',
    uz: "uch kun sandig'i",
  },
  campaign_finish_week: {
    ru: 'сундук недели',
    uz: "hafta sandig'i",
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
   * Текст нейтральный и не говорит, что аккаунт принадлежит сотруднику: скриншот экрана могут
   * переслать водителю. Списка офисов под ним нет, в отличие от семи отказов «в офис»: сотрудник
   * в офисе и так работает.
   */
  employee_account: {
    ru: 'Зарегистрироваться с этого аккаунта не получится.\nОбратитесь в офис Xalq Taxi — там помогут.',
    uz: "Bu akkaunt orqali ro'yxatdan o'tib bo'lmaydi.\nXalq Taxi ofisiga murojaat qiling — u yerda yordam berishadi.",
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

  // Итог и вскрытие акции (issue #182). Обе точки стоят на границах окна отправки 09:00–21:00.
  /** 09:00, у вступившего остались неоткрытые. `{chests}` — «2 неоткрытых сундука». */
  notification_campaign_finished_chests: {
    ru: '🎁 Акция «{title}» закончена. У вас {chests} — откройте их сегодня в приложении. В 21:00 неоткрытые откроются сами.',
    uz: "🎁 «{title}» aksiyasi tugadi. Sizda {chests} bor — bugun ilovada oching. Soat 21:00 da ochilmaganlari o'zi ochiladi.",
  },
  notification_campaign_finished_returned: {
    ru: '🏆 Акция «{title}» закончена: вы взяли цель в {done} из {total} дней. Спасибо, что были с нами!',
    uz: "🏆 «{title}» aksiyasi tugadi: siz {total} kundan {done} kunida maqsadga erishdingiz. Biz bilan bo'lganingiz uchun rahmat!",
  },
  notification_campaign_finished_joined: {
    ru: 'Акция «{title}» закончена. Спасибо за участие!',
    uz: '«{title}» aksiyasi tugadi. Ishtirokingiz uchun rahmat!',
  },
  notification_campaign_finished_not_joined: {
    ru: 'Акция «{title}» закончилась.',
    uz: '«{title}» aksiyasi tugadi.',
  },
  /** 21:00. Под ним — строка на каждый вскрытый сундук и, если есть что забирать, где и до когда. */
  notification_campaign_chests_revealed: {
    ru: '🎁 Неоткрытые сундуки акции «{title}» открылись. Вам выпало:',
    uz: "🎁 «{title}» aksiyasining ochilmagan sandiqlari ochildi. Sizga tushdi:",
  },
  notification_revealed_points_line: {
    ru: '• {prize} — уже на балансе',
    uz: '• {prize} — allaqachon hisobingizda',
  },
  notification_revealed_office_line: {
    ru: '• {prize} — ждёт в офисе',
    uz: '• {prize} — ofisda kutmoqda',
  },
  /** Где забирать — ровно тот вопрос, с которым водитель иначе позвонит. */
  notification_revealed_pickup: {
    ru: 'Заберите подарки в офисе «{office}» до {date}: покажите код из раздела «Мои награды и призы».',
    uz: "Sovg'alarni «{office}» ofisidan {date} gacha olib keting: «Mukofotlarim va sovg'alarim» bo'limidagi kodni ko'rsating.",
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
  | 'campaign_today_goal_waiting'
  | 'campaign_chest_three_days_condition'
  | 'campaign_chest_days_left'
  | 'campaign_finish_day_chests'
  | 'notification_unopened_chests';

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
  /** Условие сундука трёх дней, пока не взят ни один день. */
  campaign_chest_three_days_condition: {
    ru: {
      one: 'за {count} день с целью',
      few: 'за {count} дня с целью',
      many: 'за {count} дней с целью',
    },
    uz: {
      one: '{count} kun maqsad bilan',
      few: '{count} kun maqsad bilan',
      many: '{count} kun maqsad bilan',
    },
  },
  /** Ступень достижима и начата: сколько зачётных дней осталось. */
  campaign_chest_days_left: {
    ru: {
      one: 'ещё {count} день — и он ваш',
      few: 'ещё {count} дня — и он ваш',
      many: 'ещё {count} дней — и он ваш',
    },
    uz: {
      one: 'yana {count} kun — va u sizniki',
      few: 'yana {count} kun — va u sizniki',
      many: 'yana {count} kun — va u sizniki',
    },
  },
  /** Перечень собранного в блоке завершённой акции. */
  campaign_finish_day_chests: {
    ru: {
      one: '{count} сундук дня',
      few: '{count} сундука дня',
      many: '{count} сундуков дня',
    },
    uz: {
      one: "{count} ta kun sandig'i",
      few: "{count} ta kun sandig'i",
      many: "{count} ta kun sandig'i",
    },
  },
  /** Сообщение об итоге: «У вас 2 неоткрытых сундука». */
  notification_unopened_chests: {
    ru: {
      one: '{count} неоткрытый сундук',
      few: '{count} неоткрытых сундука',
      many: '{count} неоткрытых сундуков',
    },
    uz: {
      one: '{count} ta ochilmagan sandiq',
      few: '{count} ta ochilmagan sandiq',
      many: '{count} ta ochilmagan sandiq',
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
