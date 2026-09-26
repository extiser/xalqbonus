import type { Language } from '#server/generated/prisma/enums';
import { findDemoFlag } from '#server/repositories/demo';
import { findPersonSettings } from '#server/repositories/drivers';
import { findActiveLinkByChat } from '#server/repositories/programMembership';
import { findDriverAccountByPerson } from '#server/repositories/points';
import { findDisplayProfile } from '#server/repositories/registry';

/**
 * Водитель, каким его показывает бот: имя из учётки парка и баланс со счёта.
 *
 * Имя живёт в профиле, а не в записи человека: у человека собственных данных нет вовсе
 * (docs/drivers.md → «Три уровня личности»). Баланс принадлежит человеку и не зависит
 * от того, сколько у него профилей в парке.
 */
export type LinkedDriver = {
  personId: string;
  name: string;
  /** Позывной из того же профиля, что имя. `null` — позывного в учётке нет. */
  callsign: string | null;
  points: bigint;
  /** Язык участника из `person_settings` — тот, который он выбрал при регистрации. */
  language: Language;
  /**
   * Демо-водитель (issue #205). По нему решается, что водителю видно (issue #212): живое видно
   * всем, демо — только демо-водителю. Вызывающие передают признак дальше, в сборку списков
   * и в оформление заказа.
   */
  isDemo: boolean;
};

/** Язык, на котором бот говорит с участником, если строки участия у него почему-то нет. */
const FALLBACK_LANGUAGE: Language = 'ru';

/**
 * Имя для обращения: имя из учётки, а при пустом — фамилия.
 *
 * Пустым бывает и то и другое: реестр приходит из чужой системы, и обязательность полей
 * там наша, а не её. Обращение «Добро пожаловать, !» хуже безымянного.
 */
export const displayName = (firstName: string, lastName: string): string => {
  const name = firstName.trim() === '' ? lastName.trim() : firstName.trim();

  return name === '' ? 'водитель' : name;
};

/**
 * Позывной для показа: пустая строка из реестра — то же, что его отсутствие.
 *
 * Реестр приходит из чужой системы, и пустое поле там бывает строкой, а не `null`; показать
 * его значило бы нарисовать пустой позывной рядом с именем.
 */
export const displayCallsign = (callsign: string | null): string | null => {
  const trimmed = callsign?.trim() ?? '';

  return trimmed === '' ? null : trimmed;
};

/**
 * Кто сидит на этом чате. `null` — привязки нет, и человек в программе не участвует.
 *
 * С этого начинается каждый `/start`: у привязанного водителя телефон второй раз
 * не спрашивают.
 *
 * Счёта может не быть у перенесённых из старой базы с нулевым балансом — тогда ноль,
 * а не отсутствие: с точки зрения водителя «баллов нет» и «счёта нет» — одно и то же,
 * и заводить счёт ради показа нуля здесь нельзя, чтение не пишет.
 */
export const readLinkedDriver = async (telegramChatId: bigint): Promise<LinkedDriver | null> => {
  const link = await findActiveLinkByChat(telegramChatId);

  if (!link) {
    return null;
  }

  const [profile, account, settings, isDemo] = await Promise.all([
    findDisplayProfile(link.personId),
    findDriverAccountByPerson(link.personId),
    findPersonSettings(link.personId),
    findDemoFlag('person', link.personId),
  ]);

  return {
    personId: link.personId,
    name: displayName(profile?.firstName ?? '', profile?.lastName ?? ''),
    callsign: displayCallsign(profile?.callsign ?? null),
    points: account?.balance ?? 0n,
    language: settings?.language ?? FALLBACK_LANGUAGE,
    isDemo: isDemo ?? false,
  };
};
