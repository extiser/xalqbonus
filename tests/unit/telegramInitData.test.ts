import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { checkContactData, checkInitData } from '#server/utils/telegramInitData';

/**
 * Проверка подписанных строк Telegram покрыта тестом, хотя ручки и интерфейс не покрываются
 * (docs/infra.md → «Тесты»). Исключение того же рода, что нормализация телефона: это
 * единственные два места, где решается, кто открыл приложение и какой у него номер,
 * и сломанная проверка не падает, а тихо начинает пускать кого угодно — либо, наоборот,
 * не пускать никого.
 *
 * Чего этот файл **не** доказывает: что алгоритм совпадает с тем, который применяет
 * Telegram. Подписывает строки здесь тот же алгоритм, что и проверяет, поэтому сойтись
 * они обязаны при любой общей ошибке. Совпадение с Telegram проверяется только живой
 * строкой из Mini App на стенде — это и есть разведка issue #81, и её результат лежит
 * в `docs/miniapp.md`.
 *
 * Что файл доказывает: правленую строку проверка не пропускает, чужой токен не проходит,
 * просроченная отличается от подделанной, а поле `signature` участвует в проверяемой
 * строке — решение, которое иначе некому удержать.
 */

const TOKEN = '1234567890:AAFakeTokenForTestsOnly-xxxxxxxxxxxxxxx';
const OTHER_TOKEN = '9876543210:AAAnotherFakeTokenForTests-yyyyyyyyyyy';

const USER_JSON = JSON.stringify({
  id: 111222333,
  first_name: 'Рустам',
  last_name: 'Каримов',
  username: 'rustam',
  language_code: 'ru',
  allows_write_to_pm: true,
});

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * Подписывает набор полей так, как это делает Telegram.
 *
 * Повторяет алгоритм из `server/utils/telegramInitData.ts` намеренно: тест обязан уметь
 * собрать годную строку, не спрашивая проверяемый модуль. Общий помощник на два места
 * скрыл бы ровно ту ошибку, которую тест ищет.
 */
const signInitData = (fields: Record<string, string>, token: string): string => {
  const parameters = new URLSearchParams(fields);
  // По алфавиту сортируются имена полей — так сказано у Telegram, и так здесь написано
  // независимо от того, как это сделано в проверяемом модуле.
  const dataCheckString = [...parameters.entries()]
    .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();

  parameters.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));

  return parameters.toString();
};

const freshFields = (): Record<string, string> => ({
  auth_date: String(nowSeconds()),
  query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
  user: USER_JSON,
});

describe('checkInitData', () => {
  it('принимает строку, подписанную токеном бота, и читает из неё личность', () => {
    const result = checkInitData({ initData: signInitData(freshFields(), TOKEN), token: TOKEN });

    expect(result.outcome).toBe('valid');

    if (result.outcome !== 'valid') {
      return;
    }

    expect(result.user.id).toBe(111222333n);
    expect(result.user.firstName).toBe('Рустам');
    expect(result.user.allowsWriteToPrivateMessages).toBe(true);
    expect(result.queryId).toBe('AAHdF6IQAAAAAN0XohDhrOrc');
    expect(result.ageSeconds).toBeLessThan(5);
  });

  it('не принимает строку, правленую после подписи', () => {
    // Ровно та подделка, ради которой проверка и существует: подписана одна личность,
    // прислана другая.
    const signed = signInitData(freshFields(), TOKEN);
    const tampered = signed.replace(
      encodeURIComponent('"id":111222333'),
      encodeURIComponent('"id":999888777'),
    );

    expect(tampered).not.toBe(signed);
    expect(checkInitData({ initData: tampered, token: TOKEN }).outcome).toBe('hash_mismatch');
  });

  it('не принимает строку, подписанную чужим токеном', () => {
    const signed = signInitData(freshFields(), OTHER_TOKEN);

    expect(checkInitData({ initData: signed, token: TOKEN }).outcome).toBe('hash_mismatch');
  });

  it('не принимает дописанное к подписанной строке поле', () => {
    // Дописать поле — второй способ подделки: подпись прежняя и верная, а состав полей
    // уже не тот, который подписывали.
    const signed = `${signInitData(freshFields(), TOKEN)}&start_param=admin`;

    expect(checkInitData({ initData: signed, token: TOKEN }).outcome).toBe('hash_mismatch');
  });

  it('держит `signature` внутри проверяемой строки', () => {
    // Поле появилось в Bot API 8.0 и в проверке по HMAC не исключается — исключает его
    // только проверка по публичному ключу Ed25519, которая нам не нужна. Тест ловит
    // обратную правку: начни модуль снимать `signature` вместе с `hash`, и подпись
    // перестанет сходиться у всех современных клиентов.
    const signed = signInitData(
      { ...freshFields(), signature: 'TYJxVcisqbWjtodPepiJ6ghziUL94' },
      TOKEN,
    );

    expect(checkInitData({ initData: signed, token: TOKEN }).outcome).toBe('valid');
  });

  it('сортирует поля по именам, а не по готовым парам `key=value`', () => {
    // Разница видна только на паре имён, где одно является началом другого: в `auth_date2=…`
    // на девятом знаке стоит `2`, в `auth_date=…` — `=`, и цифра меньше. Сортировка готовых
    // пар поставила бы их в обратном порядке, и подпись не сошлась бы. Поля с такой парой
    // имён у Telegram сегодня нет, и тест держит порядок до того дня, когда оно появится.
    const signed = signInitData({ ...freshFields(), auth_date2: '1789126043' }, TOKEN);

    expect(checkInitData({ initData: signed, token: TOKEN }).outcome).toBe('valid');
  });

  it('отличает просроченную строку от подделанной', () => {
    const authDate = nowSeconds() - 3 * 60 * 60;
    const signed = signInitData({ ...freshFields(), auth_date: String(authDate) }, TOKEN);

    const result = checkInitData({ initData: signed, token: TOKEN, maxAgeSeconds: 60 * 60 });

    expect(result.outcome).toBe('expired');

    if (result.outcome !== 'expired') {
      return;
    }

    expect(result.ageSeconds).toBeGreaterThanOrEqual(3 * 60 * 60);
  });

  it('принимает ту же строку, пока она не старше предела', () => {
    const authDate = nowSeconds() - 3 * 60 * 60;
    const signed = signInitData({ ...freshFields(), auth_date: String(authDate) }, TOKEN);

    expect(checkInitData({ initData: signed, token: TOKEN }).outcome).toBe('valid');
  });

  it('пустая строка — это «открыто не из Telegram», а не подделка', () => {
    expect(checkInitData({ initData: '', token: TOKEN }).outcome).toBe('missing');
    expect(checkInitData({ initData: '   ', token: TOKEN }).outcome).toBe('missing');
  });

  it('строку без `hash` и без `auth_date` разбирать не берётся', () => {
    expect(checkInitData({ initData: `user=${encodeURIComponent(USER_JSON)}`, token: TOKEN }).outcome).toBe(
      'malformed',
    );

    const withoutAuthDate = signInitData({ user: USER_JSON }, TOKEN);

    expect(checkInitData({ initData: withoutAuthDate, token: TOKEN }).outcome).toBe('malformed');
  });

  it('подписанная строка без личности не является личностью', () => {
    // Подпись верна, а `user` в ней нет: так Telegram открывает приложение не из личного
    // чата. Пускать по такой строке некого.
    const signed = signInitData({ auth_date: String(nowSeconds()), chat_type: 'channel' }, TOKEN);

    expect(checkInitData({ initData: signed, token: TOKEN }).outcome).toBe('no_user');
  });

  it('не сверяет подпись на машине без токена, а падает', () => {
    // Пустой `TG_BOT_TOKEN` — рабочее состояние машины, на которой бота ещё нет
    // (server/bot/config.ts). Отвечать на это отказом в доступе нельзя: Mini App перестал
    // бы работать у всех, а в логе лежали бы подделки вместо незаполненной переменной.
    expect(() => checkInitData({ initData: signInitData(freshFields(), TOKEN), token: '' })).toThrow(
      /пустым токеном/,
    );
  });
});

const CONTACT_JSON = JSON.stringify({
  user_id: 111222333,
  phone_number: '+998901234567',
  first_name: 'Рустам',
  last_name: 'Каримов',
});

/**
 * Строка контакта подписывается тем же алгоритмом, что `initData`, — это и есть главный
 * результат разведки `#81`, снятый с живой строки перебором вывода ключа. Состав полей
 * при этом другой: `contact` и `auth_date`, поля `user` нет вовсе.
 */
const freshContactFields = (): Record<string, string> => ({
  auth_date: String(nowSeconds()),
  contact: CONTACT_JSON,
});

describe('checkContactData', () => {
  it('принимает подписанную строку контакта и читает из неё номер', () => {
    const result = checkContactData({
      contactData: signInitData(freshContactFields(), TOKEN),
      token: TOKEN,
    });

    expect(result.outcome).toBe('valid');

    if (result.outcome !== 'valid') {
      return;
    }

    expect(result.contact.userId).toBe(111222333n);
    expect(result.contact.phoneNumber).toBe('+998901234567');
    expect(result.contact.firstName).toBe('Рустам');
  });

  it('не принимает строку с подменённым после подписи номером', () => {
    // Ровно та подделка, ради которой проверка и существует: подписан один номер, прислан
    // другой. Без неё телефон стал бы полем, которое выбирает клиент.
    const signed = signInitData(freshContactFields(), TOKEN);
    const tampered = signed.replace(
      encodeURIComponent('+998901234567'),
      encodeURIComponent('+998907654321'),
    );

    expect(tampered).not.toBe(signed);
    expect(checkContactData({ contactData: tampered, token: TOKEN }).outcome).toBe('hash_mismatch');
  });

  it('не принимает строку, подписанную чужим токеном', () => {
    const signed = signInitData(freshContactFields(), OTHER_TOKEN);

    expect(checkContactData({ contactData: signed, token: TOKEN }).outcome).toBe('hash_mismatch');
  });

  it('отличает просроченную строку от подделанной', () => {
    // Тот же порог, что у `initData`, и по той же причине: строка не обновляется сама,
    // а предел решает, сколько украденная остаётся годной — здесь для того, чтобы привязать
    // чужой номер к своему Telegram.
    const authDate = nowSeconds() - 3 * 60 * 60;
    const signed = signInitData({ ...freshContactFields(), auth_date: String(authDate) }, TOKEN);

    expect(
      checkContactData({ contactData: signed, token: TOKEN, maxAgeSeconds: 60 * 60 }).outcome,
    ).toBe('expired');
  });

  it('подписанная строка без номера контактом не является', () => {
    // Подпись верна, а телефона в ней нет: регистрировать по такой строке нечего,
    // и притворяться, что номер подтверждён пустой строкой, нельзя.
    const withoutPhone = signInitData(
      { auth_date: String(nowSeconds()), contact: JSON.stringify({ user_id: 111222333 }) },
      TOKEN,
    );

    expect(checkContactData({ contactData: withoutPhone, token: TOKEN }).outcome).toBe('malformed');
  });

  it('оставляет владельца пустым, когда Telegram его не показал', () => {
    // Такой контакт ничего не подтверждает: сверить его с отправителем нечем. Решение
    // по нему принимает сервис привязки — исходом `contact_not_own`, а не эта функция.
    const signed = signInitData(
      {
        auth_date: String(nowSeconds()),
        contact: JSON.stringify({ phone_number: '+998901234567' }),
      },
      TOKEN,
    );

    const result = checkContactData({ contactData: signed, token: TOKEN });

    expect(result.outcome).toBe('valid');

    if (result.outcome !== 'valid') {
      return;
    }

    expect(result.contact.userId).toBeNull();
  });

  it('строку `initData` на этой проверке не путает с контактом', () => {
    // И наоборот: у `checkInitData` на строке контакта нет поля `user`, и она отвечает
    // `no_user`. Две проверки делят подпись, но не состав полей — потому их и две.
    const contact = signInitData(freshContactFields(), TOKEN);
    const initData = signInitData(freshFields(), TOKEN);

    expect(checkInitData({ initData: contact, token: TOKEN }).outcome).toBe('no_user');
    expect(checkContactData({ contactData: initData, token: TOKEN }).outcome).toBe('no_contact');
  });

  it('пустая строка — это «номером не делились», а не подделка', () => {
    expect(checkContactData({ contactData: '', token: TOKEN }).outcome).toBe('missing');
  });
});
