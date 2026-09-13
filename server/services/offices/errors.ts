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
