/**
 * Доменные ошибки офисов.
 *
 * Отказы двери — «не вошёл», «роль не та» — сюда не относятся: они живут в словаре
 * (`shared/denials.ts`). Здесь то, что про предмет разговора: такого офиса нет, такого
 * сотрудника нет.
 */
export abstract class OfficeError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Офиса с таким идентификатором нет. Правка, архив и остатки отвечают этим на 404. */
export class UnknownOfficeError extends OfficeError {
  constructor(public readonly officeId: string) {
    super(`офиса ${officeId} нет`);
  }
}

/**
 * Офис не открыт этому сотруднику: менеджер к нему не привязан.
 *
 * Отвечает ручка на это своим отказом стойки `office_not_open`, а не «офиса нет»: офис может
 * и быть, но работать в нём этому человеку не положено (issue #122, #250). Несуществующий офис
 * отвечает тем же — отличать «нет» от «не ваш» незачем.
 */
export class OfficeNotOpenError extends OfficeError {
  constructor(public readonly officeId: string) {
    super(`офис ${officeId} не открыт этому сотруднику`);
  }
}

/**
 * В наборе закрепляемых сотрудников есть тот, которого не существует.
 *
 * Отдельная ошибка, а не молчаливый пропуск: список приезжает целиком, и пропустить
 * из него одного значило бы показать человеку офис без сотрудника, которого он только что
 * добавил, без единого слова о том, почему.
 */
export class UnknownOfficeEmployeeError extends OfficeError {
  constructor(public readonly employeeIds: string[]) {
    super(`сотрудников ${employeeIds.join(', ')} нет`);
  }
}

/**
 * Сотрудник и офис с разных сторон (issue #252): демо-сотрудник закрепляется только
 * за демо-офисом, живой — только за живым.
 *
 * Демо-менеджер за живым офисом получил бы его стойку: ручки стойки открыты ему через
 * `allowDemo`, а ограничивают его только его офисы. Живой сотрудник за демо-офисом выдавал
 * бы демо-заказы как настоящие.
 */
export class OfficeSideMismatchError extends OfficeError {
  constructor(
    public readonly officeIds: string[],
    public readonly employeeIds: string[],
  ) {
    super(`офисы ${officeIds.join(', ')} и сотрудники ${employeeIds.join(', ')} с разных сторон демо`);
  }
}

/** Текст отказа — один на обе двери закрепления: со стороны офиса и со стороны демо-менеджера. */
export const OFFICE_SIDE_MISMATCH_MESSAGE =
  'Демо-сотрудника закрепляют только за демо-офисом, живого — только за живым.';
