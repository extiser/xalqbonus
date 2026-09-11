# Прогон разведки #81 на стенде

Файл живёт только в ветке `research/81-miniapp-phone` и снимается вместе с заглушкой.
На боевую машину не заходит ни CLI, ни Cowork, поэтому шаги ниже — руками.

Стенд: `@dev_xalqbonus_bot`, домен `xalq.bonusbot.uz`, стек в `/srv/xalqbonus`.

## 1. Выкатить ветку

```bash
cd /srv/xalqbonus
make prod-deploy ref=origin/research/81-miniapp-phone
```

Выкат делает `git reset --hard` на эту ссылку — после опыта машина возвращается
на `main` тем же способом (шаг 6).

## 2. Открыть два пути в nginx без пароля

Снаружи всё приложение закрыто `auth_basic` внутри `location /`. Webview Telegram пароля
не спрашивает: страница просто не откроется, и в логах приложения не будет ни строки —
ровно та же беда, от которой webhook вынесен отдельным правилом
(`docker/DEPLOY-MANUAL.md` → «Webhook не прячется за пароль»).

В существующий блок `server` домена `xalq.bonusbot.uz` — рядом с `location = /api/tg/webhook`,
ничего не переставляя:

```nginx
    # РАЗВЕДКА #81 — снимается после опыта, вместе с выкатом обратно на main.
    # Точное совпадение `=`, поэтому порядок правил в блоке значения не имеет.
    location = /miniapp-probe {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # РАЗВЕДКА #81 — снимается после опыта.
    location = /api/miniapp-probe/check {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        client_max_body_size 64k;
    }
```

```bash
nginx -t && systemctl reload nginx
curl -sS -o /dev/null -w '%{http_code}\n' https://xalq.bonusbot.uz/miniapp-probe   # ждём 200, не 401
```

## 3. Повесить кнопку запуска на стендового бота

BotFather → `/mybots` → `@dev_xalqbonus_bot` → Bot Settings → Menu Button → Edit menu
button URL → `https://xalq.bonusbot.uz/miniapp-probe`.

Кнопка меню, а не кнопка в сообщении, намеренно: она видна в чате **до** `/start`,
и без неё третье положение (человек никогда не начинал диалог с ботом) не проверить.

## 4. Смотреть в три лога одновременно

```bash
cd /srv/xalqbonus
make prod-logs | grep -E 'probe:miniapp|probe:bot'
```

- `probe:miniapp` — что приехало на сервер от страницы: сырой `initData`, состав полей,
  заключение по подписи, и наблюдения самой страницы (их страница отправляет сюда же,
  чтобы все три стороны легли в одну ленту)
- `probe:bot` — апдейт от Telegram целиком, до всякой обработки. Именно здесь видно,
  приезжает ли номер боту и в каком виде

Сама страница печатает всё на себе — на телефоне консоли нет.

## 5. Четыре положения

Что записать по каждому: версию и платформу со страницы, дословно то, что вернул
`requestContact`, и приехал ли апдейт в `probe:bot` (а если приехал — состав
`message.contact`).

1. **Соглашается.** Открыть кнопкой меню, нажать «Запросить телефон», в системном окне
   согласиться. Главное: приезжает ли боту апдейт с контактом, есть ли в нём `user_id`,
   и отличим ли такой контакт от присланного кнопкой в чате.
2. **Отказывается.** То же, но в окне отказаться. Отдельно — закрыть окно, не выбирая
   ничего: колбэк вызывается или нет, и отличимо ли «отказался» от «не ответил».
3. **Никогда не начинал диалог с ботом.** Второй аккаунт Telegram, который
   `@dev_xalqbonus_bot` не писал никогда. Открыть чат бота (это не `/start`) и нажать
   кнопку меню. Записать: есть ли `initData` вообще, что стоит в `allows_write_to_pm`,
   показывается ли окно запроса, доезжает ли что-нибудь до бота.
4. **Веб-версия Telegram и десктоп.** `web.telegram.org` и настольное приложение
   на том же аккаунте. Записать `version`, `platform`, есть ли вызов у клиента
   (`typeof requestContact`) и что он вернул.

Отдельно — скопировать из поля на странице **один** `initData` целиком и отдать
в чат CLI: в `docs/miniapp.md` нужен реальный пример того, что пришло на сервер.
Имя и username в нём настоящие, телефона в нём нет; в документ он поедет с заменёнными
значениями, но с настоящим составом полей.

## 6. Вернуть машину

```bash
cd /srv/xalqbonus
make prod-deploy ref=origin/main
```

Затем снять оба `location` из шага 2 (`nginx -t`, `systemctl reload nginx`) и убрать URL
кнопки меню у `@dev_xalqbonus_bot`.

В логе стенда после прогона остаётся живой номер телефона — апдейт печатается целиком.
Это ещё одна причина, по которой заглушка не уезжает в `main`.
