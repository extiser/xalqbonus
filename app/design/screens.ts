/**
 * Экраны и состояния служебной страницы `/design` — по строке на адрес `/design/{slug}`.
 *
 * Список один на оглавление и на страницу экрана: адрес, которого здесь нет, отвечает 404,
 * а не пустой колонкой.
 */
export interface DesignScreen {
  slug: string;
  title: string;
  /**
   * Откуда снято — файл макета. Регистрация, главная, разделы с шапкой, каталог, подарки, демо и сотрудник — пути снимка
   * `_reference/design/`; у профиля и акции часть путей — макеты вне снимка.
   */
  source: string;
}

export interface DesignGroup {
  title: string;
  screens: DesignScreen[];
}

export const DESIGN_GROUPS: DesignGroup[] = [
  {
    title: 'Регистрация и служебные экраны',
    screens: [
      { slug: 'app-loading', title: 'Загрузка — кнопкой внизу проверяется уход', source: 'registration/state-loading.html' },
      { slug: 'app-load-failed', title: 'Не удалось загрузить', source: 'registration/state-load-failed.html' },
      { slug: 'app-not-telegram', title: 'Открыто не из Telegram', source: 'registration/state-not-telegram.html' },
      { slug: 'app-outdated-telegram', title: 'Устаревший Telegram', source: 'registration/state-outdated-telegram.html' },
      { slug: 'registration-language', title: 'Шаг 1 — язык', source: 'registration/registration-language.html' },
      { slug: 'registration-phone', title: 'Шаг 2 — номер', source: 'registration/registration-screen.html' },
      { slug: 'registration-phone-checking', title: 'Шаг 2 — проверяем номер', source: 'registration/registration-screen.html' },
      { slug: 'registration-refused', title: 'Отказ «в офис» — person_already_linked', source: 'registration/registration-refused.html' },
      { slug: 'registration-retry', title: 'Повтор — проверка не прошла', source: 'registration/registration-retry.html' },
      { slug: 'registration-retry-checking', title: 'Повтор — проверяем номер', source: 'registration/registration-retry.html' },
      { slug: 'registration-employee', title: 'Отказ сотруднику', source: 'registration/registration-employee.html' },
      { slug: 'registration-employee-denied', title: 'Сотрудник с выключенной учёткой', source: 'registration/state-employee-denied.html' },
    ],
  },
  {
    title: 'Заявка кандидата',
    screens: [
      { slug: 'application-form', title: 'Экран заявки — поле пустое', source: 'application/01-form.html' },
      { slug: 'application-filled', title: 'Экран заявки — имя вписано', source: 'application/01-form.html#filled' },
      { slug: 'application-declined', title: 'Экран заявки — «Отмена» в окне номера', source: 'application/01-form.html#declined' },
      { slug: 'application-old', title: 'Экран заявки — старый Telegram, номер руками', source: 'application/01-form.html#old' },
      { slug: 'application-sending', title: 'Экран заявки — отправляем', source: 'application/01-form.html' },
      { slug: 'application-accepted', title: 'Заявка принята — напишет в Telegram', source: 'application/02-accepted.html' },
      { slug: 'application-accepted-call', title: 'Заявка принята — позвонит', source: 'application/02-accepted.html#call' },
      { slug: 'application-repeat', title: 'Заявка уже отправлена', source: 'application/04-repeat.html' },
      { slug: 'application-repeat-call', title: 'Заявка уже отправлена — позвонит', source: 'application/04-repeat.html#call' },
      { slug: 'application-failed', title: 'Сбой отправки', source: 'application/03-failed.html' },
      { slug: 'application-failed-busy', title: 'Сбой отправки — повтор идёт', source: 'application/03-failed.html#busy' },
    ],
  },
  {
    title: 'Главный экран',
    screens: [
      { slug: 'home', title: 'Участник акции — эталон', source: 'home/main-screen.html, catalog/catalog-block.html' },
      { slug: 'home-invite', title: 'В снимке акции, не вступил — плашка приглашения', source: 'home/main-screen-invite.html' },
      { slug: 'home-survey', title: 'Опрос начат — плашка «Опрос не закончен»', source: 'survey/main-screen-survey.html' },
      { slug: 'home-survey-start', title: 'Опрос открыт без ответов — плашка «Пройдите опрос»', source: 'survey/main-screen-survey-start.html' },
      { slug: 'home-several', title: 'Ждут несколько заказов и наград', source: 'home/orders-block.html, home/rewards-block.html' },
      { slug: 'home-quiet', title: 'Забирать нечего — последний заказ выдан, без акции', source: 'home/orders-block.html, home/rewards-block.html' },
      { slug: 'home-quiet-cancelled', title: 'Забирать нечего — последний заказ отменён', source: 'home/orders-block.html' },
      { slug: 'home-newcomer', title: 'Новичок — заказов, наград и истории не было, каталог пуст', source: 'home/orders-block.html, home/rewards-block.html, home/history-block.html, catalog/catalog-block.html' },
      { slug: 'home-welcome', title: 'Новичок до бонуса — слайд «+300», 1 из 5', source: 'home/main-screen-welcome.html' },
      { slug: 'home-welcome-almost', title: 'Новичок до бонуса — «Ещё 1 поездка»', source: 'home/main-screen-welcome.html' },
      { slug: 'home-welcome-uz', title: 'Новичок до бонуса — узбекский', source: 'home/main-screen-welcome.html' },
      { slug: 'home-welcome-awarded', title: 'Бонус выдан — «Ура! Бонус зачислен!» и «Спасибо»', source: 'home/main-screen-welcome-awarded.html' },
      { slug: 'home-welcome-awarded-uz', title: 'Бонус выдан — узбекский', source: 'home/main-screen-welcome-awarded.html' },
      { slug: 'home-welcome-thanked', title: '«Спасибо» нажато — без слайдера и точек', source: 'home/main-screen.html' },
      { slug: 'home-loading', title: 'История грузится', source: 'home/history-block.html' },
      { slug: 'home-errors', title: 'Не загрузилось', source: 'home/*-block.html, catalog/catalog-block.html' },
    ],
  },
  {
    title: 'Опрос',
    screens: [
      { slug: 'survey-intro', title: 'Экран открытия', source: 'survey/intro.html' },
      { slug: 'survey-intro-free', title: 'Экран открытия — опрос без награды', source: 'survey/intro.html' },
      { slug: 'survey-multiple', title: 'Несколько ответов — исключающий и «Свой вариант»', source: 'survey/question-multiple.html' },
      { slug: 'survey-scale', title: 'Шкала 1–5', source: 'survey/question-scale.html' },
      { slug: 'survey-single', title: 'Один ответ со «Своим вариантом»', source: 'survey/question-single-own.html' },
      { slug: 'survey-single-own', title: 'Один ответ — «Свой вариант» открыт', source: 'survey/question-single-own.html' },
      { slug: 'survey-save-failed', title: 'Ответ не сохранился', source: 'survey/question-single-own.html' },
      { slug: 'survey-text', title: 'Свободный ответ — необязательный, «Пропустить»', source: 'survey/question-text.html' },
      { slug: 'survey-finish', title: 'Финал', source: 'survey/finish.html, survey/survey.md' },
      { slug: 'survey-finish-free', title: 'Финал — опрос без награды', source: 'survey/finish.html' },
      { slug: 'survey-closed', title: 'Опрос закрыт', source: 'survey/closed.html' },
    ],
  },
  {
    title: 'Подарки',
    screens: [
      { slug: 'gifts-home-one', title: 'Главная — один подарок первым в «Моих наградах»', source: 'gifts/main-screen-gift-sheet.html' },
      { slug: 'gifts-home', title: 'Главная — два подарка первыми в «Моих наградах»', source: 'gifts/main-screen-gift.html' },
      { slug: 'gifts-sheet-one', title: 'Шторка — один подарок', source: 'gifts/main-screen-gift-sheet.html' },
      { slug: 'gifts-sheet', title: 'Шторка — два подарка и «Забрать всё»', source: 'gifts/main-screen-gifts-sheet.html' },
      {
        slug: 'gifts-take',
        title: '«Забрать» — ожидание, лопание, ошибка у второй, «Забрать всё», уход шторки',
        source: 'gifts/main-screen-gifts-take.html',
      },
      { slug: 'gifts-rewards', title: '«Мои награды» — группа подарков сверху', source: 'gifts/rewards-screen-gift.html' },
    ],
  },
  {
    title: 'Каталог',
    screens: [
      { slug: 'catalog-no-office', title: 'Каталог без офиса', source: 'catalog/catalog-no-office.html' },
      { slug: 'catalog-no-office-focus', title: 'Каталог без офиса — переход с товара на главной', source: 'catalog/catalog-no-office-focus.html' },
      { slug: 'catalog-pick-office', title: 'Шторка «Где заберёте?» — офисы товара с остатком', source: 'catalog/catalog-pick-office.html' },
      { slug: 'catalog-pick-office-sold-out', title: 'Шторка «Где заберёте?» — товар закончился', source: 'catalog/catalog-pick-office-sold-out.html' },
      { slug: 'catalog-office-picked', title: 'Витрина выбранного офиса — приглушённые и подсказка', source: 'catalog/catalog-office-picked.html' },
      { slug: 'catalog-exit', title: 'Шторка «Выйти из каталога?»', source: 'catalog/catalog-exit-sheet.html' },
      { slug: 'catalog-loading', title: 'Загрузка витрины — скелет', source: 'catalog/catalog-loading.html' },
      { slug: 'catalog', title: 'Витрина офиса', source: 'catalog/catalog-showcase.html' },
      { slug: 'catalog-nothing', title: 'Витрина 1: ничего не выбрано', source: 'catalog/catalog-showcase-states.html' },
      { slug: 'catalog-over-balance', title: 'Витрина 2: сумма больше баланса', source: 'catalog/catalog-showcase-states.html' },
      { slug: 'catalog-stock-limit', title: 'Витрина 3: взял всё, что есть', source: 'catalog/catalog-showcase-states.html' },
      { slug: 'catalog-empty', title: 'Витрина 4: в офисе нет товаров', source: 'catalog/catalog-showcase-states.html' },
      { slug: 'catalog-error', title: 'Витрина 5: не загрузилось', source: 'catalog/catalog-showcase-states.html' },
      { slug: 'catalog-office', title: 'Смена офиса — отмечен текущий', source: 'catalog/catalog-office-sheet.html' },
      { slug: 'catalog-office-other', title: 'Смена офиса — отмечен другой, в корзине товары', source: 'catalog/catalog-office-sheet.html' },
      { slug: 'catalog-confirm', title: 'Подтверждение заказа', source: 'catalog/catalog-confirm.html' },
      { slug: 'catalog-confirm-placing', title: 'Подтверждение — оформляется', source: 'catalog/catalog-confirm-states.html' },
      { slug: 'catalog-confirm-denied', title: 'Подтверждение — отказ', source: 'catalog/catalog-confirm-states.html' },
    ],
  },
  {
    title: 'История баллов',
    screens: [
      { slug: 'history', title: 'Страница 25 строк, дальше — прокруткой', source: 'home/history-block.html, home/section-bar.md' },
      { slug: 'history-more-loading', title: 'Следующая страница в пути', source: 'home/history-block.html' },
      { slug: 'history-more-failed', title: 'Следующая страница не пришла', source: 'catalog/catalog-confirm-states.html' },
      { slug: 'history-reasons', title: 'Все одиннадцать причин', source: 'home/history-block.html' },
      { slug: 'history-empty', title: 'Пусто — видом экрана', source: 'home/history-block.html, orders/orders-screen-empty.html' },
      { slug: 'history-error', title: 'Не загрузилось — видом экрана', source: 'home/history-block.html, orders/orders-screen-empty.html' },
      { slug: 'history-loading', title: 'Ждём ответа', source: 'home/history-block.html' },
    ],
  },
  {
    title: 'Мои награды',
    screens: [
      { slug: 'rewards', title: 'Ждут в офисе и история', source: 'orders/rewards-screen.html' },
      { slug: 'rewards-nopending', title: 'Ждущих нет — группа с нулём', source: 'orders/rewards-screen-nopending.html' },
      { slug: 'rewards-empty', title: 'Наград не было', source: 'orders/rewards-screen-empty.html' },
      { slug: 'rewards-error', title: 'Не загрузилось', source: 'orders/rewards-screen-empty.html' },
    ],
  },
  {
    title: 'Мои заказы',
    screens: [
      { slug: 'orders', title: 'Ждут выдачи и история', source: 'orders/orders-screen.html' },
      { slug: 'orders-nopending', title: 'Ждущих нет — группа с нулём', source: 'orders/orders-screen-nopending.html' },
      { slug: 'orders-empty', title: 'Заказов не было', source: 'orders/orders-screen-empty.html' },
      { slug: 'orders-error', title: 'Не загрузилось', source: 'orders/orders-screen-empty.html' },
    ],
  },
  {
    title: 'Экран заказа',
    screens: [
      { slug: 'order', title: 'Ждёт выдачи — код, офис, состав, отмена', source: 'orders/order-screen.html' },
      { slug: 'order-issued', title: 'Выдан', source: 'orders/order-screen-states.html' },
      { slug: 'order-cancelled', title: 'Отменён водителем', source: 'orders/order-screen-states.html' },
      { slug: 'order-expired', title: 'Не забран за сутки', source: 'orders/order-screen-states.html' },
      { slug: 'order-cancel', title: 'Шторка «Отменить заказ?»', source: 'comeback/04-day-chests-sheet.html, catalog/catalog-confirm.html' },
      { slug: 'order-cancel-busy', title: 'Шторка отмены — отменяется', source: 'catalog/catalog-confirm-states.html' },
      { slug: 'order-cancel-failed', title: 'Шторка отмены — отказ', source: 'catalog/catalog-confirm-states.html' },
    ],
  },
  {
    title: 'Экран награды',
    screens: [
      { slug: 'reward', title: 'Награда-товар — код, офис, зачёркнутая цена', source: 'orders/reward-screen.html' },
      { slug: 'reward-custom', title: 'Произвольная награда — значок подарка', source: 'orders/reward-screen-custom.html' },
      { slug: 'reward-issued', title: 'Получена', source: 'orders/reward-screen-states.html' },
      { slug: 'reward-expired', title: 'Срок вышел', source: 'orders/reward-screen-states.html' },
    ],
  },
  {
    title: 'Профиль',
    screens: [
      { slug: 'profile', title: 'Профиль — глазик, шторки сброса и языка', source: 'app/profile-screen.html, artboard/language-sheet.html' },
      { slug: 'profile-language', title: 'Открыта шторка языка', source: 'artboard/language-sheet.html' },
      { slug: 'profile-reset', title: 'Открыта шторка сброса', source: 'app/profile-screen.html' },
    ],
  },
  {
    title: 'Демо-аккаунт',
    screens: [
      { slug: 'demo', title: 'Главная демо-водителя — полоса «Демо-аккаунт» над шапкой', source: 'demo/01-main-screen-demo.html' },
      { slug: 'demo-sheet', title: 'Шторка «Войти как»', source: 'demo/01-main-screen-demo.html' },
      { slug: 'demo-history', title: 'Раздел под полосой — шапка раздела липнет ниже', source: 'demo/demo.md, home/section-bar.md' },
      { slug: 'demo-catalog', title: 'Витрина под полосой — строка офиса липнет ниже', source: 'demo/demo.md, catalog/catalog-showcase.html' },
    ],
  },
  {
    title: 'Акция «Неделя возвращения»',
    screens: [{ slug: 'promo', title: 'Экран приглашения', source: 'comeback/02-promo-hero.html' }],
  },
  {
    title: 'Экран участника акции',
    screens: [
      { slug: 'campaign', title: 'Экран участника — снимок 4 октября', source: 'comeback/03-member-screen.html' },
      { slug: 'campaign-heat-1', title: 'Накал 1: Ноль поездок — холодно', source: 'comeback/03-member-heat-scale.html' },
      { slug: 'campaign-heat-2', title: 'Накал 2: Первая поездка — холодно', source: 'comeback/03-member-heat-scale.html' },
      { slug: 'campaign-heat-3', title: 'Накал 3: Две из пяти — гранат', source: 'comeback/03-member-heat-scale.html' },
      { slug: 'campaign-heat-4', title: 'Накал 4: Три из пяти — гранат', source: 'comeback/03-member-heat-scale.html' },
      { slug: 'campaign-heat-5', title: 'Накал 5: Четыре из пяти — огонь', source: 'comeback/03-member-heat-scale.html' },
      { slug: 'campaign-heat-6', title: 'Накал 6: Цель взята — огонь, конфетти и «Открыть сундук»', source: 'comeback/03-member-heat-scale.html' },
      { slug: 'campaign-week-1', title: 'Неделя 1: Первый день окна', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-week-2', title: 'Неделя 2: Неделя идёт, запас есть', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-week-3', title: 'Неделя 3: Запас кончился', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-week-4', title: 'Неделя 4: Последний день', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-week-5', title: 'Неделя 5: Неделя собрана, окно ещё идёт', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-week-6', title: 'Неделя 6: Пять дней уже не набрать', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-week-7', title: 'Неделя 7: Сегодня цель уже взята', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-chests-1', title: 'Сундуки 1: Окно началось, поездок нет', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-2', title: 'Сундуки 2: Один день взят', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-3', title: 'Сундуки 3: Два дня, ступень близко', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-4', title: 'Сундуки 4: Три дня — сундук трёх дней можно открыть', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-5', title: 'Сундуки 5: Сундук трёх дней открыт', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-6', title: 'Сундуки 6: Пять дней — неделя собрана', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-7', title: 'Сундуки 7: Семь дней — всё окно', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-8', title: 'Сундуки 8: Пять дней уже не набрать', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-9', title: 'Сундуки 9: Итог: дошёл до трёх дней', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-10', title: 'Сундуки 10: Неделя подведена, большой ждёт открытия', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-11', title: 'Сундуки 11: Всё открыто — акция закрыта', source: 'comeback/03-member-chests-states.html' },
    ],
  },
  {
    title: 'Шторка «Сундуки дня»',
    screens: [
      { slug: 'day-chests', title: 'Эталон — открытие сундука с вылетом награды', source: 'comeback/04-day-chests-sheet.html' },
      { slug: 'day-chests-1', title: 'Сцена 1: День 1, первый заход', source: 'comeback/04-day-chests-sheet-states.html' },
      { slug: 'day-chests-2', title: 'Сцена 2: Середина окна — эталон, нажмите золотой сундук', source: 'comeback/04-day-chests-sheet-states.html' },
      { slug: 'day-chests-3', title: 'Сцена 3: Сегодня цель взята', source: 'comeback/04-day-chests-sheet-states.html' },
      { slug: 'day-chests-4', title: 'Сцена 4: Семь из семи', source: 'comeback/04-day-chests-sheet-states.html' },
      { slug: 'day-chests-5', title: 'Сцена 5: Окно кончилось, неоткрытые остались', source: 'comeback/04-day-chests-sheet-states.html' },
      { slug: 'day-chests-6', title: 'Сцена 6: Сундуки вскрыты за водителя', source: 'comeback/04-day-chests-sheet-states.html' },
      { slug: 'reward-tickets', title: 'Карточки награды — четыре ступени', source: 'comeback/06-reward-card-sketch.html' },
    ],
  },
  {
    title: 'Шторка «Сундук трёх дней»',
    screens: [
      { slug: 'big-chest-3days', title: 'Эталон — заработан, открытие с вылетом награды', source: 'comeback/05-3days-chest-sheet.html' },
      { slug: 'big-chest-3days-1', title: 'Сцена 1: Окно началось, дней нет — тап отказывает', source: 'comeback/05-3days-chest-states.html' },
      { slug: 'big-chest-3days-2', title: 'Сцена 2: Один день взят', source: 'comeback/05-3days-chest-states.html' },
      { slug: 'big-chest-3days-3', title: 'Сцена 3: До сундука один день', source: 'comeback/05-3days-chest-states.html' },
      { slug: 'big-chest-3days-4', title: 'Сцена 4: Сундук заработан — нажмите, чтобы открыть', source: 'comeback/05-3days-chest-states.html' },
      { slug: 'big-chest-3days-5', title: 'Сцена 5: Открыт', source: 'comeback/05-3days-chest-states.html' },
      { slug: 'big-chest-3days-6', title: 'Сцена 6: Окно кончилось — упущен', source: 'comeback/05-3days-chest-states.html' },
    ],
  },
  {
    title: 'Шторка «Сундук недели»',
    screens: [
      { slug: 'big-chest-week', title: 'Эталон — заработан, открытие с вылетом награды', source: 'comeback/05-week-chest-sheet.html' },
      { slug: 'big-chest-week-1', title: 'Сцена 1: Окно началось, дней нет — тап отказывает', source: 'comeback/05-week-chest-states.html' },
      { slug: 'big-chest-week-2', title: 'Сцена 2: Один день взят', source: 'comeback/05-week-chest-states.html' },
      { slug: 'big-chest-week-3', title: 'Сцена 3: До сундука один день', source: 'comeback/05-week-chest-states.html' },
      { slug: 'big-chest-week-4', title: 'Сцена 4: Сундук заработан — нажмите, чтобы открыть', source: 'comeback/05-week-chest-states.html' },
      { slug: 'big-chest-week-5', title: 'Сцена 5: Открыт', source: 'comeback/05-week-chest-states.html' },
      { slug: 'big-chest-week-6', title: 'Сцена 6: Окно кончилось — упущен', source: 'comeback/05-week-chest-states.html' },
    ],
  },
  {
    title: 'Сотрудник',
    screens: [
      { slug: 'staff-office-picker', title: 'Выбор офиса', source: 'staff/01-office-picker.html' },
      { slug: 'staff-desk', title: 'Стойка', source: 'staff/02-desk.html' },
      { slug: 'staff-desk-empty', title: 'Стойка — никто не ждёт', source: 'staff/02-desk-empty.html' },
      { slug: 'staff-desk-office-sheet', title: 'Шторка «Сменить»', source: 'staff/02-desk-office-sheet.html' },
      { slug: 'staff-no-offices', title: 'Сотрудник без офисов', source: 'staff/02-desk-empty.html' },
      { slug: 'staff-order', title: 'Заказ на стойке', source: 'staff/03-order-card.html' },
      { slug: 'staff-order-issue', title: 'Шторка «Выдать заказ?»', source: 'staff/03-order-issue-sheet.html' },
      { slug: 'staff-order-cancel', title: 'Шторка «Отменить заказ?»', source: 'staff/03-order-cancel-sheet.html' },
      { slug: 'staff-reward', title: 'Награда на стойке', source: 'staff/04-reward-card.html' },
      { slug: 'staff-reward-issue', title: 'Шторка «Выдать награду?»', source: 'staff/04-reward-issue-sheet.html' },
      { slug: 'staff-desk-issued', title: 'Стойка — выдано', source: 'staff/05-desk-issued.html' },
      { slug: 'staff-desk-not-found', title: 'Стойка — код не найден', source: 'staff/05-desk-not-found.html' },
      { slug: 'staff-profile', title: 'Профиль — пароль не задан', source: 'staff/06-profile.html' },
    ],
  },
];

export function findDesignScreen(slug: string): DesignScreen | undefined {
  return DESIGN_GROUPS.flatMap((group) => group.screens).find((screen) => screen.slug === slug);
}
