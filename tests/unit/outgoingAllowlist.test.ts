import { describe, expect, it } from 'vitest';

import { isOutgoingAllowed } from '#server/adapters/telegram/outgoing';

/**
 * Защита исходящих вне прода (issue #295): в локальной базе настоящие `telegram_chat_id`
 * водителей, и отправлять им можно только тем, кого назвали в `TG_OUTGOING_ALLOWLIST`.
 */
describe('отправлять ли исходящее', () => {
  const recipient = 111_222_333n;

  it('прод: список не действует — ни пустой, ни с другими', () => {
    expect(isOutgoingAllowed({ nodeEnv: 'production', allowlist: '' }, recipient)).toBe(true);
    expect(isOutgoingAllowed({ nodeEnv: 'production', allowlist: '999' }, recipient)).toBe(true);
  });

  it('не прод, список пуст: не отправлять никому', () => {
    expect(isOutgoingAllowed({ nodeEnv: 'development', allowlist: '' }, recipient)).toBe(false);
    expect(isOutgoingAllowed({ nodeEnv: undefined, allowlist: '  , ,' }, recipient)).toBe(false);
  });

  it('не прод, получатель в списке: отправлять', () => {
    expect(isOutgoingAllowed({ nodeEnv: 'development', allowlist: '111222333' }, recipient)).toBe(true);
    expect(isOutgoingAllowed({ nodeEnv: 'test', allowlist: '5, 111222333 ,7' }, recipient)).toBe(true);
  });

  it('не прод, получателя в списке нет: не отправлять, совпадение по части числа не считается', () => {
    expect(isOutgoingAllowed({ nodeEnv: 'development', allowlist: '5,7' }, recipient)).toBe(false);
    expect(isOutgoingAllowed({ nodeEnv: 'development', allowlist: '11122233' }, recipient)).toBe(false);
  });
});
